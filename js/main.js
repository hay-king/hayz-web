// HAYZ 홈페이지 — 토덕이 테마. 주황 #ff5b21은 버튼·라벨 보조색
document.getElementById('year').textContent = new Date().getFullYear();

// 다운로드: 최신 릴리스 버전 · 날짜를 GitHub에서 읽어 표시(실패하면 HTML에 적힌 버전 그대로)
fetch('https://api.github.com/repos/hay-king/hayz-web/releases/latest', { headers: { accept: 'application/vnd.github+json' } })
  .then(r => (r.ok ? r.json() : null))
  .then(rel => {
    if (!rel || !rel.tag_name) return;
    document.getElementById('appVersion').textContent = rel.tag_name;
    if (rel.published_at) document.getElementById('appDate').textContent = ' (' + new Date(rel.published_at).toLocaleDateString('ko-KR') + ')';
  })
  .catch(() => {});

// 앱 미리보기 사이드바
const route = document.getElementById('appRoute');
document.querySelectorAll('.app-side a').forEach(a => a.addEventListener('click', () => {
  document.querySelectorAll('.app-side a').forEach(x => x.classList.toggle('on', x === a));
  route.textContent = a.dataset.route;
}));

// 모바일 메뉴(햄버거): 열고 닫기, 링크를 누르면 닫힘
const nav = document.getElementById('siteNav');
const navBtn = document.querySelector('.nav-toggle');
const setNav = (open) => { nav.classList.toggle('open', open); navBtn.setAttribute('aria-expanded', String(open)); navBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); };
navBtn.addEventListener('click', () => setNav(!nav.classList.contains('open')));
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNav(false)));

// 가입 · 로그인은 웹 HAYZ(별도 서비스)에서 합니다. 옛 주소 /#login 으로 들어오면 그쪽으로 보냅니다.
const WEB_LOGIN = 'https://port-0-hayz-app-mvkqr08w872db702.sel3.cloudtype.app/login';
if (location.hash.startsWith('#login')) location.replace(WEB_LOGIN);
