import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PjkDocumentsPanel from './PjkDocumentsPanel.jsx';
import { apiFetch } from '../lib/apiClient.js';
vi.mock('../lib/apiClient.js', () => ({ apiFetch: vi.fn() }));
beforeEach(() => { apiFetch.mockReset(); });
const data = { total: 1, archiveTotal: 177, months: ['2027-01','2026-12'], asOf: '11 พฤศจิกายน 2569', exclusions: [{date:'31 ธันวาคม 2569',branch:'005',reason:'ชื่อว่าง'}], documents: [{id:'one',month:'2026-12',branch:'005',slots:[{pharmacistName:'ภก. ทดสอบ',pharmacistLicense:'48976',dateStart:'2026-12-05',dateEnd:'2026-12-05',timeStart:'08:00',timeEnd:'20:00'}],sourceSheet:'ธันวาคม 69'}] };
it('shows document provenance and submits filters before downloading', async () => {
  apiFetch.mockResolvedValue({ok:true,json:async()=>data});render(<PjkDocumentsPanel />);
  expect(await screen.findByText('ธันวาคม 69')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('เดือนเวร'),{target:{value:'2026-12'}});
  fireEvent.change(screen.getByLabelText('สาขา'),{target:{value:'005'}});
  fireEvent.click(screen.getByRole('button',{name:'ค้นหา'}));
  await waitFor(()=>expect(apiFetch.mock.calls.at(-1)[0]).toContain('month=2026-12&branch=005'));
  expect(await screen.findByText('ธันวาคม 69')).toBeInTheDocument();
});
it('shows an API failure without displaying stale document rows',async()=>{
  apiFetch.mockResolvedValue({ok:false,json:async()=>({error:'หมดเวลาการใช้งาน'})});render(<PjkDocumentsPanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('หมดเวลาการใช้งาน');
  expect(screen.queryByText('ธันวาคม 69')).not.toBeInTheDocument();
});
