const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function countSubmission(record){if(!record.skuId||!/^\d+$/.test(String(record.skuId)))throw Error('ยังยืนยัน SKU กับระบบไม่ได้ เก็บผลนับในเครื่องไว้');return {id:record.id,capturedByOperator:record.operatorCode,skuId:String(record.skuId),productCode:record.productCode,barcode:record.barcode,unitLabel:record.unit,category:record.category,round:record.round,completeProduct:record.completeProduct,observedAt:record.countedAt,lots:record.lots.map(l=>({code:l.code,quantity:String(l.quantity),manufacturedOn:l.manufacturedOn,expiresOn:l.expiresOn})),correctionOf:record.supersedesId||null,correctionReason:record.correctionReason||null,lateReason:null};}
export class CountSync{
 constructor({book,getActor,request,onChange}){Object.assign(this,{book,getActor,request,onChange});this.available=false;this.flushing=false;this.serverRecords=[];this.epoch=0;this.nextFlush=false;window.addEventListener('online',()=>this.flush());}
 connect(available){this.epoch++;this.available=available;this.serverRecords=[];if(this.flushing){this.nextFlush=available;}else this.flush();}
 async queue(record){const row=await this.book.enqueue(record,countSubmission(record));await this.flush();return row;}
 receiptValid(r,id){if(r?.contract!=='scpda-counts-001-v1'||r.branchCode!=='001'||r.eventId!==id||!uuid.test(r.receiptId||'')||!Number.isFinite(Date.parse(r.receivedAt))||r.officialStockWrites!==false)throw Error('ใบรับจากเซิร์ฟเวอร์ไม่ตรงกัน');return r;}
 async flush(){if(this.flushing){this.nextFlush=this.available;return;}if(!this.available||!this.getActor())return;this.flushing=true;
  try{const epoch=this.epoch,who=this.getActor(),all=await this.book.list(who);for(const r of all.records)if(r.uploadIntent&&!all.uploads.some(u=>u.id===r.id)){try{await this.book.enqueue(r,countSubmission(r));}catch(e){await this.onChange?.(e.message);}}
   const current=await this.book.list(who),ordered=current.uploads.filter(u=>u.status!=='accepted').sort((a,b)=>{const ar=current.records.find(r=>r.id===a.id),br=current.records.find(r=>r.id===b.id);return(ar?.recordedOnDeviceAt||'').localeCompare(br?.recordedOnDeviceAt||'');});
   for(const row of ordered){if(!this.available||epoch!==this.epoch||this.getActor()?.operatorCode!==who.operatorCode)break;let payload=JSON.parse(row.rawPayload);
    try{try{const old=await this.request('countReceipt',{id:row.id});await this.book.markUpload(row.id,{status:'accepted',receipt:this.receiptValid(old,row.id)});continue;}catch(e){if(e.status!==404)throw e;}
     if(row.status==='reason-required'||row.status==='conflict')continue;
     if(epoch!==this.epoch)break;const check=await this.request('countCheck',payload);if(epoch!==this.epoch)break;if(check.reasonRequired&&!payload.lateReason){await this.book.markUpload(row.id,{status:'reason-required',warnings:check.warnings});continue;}
     const r=await this.request('countSubmit',payload);await this.book.markUpload(row.id,{status:'accepted',receipt:this.receiptValid(r,row.id),error:null});
    }catch(e){if(e.code==='LATE_LOT_REASON_REQUIRED')await this.book.markUpload(row.id,{status:'reason-required',error:e.message});else if(e.status===409||e.status===400)await this.book.markUpload(row.id,{status:'conflict',error:e.message});else{await this.book.markUpload(row.id,{status:'pending',error:e.message});if(e.status===401&&epoch===this.epoch)this.available=false;break;}}
   }
   if(this.available&&epoch===this.epoch&&this.getActor()?.operatorCode===who.operatorCode){const h=await this.request('countHistory');if(epoch!==this.epoch)return;this.serverRecords=h.records||[];for(const r of this.serverRecords){const u=await this.book.upload(r.eventId);if(u?.receipt&&u.receipt.receiptId===r.receiptId)await this.book.markUpload(r.eventId,{reviewStatus:r.reviewStatus,reviewReason:r.reviewReason,reviewRevision:r.reviewRevision});}}
  }catch(e){await this.onChange?.(e.message);}finally{this.flushing=false;await this.onChange?.();if(this.nextFlush&&this.available){this.nextFlush=false;Promise.resolve().then(()=>this.flush());}}
 }
}
