import {useState} from "react";

export default function PreorderCancelDialog({publicId,expectedVersion,api,onClose,onCancelled}){
 const [step,setStep]=useState("password"),[password,setPassword]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function verify(){setBusy(true);setError("");try{await api.verifyCancelPassword(publicId,password);setStep("confirm");}catch(ex){setError(ex.message||"ตรวจสอบรหัสผ่านไม่สำเร็จ");}finally{setBusy(false);}}
 async function cancel(){if(!reason.trim())return;setBusy(true);setError("");try{await api.action(publicId,"cancel",{expectedVersion,password,note:reason.trim()});await onCancelled?.();onClose();}catch(ex){setError(ex.status===409?"คำขอมีการเปลี่ยนแปลง กรุณาโหลดรายการใหม่":ex.message||"ยกเลิกคำขอไม่สำเร็จ");}finally{setBusy(false);}}
 return <div className="preorder-cancel-backdrop"><section className="preorder-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="preorder-cancel-title">
  {step==="password"&&<><h3 id="preorder-cancel-title">กรอกรหัสผ่าน</h3><label>รหัสผ่าน<input autoFocus type="password" inputMode="numeric" value={password} onChange={event=>setPassword(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")verify();}}/></label><div><button type="button" disabled={busy} onClick={onClose}>ยกเลิก</button><button className="primary" type="button" disabled={busy||!password} onClick={verify}>ตรวจสอบ</button></div></>}
  {step==="confirm"&&<><h3 id="preorder-cancel-title">ยืนยันยกเลิก?</h3><p>{publicId}</p><div><button type="button" disabled={busy} onClick={onClose}>ไม่ยกเลิก</button><button className="danger" type="button" disabled={busy} onClick={()=>setStep("reason")}>ยืนยันยกเลิก</button></div></>}
  {step==="reason"&&<><h3 id="preorder-cancel-title">ระบุเหตุผลในการยกเลิก</h3><label>เหตุผล<textarea autoFocus value={reason} onChange={event=>setReason(event.target.value)} maxLength={1000}/></label><div><button type="button" disabled={busy} onClick={()=>setStep("confirm")}>กลับ</button><button className="danger" type="button" disabled={busy||!reason.trim()} onClick={cancel}>บันทึกเหตุผลและยกเลิก</button></div></>}
  {error&&<div className="preorder-error" role="alert">{error}</div>}
 </section></div>;
}
