// ==================== 向量记忆视图 ====================
function renderVectorMemoryView() {
  const container = document.getElementById('vector-memory-container');
  const chat = state.chats[state.activeChatId];
  if (!chat || !window.vectorMemoryManager) {
    container.innerHTML = '<p style="text-align:center; color:#999; margin-top:40px;">变量记忆模块未加载</p>';
    return;
  }

  window.vectorMemoryManager.renderMemoryUI(chat, container);
  bindVectorMemoryEvents(chat, container);
}

function bindVectorMemoryEvents(chat, container) {
  // ===== 批量操作状态 =====
  let vmBatchMode = false;
  let vmSelectedItems = []; // [{type: 'core'|'fragment', id}]

  function vmUpdateBatchCount() {
    const countEl = container.querySelector('#vm-batch-selected-count');
    if (countEl) countEl.textContent = vmSelectedItems.length;
  }

  function vmToggleBatchMode(enable) {
    vmBatchMode = enable;
    vmSelectedItems = [];
    const batchBar = container.querySelector('#vm-batch-toolbar');
    if (batchBar) batchBar.style.display = enable ? 'flex' : 'none';
    container.querySelectorAll('.vm-batch-element').forEach(el => {
      el.style.display = enable ? 'flex' : 'none';
      el.classList.remove('checked');
    });
    container.querySelectorAll('.vm-item-row').forEach(row => row.classList.remove('selected'));
    vmUpdateBatchCount();
  }

  function vmIsSelected(type, id) {
    return vmSelectedItems.some(i => i.type === type && i.id === id);
  }

  function vmToggleItem(type, id) {
    const idx = vmSelectedItems.findIndex(i => i.type === type && i.id === id);
    if (idx >= 0) {
      vmSelectedItems.splice(idx, 1);
    } else {
      vmSelectedItems.push({ type, id });
    }
    vmUpdateBatchCount();
  }

  // 批量模式切换
  const batchToggleBtn = container.querySelector('#vm-batch-toggle-btn');
  if (batchToggleBtn) {
    batchToggleBtn.addEventListener('click', () => vmToggleBatchMode(true));
  }
  const batchCancelBtn = container.querySelector('#vm-batch-cancel-btn');
  if (batchCancelBtn) {
    batchCancelBtn.addEventListener('click', () => vmToggleBatchMode(false));
  }

  // 全选
  const batchSelectAllBtn = container.querySelector('#vm-batch-select-all-btn');
  if (batchSelectAllBtn) {
    batchSelectAllBtn.addEventListener('click', () => {
      vmSelectedItems = [];
      container.querySelectorAll('.vm-item-checkbox').forEach(cb => {
        vmSelectedItems.push({ type: cb.dataset.type, id: cb.dataset.id });
        cb.classList.add('checked');
        const row = cb.closest('.vm-item-row');
        if (row) row.classList.add('selected');
      });
      container.querySelectorAll('.vm-section-select-all').forEach(sa => sa.classList.add('checked'));
      vmUpdateBatchCount();
    });
  }

  // 复制选中
  const batchCopyBtn = container.querySelector('#vm-batch-copy-btn');
  if (batchCopyBtn) {
    batchCopyBtn.addEventListener('click', async () => {
      if (vmSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const text = window.vectorMemoryManager.getSelectedItemsText(chat, vmSelectedItems);
      try {
        await navigator.clipboard.writeText(text);
        showToast(`已复制 ${vmSelectedItems.length} 条记忆`, 'success');
      } catch (e) {
        showToast('复制失败', 'error');
      }
    });
  }

  // 导出选中
  const batchExportBtn = container.querySelector('#vm-batch-export-btn');
  if (batchExportBtn) {
    batchExportBtn.addEventListener('click', () => {
      if (vmSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const json = window.vectorMemoryManager.exportSelected(chat, vmSelectedItems);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vector-memory-selected-${chat.originalName || chat.name}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${vmSelectedItems.length} 条记忆`, 'success');
    });
  }

  // 批量删除
  const batchDeleteBtn = container.querySelector('#vm-batch-delete-btn');
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener('click', async () => {
      if (vmSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const confirmed = await showCustomConfirm('确认批量删除', `确定要删除选中的 ${vmSelectedItems.length} 条记忆吗？此操作不可撤销。`, { confirmButtonClass: 'btn-danger', confirmText: '确认删除' });
      if (confirmed) {
        window.vectorMemoryManager.batchDelete(chat, vmSelectedItems);
        await db.chats.put(chat);
        renderVectorMemoryView();
        showToast(`已删除 ${vmSelectedItems.length} 条记忆`, 'success');
      }
    });
  }

  // 复选框点击
  container.querySelectorAll('.vm-item-checkbox').forEach(cb => {
    cb.addEventListener('click', () => {
      const type = cb.dataset.type;
      const id = cb.dataset.id;
      vmToggleItem(type, id);
      cb.classList.toggle('checked');
      const row = cb.closest('.vm-item-row');
      if (row) row.classList.toggle('selected');
    });
  });

  // 日期选择器修改事件
  container.querySelectorAll('.vm-time-picker').forEach(picker => {
    picker.addEventListener('change', async (e) => {
      const id = picker.dataset.id;
      const newTimeStr = e.target.value;
      if (!newTimeStr) return;
      
      const newTime = new Date(newTimeStr).getTime();
      window.vectorMemoryManager.editFragment(chat, id, { memoryTime: newTime });
      await db.chats.put(chat);
      showToast('记忆时间已更新', 'success');
      // 重新渲染以排序
      renderVectorMemoryView();
    });
  });

  // 分类全选
  container.querySelectorAll('.vm-section-select-all').forEach(sa => {
    sa.addEventListener('click', () => {
      const section = sa.closest('.vm-section');
      const checkboxes = section.querySelectorAll('.vm-item-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.classList.contains('checked'));
      checkboxes.forEach(cb => {
        const type = cb.dataset.type;
        const id = cb.dataset.id;
        if (allChecked) {
          cb.classList.remove('checked');
          const row = cb.closest('.vm-item-row');
          if (row) row.classList.remove('selected');
          const sIdx = vmSelectedItems.findIndex(i => i.type === type && i.id === id);
          if (sIdx >= 0) vmSelectedItems.splice(sIdx, 1);
        } else {
          if (!vmIsSelected(type, id)) {
            vmSelectedItems.push({ type, id });
          }
          cb.classList.add('checked');
          const row = cb.closest('.vm-item-row');
          if (row) row.classList.add('selected');
        }
      });
      sa.classList.toggle('checked', !allChecked);
      vmUpdateBatchCount();
    });
  });

  // 添加记忆片段
  const addFragBtn = container.querySelector('#vm-add-fragment-btn');
  if (addFragBtn) {
    addFragBtn.addEventListener('click', async () => {
      const content = await showCustomPrompt('添加记忆片段', '输入记忆内容：', '', 'textarea');
      if (!content || !content.trim()) return;
      const tags = await showCustomPrompt('添加标签', '输入关键词标签（逗号分隔）：', '');
      const tagArr = tags ? tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      const embedding = await window.vectorMemoryManager.getEmbedding(content.trim(), chat);
      window.vectorMemoryManager.createFragment(chat, {
        content: content.trim(), tags: tagArr, category: 'E', importance: 5,
        emotionalWeight: 3, embedding, source: 'manual'
      });
      await db.chats.put(chat);
      renderVectorMemoryView();
      showToast('记忆片段已添加', 'success');
    });
  }

  // 添加核心记忆
  const addCoreBtn = container.querySelector('#vm-add-core-btn');
  if (addCoreBtn) {
    addCoreBtn.addEventListener('click', async () => {
      const content = await showCustomPrompt('添加核心记忆', '核心记忆会永远注入到对话中：');
      if (!content || !content.trim()) return;
      window.vectorMemoryManager.addCoreMemory(chat, content.trim());
      await db.chats.put(chat);
      renderVectorMemoryView();
      showToast('核心记忆已添加', 'success');
    });
  }

  // 设置按钮
  const settingsBtn = container.querySelector('#vm-settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      openVectorMemorySettings(chat, 'settings');
    });
  }

  // 便携教程按钮
  const guideBtn = container.querySelector('#vm-guide-btn');
  if (guideBtn) {
    guideBtn.addEventListener('click', () => {
      openVectorMemorySettings(chat, 'guide');
    });
  }

  // 导出
  const exportBtn = container.querySelector('#vm-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const json = window.vectorMemoryManager.exportMemory(chat);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vector-memory-${chat.originalName || chat.name}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('导出成功', 'success');
    });
  }

  // 导入
  const importBtn = container.querySelector('#vm-import-btn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const mode = await showCustomConfirm('导入模式', '选择"确认"为合并模式（保留现有数据），选择"取消"为替换模式（清空现有数据）');
          const importMode = mode ? 'merge' : 'replace';
          showToast('正在导入...', 'info');
          const count = await window.vectorMemoryManager.importMemory(chat, text, importMode);
          await db.chats.put(chat);
          renderVectorMemoryView();
          showToast(`成功导入 ${count} 条记忆`, 'success');
        } catch (err) {
          showToast('导入失败: ' + err.message, 'error');
        }
      };
      input.click();
    });
  }

  // 总结按钮
  const summaryBtn = container.querySelector('#vm-summary-btn');
  if (summaryBtn) {
    summaryBtn.addEventListener('click', async () => {
      await openVectorSummaryMenu(chat);
    });
  }

  // 编辑/删除核心记忆
  container.querySelectorAll('.vm-edit-core-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const vm = window.vectorMemoryManager.getVariableMemory(chat);
      const mem = vm.fragments.find(m => m.id === id && m.category === 'C');
      if (!mem) return;
      const newContent = await showCustomPrompt('编辑核心记忆', '修改内容：', mem.content);
      if (newContent !== null && newContent.trim()) {
        window.vectorMemoryManager.editCoreMemory(chat, id, newContent.trim());
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });
  container.querySelectorAll('.vm-delete-core-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('确认删除', '确定要删除这条核心记忆吗？');
      if (confirmed) {
        window.vectorMemoryManager.deleteCoreMemory(chat, btn.dataset.id);
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });

  // 钉选/编辑/删除记忆片段
  container.querySelectorAll('.vm-pin-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      window.vectorMemoryManager.pinToCoreMemory(chat, btn.dataset.id);
      await db.chats.put(chat);
      renderVectorMemoryView();
      showToast('已钉选为核心记忆', 'success');
    });
  });
  container.querySelectorAll('.vm-edit-frag-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const frag = window.vectorMemoryManager.getFragment(chat, btn.dataset.id);
      if (!frag) return;
      const newContent = await showCustomPrompt('编辑记忆片段', '修改内容：', frag.content, 'textarea');
      if (newContent !== null && newContent.trim()) {
        window.vectorMemoryManager.editFragment(chat, btn.dataset.id, { content: newContent.trim() });
        // 重新生成embedding
        const embedding = await window.vectorMemoryManager.getEmbedding(newContent.trim(), chat);
        if (embedding) frag.embedding = embedding;
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });
  container.querySelectorAll('.vm-delete-frag-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('确认删除', '确定要删除这条记忆片段吗？');
      if (confirmed) {
        window.vectorMemoryManager.deleteFragment(chat, btn.dataset.id);
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });
}

async function openVectorMemorySettings(chat, defaultTab = 'settings') {
  const settingsHtml = window.vectorMemoryManager.renderSettingsPanel(chat);

  const guideHtml = window.vectorMemoryManager.renderGuide ? window.vectorMemoryManager.renderGuide() : '<div style="padding:20px;text-align:center;">暂无教程内容</div>';

  // 创建全屏设置面板
  let panel = document.getElementById('vm-settings-screen');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'vm-settings-screen';
  panel.className = 'vm-fullscreen-panel';
  panel.innerHTML = `
    <div class="vm-panel-header">
      <span class="vm-panel-back" id="vm-settings-back">&lsaquo;</span>
      <span class="vm-panel-title">变量记忆</span>
      <span style="width:30px;"></span>
    </div>
    <div class="vm-panel-tabs">
      <div class="vm-panel-tab ${defaultTab === 'settings' ? 'active' : ''}" data-tab="settings">极客设置</div>
      <div class="vm-panel-tab ${defaultTab === 'guide' ? 'active' : ''}" data-tab="guide">便携教程</div>
    </div>
    <div class="vm-panel-body">
      <div class="vm-panel-content ${defaultTab === 'settings' ? 'active' : ''}" id="vm-tab-settings">${settingsHtml}</div>
      <div class="vm-panel-content ${defaultTab === 'guide' ? 'active' : ''}" id="vm-tab-guide">${guideHtml}</div>
    </div>
  `;
  document.body.appendChild(panel);

  // Tab切换
  panel.querySelectorAll('.vm-panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.vm-panel-tab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.vm-panel-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = panel.querySelector('#vm-tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // 返回按钮
  panel.querySelector('#vm-settings-back').addEventListener('click', () => {
    panel.remove();
  });

  // 绑定checkbox联动
  const customEmbeddingCb = panel.querySelector('#vm-custom-embedding');
  if (customEmbeddingCb) {
    customEmbeddingCb.addEventListener('change', () => {
      const fields = panel.querySelector('#vm-custom-embedding-fields');
      if (fields) fields.style.display = customEmbeddingCb.checked ? 'block' : 'none';
    });
  }
  const periodicCb = panel.querySelector('#vm-periodic-review');
  if (periodicCb) {
    periodicCb.addEventListener('change', () => {
      const group = panel.querySelector('#vm-review-interval-group');
      if (group) group.style.display = periodicCb.checked ? 'block' : 'none';
    });
  }
  const customPromptCb = panel.querySelector('#vm-custom-prompt');
  if (customPromptCb) {
    customPromptCb.addEventListener('change', () => {
      const field = panel.querySelector('#vm-custom-prompt-field');
      if (field) field.style.display = customPromptCb.checked ? 'block' : 'none';
    });
  }

  // 重置提示词按钮
  const resetPromptBtn = panel.querySelector('#vm-reset-prompt-btn');
  if (resetPromptBtn) {
    resetPromptBtn.addEventListener('click', () => {
      const textarea = panel.querySelector('#vm-custom-prompt-text');
      if (textarea) {
        textarea.value = window.vectorMemoryManager.getDefaultExtractionPrompt();
        showToast('已重置为默认提示词', 'success');
      }
    });
  }

  // 模型输入/下拉切换
  const toggleModelInputBtn = panel.querySelector('#vm-toggle-model-input');
  const modelInputEl = panel.querySelector('#vm-embedding-model-input');
  const modelSelectEl = panel.querySelector('#vm-embedding-model-select');
  
  if (toggleModelInputBtn && modelInputEl && modelSelectEl) {
    toggleModelInputBtn.addEventListener('click', () => {
      if (modelInputEl.style.display === 'none') {
        modelInputEl.style.display = 'block';
        modelSelectEl.style.display = 'none';
        toggleModelInputBtn.textContent = '切换为下拉选择';
      } else {
        modelInputEl.style.display = 'none';
        modelSelectEl.style.display = 'block';
        toggleModelInputBtn.textContent = '切换为手动输入';
      }
    });
  }

  // 监听下拉框变化，自动填入手写框
  if (modelSelectEl && modelInputEl) {
    modelSelectEl.addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (selectedModel) {
        modelInputEl.value = selectedModel;
      }
    });
  }

  // 拉取模型按钮
  const fetchModelsBtn = panel.querySelector('#vm-fetch-models-btn');
  if (fetchModelsBtn) {
    fetchModelsBtn.addEventListener('click', async () => {
      if (!modelSelectEl) return;
      fetchModelsBtn.textContent = '拉取中...';
      fetchModelsBtn.disabled = true;
      try {
        const models = await window.vectorMemoryManager.fetchAvailableModels(chat);
        
        modelSelectEl.innerHTML = '';
        
        if (models.length === 0) {
           const option = document.createElement('option');
           option.value = "";
           option.textContent = "未找到可用模型";
           modelSelectEl.appendChild(option);
        } else {
          // 当前保存的模型或者输入框里的模型
          const currentModel = vm.settings.embeddingModel || 'text-embedding-3-small';
          let foundCurrent = false;

          models.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            if (modelId === currentModel) {
                option.selected = true;
                foundCurrent = true;
            }
            modelSelectEl.appendChild(option);
          });
          
          // 如果当前模型不在列表里，把它也加进去并选中
          if (!foundCurrent && currentModel) {
              const option = document.createElement('option');
              option.value = currentModel;
              option.textContent = currentModel + " (当前)";
              option.selected = true;
              modelSelectEl.insertBefore(option, modelSelectEl.firstChild);
          }
          
          // 切换到下拉框模式
          modelInputEl.style.display = 'none';
          modelSelectEl.style.display = 'block';
          if(toggleModelInputBtn) toggleModelInputBtn.textContent = '切换为手动输入';
          
          showToast('模型列表已更新', 'success');
        }
      } catch (e) {
        showToast('拉取模型失败: ' + e.message, 'error');
      } finally {
        fetchModelsBtn.textContent = '拉取模型';
        fetchModelsBtn.disabled = false;
      }
    });
  }

  // 保存按钮
  const saveBtn = panel.querySelector('#vm-save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      window.vectorMemoryManager.saveSettingsFromUI(chat);
      await db.chats.put(chat);
      panel.remove();
      showToast('设置已保存', 'success');
    });
  }
  
  // 检索策略变化时显示/隐藏用户消息数量设置
  const retrievalStrategySelect = panel.querySelector('#vm-retrieval-strategy');
  if (retrievalStrategySelect) {
    retrievalStrategySelect.addEventListener('change', () => {
      const userMsgCountGroup = panel.querySelector('#vm-user-msg-count-group');
      if (userMsgCountGroup) {
        userMsgCountGroup.style.display = retrievalStrategySelect.value === 'user-only' ? 'block' : 'none';
      }
    });
  }
  
  // 检索缓存开关变化时显示/隐藏缓存间隔设置
  const retrievalCacheCb = panel.querySelector('#vm-retrieval-cache');
  if (retrievalCacheCb) {
    retrievalCacheCb.addEventListener('change', () => {
      const cacheIntervalGroup = panel.querySelector('#vm-cache-interval-group');
      if (cacheIntervalGroup) {
        cacheIntervalGroup.style.display = retrievalCacheCb.checked ? 'block' : 'none';
      }
    });
  }
}

