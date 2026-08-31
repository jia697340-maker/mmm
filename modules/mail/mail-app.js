  // ========== 从 script.js 迁移：邮件功能 ==========
  let mailState = {
    currentEmailId: null,
    isEditMode: false,
    selectedEmails: new Set()
  };

  async function openEmailApp() {
    showScreen('email-screen');
    await renderEmailList();
  }

  async function renderEmailList() {
    const listEl = document.getElementById('email-list');
    listEl.innerHTML = '';
    const emails = await db.emails.orderBy('timestamp').reverse().toArray();
    if (emails.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:50px; color:#8E8E93;">No Mail</div>';
      return;
    }
    const searchTerm = document.getElementById('mail-search-input').value.toLowerCase();
    emails.forEach(email => {
      if (searchTerm && !email.subject.toLowerCase().includes(searchTerm) && !email.content.toLowerCase().includes(searchTerm)) return;
      const div = document.createElement('div');
      const itemClass = `mail-item ${email.isRead ? '' : 'unread'} ${mailState.isEditMode ? 'editing' : ''}`;
      div.className = itemClass;
      div.dataset.id = email.id;
      if (mailState.selectedEmails.has(email.id)) div.classList.add('selected');
      const date = new Date(email.timestamp);
      const timeStr = date.toLocaleDateString() === new Date().toLocaleDateString()
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString();
      div.innerHTML = `
            <div class="mail-select-checkbox"></div>
            <div class="mail-item-header">
                <span class="mail-sender">${escapeHTML(email.sender)}</span>
                <span class="mail-date">${timeStr}</span>
            </div>
            <div class="mail-subject">${escapeHTML(email.subject)}</div>
            <div class="mail-preview">${escapeHTML(email.content).replace(/\n/g, ' ').substring(0, 80)}</div>
        `;
      div.onclick = () => {
        if (mailState.isEditMode) {
          handleEmailSelection(div, email.id);
        } else {
          openEmailDetail(email.id);
        }
      };
      listEl.appendChild(div);
    });
  }

  function handleEmailSelection(element, id) {
    if (mailState.selectedEmails.has(id)) {
      mailState.selectedEmails.delete(id);
      element.classList.remove('selected');
    } else {
      mailState.selectedEmails.add(id);
      element.classList.add('selected');
    }
    updateMailDeleteButton();
  }

  function updateMailDeleteButton() {
    const btn = document.getElementById('mail-delete-selected-btn');
    const count = mailState.selectedEmails.size;
    btn.textContent = count > 0 ? `删除 (${count})` : '删除';
    btn.disabled = count === 0;
  }

  async function executeBatchDeleteEmails() {
    const count = mailState.selectedEmails.size;
    if (count === 0) return;
    const confirmed = await showCustomConfirm('删除邮件', `确定要删除这 ${count} 封邮件吗？此操作无法撤销。`, { confirmButtonClass: 'btn-danger', confirmText: '删除' });
    if (confirmed) {
      const idsToDelete = Array.from(mailState.selectedEmails);
      await db.emails.bulkDelete(idsToDelete);
      mailState.selectedEmails.clear();
      updateMailDeleteButton();
      await renderEmailList();
    }
  }

  function handleSelectAllEmails() {
    const listEl = document.getElementById('email-list');
    const allItems = listEl.querySelectorAll('.mail-item');
    const isSelectingAll = mailState.selectedEmails.size < allItems.length;
    allItems.forEach(item => {
      const id = parseInt(item.dataset.id);
      if (isSelectingAll) {
        mailState.selectedEmails.add(id);
        item.classList.add('selected');
      } else {
        mailState.selectedEmails.delete(id);
        item.classList.remove('selected');
      }
    });
    updateMailDeleteButton();
  }

  async function openEmailDetail(id) {
    const email = await db.emails.get(id);
    if (!email) return;
    mailState.currentEmailId = id;
    if (!email.isRead) await db.emails.update(id, { isRead: true });
    document.getElementById('mail-detail-subject').textContent = email.subject;
    document.getElementById('mail-detail-from').textContent = email.sender;
    document.getElementById('mail-detail-to').textContent = email.recipient || 'Me';
    document.getElementById('mail-detail-time').textContent = new Date(email.timestamp).toLocaleString();
    const avatarEl = document.getElementById('mail-detail-avatar');
    avatarEl.textContent = email.sender.charAt(0).toUpperCase();
    document.getElementById('mail-detail-body').innerHTML = email.content.replace(/\n/g, '<br>');
    const forwardBtn = document.getElementById('forward-email-btn');
    const newForwardBtn = forwardBtn.cloneNode(true);
    forwardBtn.parentNode.replaceChild(newForwardBtn, forwardBtn);
    newForwardBtn.onclick = () => forwardEmailToChat(email);
    const deleteBtn = document.getElementById('delete-email-btn');
    if (deleteBtn) {
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.onclick = () => deleteCurrentEmail();
    }
    showScreen('email-detail-screen');
  }

  function closeEmailDetail() {
    showScreen('email-screen');
    renderEmailList();
  }

  function toggleEmailEditMode() {
    mailState.isEditMode = !mailState.isEditMode;
    const btn = document.getElementById('mail-edit-btn');
    const actionBar = document.getElementById('mail-action-bar');
    const listEl = document.getElementById('email-list');
    if (mailState.isEditMode) {
      btn.textContent = '完成';
      btn.style.color = 'var(--mail-accent)';
      btn.style.fontWeight = '600';
      btn.innerHTML = '完成';
      actionBar.style.display = 'flex';
      mailState.selectedEmails.clear();
      updateMailDeleteButton();
      listEl.querySelectorAll('.mail-item').forEach(item => item.classList.add('editing'));
    } else {
      btn.innerHTML = '编辑';
      btn.style.color = 'currentColor';
      btn.style.fontWeight = 'normal';
      actionBar.style.display = 'none';
      mailState.selectedEmails.clear();
      listEl.querySelectorAll('.mail-item').forEach(item => item.classList.remove('editing', 'selected'));
    }
  }

  async function deleteEmail(id) {
    if (confirm("确定要删除这封邮件吗？")) {
      await db.emails.delete(id);
      renderEmailList();
    }
  }

  async function deleteCurrentEmail() {
    if (mailState.currentEmailId) {
      await deleteEmail(mailState.currentEmailId);
      closeEmailDetail();
    }
  }

  function saveMailConfig() {
    const config = {
      userMask: document.getElementById('mail-user-mask').value.trim(),
      worldContext: document.getElementById('mail-world-context').value.trim(),
      personaId: document.getElementById('mail-user-persona-select').value,
      allowRandom: document.getElementById('mail-allow-random-npc').checked,
      genCount: document.getElementById('mail-gen-count').value,
      selectedSenders: Array.from(document.querySelectorAll('#mail-sender-list input:checked')).map(cb => cb.value),
      selectedBookIds: Array.from(document.querySelectorAll('#mail-context-list input:checked')).map(cb => cb.value)
    };
    localStorage.setItem('ephone_mail_config', JSON.stringify(config));
    console.log("邮箱配置已保存:", config);
    return config;
  }

  function loadMailConfig() {
    const saved = localStorage.getItem('ephone_mail_config');
    return saved ? JSON.parse(saved) : null;
  }

  async function openEmailSettings() {
    const personaSelect = document.getElementById('mail-user-persona-select');
    if (personaSelect) {
      personaSelect.innerHTML = '<option value="">-- 仅使用下方关键词 (无详细人设) --</option>';
      if (state.activeChatId) {
        const currentChat = state.chats[state.activeChatId];
        if (currentChat && currentChat.settings.myPersona) {
          const opt = document.createElement('option');
          opt.value = 'current_chat';
          opt.textContent = `当前聊天设定: ${currentChat.settings.myPersona.substring(0, 15).replace(/\n/g, ' ')}...`;
          personaSelect.appendChild(opt);
        }
      }
      if (state.personaPresets && state.personaPresets.length > 0) {
        state.personaPresets.forEach((p, index) => {
          const opt = document.createElement('option');
          opt.value = p.id;
          const summary = p.persona ? p.persona.substring(0, 20).replace(/\n/g, ' ') : `预设 ${index + 1}`;
          opt.textContent = `人设库: ${summary}...`;
          personaSelect.appendChild(opt);
        });
      }
    }

    const listEl = document.getElementById('mail-sender-list');
    listEl.innerHTML = '';
    const chars = Object.values(state.chats).filter(c => !c.isGroup);
    const npcs = await db.npcs.toArray();
    [...chars, ...npcs].forEach(c => {
      const div = document.createElement('div');
      div.className = 'gr-checkbox-item';
      div.innerHTML = `<input type="checkbox" value="${c.name}" data-type="${c.id ? 'char' : 'npc'}"> <span>${c.name}</span>`;
      div.onclick = (e) => { if (e.target.tagName !== 'INPUT') div.querySelector('input').click(); };
      listEl.appendChild(div);
    });

    const wbList = document.getElementById('mail-context-list');
    wbList.innerHTML = '';
    const books = await db.worldBooks.toArray();
    books.forEach(book => {
      const div = document.createElement('div');
      div.className = 'gr-checkbox-item';
      div.innerHTML = `<input type="checkbox" value="${book.id}"> <span>${book.name}</span>`;
      div.onclick = (e) => { if (e.target.tagName !== 'INPUT') div.querySelector('input').click(); };
      wbList.appendChild(div);
    });

    const config = loadMailConfig();
    if (config) {
      if (config.userMask) document.getElementById('mail-user-mask').value = config.userMask;
      if (config.worldContext) document.getElementById('mail-world-context').value = config.worldContext;
      if (config.personaId) personaSelect.value = config.personaId;
      if (config.genCount) document.getElementById('mail-gen-count').value = config.genCount;
      document.getElementById('mail-allow-random-npc').checked = config.allowRandom !== false;

      if (config.selectedSenders) {
        config.selectedSenders.forEach(val => {
          const cb = document.querySelector(`#mail-sender-list input[value="${val}"]`);
          if (cb) cb.checked = true;
        });
      }
      if (config.selectedBookIds) {
        config.selectedBookIds.forEach(val => {
          const cb = document.querySelector(`#mail-context-list input[value="${val}"]`);
          if (cb) cb.checked = true;
        });
      }
    }

    document.getElementById('email-generator-modal').classList.add('visible');
  }

  async function handleQuickReceiveMail() {
    const config = loadMailConfig();

    if (!config || !config.userMask) {
      await showCustomAlert("提示", "请先点击旁边的齿轮图标⚙️，配置您的收件人身份和背景。");
      openEmailSettings();
      return;
    }

    await showCustomAlert("正在接收...", `正在根据保存的配置 (${config.userMask}) 生成邮件...`);
    await executeEmailGeneration(config);
  }

  async function executeEmailGeneration(config) {
    const { userMask, worldContext, allowRandom, personaId, selectedSenders, selectedBookIds } = config;
    let genCount = parseInt(config.genCount) || 3;
    if (genCount > 10) genCount = 10;

    let detailedPersona = "";
    if (personaId === 'current_chat' && state.activeChatId) {
      const chat = state.chats[state.activeChatId];
      detailedPersona = chat.settings.myPersona || "";
    } else if (personaId) {
      const preset = state.personaPresets.find(p => p.id === personaId);
      if (preset) detailedPersona = preset.persona;
    }

    let worldBookText = "";
    for (const bid of (selectedBookIds || [])) {
      const wb = await db.worldBooks.get(bid);
      if (wb) worldBookText += `- 《${wb.name}》: ${wb.content.filter(e => e.enabled).map(e => e.content).join('; ')}\n`;
    }

    let characterContext = "";
    if (selectedSenders && selectedSenders.length > 0) {
      const activeChars = Object.values(state.chats).filter(c => !c.isGroup && selectedSenders.includes(c.name));
      if (activeChars.length > 0) {
        characterContext = "\n# 【重要】指定发件人的详细档案\n";
        activeChars.forEach(chat => {
          const memory = (chat.longTermMemory && chat.longTermMemory.length > 0) ? chat.longTermMemory.map(m => m.content).join('; ') : '暂无';
          const recentHistory = chat.history.filter(m => !m.isHidden).slice(-5).map(m => `${m.role === 'user' ? '我' : chat.name}: ${String(m.content).substring(0, 50)}`).join('\n');
          characterContext += `## 发件人: ${chat.name}\n- **人设**: ${chat.settings.aiPersona.substring(0, 200)}...\n- **长期记忆**: ${memory}\n- **最近对话**: \n${recentHistory}\n\n`;
        });
      }
    }

    const systemPrompt = `
# 角色：邮件系统生成器
请根据以下设定生成 **${genCount}** 封邮件。

# 收件人档案
- **身份**: ${userMask}
${detailedPersona ? `- **详细背景**: ${detailedPersona.replace(/\n/g, ' ')}` : ""}
- **世界观**: ${worldContext || "现代职场/生活"}
${worldBookText ? "- **世界书规则**: \n" + worldBookText : ""}

${characterContext}

# 发件人候选
${selectedSenders && selectedSenders.length > 0 ? "- 指定发件人: " + selectedSenders.join(', ') : ""}
${allowRandom ? "- 允许生成随机路人/广告/通知" : ""}

# 输出格式 (JSON Only)
\`\`\`json
[
  {
    "sender": "发件人姓名",
    "subject": "邮件标题",
    "content": "邮件正文 (支持换行符\\n)",
    "timestamp_offset": 0 (距离现在的分钟数，负数表示过去)
  }
]
\`\`\`
`;

    try {
      const { proxyUrl, apiKey, model } = state.apiConfig;

      let isGemini = proxyUrl.includes('generativelanguage');
      let apiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{ role: 'user', content: `Generate ${genCount} emails` }]);

      const response = isGemini ?
        await fetch(apiConfig.url, apiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Generate ${genCount} emails` }], temperature: 1.0 })
        });

      if (!response.ok) throw new Error("API请求失败");
      const data = await response.json();
      const text = getGeminiResponseText(data);
      const jsonStr = text.replace(/^```json\s*/, '').replace(/```$/, '');
      const emails = JSON.parse(jsonStr);

      const now = Date.now();
      const newEmails = emails.map(e => ({
        sender: e.sender,
        senderType: 'gen',
        recipient: userMask,
        subject: e.subject,
        content: e.content,
        timestamp: now - (e.timestamp_offset || 0) * 60000,
        isRead: false
      }));

      await db.emails.bulkAdd(newEmails);
      await renderEmailList();
      await showCustomAlert("接收成功", `收到 ${newEmails.length} 封新邮件。`);

    } catch (e) {
      console.error(e);
      alert("生成失败: " + e.message);
    }
  }

  async function forwardEmailToChat(email) {
    await openShareTargetPicker();

    const confirmBtn = document.getElementById('confirm-share-target-btn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.onclick = async () => {
      const selectedTargetIds = Array.from(document.querySelectorAll('.share-target-checkbox:checked'))
        .map(cb => cb.dataset.chatId);

      if (selectedTargetIds.length === 0) return alert("请选择要转发到的聊天。");

      const emailCardMsg = {
        role: 'user',
        type: 'forwarded_email',
        timestamp: Date.now(),
        content: `[邮件] ${email.subject}`,
        emailData: {
          subject: email.subject,
          sender: email.sender,
          date: new Date(email.timestamp).toLocaleString(),
          preview: email.content.replace(/\n/g, ' ').substring(0, 100),
          fullContent: email.content
        }
      };

      const forwardContentForAI = `
📧 **转发邮件**
**发件人:** ${email.sender}
**收件人:** ${email.recipient || '我'}
**主题:** ${email.subject}
----------------
${email.content}
`;

      for (const targetId of selectedTargetIds) {
        const targetChat = state.chats[targetId];
        if (targetChat) {
          targetChat.history.push(emailCardMsg);

          const isSelfEmail = (email.sender === targetChat.name) || (email.sender === targetChat.originalName);

          let systemHintText = "";

          if (isSelfEmail) {
            systemHintText = `[系统提示：用户把你【之前发给TA的这封邮件】转发回给你了。请注意：这封邮件是**你自己写**的，不是用户写的。用户可能是想和你讨论邮件里的内容，或者对你的邮件表示回应。请以"邮件作者"的身份进行回复。]`;
          } else {
            systemHintText = `[系统提示：用户转发了一封邮件给你。这封邮件是【${email.sender}】写的。请根据内容和你们的关系做出反应。]`;
          }

          targetChat.history.push({
            role: 'system',
            content: `${systemHintText}\n\n--- 邮件详情 ---\n${forwardContentForAI}`,
            timestamp: Date.now() + 1,
            isHidden: true
          });

          await db.chats.put(targetChat);
        }
      }

      document.getElementById('share-target-modal').classList.remove('visible');
      await showCustomAlert("转发成功", "邮件已以卡片形式发送。");

      if (state.activeChatId && selectedTargetIds.includes(state.activeChatId)) {
        renderChatInterface(state.activeChatId);
      }
    };
  }

  window.mailState = mailState;
  window.openEmailApp = openEmailApp;
  window.renderEmailList = renderEmailList;
  window.handleEmailSelection = handleEmailSelection;
  window.updateMailDeleteButton = updateMailDeleteButton;
  window.executeBatchDeleteEmails = executeBatchDeleteEmails;
  window.handleSelectAllEmails = handleSelectAllEmails;
  window.openEmailDetail = openEmailDetail;
  window.closeEmailDetail = closeEmailDetail;
  window.toggleEmailEditMode = toggleEmailEditMode;
  window.deleteEmail = deleteEmail;
  window.deleteCurrentEmail = deleteCurrentEmail;
  window.saveMailConfig = saveMailConfig;
  window.loadMailConfig = loadMailConfig;
  window.openEmailSettings = openEmailSettings;
  window.handleQuickReceiveMail = handleQuickReceiveMail;
  window.executeEmailGeneration = executeEmailGeneration;
  window.forwardEmailToChat = forwardEmailToChat;

