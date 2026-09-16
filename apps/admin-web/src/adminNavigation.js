export const defaultAdminView = "receipts";
export const stockCostAuditView = "stock-cost-audit";
export const taxonomyView = "product-taxonomy";
export const taxonomyReviewView = "taxonomy-review";
export const adminOnlyViews = [
  stockCostAuditView,
  "category-review",
  "ingredient-dictionary",
  taxonomyView,
  taxonomyReviewView,
  "sync-log",
];
export const adminViewKeys = [
  defaultAdminView,
  "branch-stock",
  "branch-stock-history",
  "stock-recommendations",
  "movement-trace",
  "stock-requests",
  "focus-products",
  "preorder",
  ...adminOnlyViews,
];

const ADMIN_VIEW_ROUTE_SEGMENTS = {
  receipts: "receipts",
  "branch-stock": "branch-stock",
  "branch-stock-history": "branch-stock-history",
  "stock-recommendations": "stock-recommendations",
  "movement-trace": "movement-trace",
  "stock-requests": "stock-requests",
  "focus-products": "focus-products",
  preorder: "preorder",
  [stockCostAuditView]: "stock-cost-audit",
  "category-review": "category-review",
  "ingredient-dictionary": "ingredient-dictionary",
  [taxonomyView]: "taxonomy",
  [taxonomyReviewView]: "taxonomy-review",
  "sync-log": "sync-log",
};

const ADMIN_VIEW_BY_SEGMENT = Object.fromEntries(
  Object.entries(ADMIN_VIEW_ROUTE_SEGMENTS).map(([viewKey, segment]) => [segment, viewKey]),
);

export function getNavigationGroups(isAdminUser, hideDashboard = false) {
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      shortLabel: "DB",
      items: [
        { label: "สินค้าโฟกัส", view: "focus-products", description: "เป้าหมายสินค้าโปรโมชั่นและยอดขายสะสม" },
      ],
    },
    {
      id: "product-data",
      label: "ข้อมูลสินค้า",
      shortLabel: "PR",
      items: [
        { label: "ใบรับสินค้า", view: "receipts", description: "ตรวจใบรับสินค้าและโลโก้ Supplier" },
        { label: "สต็อกสาขา", view: "branch-stock", description: "สถานะสต็อกแยกตามสาขา" },
        { label: "สต๊อกดูย้อนหลัง", view: "branch-stock-history", description: "ประวัติสต๊อกสะสมตามรอบเวลา sync" },
        { label: "คำแนะนำสต๊อก", view: "stock-recommendations", description: "ระบบแนะนำว่าควรถือสต๊อก ขอสาขาอื่น หรือซื้อเพิ่มเท่าไหร่" },
        { label: "คำขอสินค้า", view: "stock-requests", description: "ส่งและติดตามคำขอสินค้าระหว่างสาขา" },
        { label: "Movement & Transactions", view: "movement-trace", description: "ยอดรวม · รายการ transaction · เอกสาร" },
        ...(isAdminUser ? [{
          label: "ตรวจสอบต้นทุนสต๊อกสินค้า",
          view: stockCostAuditView,
          description: "ดูต้นทุนเฉลี่ยและมูลค่าคงเหลือต่อสาขา",
        }] : []),
      ],
    },
    {
      id: "data-quality",
      label: "ตรวจสอบฐานข้อมูล",
      shortLabel: "DQ",
      adminOnly: true,
      items: [
        { label: "ตรวจหมวดสินค้า", view: "category-review", description: "review queue สำหรับยืนยันหมวดสินค้า" },
        { label: "พจนานุกรมสารสำคัญ", view: "ingredient-dictionary", description: "ดูแลฐานความรู้สารสำคัญ" },
        { label: "Product Taxonomy", view: taxonomyView, description: "กำหนดประเภทสินค้าและจัดประเภทอัตโนมัติ" },
        { label: "Taxonomy Review", view: taxonomyReviewView, description: "ยืนยันผล AI classification และจัดคิวตรวจทาน" },
        { label: "ประวัติ Sync", view: "sync-log", description: "สถานะและประวัติการ sync ข้อมูล" },
        { label: "Ingredient Mapping", description: "supervision workflow ระยะถัดไป", disabled: true },
        { label: "Product Master", description: "ทะเบียนสินค้ากลาง", disabled: true },
      ],
    },
    {
      id: "customer-relations",
      label: "ลูกค้าสัมพันธ์",
      shortLabel: "CR",
      items: [
        { label: "พรีออเดอร์", view: "preorder", description: "รับและติดตามคำสั่งจองสินค้าล่วงหน้า" },
      ],
    },
  ].filter((group) => (!group.adminOnly || isAdminUser) && (!hideDashboard || group.id !== "dashboard"));
}

export function readAdminViewFromLocation() {
  if (typeof window === "undefined") return null;

  const hashSegment = window.location.hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (hashSegment && ADMIN_VIEW_BY_SEGMENT[hashSegment]) {
    return ADMIN_VIEW_BY_SEGMENT[hashSegment];
  }

  const pathSegment = window.location.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")[0]
    .trim()
    .toLowerCase();
  if (pathSegment && ADMIN_VIEW_BY_SEGMENT[pathSegment]) {
    return ADMIN_VIEW_BY_SEGMENT[pathSegment];
  }

  return null;
}

export function buildAdminViewHash(viewKey) {
  const segment = ADMIN_VIEW_ROUTE_SEGMENTS[viewKey];
  if (!segment || viewKey === defaultAdminView) {
    return "";
  }
  return `#/${segment}`;
}
