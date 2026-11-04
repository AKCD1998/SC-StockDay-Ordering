// Presentation aliases only. These never replace server staffId/branchCode,
// authenticate a user, select a role, or scope a count/queue.
export const FIXTURE_OPERATOR_NUMBERS = Object.freeze({
  '001': Object.freeze({ '1': '01', '2': '02', '3': '03' }),
});

export function operatorDisplayCode(identity, assignedNumbers = {}) {
  if (!identity || typeof identity.branchCode !== 'string' || typeof identity.staffId !== 'string') return null;
  const { branchCode, staffId } = identity;
  if (!/^\d{3}$/.test(branchCode) || !/^\d+$/.test(staffId)) return null;
  if (!Object.hasOwn(assignedNumbers, branchCode)) return null;
  const branch = assignedNumbers[branchCode];
  if (!branch || !Object.hasOwn(branch, staffId)) return null;
  const number = branch[staffId];
  if (typeof number !== 'string' || !/^(0[1-9]|[1-9]\d)$/.test(number)) return null;
  return number + branchCode;
}
