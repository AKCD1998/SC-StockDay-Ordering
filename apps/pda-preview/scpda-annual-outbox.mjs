export const freshAnnualDraft = page => ({
  revision: page.revision,
  counts: page.counts,
  dirty: false,
  submitRequested: false,
  sending: null,
  receipt: null,
});

export function parseAnnualQuantity(raw) {
  const text = raw.trim();
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,3})?$/.test(text)) {
    throw Error('กรอกจำนวนตั้งแต่ 0 และทศนิยมไม่เกิน 3 ตำแหน่ง');
  }
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

export class AnnualOutbox {
  constructor({ key, storage, remote, identity, draft, changed }) {
    Object.assign(this, { key, storage, remote, identity, draft, changed });
  }

  async replace(counts, submit = false) {
    if (this.draft.submitRequested || this.draft.receipt) return;
    this.draft = { ...this.draft, counts, dirty: true, submitRequested: submit };
    try {
      await this.storage.put(this.key, this.draft);
      this.storageError = false;
    } catch (error) {
      // Keep the unsaved text visible and permit the operator to retry it.
      this.draft = { ...this.draft, submitRequested: false };
      this.storageError = true;
      this.changed(error);
      return;
    }
    this.changed();
  }

  async flush() {
    if (this.flushing || this.closed || this.draft.receipt) return;
    this.flushing = true;
    try {
      while (!this.closed && (this.draft.dirty || this.draft.sending)) {
        if (!this.draft.sending) {
          const sending = {
            ...this.identity,
            counts: this.draft.counts,
            revision: this.draft.revision,
            submit: this.draft.submitRequested,
            mutationId: crypto.randomUUID(),
          };
          this.draft = { ...this.draft, sending, dirty: false };
        }
        // Persist even on retry; power may be lost immediately after a network acknowledgement.
        try {
          await this.storage.put(this.key, this.draft);
          this.storageError = false;
        } catch (error) {
          this.storageError = true;
          throw error;
        }
        const op = this.draft.sending;
        const response = await this.remote(op);
        if (response.mutationId !== op.mutationId || response.revision !== op.revision + 1 ||
            response.category !== op.category || response.pageNo !== op.pageNo ||
            (op.submit && (response.state !== 'submitted' || !response.receiptId ||
              !Number.isFinite(Date.parse(response.receivedAt))))) {
          throw Error('ใบตอบรับจากเครื่องแม่ไม่ตรงกับหน้านี้');
        }
        const committed = { ...this.draft, revision: response.revision, sending: null, receipt: op.submit ? response : null };
        await this.storage.put(this.key, committed);
        // An edit made while IndexedDB was committing remains current.
        this.draft = { ...this.draft, revision: response.revision, sending: null, receipt: committed.receipt };
        await this.storage.put(this.key, this.draft);
        if (!this.closed) this.changed();
      }
    } catch (error) {
      if (!this.closed) this.changed(error);
    } finally {
      this.flushing = false;
    }
  }
}

export class AnnualStorage {
  constructor() {
    this.ready = new Promise((resolve, reject) => {
      const opening = indexedDB.open('scpda-annual-v1', 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('pages');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = opening.onblocked = () => reject(Error('ยังเปิดพื้นที่เก็บใบนับในเครื่องไม่ได้'));
    });
    this.ready.catch(() => {});
  }

  async run(key, write, data) {
    const db = await this.ready;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pages', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('pages');
      const request = write ? store.put(data, key) : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(Error('ยังบันทึกใบนับในเครื่องไม่สำเร็จ'));
    });
  }

  get(key) { return this.run(key, false); }
  put(key, value) { return this.run(key, true, value); }
}
