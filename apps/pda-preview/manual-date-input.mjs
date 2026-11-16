import {maskManualDate} from './manual-label-date.mjs';
const digits=text=>text.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50)).replace(/\D/g,'');
export function bindManualDateInput(input){
 let before=null;
 input.addEventListener('beforeinput',()=>{before={value:input.value,start:input.selectionStart,end:input.selectionEnd};});
 input.addEventListener('input',event=>{
  const previous=before;before=null;if(event.isComposing)return;
  let value=input.value,caret=input.selectionStart??value.length;
  // Deleting an automatically inserted slash must still make progress.
  if(previous?.start===previous?.end&&event.inputType==='deleteContentBackward'&&previous?.value[previous.start-1]==='/'){
   const remove=Math.max(0,caret-1);value=value.slice(0,remove)+value.slice(remove+1);caret=remove;
  }else if(previous?.start===previous?.end&&event.inputType==='deleteContentForward'&&previous?.value[previous.start]==='/'){
   value=value.slice(0,caret)+value.slice(caret+1);
  }
  const padSeparated=!previous||event.inputType==='insertFromPaste'||event.data?.length>1||(previous.start===0&&previous.end===previous.value.length);
  const count=digits(value.slice(0,caret)).length,masked=maskManualDate(value,{padSeparated});
  let position=0,seen=0;
  for(;position<masked.length&&seen<count;position++)if(/\d/.test(masked[position]))seen++;
  while(masked[position]==='/')position++;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)||digits(masked).length!==digits(value).length)position=masked.length;
  input.value=masked;input.setSelectionRange(position,position);
 });
 input.addEventListener('compositionend',()=>input.dispatchEvent(new Event('input',{bubbles:true})));
}
