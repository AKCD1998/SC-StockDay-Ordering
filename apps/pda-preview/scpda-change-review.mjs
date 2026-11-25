const node = (tag, text = '', className = '') => {
  const value = document.createElement(tag); value.textContent = text;
  if (className) value.className = className;
  return value;
};
const quantityFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits:3 });
export const reviewValue = (value, type = 'text') => value === null || value === undefined
  ? 'ยังไม่กรอก' : type === 'quantity' ? quantityFormat.format(value / 1000) : String(value);

export function reviewCountChanges({ changes, summary, submissionNo, previousSentAt, signal }) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = node('dialog', '', 'scpda-change-review');
    const title = node('h2', 'ตรวจข้อมูลก่อนส่งซ้ำ'); title.id = 'scpda-change-review-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const intro = node('p', `เทียบกับครั้งที่ ${submissionNo} · ${new Date(previousSentAt).toLocaleString('th-TH', { timeZone:'Asia/Bangkok' })}`);
    const counts = node('p', `${summary.rows} รายการเปลี่ยน · เพิ่ม ${summary.added} จุด · แก้ไข ${summary.changed} จุด · ล้าง ${summary.removed} จุด`, 'scpda-change-summary');
    const scroll = node('section', '', 'scpda-change-scroll'); scroll.tabIndex = 0;
    scroll.setAttribute('aria-label', 'รายการเปลี่ยนแปลง เลื่อนอ่านจนถึงท้าย');
    const content = document.createDocumentFragment();
    for (const change of changes) {
      const card = node('article', '', 'scpda-change-row');
      card.append(node('h3', `แถว ${change.ordinal || change.row} · ${change.name}`), node('p', `${change.code} · ${change.unit}`, 'scpda-change-sku'));
      for (const field of change.fields) {
        const row = node('div', '', 'scpda-change-field'); row.dataset.changeKind = field.kind;
        row.append(node('strong', field.label));
        const pair = node('div', '', 'scpda-change-values');
        pair.append(node('span', reviewValue(field.before, field.type), 'scpda-change-before'), node('span', '→'), node('span', reviewValue(field.after, field.type), 'scpda-change-after'));
        row.append(pair); card.append(row);
      }
      card.append(node('p', `รวม ${reviewValue(change.beforeTotal,'quantity')} → ${reviewValue(change.afterTotal,'quantity')} ${change.unit}`, 'scpda-change-total'));
      content.append(card);
    }
    const end = node('p', 'ยืนยันส่งอีกครั้ง', 'scpda-change-end'); content.append(end); scroll.append(content);
    const hint = node('p', 'เลื่อนอ่านรายการเปลี่ยนแปลงจนถึงท้ายก่อนยืนยัน', 'scpda-change-hint'); hint.setAttribute('role','status');
    const footer = node('footer');
    const confirm = node('button', 'ยืนยัน', 'scpda-review-confirm'); confirm.type = 'button'; confirm.disabled = true;
    const cancel = node('button', 'ยกเลิก', 'scpda-secondary'); cancel.type = 'button';
    footer.append(cancel, confirm); dialog.append(title, intro, counts, scroll, hint, footer);
    let finished = false;
    const finish = accepted => {
      if (finished) return; finished = true; signal?.removeEventListener('abort', abort);
      dialog.close(); dialog.remove(); previousFocus?.focus?.(); resolve(accepted);
    };
    const abort = () => finish(false);
    const checkEnd = () => {
      if (!finished && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4) {
        confirm.disabled = false; hint.textContent = 'ตรวจถึงท้ายรายการแล้ว · ยืนยันเพื่อใส่รหัสส่ง';
      }
    };
    scroll.addEventListener('scroll', checkEnd, { passive:true });
    confirm.onclick = () => { if (!confirm.disabled) finish(true); };
    cancel.onclick = () => finish(false);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    signal?.addEventListener('abort', abort, { once:true });
    document.body.append(dialog); dialog.showModal();
    requestAnimationFrame(() => { scroll.scrollTop = 0; checkEnd(); scroll.focus({ preventScroll:true }); });
  });
}
