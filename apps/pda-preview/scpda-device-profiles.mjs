// Public admission certificates and non-bearer day IDs only. No password/token.
export function profileIdentity(certificate) {
  try {
    const raw = certificate.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const value = JSON.parse(atob(raw));
    if (!['001', '004', '005'].includes(value.branch_code)) return null;
    const operator = value.operator_code || 'primary';
    if (operator !== 'primary' && !/^[0-9]{5,7}(SHPEE)?$/.test(operator)) return null;
    return { key: value.branch_code + ':' + operator, branchCode: value.branch_code, operatorCode: operator === 'primary' ? null : operator };
  } catch { return null; }
}

export function rememberProfile(state) {
  const profiles = { ...(state.profiles || {}) };
  const identity = profileIdentity(state.certificate || '');
  if (identity) profiles[identity.key] = { certificate: state.certificate, dailySessionId: state.dailySessionId || '' };
  return profiles;
}

export function profileRecords(state) {
  const active = profileIdentity(state.certificate || '')?.key;
  return Object.entries(rememberProfile(state)).flatMap(([key, value]) => {
    const identity = profileIdentity(value.certificate || '');
    return identity && identity.key === key ? [{ ...identity, active: key === active, dailyResumeAvailable: Boolean(value.dailySessionId) }] : [];
  });
}
