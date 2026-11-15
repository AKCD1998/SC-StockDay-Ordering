import {useEffect,useMemo,useState} from 'react';
import PreorderPanel from './PreorderPanel.jsx';
import {createPreorderApi} from './preorderApi.js';
import {admitWorkspace,WORKSPACE_TITLES} from './preorderWorkspace.js';
export default function PreorderRoleWorkspace({roleWorkspaceEnabled=false,userId,...props}){
 const [admission,setAdmission]=useState(null),[error,setError]=useState('');const api=useMemo(()=>createPreorderApi(props.apiBaseUrl,props.csrfToken),[props.apiBaseUrl,props.csrfToken]);
 // Bind admission to this subject/context. Never render a previous user's grants.
 const key=[userId,props.isAdmin,props.branchCode,props.apiBaseUrl,props.csrfToken].join('|');
 useEffect(()=>{if(!roleWorkspaceEnabled||!props.enabled)return;const controller=new AbortController();let active=true;setAdmission(null);setError('');api.workspace(controller.signal).then(data=>{if(active)setAdmission({key,workspace:admitWorkspace(data,{userId,isAdmin:props.isAdmin,branchCode:props.branchCode})});}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message||'โหลดพื้นที่ทำงานไม่สำเร็จ');});return()=>{active=false;controller.abort();};},[roleWorkspaceEnabled,props.enabled,api,key,userId,props.isAdmin,props.branchCode]);
 if(!roleWorkspaceEnabled||!props.enabled)return <PreorderPanel {...props}/>;
 if(error)return <section className="panel preorder-panel"><h2>พรีออเดอร์</h2><div className="preorder-error" role="alert">{error}</div></section>;
 if(!admission||admission.key!==key)return <section className="panel preorder-panel" aria-busy="true"><h2>พรีออเดอร์</h2><p>กำลังเปิดพื้นที่ทำงาน…</p></section>;
 const {workspace}=admission;return <section className="preorder-role-workspace"><div className="preorder-role-heading"><strong>{WORKSPACE_TITLES[workspace.role]}</strong><span>{workspace.role==='purchasing'?'ตรวจสินค้าและราคา · สั่งซื้อหลังลูกค้ายืนยัน':workspace.role==='fulfillment'?'ติดตามของเข้า HQ · ตรวจรับจริง · จัดสรรของ':'ส่งคำขอ · ยืนยันกับลูกค้า · ตรวจรับและส่งมอบ'}</span></div><PreorderPanel key={key} {...props} workspace={workspace}/></section>;
}
