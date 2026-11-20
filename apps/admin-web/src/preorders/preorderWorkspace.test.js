import {test,expect} from 'vitest';
import {admitWorkspace,admittedActions,WORKSPACE_CONTRACT} from './preorderWorkspace.js';
const actor={userId:'demo-staff',isAdmin:false,branchCode:'001'};
const manifest=(workRole,capabilities,extra={})=>({contractVersion:WORKSPACE_CONTRACT,subjectUserId:'demo-staff',workRole,capabilities,...extra});
test('HQ scope is limited to server-advertised logistics capabilities; commercial grants are rejected',()=>{
 const workspace=admitWorkspace(manifest('fulfillment',['cases.read.all','receipts.link','commercial.quote','commercial.order','branch.arrival','messages.send']),actor);
 expect(workspace.can('receipts.link')).toBe(true);for(const cap of ['commercial.quote','commercial.order','branch.arrival','cases.create'])expect(workspace.can(cap)).toBe(false);
 expect(admittedActions([['quote','ราคา'],['ordered','สั่ง'],['confirm-arrival','รับสาขา']],workspace)).toEqual([]);
});
test('branch scope must match current signed-in subject/context and cannot read all cases',()=>{
 expect(()=>admitWorkspace(manifest('branch',['cases.read.branch'],{branchCode:'003'}),actor)).toThrow(/สาขา/);
 const workspace=admitWorkspace(manifest('branch',['cases.read.branch','cases.read.all','customer.decision'],{branchCode:'001'}),actor);
 expect(workspace.can('cases.read.all')).toBe(false);expect(admittedActions([['quote','ราคา'],['decision','ตอบ']],workspace).map(x=>x[0])).toEqual(['decision']);
});
test('CEO purchasing profile requires existing admin context and never implies HQ receipt permission',()=>{
 expect(()=>admitWorkspace(manifest('purchasing',['cases.read.all','commercial.quote']),actor)).toThrow(/สิทธิ์/);
 const workspace=admitWorkspace(manifest('purchasing',['cases.read.all','commercial.quote','receipts.link']),{...actor,isAdmin:true});expect(workspace.can('commercial.quote')).toBe(true);expect(workspace.can('receipts.link')).toBe(false);
});
test('unknown versions, wrong subjects, absent read grants and malformed profiles fail closed',()=>{
 const valid=manifest('fulfillment',['cases.read.all']);for(const bad of [{...valid,contractVersion:'unknown'},{...valid,subjectUserId:'other'},{...valid,capabilities:[]},{...valid,capabilities:null},{...valid,workRole:'admin'},null])expect(()=>admitWorkspace(bad,actor)).toThrow();
});
