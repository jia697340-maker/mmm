  async function createNewStory() {
    grState.activeStoryId = null; // 标记为新建
    document.getElementById('gr-story-title').value = '';
    await loadStorySettingsUI();
    document.getElementById('gr-settings-modal').classList.add('visible');
  }

  async function openStorySettings() {
    if (!grState.activeStoryId) return;
    const story = await db.grStories.get(grState.activeStoryId);
    if (!story) return;

    document.getElementById('gr-story-title').value = story.title;
    await loadStorySettingsUI(story.settings, story.authorId);

    document.getElementById('gr-settings-modal').classList.add('visible');
  }

  // 加载设置弹窗中的选项
  // 加载设置弹窗中的选项 (修复版：增加字数和条数的回显)
  async function loadStorySettingsUI(settings = {}, selectedAuthorId = null) {
    const exportBtn = document.getElementById('gr-export-txt-btn');
    if (exportBtn) {
      if (grState.activeStoryId) {
        exportBtn.style.display = 'block';
        exportBtn.onclick = () => openExportTxtModal(grState.activeStoryId);
      } else {
        exportBtn.style.display = 'none';
      }
    }

    // 1. 加载作者列表
    const authorSelect = document.getElementById('gr-author-select');
    authorSelect.innerHTML = '';
    const authors = await db.grAuthors.toArray();
    authors.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      if (selectedAuthorId === a.id) opt.selected = true;
      authorSelect.appendChild(opt);
    });

    // 2. 加载角色列表 (Chats + NPCs)
    const charList = document.getElementById('gr-char-list');
    charList.innerHTML = '';
    const chars = Object.values(state.chats);
    const npcs = await db.npcs.toArray();

    const allEntities = [
      ...chars.map(c => ({ id: c.id, name: c.name, type: c.isGroup ? '群聊' : '角色' })),
      ...npcs.map(n => ({ id: `npc_${n.id}`, name: n.name, type: 'NPC' }))
    ];

    allEntities.forEach(item => {
      const div = document.createElement('div');
      div.className = 'gr-checkbox-item';
      // 回显：检查是否在已保存的列表中
      const isChecked = settings.charIds && settings.charIds.includes(item.id);
      div.innerHTML = `<input type="checkbox" value="${item.id}" ${isChecked ? 'checked' : ''}> <span>${item.name} <small style="color:#999">(${item.type})</small></span>`;
      div.onclick = (e) => { if (e.target.tagName !== 'INPUT') div.querySelector('input').click(); };
      charList.appendChild(div);
    });

    // 3. 加载世界书列表
    const wbList = document.getElementById('gr-worldbook-list');
    wbList.innerHTML = '';
    const books = await db.worldBooks.toArray();
    books.forEach(book => {
      const div = document.createElement('div');
      div.className = 'gr-checkbox-item';
      // 回显：检查是否在已保存的列表中
      const isChecked = settings.bookIds && settings.bookIds.includes(book.id);
      div.innerHTML = `<input type="checkbox" value="${book.id}" ${isChecked ? 'checked' : ''}> <span>${book.name}</span>`;
      div.onclick = (e) => { if (e.target.tagName !== 'INPUT') div.querySelector('input').click(); };
      wbList.appendChild(div);
    });

    // 4. 加载User预设
    const userSelect = document.getElementById('gr-user-persona-select');
    userSelect.innerHTML = '<option value="">当前默认</option>';
    const presets = await db.personaPresets.toArray();
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.persona.substring(0, 20) + '...';
      // 回显：选中已保存的 User Persona
      if (settings.userPersonaId === p.id) opt.selected = true;
      userSelect.appendChild(opt);
    });

    // 5. 【核心修复】：回显字数和上下文条数
    // 如果 settings 里有值，就用 settings 里的；如果没有（新建时），就用默认值 500 和 20
    document.getElementById('gr-output-length').value = settings.outputLength || 500;
    document.getElementById('gr-context-limit').value = settings.contextLimit || 20;
    document.getElementById('gr-reader-comments-enabled').checked = settings.readerCommentsEnabled || false;
    document.getElementById('gr-macro-world-view').value = settings.macroWorldView || '';

    // 绑定按钮事件
    const saveBtn = document.getElementById('gr-save-story-btn');
    const cancelBtn = document.getElementById('gr-cancel-settings-btn');

    // 使用 cloneNode 清除旧的监听器，防止多次点击
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);

    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newSaveBtn.onclick = () => saveStorySettings();
    newCancelBtn.onclick = () => document.getElementById('gr-settings-modal').classList.remove('visible');
  }

  // 5. 修复版：保存作品设置
  async function saveStorySettings() {
    // 获取 DOM 元素
    const titleInput = document.getElementById('gr-story-title');
    const authorSelect = document.getElementById('gr-author-select');
    const userPersonaSelect = document.getElementById('gr-user-persona-select');
    const outputLengthInput = document.getElementById('gr-output-length'); // 检查HTML ID是否一致
    const contextLimitInput = document.getElementById('gr-context-limit'); // 检查HTML ID是否一致
    const macroWorldViewInput = document.getElementById('gr-macro-world-view');
    const title = titleInput.value.trim();
    const authorId = parseInt(authorSelect.value);

    const charIds = Array.from(document.querySelectorAll('#gr-char-list input:checked')).map(cb => cb.value);
    const bookIds = Array.from(document.querySelectorAll('#gr-worldbook-list input:checked')).map(cb => cb.value);
    const userPersonaId = userPersonaSelect.value;

    // 【核心修复】：确保这里取到的是数字，并且有默认值
    const outputLength = parseInt(outputLengthInput.value) || 500;
    const contextLimit = parseInt(contextLimitInput.value) || 20;
    const readerCommentsEnabled = document.getElementById('gr-reader-comments-enabled').checked;
    const macroWorldView = macroWorldViewInput.value.trim();
    if (!title) return alert("请输入书名");
    if (charIds.length === 0) return alert("请至少选择一个角色或群聊");

    const settings = {
      charIds,
      bookIds,
      userPersonaId,
      outputLength, // 这里的名字要和 prompt 里的对应
      contextLimit,
      macroWorldView,
      readerCommentsEnabled
    };

    if (grState.activeStoryId) {
      // 更新现有作品
      await db.grStories.update(grState.activeStoryId, { title, authorId, settings });
    } else {
      // 新建作品
      const newStory = {
        title,
        authorId,
        settings,
        chapters: [],
        lastUpdated: Date.now()
      };
      grState.activeStoryId = await db.grStories.add(newStory);
    }

    document.getElementById('gr-settings-modal').classList.remove('visible');

    // 打开阅读器，并定位到最新一章
    const story = await db.grStories.get(grState.activeStoryId);
    const lastIndex = Math.max(0, story.chapters.length - 1);
    openReader(grState.activeStoryId, lastIndex);
  }

  function showReaderCommentsPopup(comments) {
    const popup = document.getElementById('gr-reader-comments-popup');
    const listEl = popup && popup.querySelector('.gr-comments-popup-list');
    if (!popup || !listEl) return;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    listEl.innerHTML = (comments || []).map(c => {
      const name = escapeHtml(c.name || '读者');
      const content = escapeHtml(c.content || '');
      return `<div class="gr-comment-item"><div class="gr-comment-name">${name}</div><div class="gr-comment-content">${content}</div></div>`;
    }).join('');
    popup.style.display = 'flex';
    const close = () => { popup.style.display = 'none'; };
    popup.onclick = (e) => { if (e.target === popup) close(); };
    const closeBtn = popup.querySelector('.gr-comments-popup-close');
    if (closeBtn) closeBtn.onclick = close;
  }

  // 6. 阅读器逻辑 - 分页版 (Jinjiang Style)
  async function openReader(storyId, chapterIndex = 0) {
    grState.activeStoryId = storyId;
    const story = await db.grStories.get(storyId);
    if (!story) return;

    // 确保索引合法
    const totalChapters = story.chapters.length;
    if (totalChapters > 0 && chapterIndex >= totalChapters) chapterIndex = totalChapters - 1;
    if (chapterIndex < 0) chapterIndex = 0;

    grState.currentChapterIndex = chapterIndex;

    // 更新顶部标题
    document.getElementById('gr-book-name-display').textContent = story.title;

    const contentArea = document.getElementById('gr-reader-content');
    contentArea.innerHTML = '';

    // --- 场景 A: 尚未开始 (没有章节) ---
    if (totalChapters === 0) {
      document.getElementById('gr-chapter-title-display').textContent = "序章";
      contentArea.innerHTML = `
            <div style="text-align:center; padding-top:100px; color:#888;">
                <p>故事尚未开始。</p>
                <p>请在下方输入第一章的剧情走向，点击"续写"开始创作。</p>
            </div>
        `;
      // 显示写作控制栏，隐藏翻页栏
      document.getElementById('gr-pagination-controls').style.display = 'none';
      document.getElementById('gr-writing-controls').style.display = 'flex';

      // 绑定生成按钮
      updateGenButtonBinding();
      showScreen('gr-reader-screen');
      return;
    }

    // --- 场景 B: 显示特定章节 ---
    const chapter = story.chapters[chapterIndex];
    grState.currentReaderChapter = chapter;
    const chapterTitle = chapter.title || `第 ${chapterIndex + 1} 章`; // 如果没有标题，使用默认

    document.getElementById('gr-chapter-title-display').textContent = chapterTitle;

    // 1. 顶部：前情提要 (Context)
    if (chapter.prevSummary) {
      contentArea.innerHTML += `
            <details class="gr-summary-box top-summary">
                <summary>📖 上文提要 (Context)</summary>
                <div class="gr-summary-content" style="font-size:12px; color:#888;">${chapter.prevSummary}</div>
            </details>
        `;
    }

    // 2. 章节大标题
    contentArea.innerHTML += `<div class="gr-chapter-title-large">${chapterTitle}</div>`;

    // 3. 正文（有读者评论时按段渲染+气泡，否则整块）
    const commentMap = {};
    (chapter.readerComments || []).forEach(rc => {
      const idx = typeof rc.segmentIndex === 'number' ? rc.segmentIndex : parseInt(rc.segmentIndex, 10);
      if (!isNaN(idx)) commentMap[idx] = Array.isArray(rc.comments) ? rc.comments : [];
    });
    
    // 调试信息
    console.log('[绿江调试] 章节评论数据:', chapter.readerComments);
    console.log('[绿江调试] 评论映射:', commentMap);
    
    const segments = (chapter.content || '').split(/\n\n/);
    console.log('[绿江调试] 段落数量:', segments.length);
    console.log('[绿江调试] 前3个段落:', segments.slice(0, 3));
    
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (segments.length <= 1 && Object.keys(commentMap).length === 0) {
      contentArea.innerHTML += `<div class="gr-chapter-text">${(chapter.content || '').replace(/\n/g, '<br>')}</div>`;
    } else {
      let bodyHtml = '';
      segments.forEach((seg, i) => {
        // 先转义文本内容，然后替换换行符
        const text = escapeHtml(seg.trim()).replace(/\n/g, '<br>');
        const comments = commentMap[i];
        
        // 创建段落div
        bodyHtml += '<div class="gr-chapter-segment">' + text;
        
        // 如果有评论，添加气泡（不转义，因为这是我们自己生成的HTML）
        if (comments && comments.length > 0) {
          console.log(`[绿江调试] 段落 ${i} 有 ${comments.length} 条评论`);
          bodyHtml += ` <span class="gr-reader-comment-bubble" data-segment-index="${i}">${comments.length}条</span>`;
        }
        
        bodyHtml += '</div>';
      });
      console.log('[绿江调试] 生成的HTML长度:', bodyHtml.length);
      console.log('[绿江调试] HTML片段示例:', bodyHtml.substring(0, 500));
      contentArea.innerHTML += bodyHtml;
    }

    // 读者评论气泡：事件委托，避免被后续 innerHTML 替换掉绑定
    if (!contentArea._readerCommentDelegation) {
      contentArea._readerCommentDelegation = true;
      contentArea.addEventListener('click', function (e) {
        const bubble = e.target.closest('.gr-reader-comment-bubble');
        if (!bubble) return;
        e.preventDefault();
        const curChapter = grState.currentReaderChapter;
        if (!curChapter || !curChapter.readerComments) return;
        const idx = parseInt(bubble.dataset.segmentIndex, 10);
        const list = curChapter.readerComments.find(r => Number(r.segmentIndex) === idx);
        const comments = list ? (list.comments || []) : [];
        showReaderCommentsPopup(comments);
      });
    }

    // 4. 底部：本章摘要 (可编辑)
    const summaryHtml = `
            <div class="gr-summary-card editable">
                <div class="gr-summary-header">
                    <span class="gr-summary-title">Chapter Checkpoint · 剧情存档</span>
                    <button class="gr-mini-btn save-summary-btn" data-index="${chapterIndex}">保存修改</button>
                </div>
                <textarea class="gr-summary-input" data-index="${chapterIndex}" placeholder="在此处概括本章关键剧情点，供AI记忆...">${chapter.summary || ''}</textarea>
                 <div class="gr-summary-footer">
                    * AI续写时将读取此框内容作为唯一记忆依据。
                </div>
            </div>
        `;
    contentArea.innerHTML += summaryHtml;
    contentArea.innerHTML += `<div style="height: 100px;"></div>`;

    // 绑定保存摘要按钮
    contentArea.querySelectorAll('.save-summary-btn').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.dataset.index);
        const textarea = contentArea.querySelector(`.gr-summary-input[data-index="${idx}"]`);
        saveChapterSummary(storyId, idx, textarea.value);
        e.target.textContent = "已保存";
        setTimeout(() => e.target.style.display = 'none', 1000);
      };
    });

    // 5. 更新底部导航栏状态
    const prevBtn = document.getElementById('gr-prev-chapter-btn');
    const nextBtn = document.getElementById('gr-next-chapter-btn');
    const paginationDiv = document.getElementById('gr-pagination-controls');
    const writingDiv = document.getElementById('gr-writing-controls');
    const rerollBtn = document.getElementById('gr-reroll-btn');

    // 总是显示分页栏，写作栏只在最后一页显示
    paginationDiv.style.display = 'flex';

    prevBtn.disabled = (chapterIndex === 0);
    prevBtn.onclick = () => openReader(storyId, chapterIndex - 1);

    if (chapterIndex < totalChapters - 1) {
      // 如果不是最后一章
      nextBtn.textContent = "下一章";
      nextBtn.onclick = () => openReader(storyId, chapterIndex + 1);
      writingDiv.style.display = 'none'; // 隐藏写作栏
    } else {
      // 如果是最后一章
      nextBtn.textContent = "续写下一章";
      nextBtn.onclick = () => {
        // 点击下一章按钮时，显示写作栏，并自动滚动到底部
        writingDiv.style.display = 'flex';
        contentArea.scrollTop = contentArea.scrollHeight;
        document.getElementById('gr-direction-input').focus();
      };
      // 默认也显示写作栏
      writingDiv.style.display = 'flex';

      // 绑定重写按钮
      rerollBtn.onclick = async () => {
        const confirmed = await showCustomConfirm("重写本章", "确定要删除当前章节并重新生成吗？", { confirmText: "重写", confirmButtonClass: "btn-danger" });
        if (confirmed) handleGenerateStoryContent(true);
      };
    }

    // 绑定生成按钮
    updateGenButtonBinding();

    showScreen('gr-reader-screen');
    contentArea.scrollTop = 0;
  }

  // 辅助：绑定生成按钮
  function updateGenButtonBinding() {
    const genBtn = document.getElementById('gr-generate-btn');
    // 使用克隆节点来移除旧的监听器
    const newBtn = genBtn.cloneNode(true);
    genBtn.parentNode.replaceChild(newBtn, genBtn);
    newBtn.onclick = () => handleGenerateStoryContent(false);
  }

  // 辅助：更新底部控制栏
  function updateControlPanel(story) {
    const controlPanel = document.querySelector('.gr-control-panel');
    // 清空旧内容，重新构建
    controlPanel.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center; width:100%;">
            <div class="gr-input-group" style="flex-grow:1;">
                <input type="text" id="gr-direction-input" class="gr-input" placeholder="输入剧情走向 (留空则自由续写)...">
            </div>
            
            ${story.chapters.length > 0 ? `
            <button id="gr-reroll-btn" class="gr-main-btn" style="background-color:#F4F4F5; color:#666; border:1px solid #ddd;" title="不满当前章？重写！">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </button>
            ` : ''}

            <button id="gr-generate-btn" class="gr-main-btn">
                <span id="gr-gen-text">续写</span>
                <svg id="gr-gen-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path></svg>
            </button>
        </div>
    `;

    // 绑定事件
    document.getElementById('gr-generate-btn').onclick = () => handleGenerateStoryContent(false); // false = 不是重写

    const rerollBtn = document.getElementById('gr-reroll-btn');
    if (rerollBtn) {
      rerollBtn.onclick = async () => {
        const confirmed = await showCustomConfirm("重写本章", "确定要删除当前最新章节并重新生成吗？\n(如果你刚才修改了摘要，重写后需要重新修改)", { confirmText: "重写", confirmButtonClass: "btn-danger" });
        if (confirmed) {
          handleGenerateStoryContent(true); // true = 是重写
        }
      };
    }
  }

  // 辅助：保存修改后的摘要
  async function saveChapterSummary(storyId, chapterIndex, newSummary) {
    const story = await db.grStories.get(storyId);
    if (story && story.chapters[chapterIndex]) {
      story.chapters[chapterIndex].summary = newSummary;
      await db.grStories.put(story);
      console.log("摘要已手动更新");
    }
  }
  // 7. 核心生成逻辑 (The Writer) - 字数强力修正版
