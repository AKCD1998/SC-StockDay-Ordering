import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import MemberSyncLog from './MemberSyncLog';
import { apiFetch } from './lib/apiClient.js';
vi.mock('./lib/apiClient.js',()=>({apiFetch:vi.fn()}));
const member={id:'11111111-1111-4111-8111-111111111111',name:'สมาชิกตัวอย่าง',memberCode:'AR000-900001',phone:'0990000001'};
const jobId='22222222-2222-4222-8222-222222222222';
const value={ok:true,member,summary:{state:'pending',label:'รอส่งถึงสาขา',hqReady:true,adaCode:member.memberCode,
 branches:[{branchCode:'005',ready:false,state:'retry'}]},jobs:[{id:jobId,kind:'receipt',receiptNo:'S-FIXTURE',branchCode:'005',state:'retry',label:'รอส่งบิล Ada',attempts:2}],
 events:[{at:'2026-11-11T02:10:11Z',code:'SCCRM_STORED',label:'บันทึก SCCRM แล้ว'}]};
const reply=(body,status=200)=>({ok:status===200,status,json:async()=>body});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('shows independent branch and receipt states, then retries the same immutable job with CSRF',async()=>{
 apiFetch.mockImplementation(async(_path,o)=>reply(o?.method==='POST'?{ok:true}:value));
 render(<MemberSyncLog member={member} csrfToken="csrf-fixture" onClose={()=>{}} onAccessDenied={()=>{}}/>);
 expect(await screen.findByText('รอส่งบิล Ada')).toBeVisible();expect(screen.getByText('สาขา 005',{selector:'strong'})).toBeVisible();
 expect(screen.getByText(/09:10:11/)).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'ลองใหม่'}));
 await waitFor(()=>expect(apiFetch.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1));
 const [path,options]=apiFetch.mock.calls.find(([,o])=>o?.method==='POST');
 expect(path).toBe(`/api/admin/sccrm-members/${member.id}/sync-status/retry`);
 expect(JSON.parse(options.body)).toEqual({jobId});expect(options.headers['x-csrf-token']).toBe('csrf-fixture');
});
it('shows a retry failure without claiming success and does not accept another member data',async()=>{
 apiFetch.mockImplementation(async(_p,o)=>o?.method==='POST'?reply({error:'ยังติดต่อ Ada ไม่ได้'},503):reply(value));
 const denied=vi.fn();render(<MemberSyncLog member={member} csrfToken="csrf" onClose={()=>{}} onAccessDenied={denied}/>);
 await screen.findByText('รอส่งบิล Ada');fireEvent.click(screen.getByRole('button',{name:'ลองใหม่'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('ยังติดต่อ Ada ไม่ได้');expect(denied).not.toHaveBeenCalled();
});
it('aborts requests when closed and forwards revoked access without showing private results',async()=>{
 let signal;apiFetch.mockImplementation(async(_p,o)=>{signal=o.signal;return reply({},403);});
 const denied=vi.fn(),close=vi.fn();const view=render(<MemberSyncLog member={member} onClose={close} onAccessDenied={denied}/>);
 await waitFor(()=>expect(denied).toHaveBeenCalled());fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);
 view.unmount();expect(signal.aborted).toBe(true);expect(screen.queryByText('รอส่งบิล Ada')).not.toBeInTheDocument();
});
