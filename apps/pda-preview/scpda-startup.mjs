// The saved installation/day marker is a hint, never a substitute for server proof.
export async function restoreScpdaSession({ status, resume, device, authenticated, needsLogin, retryable, busy, ready }) {
  busy();
  try {
    const state = await status();
    device(state);
    if (!state.dailyResumeAvailable) {
      needsLogin();
      return 'login';
    }
    try {
      const session = await resume();
      await authenticated(session);
      ready();
      return 'ready';
    } catch (error) {
      if (error.status === 401 || ['DEVICE_CERT_INVALID', 'DEVICE_ACTIVATION_REQUIRED', 'DEVICE_REVOKED'].includes(error.code)) {
        needsLogin(error);
        return 'login';
      }
      retryable(error);
      return 'retry';
    }
  } catch (error) {
    retryable(error);
    return 'retry';
  }
}
