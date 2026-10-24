const MESSAGES = {
  denied: '구글 로그인 동의가 취소되었습니다.',
  state: '로그인 확인에 실패했습니다. 처음부터 다시 시도해 주세요.',
  exchange: '구글 로그인 처리에 실패했습니다. 다시 시도해 주세요.',
  suspended: '이 계정은 정지되어 로그인할 수 없습니다.',
  unverified: '이메일 확인이 끝난 구글 계정만 사용할 수 있습니다.',
  email_in_use: '이 이메일은 다른 계정에서 사용 중입니다. 계정은 자동으로 합치지 않습니다.',
  config: '로그인 설정이 아직 끝나지 않았습니다. PUBLIC_BASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET(32자 이상)을 확인해 주세요.',
  consent: '가입 동의 시간이 지났거나 동의 정보가 없습니다. 다시 로그인해 주세요.',
  consent_required: '이용약관과 개인정보 처리방침에 모두 동의해야 가입이 완료됩니다.',
  login: '로그인이 필요합니다.',
  expired: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  rate: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  confirm: '탈퇴 안내를 확인한 뒤 다시 진행해 주세요.',
  confirm_email: '입력한 이메일이 계정의 이메일과 같지 않습니다.',
  csrf: '요청을 확인하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  forbidden: '권한이 없습니다.',
  not_found: '회원을 찾지 못했습니다.',
  self: '내 계정의 상태나 관리자 역할은 여기서 바꿀 수 없습니다.',
  last_admin: '마지막 관리자는 정지하거나 일반 회원으로 바꿀 수 없습니다.',
  bad_status: '바꿀 수 있는 상태가 아닙니다.',
  bad_role: '바꿀 수 있는 역할이 아닙니다.',
};

export function messageFor(code) {
  return MESSAGES[code] || '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
}

export function showAuthNotice() {
  const notice = document.getElementById('auth-notice');
  if (!notice) return;
  const params = new URLSearchParams(location.search);
  const code = params.get('auth_error');
  let message = '';
  if (code && Object.prototype.hasOwnProperty.call(MESSAGES, code)) message = MESSAGES[code];
  else if (params.get('withdrawn') === '1') message = '탈퇴가 완료되었습니다. 계정은 비활성화되었고 개인정보는 삭제되었습니다.';
  if (!message) return;
  notice.textContent = message;
  notice.hidden = false;
}
