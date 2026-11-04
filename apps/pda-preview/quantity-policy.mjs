// Temporary PDA entry rule, backed by the 2026-11-04 read-only stock audit.
// This is an input policy, not a database type change or a conversion rule.
export const COUNT_INPUT_POLICY = Object.freeze({id:'whole-number-v1',fractionDigits:0,maxWholeDigits:9});
export const COUNT_INPUT_MODE = COUNT_INPUT_POLICY.fractionDigits===0?'numeric':'decimal';
export const COUNT_INPUT_PATTERN = COUNT_INPUT_POLICY.fractionDigits===0?'[0-9]*':'[0-9]+([.][0-9]{1,3})?';
export function parseCountMilli(text) {
  const shape=COUNT_INPUT_POLICY.fractionDigits===0?/^(0|[1-9]\d{0,8})$/:/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/;
  if(typeof text!=='string'||!shape.test(text))throw new Error(COUNT_INPUT_POLICY.fractionDigits===0?'กรอกจำนวนเต็มตั้งแต่ 0 เช่น 1, 2, 3 (ไม่รับทศนิยม)':'กรอกจำนวนตั้งแต่ 0 และทศนิยมไม่เกิน 3 ตำแหน่ง');
  const [whole,fraction='']=text.split('.');return Number(whole)*1000+Number(fraction.padEnd(3,'0'));
}
// Presentation only: old fractional records retain their actual value.
export function formatQuantity(value){return String(value).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');}
