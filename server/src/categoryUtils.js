const CATEGORY_ALIAS_MAP = new Map([
  ["ตุ้เย็น", "ตู้เย็น"],
  ["ยาฆ่าเชิ้อ", "ยาฆ่าเชื้อ"],
  ["น้ำตามเทียม", "น้ำตาเทียม"],
  ["อุปรณ์", "อุปกรณ์"],
  ["ยาใช้ภาบนอก", "ยาใช้ภายนอก"],
]);

const CATEGORY_RULES = [
  {
    cleanCategory: "สำลี",
    shelfNo: null,
    patterns: ["สำลี", "cotton", "cotton ball", "cotton bud", "cotton roll", "gauze"],
    categoryConfidence: 0.88,
    placementConfidence: 0.88,
  },
  {
    cleanCategory: "แชมพู",
    shelfNo: null,
    patterns: ["แชมพู", "shampoo"],
    categoryConfidence: 0.9,
    placementConfidence: 0.9,
  },
  {
    cleanCategory: "ขนม",
    shelfNo: null,
    patterns: ["ขนม", "snack", "candy", "lozenge"],
    categoryConfidence: 0.72,
    placementConfidence: 0.72,
  },
  {
    cleanCategory: "วิตามิน",
    shelfNo: null,
    patterns: ["วิตามิน", "vitamin", "multivitamin", "garlic"],
    categoryConfidence: 0.76,
    placementConfidence: 0.45,
  },
  {
    cleanCategory: "น้ำเกลือ",
    shelfNo: null,
    patterns: ["น้ำเกลือ", "saline", "nss", "normal saline"],
    categoryConfidence: 0.84,
    placementConfidence: 0.4,
    alwaysHumanConfirm: true,
  },
  {
    cleanCategory: "น้ำตาเทียม",
    shelfNo: 7,
    patterns: ["น้ำตาเทียม", "eye drop", "tear", "artificial tear"],
    categoryConfidence: 0.8,
    placementConfidence: 0.66,
    alwaysHumanConfirm: true,
  },
  {
    cleanCategory: "ยาครีม",
    shelfNo: 5,
    patterns: ["ครีม", "cream", "ointment", "gel", "silicone", "hiruscar", "scar"],
    categoryConfidence: 0.83,
    placementConfidence: 0.7,
    alwaysHumanConfirm: true,
  },
  {
    cleanCategory: "ยาฆ่าเชื้อ",
    shelfNo: 2,
    patterns: ["ยาฆ่าเชื้อ", "antibiotic", "amox", "amoxicillin"],
    categoryConfidence: 0.74,
    placementConfidence: 0.68,
    alwaysHumanConfirm: true,
  },
  {
    cleanCategory: "ยาฆ่าเชื้อรา",
    shelfNo: 2,
    patterns: ["ยาฆ่าเชื้อรา", "antifungal", "clotrimazole"],
    categoryConfidence: 0.74,
    placementConfidence: 0.68,
    alwaysHumanConfirm: true,
  },
  {
    cleanCategory: "ยาฉีด",
    shelfNo: null,
    patterns: ["ยาฉีด", "inj", "inject", "injection", "vial", "ampoule", "ampule"],
    categoryConfidence: 0.82,
    placementConfidence: 0.2,
    alwaysHumanConfirm: true,
  },
  {
    cleanCategory: "อุปกรณ์",
    shelfNo: null,
    patterns: ["อุปกรณ์", "device", "mask", "syringe", "glove"],
    categoryConfidence: 0.68,
    placementConfidence: 0.68,
  },
];

const REVERIFY_RULES = [
  { shelfNo: 3, cleanCategory: "ยาฆ่าเชื้อ" },
  { shelfNo: 3, cleanCategory: "ยาฆ่าเชื้อรา" },
];

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function isRealBarcode(value) {
  const barcode = normalizeWhitespace(value);
  if (!barcode) return false;
  if (/^9{5,}/.test(barcode)) return false;
  return /\d{6,}/.test(barcode);
}

export function canonicalizeCategoryText(value, aliasRows = []) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";

  const rowAlias = aliasRows.find((row) => normalizeWhitespace(row.raw_variant) === normalized);
  if (rowAlias?.canonical_category) {
    return normalizeWhitespace(rowAlias.canonical_category);
  }

  return CATEGORY_ALIAS_MAP.get(normalized) || normalized;
}

export function parseCategoryLabel(rawLabel, aliasRows = []) {
  const label = normalizeWhitespace(rawLabel);
  if (!label) {
    return {
      rawLabel: "",
      cleanCategory: "",
      shelfNo: null,
      pharmacistZone: false,
    };
  }

  const match = label.match(/^(\d+)\s*(.+)$/);
  const shelfNo = match ? Number(match[1]) : null;
  const categoryText = match ? match[2] : label;
  const cleanCategory = canonicalizeCategoryText(categoryText, aliasRows);

  return {
    rawLabel: label,
    cleanCategory,
    shelfNo: Number.isInteger(shelfNo) ? shelfNo : null,
    pharmacistZone: Number.isInteger(shelfNo),
  };
}

export function buildDisplayCategory(cleanCategory, shelfNo) {
  if (!cleanCategory) return "";
  return Number.isInteger(shelfNo) ? `${shelfNo}${cleanCategory}` : cleanCategory;
}

export function isReverifyCategory(cleanCategory, shelfNo) {
  return REVERIFY_RULES.some((rule) => rule.cleanCategory === cleanCategory && rule.shelfNo === shelfNo);
}

export function inferKeywordCategory(product) {
  const haystack = [
    product.productNameThai,
    product.productNameEng,
    product.barcode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => haystack.includes(pattern.toLowerCase()))) {
      return {
        cleanCategory: rule.cleanCategory,
        shelfNo: Number.isInteger(rule.shelfNo) ? rule.shelfNo : null,
        pharmacistZone: Number.isInteger(rule.shelfNo),
        categoryConfidence: rule.categoryConfidence,
        placementConfidence: rule.placementConfidence,
        requiresSignoff: Number(rule.shelfNo) === 9,
        alwaysHumanConfirm: Boolean(rule.alwaysHumanConfirm),
        rationale: `Matched keyword rule: ${rule.patterns.find((pattern) => haystack.includes(pattern.toLowerCase()))}`,
      };
    }
  }

  return null;
}

export function buildCategoryDecision({
  product,
  exactMatch = null,
  keywordMatch = null,
  shelfRule = null,
  aliasRows = [],
}) {
  if (!product?.productCode) return null;

  if (exactMatch) {
    const parsed = parseCategoryLabel(
      exactMatch.raw_label || buildDisplayCategory(exactMatch.clean_category, exactMatch.shelf_no),
      aliasRows,
    );
    const cleanCategory = normalizeWhitespace(exactMatch.clean_category || parsed.cleanCategory);
    const shelfNo = Number.isInteger(exactMatch.shelf_no) ? exactMatch.shelf_no : parsed.shelfNo;
    const pharmacistZone = shelfNo !== null || Boolean(exactMatch.pharmacist_zone ?? parsed.pharmacistZone);
    const needsReverification =
      exactMatch.status === "reverify" || isReverifyCategory(cleanCategory, shelfNo);
    const requiresSignoff =
      shelfNo === 9 || Boolean(shelfRule?.is_controlled) || Boolean(shelfRule?.always_human_confirm);
    const reviewStatus = resolveReviewStatus({
      cleanCategory,
      pharmacistZone,
      needsReverification,
      requiresSignoff,
      source: "exact",
    });

    return {
      productCode: product.productCode,
      cleanCategory,
      shelfNo,
      pharmacistZone,
      isColdChain: shelfNo === 10,
      requiresSignoff,
      categoryConfidence: 0.99,
      placementConfidence: pharmacistZone ? 0.88 : 0.99,
      source: "exact",
      reviewStatus,
      rationale: exactMatch.raw_label
        ? `Matched taxonomy history: ${exactMatch.raw_label}`
        : "Matched taxonomy history by product identity.",
      needsReverification,
      matchedFromProductCode: exactMatch.product_code || null,
      matchedFromBarcode: exactMatch.barcode || null,
      rawLabelSource: exactMatch.raw_label || null,
      displayCategory: buildDisplayCategory(cleanCategory, shelfNo),
    };
  }

  if (keywordMatch) {
    const needsReverification = isReverifyCategory(keywordMatch.cleanCategory, keywordMatch.shelfNo);
    const requiresSignoff =
      keywordMatch.requiresSignoff ||
      Boolean(shelfRule?.is_controlled) ||
      Boolean(keywordMatch.alwaysHumanConfirm) ||
      Boolean(shelfRule?.always_human_confirm);
    const reviewStatus = resolveReviewStatus({
      cleanCategory: keywordMatch.cleanCategory,
      pharmacistZone: keywordMatch.pharmacistZone,
      needsReverification,
      requiresSignoff,
      source: "rule",
    });

    return {
      productCode: product.productCode,
      cleanCategory: keywordMatch.cleanCategory,
      shelfNo: keywordMatch.shelfNo,
      pharmacistZone: keywordMatch.pharmacistZone,
      isColdChain: keywordMatch.shelfNo === 10,
      requiresSignoff,
      categoryConfidence: keywordMatch.categoryConfidence ?? 0.7,
      placementConfidence: keywordMatch.placementConfidence ?? 0.5,
      source: "rule",
      reviewStatus,
      rationale: keywordMatch.rationale,
      needsReverification,
      matchedFromProductCode: null,
      matchedFromBarcode: null,
      rawLabelSource: null,
      displayCategory: buildDisplayCategory(keywordMatch.cleanCategory, keywordMatch.shelfNo),
    };
  }

  return {
    productCode: product.productCode,
    cleanCategory: null,
    shelfNo: null,
    pharmacistZone: false,
    isColdChain: false,
    requiresSignoff: false,
    categoryConfidence: 0,
    placementConfidence: 0,
    source: "rule",
    reviewStatus: "needs_review",
    rationale: "No exact historical match or keyword rule matched this product.",
    needsReverification: false,
    matchedFromProductCode: null,
    matchedFromBarcode: null,
    rawLabelSource: null,
    displayCategory: "",
  };
}

function resolveReviewStatus({
  cleanCategory,
  pharmacistZone,
  needsReverification,
  requiresSignoff,
  source,
}) {
  if (!cleanCategory) return "needs_review";
  if (needsReverification) return "reverify";
  if (requiresSignoff || pharmacistZone) return "needs_review";
  if (source === "exact") return "confirmed";
  return "proposed";
}
