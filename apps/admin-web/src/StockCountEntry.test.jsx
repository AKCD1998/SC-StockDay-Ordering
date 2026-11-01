import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {BranchStockPanel} from './BranchStockPanel.jsx';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();localStorage.clear();});
function open(branchCode){vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({records:[{productCode:'P001',productNameThai:'Fixture product',barcode:'00001',unit:'ชิ้น',qtyBranch001:6,qtyBranch004:0}],pagination:{total:1}})})));render(<BranchStockPanel branchCode={branchCode} isAdminUser={false} csrfToken="fixture" requestDraftItems={[]} setRequestDraftItems={()=>{}} onClearDraft={()=>{}}/>);}
it('enabled pilot gives branch001 an entry from the existing product row',async()=>{vi.stubEnv('VITE_FEATURE_PDA_COUNTS_001','true');open('001');expect(await screen.findByRole('button',{name:'ล็อตและประวัตินับ P001'})).toBeVisible();});
it('positive pilot flag does not expose the branch001 action in branch004',async()=>{vi.stubEnv('VITE_FEATURE_PDA_COUNTS_001','true');open('004');await screen.findByText('Fixture product');expect(screen.queryByRole('button',{name:'ล็อตและประวัตินับ P001'})).not.toBeInTheDocument();expect(screen.queryByText('ผลนับ / ล็อตหมดอายุ 001')).not.toBeInTheDocument();});
it('default-off build leaves existing stock rows without pilot actions',async()=>{vi.stubEnv('VITE_FEATURE_PDA_COUNTS_001','false');open('001');await screen.findByText('Fixture product');expect(screen.queryByRole('button',{name:'ล็อตและประวัตินับ P001'})).not.toBeInTheDocument();});
