import React from 'react';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from './lib/apiClient';
import MembersPanel from './MembersPanel';
vi.mock('./lib/apiClient', () => ({ apiFetch: vi.fn() }));
const member={id:'11111111-1111-4111-8111-111111111111',name:'สมาชิกทดลอง',phone:'0990000001',memberCode:'SC-TEST',isActive:true};
const candidates=[{adaCode:'AR001-000001',name:'ลูกค้าเดิมหนึ่ง',phone:member.phone,branchCode:'001',isActive:true,saleCount:3,returnCount:0,lastSaleAt:null,reviewToken:'first-signed'},
  {adaCode:'AR004-000002',name:'ลูกค้าเดิมสอง',phone:member.phone,branchCode:'004',isActive:true,saleCount:50,returnCount:1,lastSaleAt:'2026-10-22T03:00:00Z',reviewToken:'second-signed'}];
const reply=(body,status=200)=>({ok:status===200,status,json:async()=>body});
let saved;
beforeEach(()=>{saved=false;apiFetch.mockImplementation(async(path,options)=>{
  if(options?.method==='POST'){saved=true;return reply({ok:true,memberId:member.id,adaCode:JSON.parse(options.body).adaCode});}
  if(String(path).includes(member.id+'/ada-links'))return reply({ok:true,member,linkedCodes:[],candidates});
  if(String(path).includes('/ada-links?'))return reply({ok:true,members:saved?[]:[{...member,candidateCount:2}],total:saved?0:1});
  return reply({ok:true,members:[member],total:1});
});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
async function open(){render(<MembersPanel isAdmin csrfToken="synthetic-csrf"/>);fireEvent.click(screen.getByRole('button',{name:'จัดการรหัส Ada'}));fireEvent.click(await screen.findByRole('button',{name:'เลือกรหัส Ada ให้ สมาชิกทดลอง'}));const dialog=await screen.findByRole('dialog');await within(dialog).findByText('ลูกค้าเดิมสอง');return dialog;}
it('requires an explicit code and identity confirmation, then sends CSRF and the chosen signed option only',async()=>{
  const dialog=await open(),save=within(dialog).getByRole('button',{name:'ยืนยันผูกรหัส Ada'});
  expect(save).toBeDisabled();expect(within(dialog).getAllByRole('radio').every(r=>!r.checked)).toBe(true);
  fireEvent.click(within(dialog).getByRole('radio',{name:'AR004-000002 ลูกค้าเดิมสอง'}));expect(save).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('checkbox'));expect(save).toBeEnabled();fireEvent.click(save);
  await screen.findByText(/ผูกกับ AR004-000002 แล้ว/);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const writes=apiFetch.mock.calls.filter(([,o])=>o?.method==='POST');expect(writes).toHaveLength(1);
  expect(writes[0][1].headers['x-csrf-token']).toBe('synthetic-csrf');expect(JSON.parse(writes[0][1].body)).toEqual({adaCode:'AR004-000002',reviewToken:'second-signed'});
  expect(await screen.findByText(/ไม่มีสมาชิกที่รอเลือกรหัส Ada/)).toBeVisible();
});
it('changing a selected code clears the identity confirmation',async()=>{
  const dialog=await open();fireEvent.click(within(dialog).getAllByRole('radio')[0]);fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(within(dialog).getAllByRole('radio')[1]);expect(within(dialog).getByRole('checkbox')).not.toBeChecked();expect(within(dialog).getByRole('button',{name:'ยืนยันผูกรหัส Ada'})).toBeDisabled();
});
it('blocks a code already bound to another member and never sends a write on close',async()=>{
  candidates[0]={...candidates[0],linkedMemberId:'another-member',linkedMemberName:'คนอื่น'};
  const dialog=await open();expect(within(dialog).getAllByRole('radio')[0]).toBeDisabled();expect(within(dialog).getByText(/ผูกกับ คนอื่น แล้ว/)).toBeVisible();
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(apiFetch.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);
  candidates[0]={...candidates[0],linkedMemberId:null,linkedMemberName:null};
});
it('stale choices show a recoverable conflict and do not silently retry the confirmation',async()=>{
  const dialog=await open();const original=apiFetch.getMockImplementation();apiFetch.mockImplementation((path,options)=>options?.method==='POST'?reply({error:'ข้อมูลลูกค้าเปลี่ยนแล้ว กรุณาโหลดรายการใหม่',code:'PHONE_CHANGED'},409):original(path,options));
  fireEvent.click(within(dialog).getAllByRole('radio')[1]);fireEvent.click(within(dialog).getByRole('checkbox'));fireEvent.click(within(dialog).getByRole('button',{name:'ยืนยันผูกรหัส Ada'}));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('ข้อมูลลูกค้าเปลี่ยน');expect(within(dialog).getByRole('button',{name:'ยืนยันผูกรหัส Ada'})).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button',{name:'โหลดรายการใหม่'}));await waitFor(()=>expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
  expect(apiFetch.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
