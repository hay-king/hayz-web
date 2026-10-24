/**
 * 다운로드 주소 자리표시.
 * 실제 주소가 정해지면 href만 채웁니다. 비어 있으면 버튼은 "링크 미정"으로 남습니다.
 */
export const downloads = {
  mac: { href: '', status: '준비 중' },
  windows: { href: '', status: '준비 중' },
  web: { href: '', status: '준비 중' },
  pwa: { href: '', status: '예정' },
};

export function applyDownloads(root = document) {
  root.querySelectorAll('[data-download]').forEach((card) => {
    const item = downloads[card.getAttribute('data-download')];
    const link = card.querySelector('[data-download-link]');
    const status = card.querySelector('[data-download-status]');
    if (!item || !link) return;
    if (status) status.textContent = item.status;
    if (!item.href) {
      link.textContent = '링크 미정';
      link.setAttribute('aria-disabled', 'true');
      link.addEventListener('click', (event) => event.preventDefault());
      return;
    }
    link.href = item.href;
    link.textContent = '다운로드';
    link.removeAttribute('aria-disabled');
  });
}
