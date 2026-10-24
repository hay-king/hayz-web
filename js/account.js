// HAYZ 내 계정 — 로그인 안 했으면 홈의 가입 창으로 보냅니다.
const $ = (id) => document.getElementById(id);
const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hayz': '1' }, body: JSON.stringify(body || {}) });

fetch('/auth/me', { credentials: 'same-origin' })
  .then(r => (r.ok ? r.json() : null))
  .then(data => {
    if (!data || !data.user) { location.replace('/#login'); return; }
    const u = data.user;
    $('acctName').textContent = u.name || u.email;
    $('acctEmail').textContent = u.email;
    $('acctAvatar').textContent = (u.name || u.email).trim().charAt(0).toUpperCase();
    $('acctSince').textContent = new Date(u.created_at).toLocaleDateString('ko-KR');
    $('acctOffice').value = u.office || '';
    $('acctWelcome').hidden = !new URLSearchParams(location.search).has('welcome');
    if (location.search) history.replaceState(null, '', '/account');
    $('acctLoading').hidden = true;
    $('acctCard').hidden = false;
  })
  .catch(() => { $('acctLoading').textContent = '계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'; });

$('acctForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await post('/auth/profile', { office: $('acctOffice').value });
  $('acctSaved').textContent = r.ok ? '저장했습니다.' : '저장하지 못했습니다. 다시 로그인해 주세요.';
  $('acctSaved').hidden = false;
});
$('acctLogout').addEventListener('click', async () => { await post('/auth/logout'); location.href = '/'; });
$('acctDelete').addEventListener('click', async () => {
  if (!confirm('탈퇴하면 HAYZ 계정 정보(이름 · 이메일 · 사무실 이름)가 바로 지워집니다. 탈퇴할까요?')) return;
  const r = await post('/auth/delete');
  if (r.ok) location.href = '/'; else alert('탈퇴하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.');
});
