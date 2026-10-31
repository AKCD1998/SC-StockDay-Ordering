const nativeFormats=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','data_matrix','qr_code'];
let fallback;
async function wasmDecoder(){
  if(!fallback)fallback=(async()=>{
    const zxing=await import('./vendor/zxing/reader/index.js');
    await zxing.prepareZXingModule({overrides:{locateFile:path=>new URL('./vendor/zxing/reader/'+path,import.meta.url).href},fireImmediately:true});
    return async canvas=>(await zxing.readBarcodes(canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),{
      formats:['EAN-13','EAN-8','UPC-A','UPC-E','Code128','Code39','ITF','DataMatrix','QRCode'],maxNumberOfSymbols:10,tryHarder:true,tryRotate:true,returnErrors:false,
    })).map(r=>({value:r.text,valid:r.isValid,format:r.format}));
  })().catch(e=>{fallback=null;throw e;});
  return fallback;
}
export async function prepareBarcodeDecoder(){
  if(globalThis.BarcodeDetector){
    try{
      const formats=(await BarcodeDetector.getSupportedFormats()).filter(f=>nativeFormats.includes(f));
      // EAN + Code128 are needed for shop labels. Otherwise use the local fallback.
      if(formats.includes('ean_13')&&formats.includes('code_128')){
        const detector=new BarcodeDetector({formats});
        return async canvas=>{try{return (await detector.detect(canvas)).map(r=>({value:r.rawValue,valid:true,format:r.format}));}catch{return (await wasmDecoder())(canvas);}};
      }
    }catch{/* Browser does not expose an operational native detector. */}
  }
  return wasmDecoder();
}
