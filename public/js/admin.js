import { messageFor } from './auth-notice.js';
import { boot } from './boot.js';

boot();

const STATUS = { active: '활성', suspended: '정지', withdrawn: '탈퇴' };
const ROLE = { user: '회원', admin: '관리자' };
const error = document.getElementById('admin-error');
let csrfToken = '';
let offset = 0;
let selectedId = '';
const limit = 20;

const daysButtons = [...document.querySelectorAll('[data-days]')];
daysButtons.forEach((button) => {
  button.addEventListener('click', () => {
    daysButtons.forEach((item) => item.setAttribute('aria-pressed', item === button ? 'true' : 'false'));
    loadStats(Number(button.getAttribute('data-days')));
  });
});

document.getElementById('user-search').addEventListener('submit', (event) => {
  event.preventDefault();
  offset = 0;
  loadUsers();
});
document.getElementById('user-more').addEventListener('click', () => {
  offset += limit;
  loadUsers(true);
});
document.getElementById('act-suspend').addEventListener('click', () => changeStatus('suspended'));
document.getElementById('act-activate').addEventListener('click', () => changeStatus('active'));
document.getElementById('act-role').addEventListener('click', saveRole);

await loadStats(30);
await loadUsers();

async function loadStats(days) {
  const response = await fetch(`/api/admin/stats?days=${days}`, {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (response.status === 401) {
    location.href = '/?auth_error=login';
    return;
  }
  if (!response.ok) {
    fail('forbidden');
    return;
  }
  const data = await response.json();
  csrfToken = data.csrfToken;
  text('stat-total', String(data.totalMembers));
  text('stat-today', String(data.todaySignups));
  const recent = document.getElementById('stat-recent');
  recent.replaceChildren();
  if (!data.recentLogins.length) {
    const item = document.createElement('li');
    item.textContent = '최근 로그인한 회원이 없습니다.';
    recent.append(item);
  } else {
    data.recentLogins.forEach((user) => {
      const item = document.createElement('li');
      item.textContent = `${user.name || '이름 없음'} · ${user.email || '이메일 없음'} · ${user.lastLoginAtLabel}`;
      recent.append(item);
    });
  }
  drawTrend(data.trend);
}

function drawTrend(points) {
  const svg = document.getElementById('trend');
  const list = document.getElementById('trend-list');
  svg.replaceChildren();
  list.replaceChildren();
  const width = 640;
  const height = 180;
  const pad = 12;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const max = Math.max(1, ...points.map((point) => point.count));
  const gap = points.length > 40 ? 2 : 6;
  const barWidth = (width - pad * 2 - gap * Math.max(0, points.length - 1)) / Math.max(1, points.length);
  points.forEach((point, index) => {
    const barHeight = Math.round((point.count / max) * (height - 28));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(pad + index * (barWidth + gap)));
    rect.setAttribute('y', String(height - 16 - barHeight));
    rect.setAttribute('width', String(Math.max(1, barWidth)));
    rect.setAttribute('height', String(point.count ? Math.max(2, barHeight) : 0));
    rect.setAttribute('rx', '2');
    rect.setAttribute('class', 'trend-bar');
    svg.append(rect);
    const item = document.createElement('li');
    item.textContent = `${point.date} ${point.count}명`;
    list.append(item);
  });
}

async function loadUsers(append = false) {
  const form = document.getElementById('user-search');
  const params = new URLSearchParams({
    q: form.elements.q.value,
    status: form.elements.status.value,
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(`/api/admin/users?${params}`, {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    fail('forbidden');
    return;
  }
  const data = await response.json();
  const list = document.getElementById('user-rows');
  if (!append) list.replaceChildren();
  if (!data.users.length && !append) {
    const empty = document.createElement('p');
    empty.textContent = '조건에 맞는 회원이 없습니다.';
    list.append(empty);
  }
  data.users.forEach((user) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'user-row';
    button.addEventListener('click', () => selectUser(user.id));
    ['name', 'email', 'status', 'role'].forEach((key) => {
      const span = document.createElement('span');
      if (key === 'name') span.textContent = user.name || '이름 없음';
      else if (key === 'email') span.textContent = user.email || '이메일 없음';
      else if (key === 'status') span.textContent = STATUS[user.status] || user.status;
      else span.textContent = ROLE[user.role] || user.role;
      button.append(span);
    });
    list.append(button);
  });
  const shown = offset + data.users.length;
  const more = document.getElementById('user-more');
  more.hidden = shown >= data.total;
}

async function selectUser(id) {
  selectedId = id;
  error.hidden = true;
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    fail('not_found');
    return;
  }
  const data = await response.json();
  showDetail(data.user);
}

function showDetail(user) {
  document.getElementById('detail-empty').hidden = true;
  document.getElementById('detail-body').hidden = false;
  text('detail-name', user.name || '이름 없음');
  text('detail-email', user.email || '삭제됨');
  text('detail-status', STATUS[user.status] || user.status);
  text('detail-role', ROLE[user.role] || user.role);
  text('detail-created', user.createdAtLabel || '');
  text('detail-login', user.lastLoginAtLabel || '없음');
  text('detail-consent', user.consentedAtLabel ? `${user.consentedAtLabel} · ${user.termsVersion || ''}` : '없음');
  text('detail-sub', user.googleSub || '삭제됨');
  const photo = document.getElementById('detail-photo');
  if (user.picture) {
    photo.src = user.picture;
    photo.alt = '프로필 사진';
    photo.hidden = false;
  } else {
    photo.hidden = true;
    photo.removeAttribute('src');
  }
  const locked = user.status === 'withdrawn';
  document.getElementById('act-suspend').disabled = locked || user.status === 'suspended';
  document.getElementById('act-activate').disabled = locked || user.status === 'active';
  document.getElementById('role-select').disabled = locked;
  document.getElementById('role-select').value = user.role === 'admin' ? 'admin' : 'user';
  document.getElementById('act-role').disabled = locked;
}

async function changeStatus(status) {
  if (!selectedId) return;
  const response = await sendChange(`/api/admin/users/${encodeURIComponent(selectedId)}/status`, { status });
  if (response) await afterChange(response);
}

async function saveRole() {
  if (!selectedId) return;
  const role = document.getElementById('role-select').value;
  const response = await sendChange(`/api/admin/users/${encodeURIComponent(selectedId)}/role`, { role });
  if (response) await afterChange(response);
}

async function sendChange(url, body) {
  error.hidden = true;
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(payload.error);
    return null;
  }
  return payload;
}

async function afterChange(payload) {
  showDetail(payload.user);
  offset = 0;
  await loadUsers();
  await loadStats(currentDays());
}

function currentDays() {
  const pressed = daysButtons.find((button) => button.getAttribute('aria-pressed') === 'true');
  return Number(pressed?.getAttribute('data-days') || 30);
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function fail(code) {
  error.textContent = messageFor(code);
  error.hidden = false;
}
