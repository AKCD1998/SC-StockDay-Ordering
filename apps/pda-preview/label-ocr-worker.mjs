// Tesseract recognizes a canvas after asynchronously decoding its pixels. Killing
// its raw Worker during that decode can throw an uncaught postMessage(null).
// Close admission immediately, drain the one admitted job, then release the Worker.
// Camera/UI cleanup never waits for this; sequence guards discard late readings.
export function guardedOcrWorker(raw){
 let closed=false,termination;const pending=new Set();
 const call=(method,args)=>{if(closed)return Promise.reject(new Error('OCR session closed'));const job=Promise.resolve().then(()=>raw[method](...args));pending.add(job);job.then(()=>pending.delete(job),()=>pending.delete(job));return job;};
 return {setParameters:(...args)=>call('setParameters',args),recognize:(...args)=>call('recognize',args),terminate:()=>{closed=true;return termination??=(async()=>{await Promise.allSettled([...pending]);return raw.terminate();})();}};
}
