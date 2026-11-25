import { AnnualOutbox, AnnualStorage, freshAnnualDraft, parseAnnualQuantity } from './scpda-annual-outbox.mjs';

const labels = { common: 'สามัญ', normal: 'ปกติ', pharma: 'เภสัช' };
const pageLabel = page => `${labels[page.category]} · หน้า ${page.pageNo}`;
const el = (tag, text = '') => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};
function action(label, handler, kind = 'secondary') {
  const button = el('button', label);
  button.type = 'button';
  button.className = `scpda-${kind}`;
  button.addEventListener('click', handler);
  return button;
}

function submitPassword() {
  return new Promise(resolve => {
    const dialog = el('dialog'); dialog.className = 'scpda-account';
    const form = el('form');
    form.append(el('h2', 'ยืนยันส่งหน้าให้เครื่องแม่'), el('p', 'ส่งจบหน้านี้ให้เครื่องแม่ หลังส่งแล้วจะแก้ไขหน้านี้ไม่ได้'));
    const label = el('label', 'รหัสยืนยันการส่ง'); const input = el('input');
    input.type = 'password'; input.required = true; input.maxLength = 72;
    input.autocomplete = 'off'; input.autocapitalize = 'none'; input.spellcheck = false; label.append(input);
    const confirm = el('button', 'ยืนยันส่งหน้า'); confirm.type = 'submit'; confirm.className = 'scpda-primary';
    const cancel = action('ยกเลิก', () => finish(null));
    let settled = false;
    const finish = value => { if (settled) return; settled = true; input.value = ''; dialog.close(); dialog.remove(); resolve(value); };
    form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) finish(input.value); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    form.append(label, confirm, cancel); dialog.append(form); document.body.append(dialog); dialog.showModal(); input.focus();
  });
}

function picker(label, choices) {
  const field = el('label', label);
  const select = el('select');
  select.append(new Option('เลือก', ''), ...choices.map(([value, text]) => new Option(text, value)));
  field.append(select);
  return { field, select };
}

function download(result) {
  if (result.saved === true) return;
  if (typeof result.base64 !== 'string' || typeof result.filename !== 'string' || !result.filename.endsWith('.xlsx')) {
    throw Error('ยังไม่ได้รับไฟล์ Excel');
  }
  const data = Uint8Array.from(atob(result.base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = el('a');
  link.href = url;
  link.download = result.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 45000);
}

export class ScpdaAnnualUI {
  constructor({ mount, request }) {
    this.request = request;
    this.storage = new AnnualStorage();
    this.boxes = new Map();
    this.button = action('งานนับสต๊อกพิเศษ · ธ.ค. 2569', () => this.open());
    this.button.hidden = true;
    this.button.classList.add('scpda-annual-launch');
    mount.prepend(this.button);
    this.dialog = el('dialog');
    this.dialog.className = 'scpda-annual-dialog';
    this.title = el('h2', 'ใบนับสต๊อกตามหน้า A4');
    this.notice = el('p');
    this.notice.setAttribute('role', 'status');
    this.notice.className = 'scpda-annual-status';
    this.body = el('fieldset');
    this.body.className = 'scpda-annual-body';
    const top = el('header');
    top.append(this.title, action('ปิด', () => this.dialog.close()));
    this.dialog.append(top, this.notice, this.body);
    document.body.append(this.dialog);
    this.dialog.addEventListener('close', () => clearInterval(this.refreshTimer));
    window.addEventListener('online', () => {
      if (this.actor) void this.update();
    });
  }

  connect(actor) {
    this.disconnect();
    if (actor.branchCode !== '005' || actor.annualCountAvailable !== true) return;
    this.actor = actor;
    this.view = actor.operatorCode === '01005' ? 'team' : 'mine';
    this.button.hidden = false;
  }

  disconnect() {
    for (const box of this.boxes.values()) box.closed = true;
    this.boxes.clear();
    this.selectedPage = this.restoredEvent = null;
    this.actor = this.data = this.outbox = null;
    clearTimeout(this.syncTimer);
    clearInterval(this.refreshTimer);
    this.button.hidden = true;
    this.body.replaceChildren();
    this.dialog.close();
  }

  async open() {
    if (!this.actor || this.dialog.open) return;
    const actor = this.actor;
    this.dialog.showModal();
    this.status('กำลังอ่านใบนับ');
    try {
      if (!this.data && actor.operatorCode !== '01005') {
        const cached = await this.storage.get(this.overviewKey(actor));
        if (cached?.assigned && this.actor === actor && this.dialog.open) {
          this.data = cached;
          this.selectedPage = { category: cached.assigned.category, pageNo: cached.assigned.pageNo };
          await this.attachDraft(cached, actor);
          if (this.actor === actor && this.dialog.open) this.render();
        }
      }
    } catch (error) {
      if (this.actor === actor) this.status(error.message);
    }
    if (this.actor !== actor || !this.dialog.open) return;
    void this.update(true);
    this.refreshTimer = setInterval(() => { void this.update(); }, 18000);
  }

  overviewKey(actor) {
    return JSON.stringify([actor.branchCode, actor.operatorCode, 'last-assigned-page']);
  }

  status(message = '') {
    this.notice.textContent = message;
    this.notice.hidden = !message;
  }

  async send(op, body, onResult) {
    if (this.actionRunning) return;
    this.actionRunning = true;
    this.body.disabled = true;
    this.body.setAttribute('aria-busy','true');
    this.status('กำลังบันทึก…');
    const actor = this.actor;
    try {
      const result = await this.request(op, { eventId: this.data.event.id, ...body });
      if (this.actor === actor) {
        if (onResult) onResult(result);
        else await this.update(true);
      }
    } catch (error) {
      if (this.actor === actor) this.status(error.message);
    } finally {
      this.actionRunning = false;
      this.body.disabled = false;
      this.body.setAttribute('aria-busy','false');
    }
  }

  update(force = false) {
    if (this.refreshTask) return force ? this.refreshTask.then(() => this.update(true)) : this.refreshTask;
    this.refreshTask = this.performUpdate(force).finally(() => { this.refreshTask = null; });
    return this.refreshTask;
  }

  async performUpdate(force = false) {
    if (this.refreshing || !this.actor || (!this.dialog.open && !this.outbox)) return;
    const actor = this.actor, choiceAtStart = this.pageChoiceVersion || 0;
    this.refreshing = true;
    try {
      if (navigator.onLine !== false) await this.flushAll();
      if (this.actor !== actor || !this.dialog.open || choiceAtStart !== (this.pageChoiceVersion || 0)) return;
      let next = await this.request('annualOverview', this.overviewArgs());
      if (!next.manager && next.event && await this.restoreQueued(next, actor) && navigator.onLine !== false) {
        await this.flushAll();
        next = await this.request('annualOverview', this.overviewArgs());
      }
      if (this.actor !== actor || !this.dialog.open || choiceAtStart !== (this.pageChoiceVersion || 0)) return;
      this.data = next;
      if (!next.manager) {
        await this.storage.put(this.overviewKey(actor), next);
        if (next.assigned) {
          this.selectedPage = { category: next.assigned.category, pageNo: next.assigned.pageNo };
          await this.storage.put(this.pageKey(actor, next.event.id, next.assigned) + '::detail', next.assigned);
          await this.attachDraft(next, actor);
        } else { this.selectedPage = null; this.outbox = null; }
      }
      if (this.actor !== actor || !this.dialog.open || choiceAtStart !== (this.pageChoiceVersion || 0)) return;
      if (!this.outbox?.draft?.sending) this.status();
      this.title.textContent = next.event?.label || 'ใบนับสต๊อกตามหน้า A4';
      const editing = this.body.contains(document.activeElement);
      if (force || !editing || (!next.assigned && !!this.outbox?.draft?.receipt)) this.render();
    } catch (error) {
      if (this.actor === actor && this.dialog.open) {
        const hint = this.outbox?.storageError ? 'ยังบันทึกผลนับในเครื่องไม่สำเร็จ · '
          : this.outbox ? 'รอส่ง · เก็บผลนับไว้ในเครื่องแล้ว · ' : '';
        this.status(hint + error.message);
      }
    } finally {
      this.refreshing = false;
    }
  }

  overviewArgs() {
    return this.view === 'mine' ? { view: 'mine', ...(this.selectedPage || {}) } : {};
  }

  renderContext() {
    if (this.data.canManage) {
      const row = el('div'); row.className = 'scpda-annual-inline';
      for (const [view, text] of [['team', 'มอบหมายและติดตาม'], ['mine', 'ใบนับของฉัน']]) {
        const button = action(text, async () => {
          if (this.body.querySelector('[data-editing-point], input:invalid')) { this.status('บันทึกจุดนับและตรวจจำนวนก่อนเปลี่ยนหน้า'); return; }
          this.pageChoiceVersion = (this.pageChoiceVersion || 0) + 1; this.view = view; await this.update(true);
        }, this.view === view ? 'primary' : 'secondary');
        row.append(button);
      }
      this.body.append(row);
    }
    // Name is a display label; server roles still use the bound operator.
    const name = el('label', 'ชื่อที่ใช้ในงานนับ'); const input = el('input');
    input.value = this.data.myDisplayName || ''; input.maxLength = 80; name.append(input);
    const saveName = action('บันทึกชื่อ', () => this.send('annualParticipant', { displayName: input.value }));
    const details = el('details'); details.append(el('summary', 'ชื่อผู้ใช้งานและงานของทีม'));
    details.append(name, saveName);
    for (const page of this.data.team || []) {
      details.append(el('p', `${page.displayName || 'ยังไม่ระบุชื่อ'} · ${page.operator}${page.primary ? ' (เครื่องแม่)' : ''} · ${pageLabel(page)} · ${page.state === 'submitted' ? 'ส่งแล้ว' : `นับแล้ว ${page.countedRows}/${page.totalRows}`}`));
    }
    this.body.append(details);
  }

  pageKey(actor, eventId, page) {
    return JSON.stringify([actor.branchCode, actor.operatorCode, eventId, page.category, page.pageNo]);
  }

  async checkpoint() {
    for (const box of this.boxes.values()) await this.storage.put(box.key, box.draft);
  }

  async flushAll() {
    for (const box of [...this.boxes.values()]) await box.flush();
  }

  makeBox(actor, eventId, page, draft) {
    const key = this.pageKey(actor, eventId, page);
    if (this.boxes.has(key)) return this.boxes.get(key);
    const identity = { eventId, category: page.category, pageNo: page.pageNo };
    const box = new AnnualOutbox({ key, storage: this.storage, identity, draft,
      remote: payload => this.request('annualSave', { ...payload, ...(payload.submit && box.confirmationPassword ? { confirmationPassword: box.confirmationPassword } : {}) }),
      changed: error => {
        if (this.actor !== actor || !this.dialog.open) return;
        if (box !== this.outbox) {
          if (box.draft.receipt) setTimeout(() => { void this.update(); }, 0);
          return;
        }
        if (box.draft.receipt) {
          this.status('ส่งแล้ว · เครื่องแม่ได้รับใบนับครบ');
          setTimeout(() => { void this.update(true); }, 0);
        } else if (error) this.status((box.draft.sending ? 'รอส่ง · ' : '') + error.message);
        else if (box.draft.submitRequested) this.status('รอส่ง · เก็บผลนับไว้ในเครื่อง');
        else this.status('บันทึกผลนับไว้แล้ว');
      },
    });
    this.boxes.set(key, box);
    return box;
  }

  async restoreQueued(data, actor) {
    if (this.restoredEvent === data.event.id) return false;
    const pages = [...(data.assignedPages || (data.assigned ? [data.assigned] : [])), ...(data.receipts || [])];
    const allowed = new Map(pages.map(page => [this.pageKey(actor, data.event.id, page), page]));
    const prefix = JSON.stringify([actor.branchCode, actor.operatorCode, data.event.id]).slice(0, -1) + ',';
    const entries = await this.storage.list(prefix);
    if (this.actor !== actor) return false;
    let pending = false;
    for (const { key, value } of entries) {
      if (!allowed.has(key) || !value || !Number.isInteger(value.revision) || !value.counts) continue;
      if (value.sending || value.dirty || value.submitRequested && !value.receipt) {
        this.makeBox(actor, data.event.id, allowed.get(key), value);
        pending = true;
      }
    }
    this.restoredEvent = data.event.id;
    return pending;
  }

  async attachDraft(data, actor) {
    const page = data.assigned, key = this.pageKey(actor, data.event.id, page);
    const cached = await this.storage.get(key);
    if (this.actor !== actor) return;
    const draft = cached && (cached.dirty || cached.sending || cached.submitRequested || cached.receipt || cached.revision >= page.revision)
      ? cached : freshAnnualDraft(page);
    this.outbox = this.makeBox(actor, data.event.id, page, draft);
  }

  async choosePage(page) {
    const editing = this.body.querySelector('[data-editing-point], input:invalid');
    if (editing) { this.status('บันทึกจุดนับและตรวจจำนวนก่อนเปลี่ยนหน้า'); const picker = this.body.querySelector('[data-page-picker]'); if(picker)picker.value=`${this.data.assigned.category}:${this.data.assigned.pageNo}`; return; }
    const actor = this.actor, previous = this.selectedPage;
    const target = { category: page.category, pageNo: page.pageNo };
    this.pageChoiceVersion = (this.pageChoiceVersion || 0) + 1;
    if (navigator.onLine !== false) {
      if (this.refreshTask) await this.refreshTask;
      if (this.actor !== actor) return;
      this.selectedPage = target; await this.update(true); return;
    }
    this.selectedPage = target;
    try {
      const cached = await this.storage.get(this.pageKey(actor, this.data.event.id, page) + '::detail');
      if (this.actor !== actor) return;
      if (!cached) throw Error('เชื่อมต่ออินเทอร์เน็ตเพื่อเปิดหน้านี้ครั้งแรก');
      const next = { ...this.data, assigned: cached };
      await this.storage.put(this.overviewKey(actor), next);
      if (this.actor !== actor) return;
      this.data = next;
      await this.attachDraft(this.data, actor);
      if (this.actor === actor) this.render();
    } catch (error) { this.selectedPage = previous; this.status(error.message); this.render(); }
  }

  renderPagePicker() {
    const pages = this.data.assignedPages || [this.data.assigned];
    this.body.append(el('p', `ใบนับของคุณ ${pages.length} หน้า · งานแต่ละหน้าเก็บแยกกัน`));
    if (pages.length < 2) return;
    const field = picker('ใบนับของฉัน', pages.map(page => [`${page.category}:${page.pageNo}`, pageLabel(page)]));
    field.select.dataset.pagePicker = '';
    field.select.value = `${this.data.assigned.category}:${this.data.assigned.pageNo}`;
    field.select.onchange = async () => {
      const page = pages.find(page => `${page.category}:${page.pageNo}` === field.select.value);
      if (!page) return;field.select.disabled = true;
      try{await this.choosePage(page);}finally{field.select.disabled = false;}
    };
    this.body.append(field.field);
  }

  render() {
    this.body.replaceChildren();
    if (this.data.event) this.renderContext();
    if (!this.data.event) {
      this.body.append(el('p', 'ยังไม่มีอีเวนท์ที่เปิดสำหรับสาขา'));
    } else if (this.data.manager) {
      this.renderManager();
    } else if (this.data.assigned && this.outbox) {
      this.renderPagePicker();
      this.renderPage();
    } else {
      this.renderRequests();
    }
  }

  renderManager() {
    const { pages, requests, helpers } = this.data;
    const submitted = pages.filter(page => page.state === 'submitted').length;
    const summary = el('p', `รับผลแล้ว ${submitted} / ${pages.length} หน้า · คลัง ${this.data.event.warehouseCode}`);
    summary.className = 'scpda-annual-summary';
    this.body.append(summary);
    for (const item of requests) {
      const row = el('div');
      row.className = 'scpda-annual-inline';
      row.append(el('strong', `${item.operator} ขอ ${pageLabel(item)}`), action('อนุมัติ', () =>
        this.send('annualAssign', { ...item, approve: true }), 'primary'));
      this.body.append(row);
    }
    const free = pages.filter(page => page.state === 'free');
    const loads = new Map();
    for (const page of pages.filter(page => page.state === 'assigned')) loads.set(page.assignee, (loads.get(page.assignee) || 0) + 1);
    const directPage = picker('หน้าที่จะมอบหมาย', free.map((page, index) => [String(index + 1), pageLabel(page)]));
    const directDevice = picker('เครื่องที่รับงาน', ['01005', ...helpers].map(helper => [helper, (helper === '01005' ? '01005 · เครื่องแม่ (นับเอง)' : helper) + (loads.get(helper) ? ` · ค้าง ${loads.get(helper)} หน้า` : ' · พร้อมรับงาน')]));
    const assign = action('มอบหมายหน้า', () => {
      const page = free[Number(directPage.select.value) - 1];
      if (page && directDevice.select.value) this.send('annualAssign', { category: page.category, pageNo: page.pageNo, operator: directDevice.select.value, approve: false });
    }, 'primary');
    assign.disabled = true;
    for (const field of [directPage, directDevice]) {
      field.select.onchange = () => { assign.disabled = !(directPage.select.value && directDevice.select.value); };
    }
    this.body.append(directPage.field, directDevice.field, assign, el('p', 'มอบหมายเพิ่มให้เครื่องเดิมได้ งานที่ถืออยู่ยังอยู่ครบ'));
    const progress = el('ul');
    progress.className = 'scpda-annual-progress';
    for (const page of pages.filter(page => page.state !== 'free')) {
      progress.append(el('li', `${pageLabel(page)} · ${page.assignee} · ${page.state === 'submitted' ? 'ส่งแล้ว' : `นับแล้ว ${page.countedRows}/${page.totalRows}`}`));
    }
    this.body.append(progress);
    if (submitted && submitted === pages.length) {
      for (const [category, label] of Object.entries(labels)) {
        this.body.append(action(`สร้าง Excel ${label}`, () => this.send('annualExport', { category }, result => {
          download(result);
          this.status('สร้าง Excel แล้ว');
        }), 'primary'));
      }
    }
  }

  renderRequests() {
    const { free, pending, receipts } = this.data;
    if (receipts.length) {
      this.body.append(el('p', `เครื่องแม่ได้รับผลแล้ว ${receipts.length} หน้า`));
    }
    if (pending) {
      this.body.append(el('h3', `รออนุมัติ · ${pageLabel(pending)}`));
    }
    if (!free.length) {
      this.body.append(el('p', 'ไม่มีหน้าว่าง'));
      return;
    }
    const field = picker('เลือกหน้าว่าง', free.map((page, index) => [String(index + 1), pageLabel(page)]));
    const button = action(pending ? 'ขอเปลี่ยนหน้า' : 'ขอหน้า', () => {
      const page = free[Number(field.select.value) - 1];
      if (page) this.send('annualRequest', page);
    }, 'primary');
    button.disabled = true;
    field.select.onchange = () => { button.disabled = !field.select.value; };
    this.body.append(field.field, button);
  }

  async confirmAndSubmit(page, box) {
    if (this.actionRunning || this.outbox !== box || box.draft.receipt) return;
    if (this.body.querySelector('[data-editing-point], input:invalid')) { this.status('ตรวจจำนวนและบันทึกจุดนับก่อนส่งหน้า'); return; }
    if (Object.keys(box.draft.counts).length !== page.items.length) return;
    clearTimeout(this.syncTimer);
    const actor = this.actor;
    let password = await submitPassword();
    if (password === null || this.actor !== actor || this.outbox !== box || !this.dialog.open) return;
    this.actionRunning = true; this.body.disabled = true;
    try {
      if (navigator.onLine === false) throw Error('ยังออฟไลน์อยู่ · เก็บร่างไว้ในเครื่องแล้ว เชื่อมต่อแล้วใส่รหัสเพื่อส่งอีกครั้ง');
      if (box.flushTask) await box.flushTask;
      box.confirmationPassword = password;
      await box.replace(box.draft.counts, true);
      if (box.storageError) return;
      this.render(); this.body.disabled = true;
      await box.flush();
      if (this.outbox === box && this.dialog.open) this.render();
    } catch (error) { if (this.actor === actor) this.status(error.message); }
    finally { password = ''; box.confirmationPassword = ''; this.actionRunning = false; this.body.disabled = false; }
  }

  renderPage() {
    const page = this.data.assigned;
    const outbox = this.outbox;
    const locked = outbox.draft.submitRequested || Boolean(outbox.draft.receipt);
    const progress = el('p');
    progress.className = 'scpda-annual-summary';
    const submit = action('ส่งหน้าให้เครื่องแม่', () => this.confirmAndSubmit(page, outbox), 'primary');
    const progressText = () => {
      const counted = Object.keys(outbox.draft.counts).length;
      progress.textContent = `นับแล้ว ${counted} / ${page.items.length} รายการ`;
      submit.disabled = counted !== page.items.length || locked || this.body.querySelector('[data-editing-point]') !== null;
    };
    this.body.append(el('h3', pageLabel(page)), progress);
    if (locked) {
      const received = Boolean(outbox.draft.receipt);
      this.body.append(el('p', received ? 'ส่งแล้ว · เครื่องแม่ได้รับใบนับครบ' : 'รอส่ง · เก็บผลไว้ในเครื่องแล้ว'));
      if (!received) this.body.append(action('ใส่รหัสเพื่อส่งหน้าอีกครั้ง', () => this.confirmAndSubmit(page, outbox), 'primary'));
      progressText();
      return;
    }
    for (const item of page.items) {
      const row = el('section');
      row.className = 'scpda-annual-item';
      const key = String(item.row);
      const pointsForRow = () => outbox.draft.counts[key] || [null, null, null];
      row.append(el('strong', `${item.ordinal}. ${item.name}`));
      row.append(el('small', `${item.code} · ${item.barcode} · ${item.unit}`));
      const slots = el('div');
      slots.className = 'scpda-annual-inline';
      const total = el('output');
      const sum = () => {
        const points = pointsForRow();
        total.value = points.some(Boolean) ? String(points.reduce((acc, point) => acc + (point?.quantityMilli || 0), 0) / 1000) : '—';
      };
      const savePoints = async points => {
        const counts = { ...outbox.draft.counts };
        if (points.some(Boolean)) counts[key] = points;
        else delete counts[key];
        await outbox.replace(counts);
        if (this.outbox !== outbox || !this.dialog.open) return;
        sum();
        progressText();
        clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => { if (navigator.onLine !== false) void outbox.flush(); }, 850);
      };
      const totalField = el('label', 'รวมนับ');
      totalField.append(total);
      slots.append(totalField);
      for (let index = 0; index < 3; index++) {
        const field = el('label', `นับ ${index + 1}`);
        const input = el('input');
        input.inputMode = 'decimal';
        input.maxLength = 12;
        const existing = pointsForRow()[index];
        input.value = existing ? String(existing.quantityMilli / 1000) : '';
        input.oninput = () => {
          const points = [...pointsForRow()];
          try {
            points[index] = input.value.trim() === '' ? null : { quantityMilli: parseAnnualQuantity(input.value) };
            input.setCustomValidity('');
            void savePoints(points);
          } catch (error) {
            input.setCustomValidity(error.message);
            this.status(error.message);
          }
        };
        field.append(input);
        slots.append(field);
      }
      row.append(slots);
      const extras = el('div');
      const addPoint = (index, existing) => {
        const form = el('div');
        form.dataset.editingPoint = '';
        const placeLabel = el('label', `ตำแหน่งนับ ${index + 1}`);
        const place = el('input');
        place.value = existing?.place || '';
        place.maxLength = 120;
        placeLabel.append(place);
        const qtyLabel = el('label', 'จำนวนที่พบ');
        const qty = el('input');
        qty.inputMode = 'decimal';
        qty.maxLength = 12;
        qty.value = existing ? String(existing.quantityMilli / 1000) : '';
        qtyLabel.append(qty);
        const save = action('บันทึกจุดนับ', async () => {
          try {
            if (!place.value.trim()) throw Error('ระบุตำแหน่งที่พบสินค้า');
            const points = [...pointsForRow()];
            points[index] = { place: place.value.trim(), quantityMilli: parseAnnualQuantity(qty.value) };
            await savePoints(points);
            renderExtras();
          } catch (error) {
            this.status(error.message);
          }
        });
        form.append(placeLabel, qtyLabel, save, action('ยกเลิก', renderExtras));
        extras.replaceChildren(form);
        progressText();
        place.focus();
      };
      const renderExtras = () => {
        extras.replaceChildren(...pointsForRow().slice(3).map((point, index) =>
          action(`นับ ${index + 4} · ${point.place} · ${point.quantityMilli / 1000}`, () => addPoint(index + 3, point))),
        action('+ จุดนับ', () => addPoint(pointsForRow().length)));
        progressText();
      };
      renderExtras();
      row.append(extras);
      this.body.append(row);
      sum();
    }
    const saved = el('p'); saved.className = 'scpda-annual-summary';
    const savedText = () => {
      saved.textContent = outbox.draft.savedAt && !outbox.draft.dirty && !outbox.draft.sending
        ? 'ระบบรับร่างล่าสุด ' + new Date(outbox.draft.savedAt).toLocaleString('th-TH') + ' · กลับมานับต่อได้'
        : 'กรอกแล้วเก็บร่างในเครื่องอัตโนมัติ · ยังไม่ใช่การส่งจบหน้า';
    };
    savedText();
    const pause = action('บันทึกพักงาน', async () => {
      const invalid = [...this.body.querySelectorAll('.scpda-annual-item input')].find(input => !input.checkValidity());
      if (invalid || this.body.querySelector('[data-editing-point]')) { this.status('ตรวจจำนวนและบันทึกจุดนับก่อนพักงาน'); return; }
      await outbox.replace(outbox.draft.counts);
      if (outbox.storageError) return;
      this.status('บันทึกร่างในเครื่องแล้ว · ' + (navigator.onLine === false ? 'รอเชื่อมต่อเพื่อส่งร่าง' : 'กำลังส่งร่างเข้าระบบ'));
      if (navigator.onLine !== false) await outbox.flush();
      if (this.outbox !== outbox) return;
      savedText();
      if (!outbox.draft.sending && !outbox.draft.dirty && outbox.draft.savedAt) this.status('ระบบรับร่างแล้ว · ปิดแอปแล้วกลับมานับต่อได้');
    });
    this.body.append(saved, pause, submit);
    progressText();
  }
}
