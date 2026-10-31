// Read-only preflight: no listeners, database creation, installs or network calls.
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRuntime,inspectDatabase,parseOptions } from './runtime.mjs';
try{
 const options=parseOptions(process.argv.slice(2));const here=dirname(fileURLToPath(import.meta.url));
 const runtime=inspectRuntime(options['--backend-root']||resolve(here,'../../..','PaaSRTSM-project'));
 const database=options['--database']?inspectDatabase(options['--database'],runtime.backendRoot):{state:'not-requested',readOnlyCheck:true};
 console.log(JSON.stringify({ok:true,action:'read-only-preflight',...runtime,database,productionAccess:false,softwareInstalled:false}));
}catch(error){console.error(JSON.stringify({ok:false,action:'read-only-preflight',code:error.code||'PREFLIGHT_FAILED',reason:error.message,softwareInstalled:false}));process.exitCode=1;}
