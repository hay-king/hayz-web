// HAYZ 벌집 홈페이지 — 가벼운 인터랙션
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
