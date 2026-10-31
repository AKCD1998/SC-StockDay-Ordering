import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync,existsSync,statSync } from 'node:fs';
import { join,isAbsolute,resolve } from 'node:path';
export const OWNER_REVISION='40ef239a43b7ba2104376aad296242b062ba28d1';
export const MOBILE_ROUTE_SHA256='3ffbc9413cc9f6ca164953c1dea1dac28bd48d40929ce3b66c086e3feabf038c';
export class StartupError extends Error {constructor(code,message){super(message);this.code=code;}}
export function inspectRuntime(backendRoot){
 if(Number(process.versions.node.split('.')[0])<24)throw new StartupError('NODE_RUNTIME_UNSUPPORTED','Use an already available Node 24+ runtime; this tool does not install software.');
 const root=resolve(backendRoot),route=join(root,'apps/admin-api/src/routes/mobile-products.js');
 if(!existsSync(join(root,'package.json'))||!existsSync(route))throw new StartupError('BACKEND_PATH_INVALID','Point --backend-root at the existing PaaSRTSM-project checkout.');
 const sha=createHash('sha256').update(readFileSync(route,'utf8').replace(/\r\n/g,'\n')).digest('hex');
 if(sha!==MOBILE_ROUTE_SHA256)throw new StartupError('MOBILE_CONTRACT_DRIFT','The mobile-products route differs from the owner-reviewed file; review the contract before using it.');
 const require=createRequire(join(root,'package.json'));let expressPath;
 try{expressPath=require.resolve('express');require('node:sqlite');}catch{throw new StartupError('EXISTING_DEPENDENCY_UNAVAILABLE','Node SQLite or the existing backend Express dependency is unavailable; no installation was attempted.');}
 return {backendRoot:root,route,routeSha256:sha,lineEndingsNormalized:true,ownerRevision:OWNER_REVISION,expressPath,node:process.version,platform:process.platform,fixtureOnly:true};
}
export function inspectDatabase(file,backendRoot){
 if(typeof file!=='string'||!isAbsolute(file)||file.includes('://'))throw new StartupError('DATABASE_PATH_INVALID','Provide an absolute path to an isolated SQLite file, not a connection URL.');
 if(!existsSync(file)||statSync(file).size===0)return {state:existsSync(file)?'empty-file':'new-file',readOnlyCheck:true};
 const require=createRequire(join(resolve(backendRoot),'package.json'));const {DatabaseSync}=require('node:sqlite');let db;
 try{
  db=new DatabaseSync(file,{readOnly:true});
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
  const expected=['meta','events','lots','receipts','revisions','selection_history','selections','sessions','login_limits'];
  if(names.length!==expected.length||expected.some(n=>!names.includes(n)))throw new Error('Unexpected schema');
  const stamp=db.prepare('SELECT value FROM meta WHERE key=?').get('fixture_observed_at');if(!stamp||!Number.isFinite(Date.parse(stamp.value)))throw new Error('Missing fixture marker');
  return {state:'existing-isolated-fixture-store',readOnlyCheck:true};
 }catch{throw new StartupError('DATABASE_NOT_ISOLATED_DEMO','Existing file is not recognized as the delivered isolated PDA fixture store; it was not modified.');}
 finally{db?.close();}
}
export function parseOptions(args){
 const result={};const values=new Set(['--backend-root','--database','--port']);
 for(let i=0;i<args.length;i++){
  const name=args[i];if(name==='--fixture-demo'){if(result.fixture)throw new StartupError('DUPLICATE_OPTION',name);result.fixture=true;continue;}
  if(!values.has(name))throw new StartupError('UNKNOWN_OPTION','Unsupported option: '+name);
  if(Object.hasOwn(result,name))throw new StartupError('DUPLICATE_OPTION',name);
  const value=args[++i];if(!value||value.startsWith('--'))throw new StartupError('MISSING_OPTION_VALUE','Value required for '+name);result[name]=value;
 }
 return result;
}
