import { afterEach, describe, expect, it, vi } from "vitest";
import { approveStockMapping, makeMappingRequest, readStockExceptions, readStockReconciliation, revokeStockRule,
  validateExceptionsResponse } from "./shopee004ExceptionsClient.js";
import { exceptionFixture, exceptionsFixture, reconciliationFixture } from "../test/shopee004Exceptions.fixture.js";

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Shopee 004 exception client", () => {
  it("uses the authenticated admin read bridge with bounded pagination and abort signal", async () => {
    const fetch = vi.fn(async () => response(exceptionsFixture())); vi.stubGlobal("fetch", fetch);
    await expect(readStockExceptions({ cursor: "opaque page & marker" })).resolves.toMatchObject({ branchCode: "004" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("/admin/shopee004/stock-exceptions?limit=25&cursor=opaque+page+%26+marker");
    expect(options.credentials).toBe("include"); expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("validates reconciliation independently and never turns missing counts into zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...reconciliationFixture, reservedOrders: null })));
    await expect(readStockReconciliation()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it.each([
    [401, { error: { code: "private stack or customer payload" } }, "UNAUTHORIZED"],
    [403, {}, "FORBIDDEN"], [409, {}, "REVISION_CONFLICT"],
    [409, { error: { code: "RULE_VERSION_CONFLICT" } }, "RULE_VERSION_CONFLICT"],
    [503, { error: { code: "BRIDGE_UNAVAILABLE" } }, "BRIDGE_UNAVAILABLE"],
  ])("bounds read errors for HTTP %s", async (status, body, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(body, status)));
    const error = await readStockExceptions().catch(value => value);
    expect(error.code).toBe(code); expect(error.message).not.toContain("private stack");
  });
  it.each([
    { branchCode: "001" }, { asOf: "not-time" }, { records: [exceptionFixture({ revision: null })] },
    { records: [exceptionFixture({ proposedMatches: [{ productCode: "SYNTHETIC-A", quantityPerSale: 0 }] })] },
    { records: [exceptionFixture(), exceptionFixture()] }, { pagination: { hasMore: true, nextCursor: null } },
  ])("rejects malformed or mixed exception responses %j", overrides => {
    expect(() => validateExceptionsResponse(exceptionsFixture(undefined, overrides))).toThrow();
  });
  it("retains opaque revision and constructs explicit pack components", () => {
    const row = exceptionFixture(); const body = makeMappingRequest(row, row.proposedMatches, ["fixture-evidence"], true, "fixture-operation");
    expect(body.expectedRevision).toBe("fixture-revision-2");
    expect(body.components).toEqual([{ productCode: "SYNTHETIC-A", quantityPerSale: 1, unit: "กล่อง" }]);
    expect(body).not.toHaveProperty("cancelBeforeDispatch"); expect(body).not.toHaveProperty("physicalEvidenceVerified");
  });
  it.each([
    row => ({ row, matches: row.proposedMatches, refs: [], attested: true }),
    row => ({ row, matches: row.proposedMatches, refs: ["fixture-evidence"], attested: false }),
    row => ({ row: { ...row, evidence: row.evidence.map(e => ({ ...e, verifiedAt: null })) }, matches: row.proposedMatches, refs: ["fixture-evidence"], attested: true }),
    row => ({ row, matches: [{ ...row.proposedMatches[0], unit: "ขวด" }], refs: ["fixture-evidence"], attested: true }),
    row => ({ row, matches: [{ ...row.proposedMatches[0], quantityPerSale: 0 }], refs: ["fixture-evidence"], attested: true }),
    row => ({ row, matches: [...row.proposedMatches, ...row.proposedMatches], refs: ["fixture-evidence"], attested: true }),
    row => ({ row: { ...row, issueClass: "lifecycle" }, matches: row.proposedMatches, refs: ["fixture-evidence"], attested: true }),
  ])("blocks unverified, conflicting or lifecycle-only mapping approval", build => {
    const input = build(exceptionFixture());
    expect(() => makeMappingRequest(input.row, input.matches, input.refs, input.attested, "fixture-operation")).toThrow();
  });
  it("includes CSRF and reuses the caller operation without automatic POST retries", async () => {
    const fetch = vi.fn(async () => response({ recorded: true, duplicate: false, ruleId: "fixture-rule", ruleVersion: 2, requeuedOrders: 2 })); vi.stubGlobal("fetch", fetch);
    const row = exceptionFixture(); const body = makeMappingRequest(row, row.proposedMatches, ["fixture-evidence"], true, "fixture-operation");
    await approveStockMapping(row.exceptionId, body, "fixture-csrf");
    expect(fetch).toHaveBeenCalledTimes(1); const options = fetch.mock.calls[0][1];
    expect(options.headers["X-CSRF-Token"]).toBe("fixture-csrf"); expect(JSON.parse(options.body)).toEqual(body);
  });
  it.each([
    async () => { throw new Error("private upstream diagnostic"); },
    async () => response({ error: { code: "private upstream diagnostic" } }, 503),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad private body"); } }),
    async () => response({ recorded: true }),
  ])("treats ambiguous mutation outcomes as unknown without leaking provider details", async implementation => {
    const fetch = vi.fn(implementation); vi.stubGlobal("fetch", fetch);
    const error = await approveStockMapping("fixture-exception", {}, "fixture-csrf").catch(value => value);
    expect(error).toMatchObject({ code: "OUTCOME_UNKNOWN", outcomeUnknown: true });
    expect(error.message).not.toContain("private"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds reads to eight seconds and does not retry", async () => {
    vi.useFakeTimers(); const fetch = vi.fn((_, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError"))))); vi.stubGlobal("fetch", fetch);
    const pending = readStockExceptions().catch(error => error);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ code: "TEMPORARY_UNAVAILABLE" }); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps rule revocation a separate append-only operation", async () => {
    const fetch = vi.fn(async () => response({ recorded: true, duplicate: false })); vi.stubGlobal("fetch", fetch);
    await revokeStockRule("fixture-rule", { expectedVersion: 2, operationId: "fixture-revoke", reason: "แพ็กต้นทางเปลี่ยน" }, "fixture-csrf");
    expect(fetch.mock.calls[0][0]).toContain("/stock-rules/fixture-rule/revoke");
    expect(fetch.mock.calls[0][1].body).not.toContain("cutover");
  });
  it("distinguishes an explicitly fail-closed unconfigured bridge from an ambiguous write timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ definitiveNoWrite: true, error: { code: "BRIDGE_UNAVAILABLE", definitiveNoWrite: true, detailsWithheld: true } }, 503)));
    const error = await approveStockMapping("fixture-exception", {}, "fixture-csrf").catch(value => value);
    expect(error).toMatchObject({ code: "BRIDGE_UNAVAILABLE", outcomeUnknown: false });
  });
});
