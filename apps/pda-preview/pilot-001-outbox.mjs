// A separate namespace keeps proposed pilot requests apart from the accepted
// fixture demo. No enrollment codes, auth tokens or cookies are stored here.
export class PilotOutbox {
  constructor(origin) {
    this.origin = origin;
    this.ready = new Promise((resolve, reject) => {
      const request = indexedDB.open('sc-pda-count-pilot-001:' + origin, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async all() {
    const db = await this.ready;
    return new Promise((resolve, reject) => {
      const request = db.transaction('events', 'readonly').objectStore('events').getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async enqueue(identity, request) {
    const db = await this.ready;
    const original = JSON.stringify(request);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('events', 'readwrite'), store = transaction.objectStore('events');
      let failure;
      const found = store.get(request.id);
      found.onsuccess = () => {
        if (found.result) { failure = new Error('The original queued request cannot be overwritten'); transaction.abort(); return; }
        store.add({ id: request.id, targetOrigin: this.origin, staffId: identity.staffId, deviceId: identity.deviceId, branchCode: '001', original, status: 'pending' });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || new Error('Queue save failed'));
    });
  }
  async mark(id, status, detail) {
    const db = await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('events', 'readwrite'), store = transaction.objectStore('events');
      const found = store.get(id);
      found.onsuccess = () => { if (found.result) store.put({ ...found.result, status, detail }); };
      transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Queue update failed'));
    });
  }
  async forIdentity(identity) {
    return (await this.all()).filter(event => event.targetOrigin === this.origin && event.staffId === identity.staffId && event.deviceId === identity.deviceId && event.branchCode === '001');
  }
}
