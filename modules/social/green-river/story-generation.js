  async function handleGenerateStoryContent(isReroll = false) {
    if (grState.isGenerating) return;

    let story = await db.grStories.get(grState.activeStoryId);

    // --- 重写逻辑 ---
    if (isReroll && story.chapters.length > 0) {
      story.chapters.pop();
      await db.grStories.put(story);
      openReader(story.id, Math.max(0, story.chapters.length - 1));
    }

    const author = await db.grAuthors.get(story.authorId);
    const directionInput = document.getElementById('gr-direction-input');
    const userDirection = directionInput.value.trim();

    const genBtn = document.getElementById('gr-generate-btn');
    const btnText = document.getElementById('gr-gen-text'); // 获取文字标签
    grState.isGenerating = true;

    if (genBtn) {
      genBtn.disabled = true;
      // 【核心修复】：加了判断，只有当文字标签存在时才修改文字，否则只禁用按钮
      if (btnText) btnText.textContent = "撰写中...";
    }

    try {
      // 获取目标字数，并做一个"溢价"处理
      // 如果用户设置 500，我们告诉 AI 写 800，这样它偷懒打折后刚好是 500
      const settingValue = parseInt(story.settings.outputLength) || 500;
      const targetWordCount = Math.floor(settingValue * 1.5);

      const historyLimit = story.settings.contextLimit || 20;

      // --- 构建上下文 ---
      let charsContext = "";
      for (const id of story.settings.charIds) {
        if (id.startsWith('npc_')) {
          const npcId = parseInt(id.replace('npc_', ''));
          const npc = await db.npcs.get(npcId);
          if (npc) charsContext += `- NPC ${npc.name}: ${npc.persona}\n`;
        } else {
          const chat = state.chats[id];
          if (chat) {
            let memories = '';
            const memMode = chat.settings?.memoryMode || (chat.settings?.enableStructuredMemory ? 'structured' : 'diary');
            if (memMode === 'vector' && window.vectorMemoryManager) {
              memories = window.vectorMemoryManager.serializeCoreMemories(chat) || '';
            } else if (memMode === 'structured' && window.structuredMemoryManager) {
              memories = window.structuredMemoryManager.serializeForPrompt(chat) || '';
            } else {
              memories = (chat.longTermMemory || []).map(m => `  * ${m.content}`).join('\n');
            }

            const history = chat.history.slice(-historyLimit).map(m => {
              if (m.role === 'system' || m.type === 'red_packet' || m.type === 'waimai_request' || m.type === 'transfer') return null;
              let content = String(m.content);
              if (content.includes("红包") || content.includes("手机") || content.includes("转账")) return null;
              return `  > ${m.senderName}: ${content.substring(0, 50)}`;
            }).filter(Boolean).join('\n');

            charsContext += `### 角色: ${chat.name}\n- **核心人设**: ${chat.settings.aiPersona}\n`;
            if (memories) charsContext += `- **【重要：长期记忆】**:\n${memories}\n`;
            if (history) charsContext += `- **【语气参考 (最近聊天)】**:\n${history}\n`;
            charsContext += `\n`;
          }
        }
      }

      let userPersonaText = "普通用户";
      if (story.settings.userPersonaId) {
        const preset = await db.personaPresets.get(story.settings.userPersonaId);
        if (preset) userPersonaText = preset.persona;
      } else if (state.chats[Object.keys(state.chats)[0]]) {
        userPersonaText = state.chats[Object.keys(state.chats)[0]].settings.myPersona;
      }

      let worldBookText = "";
      for (const bid of story.settings.bookIds) {
        const wb = await db.worldBooks.get(bid);
        if (wb) worldBookText += `- 《${wb.name}》设定: ${wb.content.filter(e => e.enabled).map(e => e.content).join(';')}\n`;
      }

      let prevSummary = "这是故事的开始。";
      if (story.chapters && story.chapters.length > 0) {
        const lastChapter = story.chapters[story.chapters.length - 1];
        if (lastChapter && lastChapter.summary) {
          prevSummary = lastChapter.summary;
        }
      }
      let macroContext = "";
      if (story.settings.macroWorldView) {
        macroContext = `
# 【🔥 核心世界观 / IF线设定 (最高优先级)】
注意：这是一条IF线或特殊背景故事。**你必须优先遵循以下设定**，如果以下设定与角色的原始人设或记忆冲突，**请以以下设定为准并进行适配**！
---
${story.settings.macroWorldView}
---
`;
      }
      // E. Prompt 强力优化 (字数扩充 + 标题生成)
      const systemPrompt = `
# 身份
你现在是【${author.name}】。文风特点: ${author.style}

# 核心任务
续写这篇小说的新一章。
${macroContext}
# 【最高优先级：字数扩充指令】
你必须输出 **${targetWordCount} 字** 以上的内容。
为了达到这个字数，你**必须**执行以下操作：
1.  **拒绝流水账**：不要只写"他做了什么"，要写"他如何做、什么表情、心里想了什么、周围环境如何"。
2.  **细节描写**：增加环境描写（光影、气味、声音）、微表情描写、肢体动作描写。
3.  **心理活动**：大幅增加角色的内心独白和纠结。
4.  **慢镜头**：将关键动作拆解，放慢叙事节奏。

# 数据使用指南
1. **世界观**: ${worldBookText ? "必须严格遵守以下设定：" + worldBookText : "请根据角色设定自行判断。"}
2. **时代净化**: 严禁出现不符合世界观的现代物品。
3. **长期记忆**: 必须遵守角色档案中的记忆事实。

# 设定资料
- **"我" (User) 的设定**: ${userPersonaText}
- **登场角色档案**:
${charsContext}

# 当前进度
- **前情提要**: ${prevSummary}
- **用户指示**: ${userDirection || "（无指示，请顺其自然地发展剧情，重点是写够字数！）"}

# 输出格式 (JSON)
回复必须且只能是一个JSON对象：${(story.settings.readerCommentsEnabled ? `
- **content** 正文必须用双换行 \\n\\n 分段，以便与读者评论对应。
- **readerComments**（仅当开启读者评论时）：可选。模拟网文读者在部分段落后留下的评论，不必每段都有，由你判断（高能、好笑、虐、吐槽等）。段落序号 = content 按 \\n\\n 分割后的下标（从0开始）。最多 5 段有评论，每段最多 3 条。每条评论包含 name（读者昵称）和 content（评论内容）。` : '')}
\`\`\`json
{
  "title": "四字或多字标题 (如：月下对酌、危机四伏)",
  "content": "正文内容 (必须使用${author.style}风格，**强制写满 ${targetWordCount} 字**，段落之间用换行符\\n\\n分隔)",
  "summary": "用陈述句概括本章关键事实（谁、在哪里、做了什么），供下一章记忆使用。"${story.settings.readerCommentsEnabled ? `,
  "readerComments": [{"segmentIndex": 0, "comments": [{"name": "读者昵称", "content": "评论内容"}]}]
` : ''}
}
\`\`\`
`;

      // API 调用
      const { proxyUrl, apiKey, model } = state.apiConfig;
      const messages = [{ role: 'user', content: `请开始写作，请务必写够 ${targetWordCount} 字！` }];

      let response;
      if (proxyUrl.includes('generativelanguage')) {
        let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
        response = await fetch(geminiConfig.url, geminiConfig.data);
      } else {
        response = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            temperature: 0.9, // 提高温度，让它更啰嗦一点
            ...(state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined ? { top_p: state.globalSettings.apiTopP } : {}),
            ...(state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens !== undefined ? { max_tokens: state.globalSettings.apiMaxTokens } : {}),
            ...(state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined ? { presence_penalty: state.globalSettings.apiPresencePenalty } : {}),
            ...(state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined ? { frequency_penalty: state.globalSettings.apiFrequencyPenalty } : {})
          })
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const aiText = getGeminiResponseText(data);

      // 1. 提取 JSON 部分
      let jsonStr = aiText;
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        throw new Error("AI未返回有效JSON格式");
      }

      let result;
      try {
        // 2. 尝试直接解析
        result = JSON.parse(jsonStr);
      } catch (e) {
        console.warn("JSON解析初次失败，尝试修复转义字符...", e);

        // 3. 【核心修复】: 自动修复错误的转义字符
        // 正则含义：查找所有反斜杠，如果它后面跟的不是 json 允许的转义符( " \ / b f n r t u )，就把它替换为双反斜杠
        const fixedStr = jsonStr.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');

        try {
          result = JSON.parse(fixedStr);
          console.log("JSON自动修复成功！");
        } catch (e2) {
          // 如果还是失败，抛出异常
          throw new Error("JSON解析失败: " + e.message);
        }
      }

      const readerComments = (result.readerComments && Array.isArray(result.readerComments))
        ? result.readerComments
        : [];
        
      const content = result.content;
      if (!content || typeof content !== 'string' || content.trim().length < 50) {
        throw new Error("AI未返回有效正文或内容过短，生成失败");
      }

      const newChapter = {
        title: result.title || `第 ${story.chapters.length + 1} 章`,
        content: content,
        summary: result.summary,
        prevSummary: prevSummary,
        readerComments,
        timestamp: Date.now()
      };

      // 并发安全获取
      story = await db.grStories.get(grState.activeStoryId);
      story.chapters.push(newChapter);
      story.lastUpdated = Date.now();
      await db.grStories.put(story);

      openReader(story.id, story.chapters.length - 1);
      document.getElementById('gr-direction-input').value = '';

    } catch (e) {
      console.error("绿江生成失败:", e);
      alert("生成失败: " + e.message);
    } finally {
      grState.isGenerating = false;
      if (genBtn) {
        genBtn.disabled = false;
        // 【核心修复】：同样只在文字标签存在时才恢复文字
        if (btnText) btnText.textContent = "续写";
      }
    }
  }
  // 8. 侧边栏目录功能
  // 章节删除模式状态
