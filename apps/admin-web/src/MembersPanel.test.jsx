import React from 'react';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from './lib/apiClient';
import MembersPanel from './MembersPanel';
vi.mock('./lib/apiClient', () => ({ apiFetch: vi.fn() }));
const member = { id: '11111111-1111-4111-8111-111111111111', memberCode: 'SC-TEST', name: 'สมาชิกทดสอบ', phone: '0990000000', registeredAt: '2026-10-22T03:00:00Z', isActive: true };
const receipt = { claimId: 'claim1', receiptNo: 'BILL-TEST', branchCode: '005', soldAt: '2026-10-22T03:04:05Z', totalAmount: 90, totalAmountSource: 'pos_header', items: [{ productCode: 'SKU-TEST', productName: 'สินค้าทดสอบ', unitName: 'กล่อง', qty: 3, unitPrice: 30, lineTotal: 90 }], returns: [] };
function reply(body, status = 200) { return { ok: status === 200, status, json: async () => body }; }
beforeEach(() => { apiFetch.mockImplementation(async path => reply(String(path).includes('purchase-history') ? { memberId: member.id, purchases: [receipt], hasMore: false } : { members: [member], total: 1 })); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('shows member directory and opens the final-column history with SKU, units, quantity and Bangkok seconds', async () => {
  render(<MembersPanel isAdmin />);
  const button = await screen.findByRole('button', { name: 'ดูประวัติการซื้อ สมาชิกทดสอบ' }); button.focus(); fireEvent.click(button);
  const modal = await screen.findByRole('dialog');
  expect(await within(modal).findByText('SKU-TEST')).toBeVisible();
  expect(within(modal).getByText('กล่อง')).toBeVisible(); expect(within(modal).getByText('3')).toBeVisible();
  expect(within(modal).getByText(/10:04:05/)).toBeVisible();
  expect(within(modal).getByRole('columnheader', { name: 'หน่วย' })).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(button).toHaveFocus();
});
it('searches on submit with escaped values and uses server pagination', async () => {
  apiFetch.mockResolvedValue(reply({ members: [member], total: 26 })); render(<MembersPanel isAdmin />);
  await screen.findByText('สมาชิกทดสอบ'); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ชื่อ&เบอร์' } });
  fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }));
  await waitFor(() => expect(apiFetch.mock.calls.at(-1)[0]).toContain('search=%E0%B8%8A%E0%B8%B7%E0%B9%88%E0%B8%AD%26'));
  await screen.findByText('สมาชิกทดสอบ'); fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
  await waitFor(() => expect(apiFetch.mock.calls.at(-1)[0]).toContain('page=2'));
});
it('supports history pagination, unknown historic units and members with no bills', async () => {
  let count = 0;
  apiFetch.mockImplementation(async path => reply(String(path).includes('purchase-history') ? { memberId: member.id, purchases: [{ ...receipt, claimId: String(++count), items: [{ ...receipt.items[0], unitName: null, unitCode: null }] }], hasMore: count === 1, nextCursor: 'cursor-test' } : { members: [member], total: 1 }));
  render(<MembersPanel isAdmin />); fireEvent.click(await screen.findByRole('button', { name: /ดูประวัติการซื้อ สมาชิก/ }));
  expect(await screen.findByText('ไม่ระบุ')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'โหลดประวัติเพิ่ม' }));
  await waitFor(() => expect(screen.getAllByText('SKU-TEST')).toHaveLength(2));
  expect(apiFetch.mock.calls.at(-1)[0]).toContain('cursor=cursor-test');
});
it('does not request private data for non-admins and clears the directory when history access is revoked', async () => {
  const view = render(<MembersPanel isAdmin={false} />); expect(apiFetch).not.toHaveBeenCalled();
  view.rerender(<MembersPanel isAdmin />); const button = await screen.findByRole('button', { name: /ดูประวัติการซื้อ สมาชิก/ });
  apiFetch.mockResolvedValue(reply({}, 403)); fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('แอดมิน'); expect(screen.queryByText(member.phone)).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('aborts a closed modal request and never replaces the next member history with a stale response', async () => {
  const second = { ...member, id: '22222222-2222-4222-8222-222222222222', name: 'สมาชิกสอง' };
  let resolveOld, oldSignal;
  apiFetch.mockImplementation(async (path, options) => {
    if (String(path).includes(member.id)) { oldSignal = options.signal; return new Promise(resolve => { resolveOld = resolve; }); }
    if (String(path).includes(second.id)) return reply({ memberId: second.id, purchases: [] });
    return reply({ members: [member, second], total: 2 });
  });
  render(<MembersPanel isAdmin />); fireEvent.click(await screen.findByRole('button', { name: 'ดูประวัติการซื้อ สมาชิกทดสอบ' }));
  fireEvent.click(screen.getByRole('button', { name: 'ปิดประวัติการซื้อ' })); expect(oldSignal.aborted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'ดูประวัติการซื้อ สมาชิกสอง' }));
  expect(await screen.findByText('ยังไม่มีประวัติการซื้อที่บันทึกให้สมาชิกคนนี้')).toBeVisible();
  resolveOld(reply({ memberId: member.id, purchases: [receipt] }));
  await waitFor(() => expect(within(screen.getByRole('dialog')).queryByText('SKU-TEST')).not.toBeInTheDocument());
});
