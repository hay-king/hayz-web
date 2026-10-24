// HAYZ 홈페이지 — 대시보드형. 대화방 예시 · 앱 화면 탭 · 모바일 메뉴 · 최신 버전 표시
document.getElementById('year').textContent = new Date().getFullYear();

// 다운로드: 최신 릴리스 버전 · 날짜를 GitHub에서 읽어 표시(실패하면 HTML에 적힌 버전 그대로)
fetch('https://api.github.com/repos/hay-king/hayz-web/releases/latest', { headers: { accept: 'application/vnd.github+json' } })
  .then(r => (r.ok ? r.json() : null))
  .then(rel => {
    if (!rel || !rel.tag_name) return;
    document.getElementById('appVersion').textContent = rel.tag_name;
    if (rel.published_at) document.getElementById('appDate').textContent = ' · ' + new Date(rel.published_at).toLocaleDateString('ko-KR');
  })
  .catch(() => {});

// 가입 · 로그인은 웹 HAYZ(별도 서비스)에서 합니다. 옛 주소 /#login 으로 들어오면 그쪽으로 보냅니다.
const WEB_LOGIN = 'https://port-0-hayz-app-mvkqr08w872db702.sel3.cloudtype.app/login';
if (location.hash.startsWith('#login')) location.replace(WEB_LOGIN);

// 모바일 메뉴: 열고 닫기, 링크를 누르면 닫힘
const nav = document.getElementById('siteNav');
const navBtn = document.querySelector('.nav-toggle');
const setNav = (open) => { nav.classList.toggle('open', open); navBtn.setAttribute('aria-expanded', String(open)); navBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); };
navBtn.addEventListener('click', () => setNav(!nav.classList.contains('open')));
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNav(false)));

// 지금 보고 있는 섹션을 알약 메뉴에 표시
const links = [...nav.querySelectorAll('a')];
const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
const spy = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(a => a.classList.toggle('is-on', a.getAttribute('href') === '#' + e.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach(s => spy.observe(s));

// 실제 앱 화면 탭
const SHOTS = {
  home: { src: 'assets/app-home.jpg', alt: 'HAYZ 홈 대시보드 — 매출, 오늘 할 일, 안 읽은 메일, 최근 메모', cap: '매출 · 오늘 할 일 · 안 읽은 메일 · 최근 메모를 한 화면에서 봅니다.' },
  ledger: { src: 'assets/app-ledger.jpg', alt: 'HAYZ 거래처 관리 — 월별 계약 · 입금 · 미수', cap: '거래처별 계약 · 입금 · 미수금을 월별로 정리합니다.' },
  market: { src: 'assets/app-market.jpg', alt: 'HAYZ 봇 마켓 — 분야별 전문가 AI 봇', cap: '분야별 전문가 봇을 찾아 내 사무실에 들입니다.' }
};
const shot = document.getElementById('shot');
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
const pick = (btn) => {
  const s = SHOTS[btn.dataset.shot];
  tabs.forEach(t => t.setAttribute('aria-selected', String(t === btn)));
  shot.src = s.src; shot.alt = s.alt;
  document.getElementById('shotCap').textContent = s.cap;
};
tabs.forEach((t, i) => {
  t.addEventListener('click', () => pick(t));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); pick(n);
  });
});

// 대화방 예시: 부탁 → 작성 중 → 초안 → 승인 순서로 한 번 보여 줌(움직임 줄이기 설정이면 바로 끝 장면)
const chat = document.getElementById('chatDemo');
const step = (n) => chat.querySelector(`[data-step="${n}"]`);
const approve = document.getElementById('approveBtn');
function finish() {
  chat.classList.remove('is-playing');
  step(2).hidden = true;
  approve.classList.add('is-done');
  approve.lastChild.textContent = '승인됨';
}
if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
else {
  chat.classList.add('is-playing');
  [1, 2, 3, 4].forEach(n => step(n).classList.add('is-wait'));
  const show = (n) => step(n).classList.remove('is-wait');
  const play = () => {
    setTimeout(() => show(1), 300);
    setTimeout(() => show(2), 1100);
    setTimeout(() => { step(2).classList.add('is-gone'); show(3); }, 2700);
    setTimeout(() => { approve.classList.add('is-done'); approve.lastChild.textContent = '승인됨'; show(4); }, 4600);
  };
  const seen = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { seen.disconnect(); play(); } }, { threshold: 0.4 });
  seen.observe(chat);
}
