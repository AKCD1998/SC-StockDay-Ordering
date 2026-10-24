import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const app=fileURLToPath(new URL('../',import.meta.url));
const target=path.resolve(process.argv[2]||'');
if(!process.argv[2]||fs.existsSync(target))throw new Error('A new explicit output directory is required.');
const source=path.join(app,'installer/hourly004');
fs.mkdirSync(target,{recursive:true});
for(const name of ['baseline','runtime'])fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true,errorOnExist:true,force:false});
for(const name of ['hourly004-update.ps1','README-TH.md'])fs.copyFileSync(path.join(source,name),path.join(target,name));
const release=path.join(target,'release');fs.mkdirSync(release);
fs.cpSync(path.join(app,'src'),path.join(release,'src'),{recursive:true});
fs.copyFileSync(path.join(source,'baseline/last-confirmed-success.json'),path.join(release,'hourly004-handoff-success.json'));
fs.mkdirSync(path.join(release,'installer/hourly004/runtime'),{recursive:true});
for(const name of ['hourly-runtime.mjs','runtime-core.mjs'])fs.copyFileSync(path.join(source,'runtime',name),path.join(release,'installer/hourly004/runtime',name));
const lock=JSON.parse(fs.readFileSync(path.join(app,'package-lock.json'),'utf8'));
// Reuse the committed standalone lock, with no new dependencies or lifecycle
// scripts. The build process never loads .env or a production entrypoint.
fs.writeFileSync(path.join(release,'package.json'),JSON.stringify({name:lock.name,version:lock.version,type:'module',private:true,dependencies:lock.packages[''].dependencies},null,2));
fs.copyFileSync(path.join(app,'package-lock.json'),path.join(release,'package-lock.json'));
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
if(!fs.existsSync(npm))throw new Error('Configured npm CLI is unavailable.');
const result=spawnSync(process.execPath,[npm,'ci','--prefix',release,'--ignore-scripts','--omit=dev','--no-audit','--no-fund'],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:1048576});
if(result.status!==0)throw new Error('Locked offline-release dependency preparation failed; no production changes.');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Release may not contain links.');if(entry.isDirectory())walk(full);else if(entry.isFile()){
  const relative=path.relative(release,full).replaceAll('\\','/');
  if(relative.split('/').includes('.env'))throw new Error('Configuration must never enter a release.');
  files.push({path:relative,integrity:createHash('sha256').update(fs.readFileSync(full)).digest('hex').toUpperCase()});
}}}
walk(release);files.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(target,'release-manifest.json'),JSON.stringify({version:'hourly004-stability-20261024',files},null,2));
console.log(JSON.stringify({status:'review-package-built',fileCount:files.length,guardBudgetMs:12000,newRecoveryEnabled:false,productionFilesChanged:0,configurationIncluded:false}));
