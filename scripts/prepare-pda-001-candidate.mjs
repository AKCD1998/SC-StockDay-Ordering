// Local artifact preparation only: no provider SDK, credentials, publish or DB access.
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);const get=key=>args.includes(key)?args[args.indexOf(key)+1]:null;
if(args.some((arg,index)=>index%2===0&&!['--out','--config','--current-cors'].includes(arg))||!get('--out'))throw new Error('Use --out /absolute/review-artifact-dir [--config reviewed.json] [--current-cors public-origin-array.json]');
const config=JSON.parse(await readFile(resolve(get('--config')||join(root,'deployment/pda-001-candidate.json')),'utf8'));
for(const value of [config.backend.apiOrigin,config.pda.origin,...config.cors.addExactOrigins]){const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw new Error('Exact reviewed HTTPS origins required');}
if(config.branchCode!=='001'||config.publication.humanOverrideEnabled!==false||config.publication.officialStockWrites!==false||config.cors.allowWildcard!==false)throw new Error('Candidate scope differs from reviewed branch001 observation-only boundary');
const out=resolve(get('--out')),marker=join(out,'.pda-review-artifact');
try{await access(out);await access(marker);}catch(error){try{await access(out);throw new Error('Refusing to overwrite an existing directory without the PDA artifact marker');}catch(inner){if(inner.code!=='ENOENT')throw inner;}await mkdir(out,{recursive:true});await writeFile(marker,config.candidate);}
if(out===root||out.startsWith(join(root,'apps')+'/'))throw new Error('Use a separate review-artifact output directory');
await cp(join(root,'apps/pda-preview'),join(out,'pda'),{recursive:true,filter:path=>!path.startsWith(join(root,'apps/pda-preview/tests'))});
const entry=join(out,'pda','pilot-001.html');const html=await readFile(entry,'utf8');
await writeFile(entry,html.replace('</head>',`<meta name="sc-pda-api-origin" content="${config.backend.apiOrigin}"></head>`));
const shellHash=createHash('sha256');for(const file of ['pilot-001.html','style.css','pilot-001-worker-ui.css','pilot-001-sc-brand.css','pilot-001-ui.mjs','browser-preview-client.mjs','pilot-audit-inbox.mjs','operator-display.mjs','count-choice.mjs','quantity-policy.mjs','pilot-001-outbox.mjs','mobile-count-pilot.mjs','pilot-001-worker.js','camera-scanner.mjs','scanner-core.mjs','barcode-decoder.mjs','assets/fonts/sc-plex-thai-400.ttf','assets/fonts/sc-plex-thai-500.ttf','assets/fonts/sc-plex-thai-600.ttf','assets/fonts/sc-plex-thai-700.ttf'])shellHash.update(await readFile(join(out,'pda',file)));
const worker=join(out,'pda','pilot-001-worker.js');await writeFile(worker,(await readFile(worker,'utf8')).replace('sc-pda-pilot-001-shell-v1','sc-pda-pilot-001-shell-'+shellHash.digest('hex').slice(0,16)));
let current=null;if(get('--current-cors')){current=JSON.parse(await readFile(resolve(get('--current-cors')),'utf8'));if(!Array.isArray(current)||current.some(value=>typeof value!=='string'||value==='*'))throw new Error('Current CORS snapshot must be a reviewed array without wildcard');}
await writeFile(join(out,'activation-plan.json'),JSON.stringify({...config,productionActionsPerformed:false,cors:{...config.cors,currentSnapshotProvided:Boolean(current),mergedOrigins:current?[...new Set([...current,...config.cors.addExactOrigins])]:null}},null,2));
const log=[];
const build=spawn('npm',['run','build','-w','apps/admin-web','--','--outDir',join(out,'stockday-web'),'--emptyOutDir'],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',VITE_API_BASE_URL:config.backend.apiOrigin,VITE_FEATURE_PDA_COUNTS_001:config.website.VITE_FEATURE_PDA_COUNTS_001},stdio:['ignore','pipe','pipe']});
build.stdout.on('data',data=>log.push(data));build.stderr.on('data',data=>log.push(data));
const code=await new Promise((done,reject)=>{build.once('error',reject);build.once('exit',done);});await writeFile(join(out,'website-build.log'),Buffer.concat(log));if(code!==0)throw new Error('Candidate build failed; see website-build.log');
await writeFile(join(out,'README.txt'),`Local deploy-ready assets only; not deployed.\nPDA entry: pda${config.pda.entryPath}\nStockDay assets: stockday-web/\nBoth use ${config.backend.apiOrigin}; enable only after approved backend migration/deploy/CORS and matching flags.\nDo not publish fixture-web-build assets or fixture database/session data.\n`);
process.stdout.write(JSON.stringify({candidate:config.candidate,output:out,productionActionsPerformed:false,corsSnapshotVerified:Boolean(current),buildPassed:true})+'\n');
