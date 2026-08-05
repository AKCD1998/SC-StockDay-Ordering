export function parsePastedProductCodes(value) {
  const seen = new Set();
  const duplicates = [];
  const skipped = [];
  const productCodes = [];

  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((code) => {
      if (!code || code.toUpperCase() === "#N/A") {
        if (code) skipped.push(code);
        return;
      }
      if (seen.has(code)) {
        duplicates.push(code);
        return;
      }
      seen.add(code);
      productCodes.push(code);
    });

  return { productCodes, duplicates, skipped };
}

export function formatBranchOptionLabel(branch) {
  const code = String(branch?.branchCode || "").trim();
  const name = String(branch?.branchName || "").trim();
  if (!code) return name || "-";
  if (!name || name === code) return `สาขา ${code}`;
  return `${code} - ${name}`;
}
