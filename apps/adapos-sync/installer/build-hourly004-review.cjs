'use strict';
// Offline owner-bundle builder; no .env, network, credentials, or POS access.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const app=path.resolve(__dirname,'..'),installer=path.join(__dirname,'hourly004');
const allowed=new Set(['hourlyGuardProcess.js','hourlyCompleteCohortGuard.ps1','hourlyHostCpu.ps1','hourlyGuardEvidence.js','hourlyAttemptDiagnostics.js','hourlyStatusStore.js','hourlyFailureHistory.js']);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
function must(v,code){if(!v)throw Object.assign(new Error('Offline bundle stopped; details withheld.'),{code});}
function files(dir){must(!fs.lstatSync(dir).isSymbolicLink(),'SOURCE_LINK_REFUSED');return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>{must(!d.isSymbolicLink(),'SOURCE_LINK_REFUSED');must(d.name!=='.env','ENV_FILE_REFUSED');return d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)];});}
function treeIntegrity(dir){const all=files(dir),tree=crypto.createHash('sha256');for(const rel of all.map(f=>path.relative(dir,f).replaceAll('\\','/')).sort())tree.update(rel+'\0'+hash(fs.readFileSync(path.join(dir,rel)))+'\n');return {files:all.length,integrity:tree.digest('hex').toUpperCase()};}
function build(approvedDirectory,outputDirectory){
 const approved=path.resolve(approvedDirectory),out=path.resolve(outputDirectory),predecessor=path.join(approved,'release');
 must(!out.startsWith(approved+path.sep)&&!approved.startsWith(out+path.sep)&&out!==approved,'OUTPUT_OVERLAPS_PREDECESSOR');must(!out.startsWith(app+path.sep)&&out!==app,'OUTPUT_IN_CHECKOUT_REFUSED');must(!fs.existsSync(out)&&!fs.existsSync(out+'.zip'),'OUTPUT_ALREADY_EXISTS');
 const expected=JSON.parse(fs.readFileSync(path.join(installer,'baseline/previous-release-integrity.json'),'utf8')),actual=treeIntegrity(predecessor);must(actual.files===expected.files&&actual.integrity===expected.integrity,'APPROVED_V4_RELEASE_MISMATCH');
 must(fs.readFileSync(path.join(approved,'runtime/hourly-complete-launcher.mjs')).equals(fs.readFileSync(path.join(installer,'baseline/previous-launcher.mjs'))),'APPROVED_V4_POINTER_MISMATCH');
 const before=path.join(predecessor,'src'),after=path.join(app,'src'),paths=new Set([...files(before).map(f=>path.relative(before,f)),...files(after).map(f=>path.relative(after,f))]);
 for(const rel of paths){if(allowed.has(rel.replaceAll('\\','/')))continue;must(fs.existsSync(path.join(before,rel))&&fs.existsSync(path.join(after,rel)),'NON_HOURLY_SOURCE_CHANGE');must(fs.readFileSync(path.join(before,rel),'utf8').replaceAll('\r\n','\n')===fs.readFileSync(path.join(after,rel),'utf8').replaceAll('\r\n','\n'),'NON_HOURLY_SOURCE_CHANGE');}
 fs.mkdirSync(out);fs.cpSync(predecessor,path.join(out,'release'),{recursive:true});
 for(const rel of allowed)fs.copyFileSync(path.join(after,rel),path.join(out,'release/src',rel));
 fs.cpSync(installer,path.join(out,'release/installer/hourly004'),{recursive:true});
 for(const rel of ['baseline','runtime','hourly004-update.ps1','hourly004-install-recovery.ps1','README-TH.md','CPU-V5-REVIEW-TH.md','.gitattributes'])fs.cpSync(path.join(installer,rel),path.join(out,rel),{recursive:true});
 const release=path.join(out,'release'),entries=files(release).map(f=>({path:path.relative(release,f).replaceAll('\\','/'),integrity:hash(fs.readFileSync(f))})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify({files:entries},null,2)+'\n');
 const report={schemaVersion:'hourly004-cpu-v5-owner-bundle-v1',status:'PREPARED_NOT_INSTALLED',preparedAt:new Date().toISOString(),target:'SERVER004',branch:'004',release:'stability-20261028-cpu-v5',predecessor:'stability-20261024-checkpoint-v4',guardBudgetMs:12000,recoveryEnabled:false,cohortCount:6835,batchSize:200,collectionDeadlineMs:900000,taskLimitMinutes:20,sourceAndDependenciesPinned:true,nonHourlySourceBytesCopiedFromPredecessor:true,sharedCheckoutChanges:false,productionChanges:false,releaseFiles:entries.length,containsEnv:false};
 fs.mkdirSync(path.join(out,'review'));fs.writeFileSync(path.join(out,'review/bundle-scope.json'),JSON.stringify(report,null,2)+'\n');
 if(process.platform==='win32'){const command=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::CreateFromDirectory('${out.replaceAll("'","''")}','${(out+'.zip').replaceAll("'","''")}')`;const r=cp.spawnSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,encoding:'utf8',timeout:120000});must(r.status===0,'ARCHIVE_CREATION_FAILED');}
 return {...report,archiveCreated:fs.existsSync(out+'.zip'),archiveBytes:fs.existsSync(out+'.zip')?fs.statSync(out+'.zip').size:null};
}
if(require.main===module){try{const args=process.argv.slice(2);must(args.length===2,'USAGE_APPROVED_V4_DIRECTORY_AND_NEW_OUTPUT_DIRECTORY');console.log(JSON.stringify(build(...args)));}catch(e){console.log(JSON.stringify({status:'stopped',code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'OFFLINE_BUNDLE_FAILED',detailsWithheld:true}));process.exitCode=1;}}
module.exports={build,treeIntegrity};
