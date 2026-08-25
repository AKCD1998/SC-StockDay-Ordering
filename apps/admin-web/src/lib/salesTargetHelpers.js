export function summarizeBranchSales(progressByBranch, branchCodes) {
  const progressEntries = branchCodes.map((code) => progressByBranch?.[code] ?? null);
  const availableBranchCount = progressEntries.filter(Boolean).length;
  const isComplete = branchCodes.length > 0 && progressEntries.every((entry) => (
    entry && Number.isFinite(Number(entry.actualSoFar))
  ));

  return {
    actualSoFar: isComplete
      ? progressEntries.reduce((total, entry) => total + Number(entry.actualSoFar), 0)
      : null,
    availableBranchCount,
    branchCount: branchCodes.length,
    isComplete,
  };
}
