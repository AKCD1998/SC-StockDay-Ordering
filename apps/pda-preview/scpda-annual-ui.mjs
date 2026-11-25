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
    this.body = el('div');
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
    this.button.hidden = false;
  }

  disconnect() {
    if (this.outbox) this.outbox.closed = true;
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
    }
  }

  async update(force = false) {
    if (this.refreshing || !this.actor || (!this.dialog.open && !this.outbox)) return;
    const actor = this.actor;
    this.refreshing = true;
    try {
      if (this.outbox && navigator.onLine !== false) await this.outbox.flush();
      if (this.actor !== actor || !this.dialog.open) return;
      const next = await this.request('annualOverview');
      if (this.actor !== actor || !this.dialog.open) return;
      this.data = next;
      if (!next.manager) {
        await this.storage.put(this.overviewKey(actor), next);
        if (next.assigned) await this.attachDraft(next, actor);
      }
      if (this.actor !== actor || !this.dialog.open) return;
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

  async attachDraft(data, actor) {
    const page = data.assigned;
    const identity = { eventId: data.event.id, category: page.category, pageNo: page.pageNo };
    const key = JSON.stringify([actor.branchCode, actor.operatorCode, identity.eventId, page.category, page.pageNo]);
    if (this.outbox?.key === key) return;
    const cached = await this.storage.get(key);
    if (this.actor !== actor) return;
    if (this.outbox) this.outbox.closed = true;
    this.outbox = new AnnualOutbox({
      key, storage: this.storage, identity, draft: cached || freshAnnualDraft(page),
      remote: payload => this.request('annualSave', payload),
      changed: error => {
        if (this.actor !== actor || !this.dialog.open) return;
        const draft = this.outbox.draft;
        if (draft.receipt) {
          this.status('ส่งแล้ว · เครื่องแม่ได้รับใบนับครบ');
          setTimeout(() => { void this.update(true); }, 0);
        } else if (error) {
          this.status((draft.sending ? 'รอส่ง · ' : '') + error.message);
        } else if (draft.submitRequested) {
          this.status('รอส่ง · เก็บผลนับไว้ในเครื่อง');
        } else {
          this.status('บันทึกผลนับไว้แล้ว');
        }
      },
    });
  }

  render() {
    this.body.replaceChildren();
    if (!this.data.event) {
      this.body.append(el('p', 'ยังไม่มีอีเวนท์ที่เปิดสำหรับสาขา'));
    } else if (this.data.manager) {
      this.renderManager();
    } else if (this.data.assigned && this.outbox) {
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
    const busy = new Set(pages.filter(page => page.state === 'assigned').map(page => page.assignee));
    const directPage = picker('หน้าที่จะมอบหมาย', free.map((page, index) => [String(index + 1), pageLabel(page)]));
    const directDevice = picker('เครื่องลูก', helpers.filter(helper => !busy.has(helper)).map(helper => [helper, helper]));
    const assign = action('มอบหมายหน้า', () => {
      const page = free[Number(directPage.select.value) - 1];
      if (page && directDevice.select.value) this.send('annualAssign', { category: page.category, pageNo: page.pageNo, operator: directDevice.select.value, approve: false });
    }, 'primary');
    assign.disabled = true;
    for (const field of [directPage, directDevice]) {
      field.select.onchange = () => { assign.disabled = !(directPage.select.value && directDevice.select.value); };
    }
    this.body.append(directPage.field, directDevice.field, assign);
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

  renderPage() {
    const page = this.data.assigned;
    const outbox = this.outbox;
    const locked = outbox.draft.submitRequested || Boolean(outbox.draft.receipt);
    const progress = el('p');
    progress.className = 'scpda-annual-summary';
    const submit = action('ส่งหน้าให้เครื่องแม่', async () => {
      const invalid = [...this.body.querySelectorAll('input')].find(input => !input.checkValidity());
      if (invalid) { invalid.reportValidity(); return; }
      const counts = outbox.draft.counts;
      if (Object.keys(counts).length !== page.items.length) return;
      await outbox.replace(counts, true);
      if (this.outbox !== outbox || !this.dialog.open) return;
      this.render();
      void this.update(true);
    }, 'primary');
    const progressText = () => {
      const counted = Object.keys(outbox.draft.counts).length;
      progress.textContent = `นับแล้ว ${counted} / ${page.items.length} รายการ`;
      submit.disabled = counted !== page.items.length || locked || this.body.querySelector('[data-editing-point]') !== null;
    };
    this.body.append(el('h3', pageLabel(page)), progress);
    if (locked) {
      const received = Boolean(outbox.draft.receipt);
      this.body.append(el('p', received ? 'ส่งแล้ว · เครื่องแม่ได้รับใบนับครบ' : 'รอส่ง · เก็บผลไว้ในเครื่องแล้ว'));
      if (!received) this.body.append(action('ลองส่งอีกครั้ง', () => this.update(true), 'primary'));
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
    this.body.append(submit);
    progressText();
  }
}
