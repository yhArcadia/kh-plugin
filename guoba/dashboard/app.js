/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-11 18:38:07
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-12 15:20:32
 * @FilePath: /kh-plugin/guoba/dashboard/app.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
const API_BASE = window.__GUOBA_MOUNT_PREFIX__ || '/guoba-plugin-mock-root';

let token = null;
let groupsData = [];
let sortField = 'records';
let sortAsc = false;
let currentMemberGid = null;
let currentMemberPage = 1;
let memberSortField = 'records';
let memberSortAsc = false;
let memberItems = [];
const MEMBER_PAGE_SIZE = 30;

function findToken() {
  const AES_KEY = '_11111000001111@';
  const AES_IV  = '@11111000001111_';

  function decryptAES(encrypted) {
    const key = CryptoJS.enc.Utf8.parse(AES_KEY);
    const iv  = CryptoJS.enc.Utf8.parse(AES_IV);
    const jsonStr = CryptoJS.AES.decrypt(encrypted, key, {
      iv: iv,
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    }).toString(CryptoJS.enc.Utf8);
    if (!jsonStr) return null;
    try { return JSON.parse(jsonStr); } catch (e) { console.log('[kh-dashboard] decryptAES JSON.parse error:', e.message, 'json preview:', jsonStr.slice(0, 100)); return null; }
  }

  function isValidToken(v) {
    return v && typeof v === 'string' && v.length > 20;
  }

  const allKeys = [];
  for (const storage of [localStorage, sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      allKeys.push(k);
    }
  }

  for (const storage of [localStorage, sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.endsWith('__TOKEN__')) {
        const encrypted = storage.getItem(key);
        if (encrypted) {
          const data = decryptAES(encrypted);
          if (data?.value && isValidToken(data.value)) return data.value;
          if (isValidToken(data)) return data;
        }
      }
    }
  }

  const cacheSuffixes = ['COMMON__LOCAL__KEY__', 'COMMON__SESSION__KEY__'];
  const cacheStorages = [[localStorage, 0], [sessionStorage, 1]];
  for (const [storage, idx] of cacheStorages) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.endsWith(cacheSuffixes[idx])) {
        const encrypted = storage.getItem(key);
        if (encrypted) {
          const cache = decryptAES(encrypted);
          const valueObj = cache?.value;
          const tokenEntry = valueObj?.TOKEN__;
          const token = tokenEntry?.value;
          if (isValidToken(token)) return token;
        }
      }
    }
  }

  return null;
}

async function apiCall(action, body) {
  if (!token) {
    token = findToken();
    if (!token) throw new Error('TOKEN_NOT_FOUND');
  }
  const url = `${API_BASE}/api/plugin/do/kh-plugin/action`;
  const payload = { action, args: body || {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const fetchOpts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'guoba-access-token': token
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  };
  const res = await fetch(url, fetchOpts);
  clearTimeout(timer);
  if (res.status === 401) {
    token = findToken();
    if (token) {
      fetchOpts.headers['guoba-access-token'] = token;
      const retry = await fetch(url, fetchOpts);
      if (retry.status === 401) throw new Error('AUTH_FAILED');
      const retryJson = await retry.json();
      if (retryJson.code !== 0) throw new Error(retryJson.message || '请求失败');
      return retryJson.result;
    }
    throw new Error('AUTH_FAILED');
  }
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '请求失败');
  return json.result;
}

function showError(title, msg) {
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('mainContent').classList.add('hidden');
}

function hideError() {
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return ts;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function roleBadge(role) {
  if (role === 'owner') return '<span class="badge badge-owner">群主</span>';
  if (role === 'admin') return '<span class="badge badge-admin">管理</span>';
  return '<span class="badge badge-member">成员</span>';
}

function renderOverview(data) {
  const cards = document.getElementById('overviewCards');
  cards.innerHTML = `
    <div class="card">
      <div class="card-label">📊 群数量</div>
      <div class="card-value">${data.groups.length}</div>
      <div class="card-sub">${data.capped ? '（已达扫描上限）' : '已全部扫描'}</div>
    </div>
    <div class="card">
      <div class="card-label">👥 成员条目</div>
      <div class="card-value">${data.scannedMemberKeys.toLocaleString()}</div>
      <div class="card-sub">Redis 中扫描到的 key 数</div>
    </div>
    <div class="card">
      <div class="card-label">📝 身份记录</div>
      <div class="card-value">${data.scannedRecords.toLocaleString()}</div>
      <div class="card-sub">各用户历史记录条数之和</div>
    </div>
    <div class="card">
      <div class="card-label">⏱️ 缓存状态</div>
      <div class="card-value" style="font-size:22px">${data.cached ? '♻️ 缓存' : '🆕 实时'}</div>
      <div class="card-sub">${data.cached ? '30秒内已有缓存' : '本次为实时扫描'}</div>
    </div>
  `;
}

function renderGroupTable(groups) {
  const tbody = document.getElementById('groupTableBody');
  const count = document.getElementById('groupCount');
  count.textContent = `共 ${groups.length} 个群`;

  if (groups.length === 0) {
    tbody.innerHTML = '';
    document.getElementById('groupEmpty').classList.remove('hidden');
    return;
  }
  document.getElementById('groupEmpty').classList.add('hidden');

  tbody.innerHTML = groups.map(g => `
    <tr onclick="selectGroup(${g.groupId}, '${(g.groupName || '').replace(/'/g, "\\'")}')" data-gid="${g.groupId}">
      <td>${g.avatar ? `<img class="avatar-img" src="${g.avatar}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:36px;height:36px">` : ''}</td>
      <td>${g.groupName || String(g.groupId)}</td>
      <td>${g.actualMemberCount || g.members}</td>
      <td>${g.records}</td>
      <td>${formatTime(g.latestRecordTime)}</td>
    </tr>
  `).join('');
}

function sortGroups() {
  groupsData.sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'latestRecordTime') {
      va = va || '0'; vb = vb || '0';
    }
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortAsc ? va - vb : vb - va;
  });
  renderGroupTable(groupsData);
}

async function loadOverview() {
  document.getElementById('groupLoading').classList.remove('hidden');
  document.getElementById('groupEmpty').classList.add('hidden');
  try {
    const data = await apiCall('statistics', { maxKeys: 50000 });
    groupsData = data.groups || [];
    renderOverview(data);
    sortGroups();
    document.getElementById('groupCount').textContent = `共 ${groupsData.length} 个群`;
  } catch (err) {
    if (err.message === 'TOKEN_NOT_FOUND') {
      showError('🔐 未检测到登录状态', '请先在浏览器中打开锅巴后台并登录，然后刷新本页面。');
    } else if (err.message === 'AUTH_FAILED') {
      showError('🔐 登录已过期', '请重新登录锅巴后台，然后刷新本页面。');
    } else {
      showError('⚠️ 数据加载失败', err.message);
    }
  } finally {
    document.getElementById('groupLoading').classList.add('hidden');
  }
}

async function loadBlacklist() {
  try {
    const data = await apiCall('blacklistPreview');
    const tbody = document.getElementById('blacklistTableBody');
    const count = document.getElementById('blacklistCount');
    count.textContent = `共 ${data.length} 人`;
    if (data.length === 0) {
      tbody.innerHTML = '';
      document.getElementById('blacklistEmpty').classList.remove('hidden');
      return;
    }
    document.getElementById('blacklistEmpty').classList.add('hidden');
    tbody.innerHTML = data.map(u => `
      <tr>
        <td><img class="avatar-img" src="${u.avatar || ''}" alt="" loading="lazy" onerror="this.style.display='none'"></td>
        <td class="mono">${u.userId}</td>
        <td>${u.name || '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    if (err.message === 'TOKEN_NOT_FOUND' || err.message === 'AUTH_FAILED') return;
    document.getElementById('blacklistCount').textContent = '加载失败';
  }
}

async function selectGroup(gid, gname) {
  currentMemberGid = gid;
  currentMemberPage = 1;
  document.getElementById('memberPanel').classList.remove('hidden');
  document.getElementById('memberPanelTitle').textContent = gname || gid;
  document.getElementById('memberPanel').scrollIntoView({ behavior: 'smooth' });

  document.querySelectorAll('#groupTableBody tr').forEach(tr => {
    tr.classList.toggle('active', tr.dataset.gid === String(gid));
  });

  await loadMembers();
}

function closeMemberPanel() {
  document.getElementById('memberPanel').classList.add('hidden');
  currentMemberGid = null;
  document.querySelectorAll('#groupTableBody tr').forEach(tr => tr.classList.remove('active'));
}

async function loadMembers() {
  if (!currentMemberGid) return;
  document.getElementById('memberLoading').classList.remove('hidden');
  document.getElementById('memberEmpty').classList.add('hidden');
  document.getElementById('memberTableBody').innerHTML = '';

  try {
    const data = await apiCall('members', {
      groupId: currentMemberGid,
      page: currentMemberPage,
      pageSize: MEMBER_PAGE_SIZE
    });

    memberItems = data.items || [];

    if (memberItems.length === 0) {
      document.getElementById('memberEmpty').classList.remove('hidden');
    } else {
      sortMembers();
    }

    const totalPages = Math.ceil(data.totalMembers / MEMBER_PAGE_SIZE) || 1;
    document.getElementById('memberPagination').innerHTML = `
      <button class="btn btn-sm" onclick="currentMemberPage--;loadMembers()" ${currentMemberPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span class="pagination-info">${currentMemberPage} / ${totalPages}</span>
      <button class="btn btn-sm" onclick="currentMemberPage++;loadMembers()" ${currentMemberPage >= totalPages ? 'disabled' : ''}>下一页</button>
    `;
  } catch (err) {
    document.getElementById('memberEmpty').classList.remove('hidden');
    document.getElementById('memberEmpty').textContent = '加载失败: ' + err.message;
  } finally {
    document.getElementById('memberLoading').classList.add('hidden');
  }
}

function sortMembers() {
  memberItems.sort((a, b) => {
    let va, vb;
    if (memberSortField === 'displayName') {
      va = (a.card || a.nickname || String(a.userId)).toLowerCase();
      vb = (b.card || b.nickname || String(b.userId)).toLowerCase();
      return memberSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    if (memberSortField === 'recordTime') {
      va = a.recordTime || '0';
      vb = b.recordTime || '0';
      return memberSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    va = a[memberSortField] || 0;
    vb = b[memberSortField] || 0;
    return memberSortAsc ? va - vb : vb - va;
  });
  renderMemberTable();
}

function renderMemberTable() {
  document.getElementById('memberTableBody').innerHTML = memberItems.map(m => {
    const avatarUrl = `https://q1.qlogo.cn/g?b=qq&s=100&nk=${m.userId}`;
    const displayName = m.card || m.nickname || String(m.userId);
    const subName = (m.card && m.nickname && m.card !== m.nickname) ? m.nickname : '';
    const escapedDisplay = displayName.replace(/'/g, "\\'");
    return `
      <tr onclick="showMemberHistory(${currentMemberGid}, '${String(m.userId).replace(/'/g, "\\'")}', '${escapedDisplay}')" style="cursor:pointer">
        <td><img class="avatar-img" src="${avatarUrl}" alt="" loading="lazy" onerror="this.style.display='none'" onclick="openImageViewer(event);event.stopPropagation()"></td>
        <td>
          <span>${displayName}</span>
          <span style="color:var(--text-muted);font-size:12px;margin-left:8px">${m.userId}</span>
          ${subName ? `<br><span style="color:var(--text-muted);font-size:12px">${subName}</span>` : ''}
        </td>
        <td>${m.records}</td>
        <td>${formatTime(m.recordTime)}</td>
      </tr>
    `;
  }).join('');
}

async function showMemberHistory(gid, uid, displayName) {
  const modal = document.getElementById('historyModal');
  const title = document.getElementById('historyModalTitle');
  const body = document.getElementById('historyModalBody');

  title.textContent = `📜 ${displayName || uid} 的历史记录`;
  body.innerHTML = '<div class="loading"><span class="spinner"></span> 加载中...</div>';
  modal.classList.remove('hidden');

  try {
    const data = await apiCall('memberHistory', { groupId: gid, userId: uid, limit: 100 });
    const records = data.records.reverse();

    if (records.length === 0) {
      body.innerHTML = '<div class="empty">暂无历史记录</div>';
      return;
    }

    body.innerHTML = '<div class="timeline">' + records.map((r, i) => {
      const avatarNk = r.user_id || uid;
      const avatarUrl = r.localAvatarUrl || `https://q1.qlogo.cn/g?b=qq&s=100&nk=${avatarNk}`;
      return `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-time">${r.recordTime || '-'}</div>
          <div class="timeline-card">
            <img class="timeline-avatar" src="${avatarUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
            <div class="timeline-info">
              <div class="timeline-name">${i + 1}. ${r.card || r.nickname || uid} ${roleBadge(r.role)} ${r.title ? '<span class="badge badge-title">' + r.title + '</span>' : ''}</div>
              <dl class="timeline-detail">
                <dt>昵称</dt><dd>${r.nickname || '-'}</dd>
                <dt>群名片</dt><dd>${r.card || '-'}</dd>
                <dt>头衔</dt><dd>${r.title || '无'}</dd>
                <dt>权限</dt><dd>${r.role || 'member'}</dd>
              </dl>
            </div>
          </div>
        </div>
      `;
    }).join('') + '</div>';
  } catch (err) {
    body.innerHTML = `<div class="empty">加载失败: ${err.message}</div>`;
  }
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.add('hidden');
}

async function refresh() {
  hideError();
  token = findToken();
  if (!token) {
    showError('🔐 未检测到登录状态', '请先在浏览器中打开锅巴后台并登录，然后刷新本页面。');
    return;
  }
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '⏳ 刷新中...';
  btn.disabled = true;
  try {
    await Promise.all([loadOverview(), loadBlacklist()]);
  } catch(e) {}
  btn.textContent = '🔄 刷新';
  btn.disabled = false;
}

document.querySelectorAll('.panel:not(#memberPanel) th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if (sortField === field) {
      sortAsc = !sortAsc;
    } else {
      sortField = field;
      sortAsc = false;
    }
    document.querySelectorAll('.panel:not(#memberPanel) th').forEach(h => h.classList.remove('sorted'));
    th.classList.add('sorted');
    sortGroups();
  });
});

document.querySelectorAll('#memberPanel th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if (memberSortField === field) {
      memberSortAsc = !memberSortAsc;
    } else {
      memberSortField = field;
      memberSortAsc = false;
    }
    document.querySelectorAll('#memberPanel th').forEach(h => h.classList.remove('sorted'));
    th.classList.add('sorted');
    sortMembers();
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeImageViewer();
    closeHistoryModal();
    closeMemberPanel();
    closeSearchPanel();
  }
});

function openImageViewer(e) {
  e.stopPropagation();
  let src = e.target.src || '';
  if (!src) return;
  src = src.replace(/([?&])s=\d+(&|$)/, '$1s=0$2');
  document.getElementById('imgViewerImg').src = src;
  document.getElementById('imgViewer').classList.remove('hidden');
}

function closeImageViewer() {
  document.getElementById('imgViewer').classList.add('hidden');
  document.getElementById('imgViewerImg').src = '';
}

document.addEventListener('click', e => {
  const img = e.target.closest('.timeline-avatar');
  if (img) openImageViewer(e);
});

let searchActive = false;

document.getElementById('searchInput').addEventListener('input', () => {
  filterGroups();
});

document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});

function filterGroups() {
  if (searchActive) return;
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!q) { sortGroups(); return; }
  const filtered = groupsData.filter(g =>
    String(g.groupId).toLowerCase().includes(q) ||
    (g.groupName || '').toLowerCase().includes(q)
  );
  renderGroupTable(filtered);
}

async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;

  const panel = document.getElementById('searchPanel');
  const tbody = document.getElementById('searchTableBody');
  const empty = document.getElementById('searchEmpty');
  const count = document.getElementById('searchResultCount');

  searchActive = true;
  panel.classList.remove('hidden');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">搜索中...</td></tr>';
  empty.classList.add('hidden');

  try {
    const data = await apiCall('search', { query: q, limit: 30 });
    const items = data.items || [];
    count.textContent = `共 ${items.length} 条${data.capped ? '+' : ''}`;

    if (items.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    tbody.innerHTML = items.map(r => {
      const userId = r.userId || '';
      const nickname = r.nickname || '';
      const card = r.card || '';
      const displayName = card || nickname || userId;
      const subName = (card && nickname && card !== nickname) ? nickname : '';
      const groupId = r.groupId || '';
      const escapedDisplay = displayName.replace(/'/g, "\\'");
      return `
        <tr onclick="showMemberHistory(${groupId}, '${String(userId).replace(/'/g, "\\'")}', '${escapedDisplay}')" style="cursor:pointer">
          <td><img class="avatar-img" src="https://q1.qlogo.cn/g?b=qq&s=100&nk=${userId}" alt="" loading="lazy" onerror="this.style.display='none'" onclick="openImageViewer(event);event.stopPropagation()"></td>
          <td>
            <span>${displayName}</span>
            <span style="color:var(--text-muted);font-size:12px;margin-left:8px">${userId}</span>
            ${subName ? '<br><span style="color:var(--text-muted);font-size:12px">' + subName + '</span>' : ''}
          </td>
          <td>${r.groupName || groupId}</td>
          <td>${r.records}</td>
          <td>${formatTime(r.latestRecordTime)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">搜索失败: ${err.message}</td></tr>`;
  }
}

function closeSearchPanel() {
  searchActive = false;
  document.getElementById('searchPanel').classList.add('hidden');
  filterGroups();
}

refresh();