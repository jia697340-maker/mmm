
function handleCoupleSpaceGardenChanged(data) {
  localStorage.setItem('coupleGarden_' + data.charId, JSON.stringify(data.gardenData || {}));
}

function handleCoupleSpaceGardenSettingsChanged(data) {
  localStorage.setItem('coupleGardenSettings_' + data.charId, JSON.stringify(data.settings || {}));
  localStorage.removeItem('coupleGardenAutoLast_' + data.charId);
  console.log(`[情侣空间] ⚙️ 已保存 浇水 设置并清除当天执行记录，重新初始化定时器`);
  setupCoupleSpaceGardenAutoTimer();
}

async function handleCoupleSpaceGardenWaterReward(data) {
  // data: { charId, author, amount, description }
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    if (data.author === 'user') {
      // User wallet: processTransaction
      if (typeof processTransaction === 'function') {
        await processTransaction(data.amount, 'income', data.description || '情侣树浇水奖励');
      }
    } else if (data.author === 'char') {
      // Character wallet: simulatedTaobaoHistory.totalBalance
      if (!chat.simulatedTaobaoHistory) chat.simulatedTaobaoHistory = { totalBalance: 0, purchases: [] };
      chat.simulatedTaobaoHistory.totalBalance += data.amount;
      if (typeof db !== 'undefined' && db.chats) {
        await db.chats.put(chat);
      }
    }
  } catch(e) {
    console.error('Garden water reward error:', e);
  }
}

async function handleCoupleSpaceGardenAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceGardenAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenAiResult',
      content: result.content
    }, '*');
  } catch(err) {
    console.error('Garden AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceGardenCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenCommentResult', waterId: data.waterId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceGardenComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenCommentResult',
      waterId: data.waterId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Garden comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenCommentResult', waterId: data.waterId, error: true }, '*');
  }
}

async function handleCoupleSpaceGardenHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !apiKey || !model) return;
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给你们的情侣树浇了水，写了："${data.waterContent || ''}"，并点了爱心。
你会不会也想给这条浇水记录点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenHeartResult',
      waterId: data.waterId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Garden heart AI error:', e);
  }
}

async function generateCoupleSpaceGardenAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const gardenSettings = data.gardenSettings || {};
  const maxCharVisible = gardenSettings.visibleCharWaters ?? 10;
  const maxUserVisible = gardenSettings.visibleUserWaters ?? 10;
  const items = data.existingWaters || [];
  const charWaters = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userWaters = items.filter(i => i.author === 'user').slice(-maxUserVisible);
  let existingCharWatersText = '';
  if (charWaters.length > 0) {
    existingCharWatersText = charWaters.map(m => '- "' + (m.content || '') + '" (' + new Date(m.createdAt).toLocaleDateString('zh-CN') + ')').join('\n');
  }
  let existingUserWatersText = '';
  if (userWaters.length > 0) {
    existingUserWatersText = userWaters.map(m => '- "' + (m.content || '') + '" (' + new Date(m.createdAt).toLocaleDateString('zh-CN') + ')').join('\n');
  }
  const treeStatus = data.treeStatus || '';

  let systemPrompt;
  if (gardenSettings.enableCustomPrompt && gardenSettings.customPrompt) {
    systemPrompt = gardenSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharWaters\}\}/g, existingCharWatersText ? '# 你之前的浇水记录\n' + existingCharWatersText : '')
      .replace(/\{\{existingUserWaters\}\}/g, existingUserWatersText ? '# 伴侣的浇水记录\n' + existingUserWatersText : '')
      .replace(/\{\{treeStatus\}\}/g, treeStatus ? '# 树的状态\n' + treeStatus : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要给情侣空间里你们共同种的树浇水。
浇水就是写一段话挂在树上，像给树系上的小纸条。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

${ctx.worldBook ? '# 世界观\n' + ctx.worldBook : ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

${ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : ''}

${ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${ctx.gardenContext ? '# 情侣树\n' + ctx.gardenContext : ''}

${existingCharWatersText ? '# 你之前的浇水记录（避免重复）\n' + existingCharWatersText : ''}

${existingUserWatersText ? '# 伴侣的浇水记录（参考）\n' + existingUserWatersText : ''}

${treeStatus ? '# 树的状态\n' + treeStatus : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"content": "浇水文字"}

# 写作要求
- 浇水文字在10-200字之间
- 像给树挂上一张小纸条，写给对方或写给这棵树
- 可以是对伴侣的想念、感悟、期待、鼓励、撒娇
- 语气符合你的角色设定
- 基于记忆和最近的对话，不要凭空编造
- 和之前的浇水记录不要重复
- 可以提到树的成长状态，表达对未来的期待
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请给树浇水吧。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8, top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0, presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0, frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceGardenComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"给你们的情侣树浇了水，写了一段话，请你评论。

# 你的角色设定
${ctx.aiPersona}

# 浇水内容
${data.waterContent || '(无文字)'}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论一样自然
- 字数在10-80字之间
- 语气符合你的角色设定
- 可以回应内容、表达感受、撒娇、逗趣
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请评论这条浇水记录。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8, top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0, presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0, frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Garden Scheduler ==========
let coupleSpaceGardenTimers = {};

function setupCoupleSpaceGardenAutoTimer() {
  Object.values(coupleSpaceGardenTimers).forEach(t => clearInterval(t));
  coupleSpaceGardenTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleGardenSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 浇水 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleGardenAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 浇水 的自动生成`);
          triggerAutoGardenWater(space.charId, true);
        });
        scheduleGardenAutoWater(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleGardenAutoWater(charId, timeStr) {
  coupleSpaceGardenTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleGardenAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 浇水 的自动生成`);
      triggerAutoGardenWater(charId, true);
    });
  }, 60000);
}

async function triggerAutoGardenWater(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return;
  const settings = JSON.parse(localStorage.getItem('coupleGardenSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 浇水记录...`);
  try {
    const gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + charId) || '{}');
    const waterLogs = gardenData.waterLogs || [];
    const result = await generateCoupleSpaceGardenAi(chat, {
      charId,
      existingWaters: waterLogs,
      gardenSettings: settings,
      treeStatus: ''
    });
    const newWater = {
      id: 'water_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      content: result.content,
      author: 'char',
      createdAt: Date.now(),
      coinsEarned: 0,
      specialDate: null,
      hearts: { char: true },
      comments: []
    };
    const iframe = document.getElementById('couple-space-iframe');
    const isIframeOpenForThisChar = iframe && iframe.src && iframe.src.includes('330--main/index.html') && localStorage.getItem('coupleSpaceLastId') === charId;
    
    if (isIframeOpenForThisChar && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAutoResult', item: newWater }, '*');
    } else {
      try {
        const gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + charId) || '{}');
        if (!gardenData.waterLogs) gardenData.waterLogs = [];
        gardenData.waterLogs.push(newWater);
        localStorage.setItem('coupleGarden_' + charId, JSON.stringify(gardenData));
      } catch(e) { console.error('Failed to save garden offline:', e); }
    }
  } catch(err) {
    console.error('Auto garden water failed:', err);
  }
}

// Initialize garden timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceGardenAutoTimer, 10000);
}

