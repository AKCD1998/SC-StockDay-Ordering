// A self-contained, explicitly synthetic preview of the existing PDA entry.
// No credentials, provider calls, deployment, backend proxy or model API.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),app=join(root,'apps/pda-preview');
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--out')throw Error('Use --out /absolute/new-preview-directory');
const out=resolve(args[1]);if(out===app||out.startsWith(app+'/'))throw Error('Use a separate artifact output directory');await mkdir(out,{recursive:true});
const wasm=(await readFile(join(app,'vendor/zxing/reader/zxing_reader.wasm'))).toString('base64');
const sample='data:image/png;base64,'+(await readFile(join(app,'assets/sample-barcode.png'))).toString('base64');
const result=await build({entryPoints:[join(app,'pilot-001-ui.mjs')],bundle:true,write:false,format:'iife',platform:'browser',target:['chrome109','safari16'],minify:true,legalComments:'inline',logLevel:'silent',plugins:[{
 name:'embed-existing-public-decoder-assets',setup(builder){
  builder.onLoad({filter:/barcode-decoder\.mjs$/},async({path})=>{let source=await readFile(path,'utf8');const original="overrides:{locateFile:path=>new URL('./vendor/zxing/reader/'+path,import.meta.url).href}";if(!source.includes(original))throw Error('Decoder asset contract changed; review embedding');source=source.replace(original,`overrides:{locateFile:path=>path,wasmBinary:Uint8Array.from(atob('${wasm}'),c=>c.charCodeAt(0))}`);return {contents:source,resolveDir:dirname(path)};});
  builder.onLoad({filter:/camera-scanner\.mjs$/},async({path})=>{const source=(await readFile(path,'utf8')).replace("new URL('./assets/sample-barcode.png',import.meta.url).href",JSON.stringify(sample));return {contents:source,resolveDir:dirname(path)};});
 }
}]});
let css='';for(const name of ['style.css','pilot-001-worker-ui.css','pilot-001-sc-brand.css'])css+='\n'+(await readFile(join(app,name),'utf8')).replace(/@import\s+url\([^)]*\)\s*;/g,'');
for(const weight of [400,500,600,700]){const font=(await readFile(join(app,`assets/fonts/sc-plex-thai-${weight}.ttf`))).toString('base64');css=css.replace(`url('./assets/fonts/sc-plex-thai-${weight}.ttf')`,`url('data:font/ttf;base64,${font}')`);}
let html=await readFile(join(app,'pilot-001.html'),'utf8');
if(html.includes('name="sc-pda-api-origin"')||html.includes('name="pda-pilot-fixture"'))throw Error('Source contains a backend binding; refuse to turn configured data into a browser demo');
html=html.replace(/\s*<link rel="stylesheet"[^>]+>/g,'').replace('</head>',()=>'<meta name="sc-pda-artifact" content="self-contained-browser-preview"><style>'+css+'</style></head>');
const bootstrap="if(!crypto.randomUUID)crypto.randomUUID=()=>{const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=[...a].map(n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};";
const script=bootstrap+result.outputFiles[0].text;
html=html.replace('<script type="module" src="./pilot-001-ui.mjs"></script>',()=>'<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>');
const notices=[];for(const name of ['assets/fonts/OFL.txt','vendor/zxing/LICENSE','vendor/zxing/ZXING-CPP-LICENSE','vendor/zxing/NOTICE.md'])notices.push(name+'\n'+await readFile(join(app,name),'utf8'));
const license=notices.join('\n\n');html=html.replace('</body>','<template id="third-party-licenses">'+license.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</template></body>');
await writeFile(join(out,'pilot-001.html'),html);await writeFile(join(out,'THIRD-PARTY-LICENSES.txt'),license);
await writeFile(join(out,'OPEN-FIRST.txt'),'Open pilot-001.html in the HTML preview or a modern browser. No inventory backend is required. If browser policy blocks local files, serve this directory on localhost with an existing static-file server; do not disable browser policy. Browser QA verified static HTTP and an opaque embedded preview, not direct file navigation.\nPublic demo codes: 1111 (01001), 2222 (02001), 3333 (03001).\nData stays in browser storage, or temporary page memory if browser storage is blocked. The on-screen demo badge explains the mode. No stock is sent to Ada or StockDay.\nCamera access depends on the browser/context; typed/sample barcode, count and linked correction work without camera permission.\nThis is the same PDA project, not a production deployment.\n');
const manifest={artifact:'SC-PDA-BROWSER-PREVIEW-R1',entry:'pilot-001.html',bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),browserOnly:true,externalAssetsRequired:false,productionWrites:false,deployed:false};await writeFile(join(out,'ARTIFACT-IDENTITY.json'),JSON.stringify(manifest,null,2));
process.stdout.write(JSON.stringify({...manifest,path:join(out,'pilot-001.html')})+'\n');
