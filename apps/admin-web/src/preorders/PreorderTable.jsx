import {useRef,useState} from "react";
import {formatThaiDate,intentLabel,statusLabel} from "./preorderHelpers.js";
import PreorderCancelDialog from "./PreorderCancelDialog.jsx";

const CANCELLABLE=new Set(["SUBMITTED","IN_REVIEW","NEEDS_INFO","PROCUREMENT_PENDING"]);

export default function PreorderTable({items,onOpen,api,canCancel=false,onCancelled}){
 const [swipedId,setSwipedId]=useState(""),[cancelItem,setCancelItem]=useState(null);
 const touchStart=useRef(null);
 if(!items.length)return <div className="preorder-empty"><strong>ยังไม่มีคำขอพรีออเดอร์</strong><p>รายการที่สร้างจากสาขานี้จะแสดงที่นี่</p></div>;
 function startSwipe(event){const touch=event.changedTouches?.[0];if(touch)touchStart.current={x:touch.clientX,y:touch.clientY};}
 function endSwipe(event,itemId){const touch=event.changedTouches?.[0],start=touchStart.current;touchStart.current=null;if(!touch||!start)return;const dx=touch.clientX-start.x,dy=touch.clientY-start.y;if(Math.abs(dy)>Math.abs(dx))return;if(dx>48)setSwipedId(itemId);else if(dx< -32)setSwipedId("");}
 return <div className="preorder-table-wrap"><table className="preorder-table"><thead><tr><th aria-label="ยกเลิก"></th><th>ID / เวลา</th><th>ลูกค้า</th><th>สินค้า</th><th>ประเภท</th><th>แอดมินเปิดอ่าน</th><th>สถานะ</th><th>ตอบล่าสุด</th><th>ETA</th><th></th></tr></thead><tbody>
  {items.map(item=>{const canCancelItem=canCancel&&CANCELLABLE.has(item.status);const open=swipedId===item.public_id;return <tr key={item.public_id} className={open?"preorder-swipe-row is-swiped":"preorder-swipe-row"} onTouchStart={startSwipe} onTouchEnd={event=>endSwipe(event,item.public_id)} onTouchCancel={()=>{touchStart.current=null;}}>
   <td className="preorder-cancel-slot">{canCancelItem&&<button type="button" hidden={!open} className="danger" onClick={()=>{setCancelItem(item);setSwipedId("");}}>ยกเลิกคำขอ</button>}</td>
   <td data-label="ID / เวลา"><div className="preorder-swipe-content"><strong>{item.public_id}</strong><small>{formatThaiDate(item.created_at)}</small></div></td>
   <td data-label="ลูกค้า"><div className="preorder-swipe-content">{item.customer_name_masked}<small>{item.customer_phone_masked}</small></div></td>
   <td data-label="สินค้า"><div className="preorder-swipe-content"><span title={item.item_summary}>{item.item_summary||(item.item_count||0)+" รายการ"}</span></div></td>
   <td data-label="ประเภท"><div className="preorder-swipe-content">{intentLabel(item.intent)}</div></td>
   <td data-label="แอดมินเปิดอ่าน"><div className="preorder-swipe-content">{item.first_admin_viewed_at?formatThaiDate(item.first_admin_viewed_at):"ยังไม่เปิดอ่าน"}</div></td>
   <td data-label="สถานะ"><div className="preorder-swipe-content"><span className={"preorder-status status-"+String(item.status).toLowerCase()}>{statusLabel(item.status)}</span></div></td>
   <td data-label="ตอบล่าสุด"><div className="preorder-swipe-content">{formatThaiDate(item.last_reply_at)}</div></td>
   <td data-label="ETA"><div className="preorder-swipe-content">{item.eta_date?<><strong>ประมาณ {new Date(item.eta_date).toLocaleDateString("th-TH")}</strong><small>{item.eta_basis||"ตามรอบส่งสินค้า"}</small></>:"-"}</div></td>
   <td><div className="preorder-swipe-content"><button type="button" onClick={()=>onOpen(item.public_id)}>ดูรายละเอียด</button></div></td>
  </tr>;})}
 </tbody></table>
 {cancelItem&&<PreorderCancelDialog publicId={cancelItem.public_id} expectedVersion={cancelItem.version} api={api} onClose={()=>setCancelItem(null)} onCancelled={onCancelled}/>}
 </div>;
}
