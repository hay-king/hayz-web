// HAYZ 벌집 홈페이지 — 가벼운 인터랙션
// 브랜드 주황 #ff5b21 (HAYZ 데스크톱 앱 public/dash.css --d-orange), 노랑은 벌·벌집 포인트에만
document.getElementById('year').textContent = new Date().getFullYear();
const desc = document.getElementById('hiveDesc');
const cells = document.querySelectorAll('.hive .cell');
const def = desc.textContent;
const show = (c) => { cells.forEach(x => x.classList.toggle('on', x === c)); desc.textContent = c ? c.dataset.desc : def; };
cells.forEach(c => {
  c.addEventListener('mouseenter', () => show(c));
  c.addEventListener('focus', () => show(c));
  c.addEventListener('click', () => show(c));
});
document.querySelector('.hive').addEventListener('mouseleave', () => show(document.querySelector('.cell.core')));
show(document.querySelector('.cell.core'));

// 앱 미리보기 사이드바
const route = document.getElementById('appRoute');
document.querySelectorAll('.app-side a').forEach(a => a.addEventListener('click', () => {
  document.querySelectorAll('.app-side a').forEach(x => x.classList.toggle('on', x === a));
  route.textContent = a.dataset.route;
}));

// 로그인 모달 + 구글 로그인(GIS). Client ID 미설정 시 안내 문구로 대체
const modal = document.getElementById('login');
const CLIENT_ID = document.querySelector('meta[name="google-client-id"]').content;
let gsiReady = false;
function initGoogle() {
  if (gsiReady) return;
  const ok = window.google && google.accounts && !CLIENT_ID.startsWith('YOUR_');
  document.getElementById('gFallback').hidden = ok;
  if (!ok) return;
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: async ({ credential }) => {
      try {
        const r = await fetch('/auth/google', { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
        const d = await r.json();
        location.href = d.isNew ? '/app/onboarding' : '/app/messenger';
      } catch { alert('로그인 서버가 아직 준비되지 않았습니다.'); }
    }
  });
  google.accounts.id.renderButton(document.getElementById('g_id_signin'),
    { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'ko' });
  gsiReady = true;
}
const openLogin = (e) => { e && e.preventDefault(); modal.hidden = false; initGoogle(); };
const closeLogin = () => { modal.hidden = true; if (location.hash === '#login') history.replaceState(null, '', ' '); };
document.querySelectorAll('[data-open-login]').forEach(b => b.addEventListener('click', openLogin));
document.querySelector('[data-close-login]').addEventListener('click', closeLogin);
modal.addEventListener('click', e => { if (e.target === modal) closeLogin(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLogin(); });
if (location.hash === '#login') openLogin();
