import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,within,fireEvent,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportPrintRegister from './ReportPrintRegister.jsx';
import {apiFetch} from '../lib/apiClient.js';
vi.mock('../lib/apiClient.js',()=>({apiFetch:vi.fn()}));
const doc={id:'test-doc',report_kind:'KY11',branch_code:'001',period_start:'2026-07-01',period_end:'2026-09-30',version_label:'TEST R5',filename:'synthetic.pdf',page_count:10,status:'waiting_confirmation',monthPagesMapped:true,confirmedPages:0,scopeTotalPages:10,confirmedRanges:'',source_reference:'test source',sections:[]};
const response=v=>({ok:true,json:async()=>v});
beforeEach(()=>{let n=0;vi.stubGlobal('crypto',{randomUUID:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`});apiFetch.mockReset();apiFetch.mockImplementation((path,opts)=>Promise.resolve(response(opts?.method?{}:path.includes('/test-doc')?{document:doc,events:[]}:{documents:[doc],unmappedEvidence:[]})));});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('paper print register',()=>{
 it('shows generated documents as waiting and requires explicit paper confirmation',async()=>{
  const user=userEvent.setup();render(<ReportPrintRegister csrfToken="test-csrf"/>);
  expect(await screen.findByText('synthetic.pdf')).toBeVisible();expect(apiFetch.mock.calls.every(([,o])=>!o?.method)).toBe(true);
  await user.click(screen.getByRole('button',{name:'ดูประวัติ / ยืนยัน'}));
  const form=await screen.findByRole('form',{name:'ยืนยันการพิมพ์กระดาษ'});
  expect(within(form).getByRole('button',{name:'บันทึกการยืนยัน'})).toBeDisabled();
  fireEvent.change(within(form).getByLabelText('หน้าที่พิมพ์ในไฟล์หลัก'),{target:{value:'1-3'}});
  fireEvent.change(within(form).getByLabelText('หลักฐาน / คำยืนยัน / ที่อยู่ภาพ'),{target:{value:'explicit paper confirmation'}});
  fireEvent.change(within(form).getByLabelText('เหตุผลการบันทึก'),{target:{value:'test'}});
  await user.click(within(form).getByRole('checkbox',{name:/ยืนยันว่าพิมพ์เป็นกระดาษแล้ว/}));
  await user.click(within(form).getByRole('button',{name:'บันทึกการยืนยัน'}));
  await waitFor(()=>expect(apiFetch.mock.calls.some(([,o])=>o?.method==='POST')).toBe(true));
  const [,options]=apiFetch.mock.calls.find(([,o])=>o?.method==='POST');const body=JSON.parse(options.body);
  expect(body.physicalPrinted).toBe(true);expect(body.pages).toBe('1-3');expect(body.printedOn).toBe('');expect(body.copies).toBe(null);expect(options.headers['X-CSRF-Token']).toBe('test-csrf');
 });
 it('keeps unmapped photo evidence separate from confirmed pages and labels multi-month unknown page mapping',async()=>{
  apiFetch.mockResolvedValue(response({documents:[{...doc,monthPagesMapped:false,status:'confirmed_printed',allConfirmedRanges:'1-10',confirmedPages:null,scopeTotalPages:null}],unmappedEvidence:[{id:'photo',report_kind:'KY9',branch_code:'005',month:'2026-09',summary:'photo version unknown',evidence_reference:'synthetic photo'}]}));
  render(<ReportPrintRegister csrfToken="test"/>);expect(await screen.findByText('photo version unknown')).toBeVisible();expect(screen.getByText('เลขหน้าแยกเดือนยังรอยืนยัน')).toBeVisible();expect(apiFetch.mock.calls.every(([,o])=>!o?.method)).toBe(true);
 });
 it('previews a history file without recording confirmations until explicit import',async()=>{
  const user=userEvent.setup(),seed={schema:'sc.report-print-register.private-seed.v1',documents:[],confirmations:[],unmappedEvidence:[]};
  const original=apiFetch.getMockImplementation();apiFetch.mockImplementation((path,opts)=>path.endsWith('/imports/preview')?Promise.resolve(response({digest:'test-digest',documents:1,paperConfirmations:0,unmappedEvidence:1})):original(path,opts));
  render(<ReportPrintRegister csrfToken="csrf-import"/>);await screen.findByText('synthetic.pdf');
  await user.click(screen.getByText('นำเข้าประวัติที่เตรียมไว้เป็นชุด'));
  const file=new File([JSON.stringify(seed)],'synthetic-history.json',{type:'application/json'});file.text=async()=>JSON.stringify(seed);
  await user.upload(screen.getByLabelText('ไฟล์ทะเบียนที่เตรียมไว้ (JSON)'),file);
  await user.click(screen.getByRole('button',{name:'ตรวจรายการก่อนนำเข้า'}));
  expect(await screen.findByLabelText('ผลตรวจชุดนำเข้า')).toBeVisible();expect(apiFetch.mock.calls.some(([p])=>p.endsWith('/imports'))).toBe(false);
  await user.click(screen.getByRole('button',{name:'นำเข้าตามหลักฐานที่ตรวจแล้ว'}));
  await waitFor(()=>expect(apiFetch.mock.calls.some(([p])=>p.endsWith('/imports'))).toBe(true));
  const [,options]=apiFetch.mock.calls.find(([p])=>p.endsWith('/imports'));expect(JSON.parse(options.body).confirmImport).toBe(true);expect(options.headers['X-CSRF-Token']).toBe('csrf-import');
 });
});
