// The existing Task action and principal remain unchanged. Only this pointer
// switches after a complete offline release is staged and verified.
import { main } from './stability-20261024-checkpoint-v2/installer/hourly004/runtime/hourly-runtime.mjs';
import {safeHourlyFailureCode} from './stability-20261024-checkpoint-v2/src/hourlyAttemptDiagnostics.js';
import {safeStorageFailure} from './stability-20261024-checkpoint-v2/src/hourlyStatusStore.js';
main().catch(error=>{
  console.log(JSON.stringify({status:'launch-stopped',failure:{code:safeHourlyFailureCode(error),...(error.storageFailure?{storageFailure:safeStorageFailure({code:error.storageFailure.code},error.storageFailure.stage)}:{})},detailsWithheld:true}));
  process.exitCode=1;
});
