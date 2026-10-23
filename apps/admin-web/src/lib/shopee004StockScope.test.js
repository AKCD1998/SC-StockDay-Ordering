import { describe, it, expect } from 'vitest';
import { projectBranchStockRows, buildBranchStockExportMatrix } from './branchStockScope';
describe('unknown marketplace quantities in branch scope',()=>{
  const row={productCode:'P1',qtyBranch000:4,qtyBranch001:3,qtyBranch003:2,qtyBranch004:null,qtyBranch005:1,
    stock004:{basis:'shopee-availability-unknown'}};
  it('preserves unknown 004 and unknown scope total while other branches remain numeric',()=>{
    const [r]=projectBranchStockRows([row],{isBranchStockScopeUser:true,scopeId:'samut-songkhram',branchCode:'004'});
    expect(r.qtyBranch004).toBeNull();expect(r.qtyTotalAllBranches).toBeNull();expect(r.qtyBranch001).toBe(3);
    const [other]=projectBranchStockRows([row],{isBranchStockScopeUser:true,scopeId:'branch-001',branchCode:'001'});
    expect(other.qtyTotalAllBranches).toBe(3);
  });
  it('exports unknown availability as text, and keeps normal zero and negatives numeric',()=>{
    const columns=[{key:'qtyBranch004',label:'004',type:'number'}];
    expect(buildBranchStockExportMatrix([row],columns)[1][0]).toBe('ไม่ทราบ');
    expect(buildBranchStockExportMatrix([{qtyBranch004:0},{qtyBranch004:-2}],columns).slice(1)).toEqual([[0],[-2]]);
  });
  it('labels temporary 004 quantities in exports while preserving other branch numbers',()=>{
    const columns=[{key:'qtyBranch004',label:'004',type:'number'},{key:'qtyBranch001',label:'001',type:'number'}];
    const estimate={...row,qtyBranch004:2,stock004:{basis:'hourly-and-shopee-known-only',viewStatus:'unverified'}};
    const matrix=buildBranchStockExportMatrix([estimate],columns);
    expect(matrix[0]).toEqual(['004','001','สถานะยอด 004']);
    expect(matrix[1]).toEqual(['2 (ยังไม่รวมออเดอร์ค้างจับคู่)',3,'ยอดชั่วคราว · POS และยอดจองที่ทราบ · ยังไม่ยืนยันยอดพร้อมขาย']);
    const [projected]=projectBranchStockRows([estimate],{isBranchStockScopeUser:true,scopeId:'all',branchCode:'004'});
    expect(projected.qtyBranch004).toBe(2);expect(projected.qtyTotalAllBranches).toBe(12);
  });
  it('never exports a stale reference as current stock or a current total',()=>{
    const cached={...row,qtyBranch004:999,qtyTotalAllBranches:1000,stock004:{basis:'hourly-and-shopee',viewStatus:'reference',lastConfirmed:{quantity:7}}};
    const [projected]=projectBranchStockRows([cached],{isBranchStockScopeUser:true,scopeId:'all',branchCode:'004'});
    expect(projected.qtyBranch004).toBeNull();expect(projected.qtyTotalAllBranches).toBeNull();
    const columns=[{key:'qtyBranch004',label:'004',type:'number'},{key:'qtyTotalAllBranches',label:'total',type:'number'},{key:'qtyBranch001',label:'001',type:'number'}];
    expect(buildBranchStockExportMatrix([cached],columns)[1]).toEqual(['ไม่ทราบ','ไม่ทราบ',3,'ยอดอ้างอิงเดิม · ยอดพร้อมใช้ปัจจุบันไม่ทราบ']);
  });
  it('does not turn a missing known-only quantity into a temporary zero',()=>{
    const unknown={...row,qtyBranch004:null,qtyTotalAllBranches:null,stock004:{basis:'hourly-and-shopee-known-only',viewStatus:'unverified'}};
    const [projected]=projectBranchStockRows([unknown],{isBranchStockScopeUser:true,scopeId:'all',branchCode:'004'});
    expect(projected.qtyBranch004).toBeNull();expect(projected.qtyTotalAllBranches).toBeNull();
    expect(buildBranchStockExportMatrix([unknown],[{key:'qtyBranch004',label:'004',type:'number'}])[1]).toEqual(['ไม่ทราบ','ยังยืนยันยอดพร้อมใช้ไม่ได้']);
  });
});
