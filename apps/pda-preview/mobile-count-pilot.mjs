// Candidate branch-001 count contract. These count routes are NOT deployed or
// enabled by the existing demo UI. Existing mobile enrollment routes are reused.
// Tokens stay in memory; no PIN/refresh contract, proxy, or CORS bypass is added.
export const PILOT_CONTRACT = 'sc-pda-count-ledger-001-v2';
const LIVE_ORIGIN = 'https://paasrtsm-project.onrender.com';
export class PilotApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export class MobileCountPilotClient {
  #identity = null;
  #connected = false;
  constructor({ fetchImpl = globalThis.fetch, fixtureOrigin = null, allowLocalFixture = false, allowReusableCodeFixture=false, apiOrigin=LIVE_ORIGIN } = {}) {
    if (fixtureOrigin && (!allowLocalFixture || !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixtureOrigin))) throw new Error('Only an explicitly selected loopback fixture origin is permitted');
    if(allowReusableCodeFixture&&(!fixtureOrigin||!allowLocalFixture))throw new Error('Reusable operator codes are currently available only in the explicit isolated fixture');
    Object.defineProperty(this,'reusableCodeFixture',{value:allowReusableCodeFixture});
    const configured=new URL(apiOrigin);
    if(configured.protocol!=='https:'||configured.username||configured.password||configured.pathname!=='/'||configured.search||configured.hash)throw new Error('Reviewed HTTPS API origin required');
    Object.defineProperty(this, 'origin', { value: fixtureOrigin || configured.origin, enumerable: true });
    this.fetch = fetchImpl.bind(globalThis);
  }
  get identity() {
    if (!this.#identity) return null;
    const { token, ...publicIdentity } = this.#identity;
    return publicIdentity;
  }
  async request(path, { method = 'GET', body, authenticated = true } = {}) {
    if (!path.startsWith('/api/mobile/') || path.includes('://') || path.includes('\\')) throw new Error('Mobile API path required');
    if (authenticated && (!this.#identity || Date.parse(this.#identity.expiresAt) <= Date.now())) {
      this.disconnect(); throw new PilotApiError(401, 'ENROLLMENT_REQUIRED', 'Existing mobile enrollment is required');
    }
    const requestToken=this.#identity?.token;
    const response = await this.fetch(this.origin + path, { method, mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(authenticated ? { Authorization: 'Bearer ' + requestToken } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const staleAuthentication=response.status===401&&authenticated&&this.#identity?.token!==requestToken;
    if (response.status === 401 && authenticated&&!staleAuthentication) this.disconnect();
    let data;
    try { data = await response.json(); } catch { throw new PilotApiError(response.status, 'INVALID_RESPONSE', 'Mobile API did not return JSON'); }
    if (!response.ok) {const error=new PilotApiError(response.status, data.code || 'API_REJECTED', data.error || 'Mobile API request rejected');error.staleAuthentication=staleAuthentication;throw error;}
    return data;
  }
  async roster(code) {
    if (typeof code !== 'string' || !code.trim() || code.length > 200) throw new Error('An existing enrollment code is required');
    if(this.reusableCodeFixture&&!/^\d{4}$/.test(code.trim()))throw new Error('กรอกรหัสตัวเลข 4 หลัก');
    const data = this.reusableCodeFixture?await this.request('/api/mobile/operator-access/roster',{method:'POST',body:{code:code.trim()},authenticated:false}):await this.request('/api/mobile/enroll/roster?code=' + encodeURIComponent(code.trim()), { authenticated: false });
    if(this.reusableCodeFixture&&data.contract!=='sc-pda-reusable-code-fixture-v1')throw new Error('Reusable-code contract mismatch');
    if (data.branchCode !== '001' || !Array.isArray(data.staff)) throw new Error('This pilot accepts branch 001 enrollment only');
    return data;
  }
  async enroll({ code, staffId, deviceId, deviceLabel }) {
    this.disconnect();
    const roster = await this.roster(code);
    if (!roster.staff.some(staff => staff.staffId === staffId) || typeof deviceId !== 'string' || !deviceId.trim()) throw new Error('Select eligible staff and a device identity');
    const data = await this.request(this.reusableCodeFixture?'/api/mobile/operator-access/login':'/api/mobile/enroll/redeem', { method: 'POST', authenticated: false,
      body: { code: code.trim(), staffId, deviceId, ...(deviceLabel ? { deviceLabel } : {}) } });
    if(this.reusableCodeFixture&&(data.contract!=='sc-pda-reusable-code-fixture-v1'||data.fixtureOnly!==true))throw new Error('Reusable-code session is not an isolated fixture response');
    if (data.branchCode !== '001' || data.staffId !== staffId || data.deviceId !== deviceId || !['sales', 'manager'].includes(data.role) || typeof data.token !== 'string' || !data.token || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) throw new Error('Enrollment response identity mismatch');
    this.#identity = data;
    return this.identity;
  }
  async connect() {
    this.#connected = false;
    const data = await this.request('/api/mobile/counts/capabilities');
    if (data.contract !== PILOT_CONTRACT || data.branchCode !== '001' || data.staffId !== this.#identity.staffId || data.role !== this.#identity.role || data.officialStockWrites !== false || data.humanOverrideEnabled !== false || data.stockSource !== 'full-sync' || data.stockObservedAt !== null || data.requiresExplicitUnit !== true || data.barcodePackInferred !== false) throw new Error('Count service contract is unavailable or different; counts remain unsent');
    this.#connected = true;
    return data;
  }
  requireConnection() { if (!this.#connected) throw new Error('Verify the branch-001 count-service contract before sending requests'); }
  async scopes() { this.requireConnection();const data=await this.request('/api/mobile/counts/scopes');if(data.branchCode!=='001'||!Array.isArray(data.scopes))throw new Error('Scope response mismatch');return data.scopes; }
  async summary(productCode) {this.requireConnection();return this.request('/api/mobile/counts/products/'+encodeURIComponent(productCode)+'/summary');}
  async lookup(barcode,scopeId=null) {
    this.requireConnection();
    if (typeof barcode !== 'string' || !barcode.trim()) throw new Error('Barcode must be a string');
    const data = await this.request('/api/mobile/counts/products/by-barcode/' + encodeURIComponent(barcode.trim())+(scopeId?'?scopeId='+encodeURIComponent(scopeId):''));
    if (data.barcode !== barcode.trim() || typeof data.productCode !== 'string' || data.stock?.source !== 'full-sync' || data.stock.observedAt !== null || data.comparisonAllowed !== false || data.humanOverrideEnabled !== false) throw new Error('Product lookup evidence is incompatible');
    return data;
  }
  async submit(immutableRequest) {
    this.requireConnection();
    const data = await this.request('/api/mobile/counts', { method: 'POST', body: immutableRequest });
    if (data.contract !== PILOT_CONTRACT || data.eventId !== immutableRequest.id || data.event?.branchCode !== '001' || data.event?.staffId !== this.#identity.staffId || data.event?.deviceId !== this.#identity.deviceId || data.officialStockWrites !== false || data.humanOverrideEnabled !== false || !data.receiptId || !Number.isFinite(Date.parse(data.receivedAt))) throw new Error('No compatible server receipt; preserve the original queued request');
    return data;
  }
  async history() {
    this.requireConnection();
    const data = await this.request('/api/mobile/counts/history');
    if (data.contract !== PILOT_CONTRACT || data.branchCode !== '001' || !Array.isArray(data.records)) throw new Error('Count history scope mismatch');
    return data.records;
  }
  disconnect() { this.#identity = null; this.#connected = false; }
}
