import { stripHtml, toDateInputValue } from "./format.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const useMock = String(import.meta.env.VITE_USE_LOOKUP_MOCK || "false").toLowerCase() === "true";

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBaseUrl}${path}`;
}

async function parsePayload(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

async function requestJson(path, options = {}) {
  if (useMock) {
    return requestMock(path);
  }

  const response = await fetch(buildApiUrl(path), {
    credentials: "include",
    ...options,
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new ApiError(payload?.message || payload?.error || `HTTP ${response.status}`, response.status, payload);
  }

  return payload;
}

function withParams(path, params) {
  const search = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function makeEncounter(index) {
  const day = (index % 9) + 1;
  const branch = ["001", "002", "003", "004"][index % 4];
  const symptoms = [
    { no: 101, name: "ไข้หวัด" },
    { no: 205, name: "ไอ เจ็บคอ" },
    { no: 309, name: "ปวดกล้ามเนื้อ" },
    { no: 411, name: "ผื่นคัน" },
  ];
  const symptom = symptoms[index % symptoms.length];
  const meds = [
    { name: "Paracetamol", qty: 10, uom: "เม็ด" },
    { name: "Cetirizine", qty: 5, uom: "เม็ด" },
  ];
  const encounterAt = `2026-06-${String(day).padStart(2, "0")}T0${(index % 8) + 8}:15:00+07:00`;

  return {
    encounterId: `ENC-${1000 + index}`,
    branchNo: branch,
    encounterAt,
    followupCall: `2026-06-${String(Math.min(day + 2, 28)).padStart(2, "0")}T10:00:00+07:00`,
    patientPid: `1101700${String(100000 + index).slice(-6)}`,
    patientName: `ผู้ป่วยตัวอย่าง ${index + 1}`,
    patientPhone: `08${String(10000000 + index).slice(-8)}`,
    symptomNo: symptom.no,
    symptomName: symptom.name,
    answersText: `<p>มีอาการ ${symptom.name} มา 2 วัน ไม่มีโรคประจำตัว</p>`,
    medsJson: JSON.stringify(meds),
    medsAmedTh: meds.map((item) => item.name).join(", "),
    warningNote: index % 5 === 0 ? "ควรโทรติดตามภายใน 48 ชม." : "",
  };
}

const mockEncounters = Array.from({ length: 34 }, (_, index) => makeEncounter(index));

const mockMedicationMap = Object.fromEntries(
  mockEncounters.map((encounter) => [
    encounter.encounterId,
    [
      {
        barcode: `8850000${encounter.encounterId.slice(-3)}`,
        skuId: Number(encounter.encounterId.slice(-3)),
        itemId: Number(encounter.encounterId.slice(-3)),
        quantity: 10,
        unitPrice: 12.5,
        lineTotal: 125,
        directionsText: "รับประทานครั้งละ 1 เม็ด หลังอาหาร",
        aggregateDirections: "หลังอาหาร เช้า-เย็น",
        amedFullName: "Paracetamol 500mg",
        amedShortName: "Para",
        verifiedBy: "pharm001",
      },
      {
        barcode: `8851000${encounter.encounterId.slice(-3)}`,
        skuId: Number(encounter.encounterId.slice(-3)) + 500,
        itemId: Number(encounter.encounterId.slice(-3)) + 500,
        quantity: 5,
        unitPrice: 8,
        lineTotal: 40,
        directionsText: "รับประทานก่อนนอน",
        aggregateDirections: "ก่อนนอน",
        amedFullName: "Cetirizine 10mg",
        amedShortName: "Ceti",
        verifiedBy: "pharm001",
      },
    ],
  ]),
);

function filterEncounters(input, filters = {}) {
  const search = String(filters.search || "").trim().toLowerCase();
  const branchCode = String(filters.branchCode || "").trim();
  const dateFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00+07:00`) : null;
  const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59+07:00`) : null;
  const patientPid = String(filters.patientPid || "").trim().toLowerCase();
  const symptom = String(filters.symptom || "").trim().toLowerCase();
  const drug = String(filters.drug || "").trim().toLowerCase();

  let rows = input.filter((row) => {
    const encounterDate = new Date(row.encounterAt);
    const haystack = `${row.patientPid} ${row.patientName} ${row.patientPhone} ${row.symptomName}`.toLowerCase();

    if (search && !haystack.includes(search)) return false;
    if (branchCode && row.branchNo !== branchCode) return false;
    if (dateFrom && encounterDate < dateFrom) return false;
    if (dateTo && encounterDate > dateTo) return false;
    if (patientPid && !String(row.patientPid).toLowerCase().includes(patientPid)) return false;
    if (symptom) {
      const symptomHaystack = `${row.symptomNo} ${row.symptomName}`.toLowerCase();
      if (!symptomHaystack.includes(symptom)) return false;
    }
    if (drug) {
      const drugHaystack = `${row.medsAmedTh} ${row.medsJson}`.toLowerCase();
      if (!drugHaystack.includes(drug)) return false;
    }
    return true;
  });

  const sort = String(filters.sort || "encounter_at");
  const dir = String(filters.dir || "DESC").toUpperCase();
  const sortMap = {
    encounter_at: "encounterAt",
    patient_pid: "patientPid",
    symptom_no: "symptomNo",
    followup_call: "followupCall",
  };
  const field = sortMap[sort] || "encounterAt";

  rows = rows.sort((left, right) => {
    const leftValue = left[field] || "";
    const rightValue = right[field] || "";
    if (leftValue === rightValue) return 0;
    if (dir === "ASC") return leftValue > rightValue ? 1 : -1;
    return leftValue < rightValue ? 1 : -1;
  });

  return rows;
}

function requestMock(path) {
  const url = new URL(path, "http://lookup.mock");

  if (url.pathname === "/api/cipdata/branches") {
    const branches = [...new Set(mockEncounters.map((row) => row.branchNo))].map((branchCode) => ({
      branchCode,
      branchName: "",
    }));
    return Promise.resolve({ branches });
  }

  if (url.pathname === "/api/cipdata/encounters") {
    const page = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 25);
    const rows = filterEncounters(mockEncounters, Object.fromEntries(url.searchParams.entries()));
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      records: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    });
  }

  if (/^\/api\/cipdata\/encounters\/[^/]+$/.test(url.pathname)) {
    const encounterId = decodeURIComponent(url.pathname.split("/").pop());
    const row = mockEncounters.find((item) => item.encounterId === encounterId);
    if (!row) {
      return Promise.reject(new ApiError("Encounter not found.", 404));
    }
    return Promise.resolve(row);
  }

  if (/^\/api\/cipdata\/encounters\/[^/]+\/medications$/.test(url.pathname)) {
    const encounterId = decodeURIComponent(url.pathname.split("/")[4]);
    return Promise.resolve({
      records: mockMedicationMap[encounterId] || [],
    });
  }

  if (url.pathname === "/api/cipdata/kpis") {
    const monthlyTarget = Number(url.searchParams.get("monthlyTarget") || 300);
    const branchCode = url.searchParams.get("branchCode") || "";
    const accumStart = url.searchParams.get("accumStart") || "";
    const accumEnd = url.searchParams.get("accumEnd") || "";
    const accumMode = url.searchParams.get("accumMode") || "monthStart";
    const today = toDateInputValue(new Date("2026-06-25T10:00:00+07:00"));
    const todayCount = filterEncounters(mockEncounters, { branchCode, dateFrom: today, dateTo: today }).length;
    const dateFrom = accumMode === "custom" && accumStart ? accumStart : "2026-06-01";
    const dateTo = accumMode === "custom" && accumEnd ? accumEnd : today;
    const accumCount = filterEncounters(mockEncounters, { branchCode, dateFrom, dateTo }).length;
    const remaining = Math.max(monthlyTarget - accumCount, 0);
    return Promise.resolve({
      todayDate: `${today}T00:00:00+07:00`,
      todayCount,
      accumCount,
      accumLabel: accumMode === "custom" ? `ช่วง ${dateFrom} ถึง ${dateTo}` : `ตั้งแต่ ${dateFrom} ถึง ${dateTo}`,
      target: monthlyTarget,
      remaining,
      perDay: Math.ceil(remaining / 5),
      remainingDays: 5,
    });
  }

  if (url.pathname === "/api/cipdata/summary") {
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const search = String(url.searchParams.get("search") || "").toLowerCase();
    const hideZero = String(url.searchParams.get("hideZero") || "").toLowerCase() === "true";
    const filtered = filterEncounters(mockEncounters, {
      branchCode: url.searchParams.get("branchCode") || "",
      dateFrom,
      dateTo,
    });
    let rows = filtered.reduce((accumulator, encounter) => {
      const meds = JSON.parse(encounter.medsJson || "[]");
      meds.forEach((item) => {
        const key = item.name;
        if (!accumulator[key]) {
          accumulator[key] = {
            skuId: key,
            companyCode: key.slice(0, 3).toUpperCase(),
            skuName: item.name,
            uom: item.uom || "หน่วย",
            qtyInBase: 1,
            totalQty: 0,
            totalQtyBase: 0,
            orders: 0,
            lastSold: encounter.encounterAt,
          };
        }
        accumulator[key].totalQty += Number(item.qty || 0);
        accumulator[key].totalQtyBase += Number(item.qty || 0);
        accumulator[key].orders += 1;
      });
      return accumulator;
    }, {});

    rows = Object.values(rows);
    if (search) {
      rows = rows.filter((row) => `${row.skuName} ${row.companyCode}`.toLowerCase().includes(search));
    }
    if (hideZero) {
      rows = rows.filter((row) => row.totalQtyBase > 0);
    }

    return Promise.resolve({
      records: rows,
      totals: rows.reduce(
        (accumulator, row) => {
          accumulator.totalQtyBase += row.totalQtyBase;
          accumulator.totalOrders += row.orders;
          return accumulator;
        },
        { totalQtyBase: 0, totalOrders: 0 },
      ),
      filters: { dateFrom, dateTo },
    });
  }

  if (url.pathname === "/api/cipdata/followups") {
    const page = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 50);
    const date = url.searchParams.get("date") || "2026-06-10";
    const branchCode = url.searchParams.get("branchCode") || "";
    const rows = mockEncounters.filter((row) => {
      const followupDate = toDateInputValue(row.followupCall);
      return followupDate === date && (!branchCode || row.branchNo === branchCode);
    });
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      records: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
      date,
    });
  }

  if (url.pathname === "/api/cipdata/report-preview") {
    const reportType = url.searchParams.get("reportType") || "range";
    const branchCode = url.searchParams.get("branchCode") || "";
    const dateFrom = url.searchParams.get("dateFrom") || "2026-06-01";
    const dateTo = url.searchParams.get("dateTo") || "2026-06-25";
    const records = filterEncounters(mockEncounters, {
      branchCode,
      dateFrom,
      dateTo,
      patientPid: url.searchParams.get("patientPid") || "",
      symptom: url.searchParams.get("symptom") || "",
      drug: url.searchParams.get("drug") || "",
    });

    return Promise.resolve({
      meta: {
        reportType,
        title: "รายงาน CiPData",
        subtitle: `ช่วง ${dateFrom} ถึง ${dateTo}${branchCode ? ` • สาขา ${branchCode}` : ""}`,
        generatedAt: new Date("2026-06-25T14:00:00+07:00").toISOString(),
      },
      filters: {
        reportType,
        dateFrom,
        dateTo,
        branchCode,
      },
      records: records.map((row) => ({
        encounterId: row.encounterId,
        branchNo: row.branchNo,
        encounterAt: row.encounterAt,
        patientPid: row.patientPid,
        patientName: row.patientName,
        symptomName: row.symptomName,
        answersText: stripHtml(row.answersText),
        medications: row.medsAmedTh,
      })),
    });
  }

  return Promise.reject(new ApiError(`Unknown mock route: ${path}`, 404));
}

export const api = {
  getBranches() {
    return requestJson("/api/cipdata/branches");
  },

  getEncounters(filters) {
    return requestJson(withParams("/api/cipdata/encounters", filters));
  },

  getEncounterDetail(encounterId) {
    return requestJson(`/api/cipdata/encounters/${encodeURIComponent(encounterId)}`);
  },

  getEncounterMedications(encounterId) {
    return requestJson(`/api/cipdata/encounters/${encodeURIComponent(encounterId)}/medications`);
  },

  getKpis(filters) {
    return requestJson(withParams("/api/cipdata/kpis", filters));
  },

  getSummary(filters) {
    return requestJson(withParams("/api/cipdata/summary", filters));
  },

  getFollowups(filters) {
    return requestJson(withParams("/api/cipdata/followups", filters));
  },

  getReportPreview(filters) {
    return requestJson(withParams("/api/cipdata/report-preview", filters));
  },
};
