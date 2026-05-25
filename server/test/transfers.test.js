import test from "node:test";
import assert from "node:assert/strict";
import { getMockTransferPayload } from "../../apps/adapos-sync/src/mockPayloads.js";
import { MockRepository } from "../src/repositories/mockRepository.js";
import { normalizeTransferPayload, validateTransferPayload } from "../src/transferSync.js";

test("normalizeTransferPayload accepts real sync-agent camelCase transfer payloads", () => {
  const payload = getMockTransferPayload();
  const { error, normalized } = validateTransferPayload(payload);

  assert.equal(error, null);
  assert.equal(normalized.headers.length, 1);
  assert.equal(normalized.lines.length, 1);

  assert.deepEqual(normalized.headers[0], {
    docNo: "TB00026-000986",
    docType: "4",
    branchCode: "000",
    branchCodeTo: "001",
    warehouseCode: "WA0001",
    warehouseCodeTo: "WA0002",
    docDate: "2026-05-19",
    tnfDate: "2026-05-19",
    transferType: "transfer",
    total: 1250,
    vat: 87.5,
    grand: 1337.5,
    deptCode: "D001",
    createdBy: "dao1",
    approvedBy: "dao1",
    raw: payload.headers[0],
  });

  assert.deepEqual(normalized.lines[0], {
    docNo: "TB00026-000986",
    docType: "4",
    branchCode: "000",
    branchCodeTo: "001",
    lineNo: 1,
    productCode: "IC-000833",
    unitCode: "BOX",
    unitName: "กล่อง",
    qty: 12,
    qtyBase: 12,
    stockFactor: 1,
    cost: 100,
    costIn: 100,
    net: 1200,
    vat: 84,
    warehouseCode: "WA0001",
    warehouseCodeTo: "WA0002",
    docDate: "2026-05-19",
    raw: payload.lines[0],
  });
});

test("normalizeTransferPayload preserves raw AdaAcc field compatibility", () => {
  const payload = {
    headers: [
      {
        FTPthDocNo: "TBRAW-0001",
        FTPthDocType: "4",
        FTBchCode: "002",
        FTBchCodeTo: "003",
        FDPthDocDate: "2026-05-20",
        FTWahCode: "RAW1",
        FTWahCodeTo: "RAW2",
        FTPthUsrName: "legacy-user",
      },
    ],
    lines: [
      {
        FTPthDocNo: "TBRAW-0001",
        FNPtdSeqNo: 7,
        FTPtdPdtCode: "630020166",
        FTPunCode: "PCS",
        FTPunName: "ชิ้น",
        FCPtdQtyAll: "5",
        FCPtdQtyBase: "10",
        FCPtdStkFac: "2",
        FTBchCode: "002",
        FTWahCode: "RAW1",
      },
    ],
  };

  const { error, normalized } = validateTransferPayload(payload);

  assert.equal(error, null);
  assert.equal(normalized.headers[0].branchCode, "002");
  assert.equal(normalized.headers[0].branchCodeTo, "003");
  assert.equal(normalized.headers[0].warehouseCode, "RAW1");
  assert.equal(normalized.lines[0].docType, "4");
  assert.equal(normalized.lines[0].lineNo, 7);
  assert.equal(normalized.lines[0].productCode, "630020166");
  assert.equal(normalized.lines[0].qty, 5);
  assert.equal(normalized.lines[0].qtyBase, 10);
  assert.equal(normalized.lines[0].stockFactor, 2);
});

test("line docType and source branch fall back from matching header aliases", () => {
  const payload = {
    headers: [
      {
        docNo: "TB00026-000999",
        docType: "7",
        branchFrm: "005",
        tnfDate: "2026-05-21",
      },
    ],
    lines: [
      {
        docNo: "TB00026-000999",
        seqNo: 3,
        productCode: "IC-001446",
      },
    ],
  };

  const normalized = normalizeTransferPayload(payload);

  assert.equal(normalized.lines[0].docType, "7");
  assert.equal(normalized.lines[0].branchCode, "005");
  assert.equal(normalized.lines[0].docDate, "2026-05-21");
});

test("mock repository accepts normalized transfer payloads", async () => {
  const repository = new MockRepository();
  const payload = normalizeTransferPayload(getMockTransferPayload());

  const result = await repository.ingestTransfers(payload);

  assert.deepEqual(result, {
    acceptedHeaders: 1,
    acceptedLines: 1,
  });
});
