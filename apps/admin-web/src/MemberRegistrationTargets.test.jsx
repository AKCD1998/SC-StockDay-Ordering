import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MemberRegistrationTargets from './MemberRegistrationTargets';

const fixture = (month = '2026-11') => ({ ok: true, month, asOfDate: '2026-11-03',
  generatedAt: '2026-11-03T02:00:00Z', trackingStartedAt: '2026-11-01T02:00:00Z', partialMonth: true,
  branches: [{ branchCode: '001', target: 500, total: 23, today: 3, remaining: 477, percent: 4.6 }],
  daily: [{ date: `${month}-01`, status: 'recorded', byBranch: { '001': 20 } }, { date: `${month}-02`, status: 'recorded', byBranch: { '001': 0 } }, { date: `${month}-04`, status: 'future', byBranch: { '001': null } }],
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T02:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('renders scoped progress, coverage warning and future dates without fabricated zeros', async () => {
  render(<MemberRegistrationTargets />);
  const card = (await screen.findByRole('heading', { name: 'สาขา 001' })).closest('article');
  expect(within(card).getByText('23')).toBeVisible(); expect(within(card).getByText('เหลือ 477 คน')).toBeVisible();
  expect(screen.getByText(/วันนี้ \+3 คน/)).toBeVisible(); expect(screen.getByText(/ยอดก่อนหน้านี้ยังไม่มีข้อมูลยืนยัน/)).toBeVisible();
  expect(screen.getByText('ยังไม่ถึงวัน')).toBeVisible(); expect(screen.queryByText('สาขา 004')).not.toBeInTheDocument();
  expect(fetch.mock.calls[0][1].credentials).toBe('include');
});
it('clears the previous report on refresh failure and can retry', async () => {
  render(<MemberRegistrationTargets />); await screen.findByRole('progressbar');
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'SCCRM ไม่พร้อมใช้งาน' }) });
  fireEvent.click(screen.getByRole('button', { name: 'รีเฟรชยอด' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('SCCRM ไม่พร้อมใช้งาน');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));
  expect(await screen.findByRole('progressbar')).toBeVisible();
});
it('aborts the old month request and ignores its late response', async () => {
  let resolveOld, oldSignal;
  fetch.mockImplementationOnce((_url, options) => { oldSignal = options.signal; return new Promise(resolve => { resolveOld = resolve; }); });
  fetch.mockImplementation(async url => ({ ok: true, json: async () => fixture(new URL(url).searchParams.get('month')) }));
  render(<MemberRegistrationTargets />);
  const initialMonth = screen.getByLabelText('เดือนที่รายงาน').value;
  const nextMonth = initialMonth === '2026-12' ? '2027-01' : '2026-12';
  fireEvent.change(screen.getByLabelText('เดือนที่รายงาน'), { target: { value: nextMonth } });
  expect(oldSignal.aborted).toBe(true); await screen.findByRole('progressbar');
  resolveOld({ ok: true, json: async () => ({ ...fixture(initialMonth), branches: [{ branchCode: '005', target: 250, total: 1, today: 1, remaining: 249, percent: .4 }] }) });
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'สาขา 005' })).not.toBeInTheDocument());
});
