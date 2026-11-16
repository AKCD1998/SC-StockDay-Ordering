import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import StockCheckPanel from './StockCheckPanel.jsx';
import {canUseStockCheck,getNavigationGroups,buildAdminViewHash,readAdminViewFromLocation} from './adminNavigation.js';
const records=[{productCode:'IC-000981',name:'เภสัช ชื่อสินค้ายาวภาษาไทยที่ต้องแสดงครบทุกคำ',latestCount:{quantity:0,unit:'แผง',operatorCode:'01001',round:1,completeProduct:false,receivedAt:'2026-11-15T02:00:00Z',observedAt:'2026-11-15T01:59:00Z',receiptId:'fixture-receipt',lots:[{code:'LOT-A',quantity:0,manufacturedOn:null,expiresOn:'2027-01-01'}]}},{productCode:'630000001',name:'ปกติ สินค้าที่ยังไม่ได้ส่ง',latestCount:null}];
beforeEach(()=>{global.fetch=vi.fn(async()=>({ok:true,status:200,json:async()=>({contract:'scpda-stock-check-001-v1',branchCode:'001',records,pagination:{total:2,limit:50,offset:0}})}));});
afterEach(()=>{cleanup();vi.restoreAllMocks();window.history.replaceState({},'','/');});
it('only admin can select005 and response must match the requested branch',async()=>{
 vi.stubEnv('VITE_FEATURE_SCPDA_BRANCH_005','true');
 try{
  fetch.mockImplementation(async url=>({ok:true,status:200,json:async()=>({contract:'scpda-stock-check-001-v1',branchCode:new URL(url,'http://fixture').searchParams.get('branchCode')||'001',records,pagination:{total:2,limit:50,offset:0}})}));
  const view=render(<StockCheckPanel isAdminUser/>);await screen.findByText(records[0].name);
  fireEvent.change(screen.getByRole('combobox',{name:'สาขาผลนับ PDA'}),{target:{value:'005'}});
  await waitFor(()=>expect(fetch.mock.calls.at(-1)[0]).toContain('branchCode=005'));
  expect(await screen.findByText(records[0].name)).toBeVisible();view.unmount();
  render(<StockCheckPanel/>);expect(screen.queryByRole('combobox',{name:'สาขาผลนับ PDA'})).not.toBeInTheDocument();
 }finally{vi.unstubAllEnvs();}
});
it('shows latest PDA receipt, full names, zero and unsubmitted products distinctly',async()=>{
 render(<StockCheckPanel/>);expect(await screen.findByText(records[0].name)).toBeVisible();expect(screen.getByText('ยังไม่มีผลนับ')).toBeVisible();expect(screen.getByText('0')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'ดูล็อต / วันที่'}));expect(screen.getByText('ล็อต LOT-A')).toBeVisible();expect(screen.getByText('ผลิต ไม่ระบุ')).toBeVisible();expect(screen.getByText(/หมดอายุ/)).toBeVisible();expect(screen.queryByRole('button',{name:'ทบทวน'})).not.toBeInTheDocument();
});
it('category buttons and search request fresh server data with paging reset',async()=>{
 render(<StockCheckPanel/>);await screen.findByText(records[0].name);
 fireEvent.click(screen.getByRole('button',{name:'สามัญ'}));await waitFor(()=>expect(fetch.mock.calls.at(-1)[0]).toContain('category=common'));
 fireEvent.change(screen.getByRole('textbox',{name:'ค้นหาสินค้า'}),{target:{value:'IC-000981'}});fireEvent.click(screen.getByRole('button',{name:'ค้นหา'}));
 await waitFor(()=>expect(fetch.mock.calls.at(-1)[0]).toContain('search=IC-000981'));expect(fetch.mock.calls.at(-1)[0]).toContain('offset=0');expect(fetch.mock.calls.at(-1)[1].credentials).toBe('include');
});
it('admin alone receives review entry buttons',async()=>{render(<StockCheckPanel isAdminUser csrfToken="fixture"/>);expect(await screen.findByRole('button',{name:'ทบทวน'})).toBeVisible();});
it('server denial is shown without manufacturing a stock zero',async()=>{
 fetch.mockImplementation(async()=>({ok:false,status:403,json:async()=>({error:'denied'})}));render(<StockCheckPanel/>);expect(await screen.findByRole('alert')).toHaveTextContent('บัญชีนี้ยังไม่เปิดใช้');expect(screen.queryByText('0',{selector:'strong'})).not.toBeInTheDocument();
});
it('navigation and direct-route admission require the feature plus admin or original branch001',()=>{
 for(const actor of [{role:'admin'},{role:'branch',branchCode:'001',actorBranchCode:'001'}])expect(canUseStockCheck({enabled:true,...actor})).toBe(true);
 for(const actor of [{role:'branch',branchCode:'004'},{role:'branch',branchCode:'001',actorBranchCode:'004'},{role:'staff',branchCode:'001'},{role:'admin',enabled:false}])expect(canUseStockCheck({enabled:true,...actor})).toBe(false);
 expect(getNavigationGroups(false,false,false).flatMap(g=>g.items).some(i=>i.view==='stock-check')).toBe(false);
 expect(getNavigationGroups(false,false,true).flatMap(g=>g.items).find(i=>i.view==='stock-check').label).toBe('เช็คสินค้า');
 expect(buildAdminViewHash('stock-check')).toBe('#/stock-check');window.location.hash='#/stock-check';expect(readAdminViewFromLocation()).toBe('stock-check');
});
