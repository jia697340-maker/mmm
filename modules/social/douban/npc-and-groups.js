  let editingGroupId = null;

  // ========== NPC头像管理功能 ==========
  let selectedNpcAvatars = new Set();

  async function openNpcAvatarsModal() {
    const modal = document.getElementById('npc-avatars-modal');
    await renderNpcAvatarsList();
    modal.classList.add('visible');
  }

  async function renderNpcAvatarsList() {
    const grid = document.getElementById('npc-avatars-grid');
    const npcAvatars = state.globalSettings.npcAvatars || [];
    
    if (npcAvatars.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #999; padding: 40px;">暂无自定义NPC头像<br>点击上方按钮添加</div>';
      return;
    }

    grid.innerHTML = npcAvatars.map((avatar, index) => `
      <div class="npc-avatar-item" data-index="${index}" style="position: relative; cursor: pointer;">
        <input type="checkbox" class="npc-avatar-checkbox" data-index="${index}" 
          style="position: absolute; top: 5px; left: 5px; z-index: 10; width: 18px; height: 18px; cursor: pointer;"
          ${selectedNpcAvatars.has(index) ? 'checked' : ''}>
        <img src="${avatar}" alt="NPC头像" onerror="this.onerror=null; this.src=defaultAvatar;"
          style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;">
      </div>
    `).join('');

    // 绑定复选框事件
    document.querySelectorAll('.npc-avatar-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          selectedNpcAvatars.add(index);
        } else {
          selectedNpcAvatars.delete(index);
        }
        updateNpcAvatarDeleteButton();
      });
    });

    updateNpcAvatarDeleteButton();
  }

  function updateNpcAvatarDeleteButton() {
    const deleteBtn = document.getElementById('delete-selected-npc-avatars-btn');
    if (selectedNpcAvatars.size > 0) {
      deleteBtn.style.display = 'block';
      deleteBtn.textContent = `删除选中 (${selectedNpcAvatars.size})`;
    } else {
      deleteBtn.style.display = 'none';
    }
  }

  async function addNpcAvatarFromURL() {
    const url = await showCustomPrompt('添加NPC头像', '请输入头像图片URL：', '', 'text');
    if (!url) return;

    if (!state.globalSettings.npcAvatars) {
      state.globalSettings.npcAvatars = [];
    }

    state.globalSettings.npcAvatars.push(url);
    await db.globalSettings.put(state.globalSettings);
    await renderNpcAvatarsList();
    showToast('头像添加成功', 'success');
  }

  async function addNpcAvatarFromLocal() {
    const input = document.getElementById('npc-avatar-local-input');
    input.click();
  }

  async function handleNpcAvatarLocalUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          if (!state.globalSettings.npcAvatars) {
            state.globalSettings.npcAvatars = [];
          }

          state.globalSettings.npcAvatars.push(base64);
          successCount++;
        } catch (error) {
          console.error(`上传文件 ${file.name} 失败:`, error);
          failCount++;
        }
      }

      await db.globalSettings.put(state.globalSettings);
      await renderNpcAvatarsList();
      
      if (failCount === 0) {
        showToast(`成功上传 ${successCount} 个头像`, 'success');
      } else {
        showToast(`成功上传 ${successCount} 个，失败 ${failCount} 个`, 'warning');
      }
    } catch (error) {
      console.error('批量上传头像失败:', error);
      showToast('上传失败', 'error');
    }

    // 清空input
    event.target.value = '';
  }

  async function deleteSelectedNpcAvatars() {
    if (selectedNpcAvatars.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要删除选中的 ${selectedNpcAvatars.size} 个头像吗？`,
      { confirmText: '删除', cancelText: '取消' }
    );

    if (!confirmed) return;

    const npcAvatars = state.globalSettings.npcAvatars || [];
    const indicesToDelete = Array.from(selectedNpcAvatars).sort((a, b) => b - a);
    
    indicesToDelete.forEach(index => {
      npcAvatars.splice(index, 1);
    });

    state.globalSettings.npcAvatars = npcAvatars;
    await db.globalSettings.put(state.globalSettings);
    
    selectedNpcAvatars.clear();
    await renderNpcAvatarsList();
    showToast('删除成功', 'success');
  }

  function toggleSelectAllNpcAvatars() {
    const selectAllCheckbox = document.getElementById('select-all-npc-avatars');
    const npcAvatars = state.globalSettings.npcAvatars || [];
    
    if (selectAllCheckbox.checked) {
      selectedNpcAvatars.clear();
      npcAvatars.forEach((_, index) => selectedNpcAvatars.add(index));
    } else {
      selectedNpcAvatars.clear();
    }

    renderNpcAvatarsList();
  }

  // 获取NPC头像（用于豆瓣生成）
  function getNpcAvatarForCharacter(npcName) {
    const npcAvatars = state.globalSettings.npcAvatars || [];
    const enableAiAvatar = state.globalSettings.doubanEnableAiAvatar !== false;
    
    // 如果没有自定义头像或开启了AI生图，返回null（使用AI生成）
    if (npcAvatars.length === 0 || enableAiAvatar) {
      return null;
    }

    // 初始化当前批次的头像分配记录
    if (!window.currentDoubanAvatarAssignments) {
      window.currentDoubanAvatarAssignments = {};
    }

    // 如果这个NPC在当前批次已经分配过头像，返回已分配的
    if (window.currentDoubanAvatarAssignments[npcName]) {
      return window.currentDoubanAvatarAssignments[npcName];
    }

    // 获取当前批次已使用的头像
    const usedAvatars = Object.values(window.currentDoubanAvatarAssignments);
    const availableAvatars = npcAvatars.filter(avatar => !usedAvatars.includes(avatar));
    
    // 如果还有未使用的头像，随机选择一个
    if (availableAvatars.length > 0) {
      const selectedAvatar = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      window.currentDoubanAvatarAssignments[npcName] = selectedAvatar;
      return selectedAvatar;
    }
    
    // 如果所有头像都被使用了，返回null使用默认头像
    return null;
  }

  // 重置当前批次的头像分配（在生成新帖子时调用）
  function resetDoubanAvatarAssignments() {
    window.currentDoubanAvatarAssignments = {};
  }

  // ========== 自定义小组管理功能 ==========

  async function openCustomGroupsModal() {
    const modal = document.getElementById('custom-groups-modal');
    await renderCustomGroupsList();
    modal.classList.add('visible');
  }

  async function renderCustomGroupsList() {
    const listEl = document.getElementById('custom-groups-list');
    listEl.innerHTML = '';

    // 初始化自定义小组数组（如果不存在）
    if (!state.globalSettings.customDoubanGroups) {
      state.globalSettings.customDoubanGroups = [];
    }

    const groups = state.globalSettings.customDoubanGroups;

    if (groups.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; padding: 50px 0;">暂无自定义小组，点击上方"+ 添加小组"开始创建</p>';
      return;
    }

    groups.forEach((group, index) => {
      const groupItem = document.createElement('div');
      groupItem.className = 'custom-group-item';
      groupItem.style.cssText = `
        background: #f8f9fa;
        border-radius: 12px;
        padding: 15px;
        margin-bottom: 12px;
        border: 2px solid ${group.enabled ? '#4CAF50' : '#ddd'};
      `;

      const promptPreview = group.prompt.length > 60 ? group.prompt.substring(0, 60) + '...' : group.prompt;

      groupItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 15px; color: #333; margin-bottom: 5px;">
              ${group.name}
              ${group.enabled ? '<span style="background: #4CAF50; color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px;">已启用</span>' : '<span style="background: #999; color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px;">未启用</span>'}
            </div>
            <div style="font-size: 13px; color: #666; line-height: 1.4;">${promptPreview}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="edit-group-btn" data-index="${index}" style="flex: 1; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">编辑</button>
          <button class="delete-group-btn" data-index="${index}" style="flex: 1; padding: 8px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">删除</button>
        </div>
      `;

      listEl.appendChild(groupItem);
    });

    // 绑定编辑按钮事件
    listEl.querySelectorAll('.edit-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        openEditGroupModal(index);
      });
    });

    // 绑定删除按钮事件
    listEl.querySelectorAll('.delete-group-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.index);
        const group = state.globalSettings.customDoubanGroups[index];
        
        const confirmed = await showCustomConfirm(
          '确认删除？',
          `确定要删除小组"${group.name}"吗？此操作无法恢复！`,
          { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
        );

        if (confirmed) {
          state.globalSettings.customDoubanGroups.splice(index, 1);
          await db.globalSettings.put(state.globalSettings);
          await renderCustomGroupsList();
          await showCustomAlert('删除成功', '小组已删除');
        }
      });
    });
  }

  function openEditGroupModal(index = null) {
    const modal = document.getElementById('edit-custom-group-modal');
    const titleEl = document.getElementById('edit-group-modal-title');
    const nameInput = document.getElementById('custom-group-name-input');
    const promptInput = document.getElementById('custom-group-prompt-input');
    const enabledInput = document.getElementById('custom-group-enabled-input');

    editingGroupId = index;

    if (index === null) {
      // 添加新小组
      titleEl.textContent = '添加新小组';
      nameInput.value = '';
      promptInput.value = '';
      enabledInput.checked = true;
    } else {
      // 编辑现有小组
      titleEl.textContent = '编辑小组';
      const group = state.globalSettings.customDoubanGroups[index];
      nameInput.value = group.name;
      promptInput.value = group.prompt;
      enabledInput.checked = group.enabled !== false;
    }

    modal.classList.add('visible');
  }

  async function saveEditGroup() {
    const nameInput = document.getElementById('custom-group-name-input');
    const promptInput = document.getElementById('custom-group-prompt-input');
    const enabledInput = document.getElementById('custom-group-enabled-input');

    const name = nameInput.value.trim();
    const prompt = promptInput.value.trim();
    const enabled = enabledInput.checked;

    if (!name) {
      alert('请输入小组名称');
      return;
    }

    if (!prompt) {
      alert('请输入小组提示词');
      return;
    }

    const groupData = { name, prompt, enabled };

    if (!state.globalSettings.customDoubanGroups) {
      state.globalSettings.customDoubanGroups = [];
    }

    if (editingGroupId === null) {
      // 添加新小组
      state.globalSettings.customDoubanGroups.push(groupData);
    } else {
      // 更新现有小组
      state.globalSettings.customDoubanGroups[editingGroupId] = groupData;
    }

    await db.globalSettings.put(state.globalSettings);

    document.getElementById('edit-custom-group-modal').classList.remove('visible');
    await renderCustomGroupsList();
    await showCustomAlert('保存成功', editingGroupId === null ? '小组已添加' : '小组已更新');
  }
  // ========== 自定义小组管理功能结束 ==========


