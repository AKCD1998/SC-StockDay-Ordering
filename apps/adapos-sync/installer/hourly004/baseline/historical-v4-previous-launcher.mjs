// The existing Task action and principal remain unchanged. Only this pointer
// switches after a complete offline release is staged and verified.
import { main } from './stability-20261024/installer/hourly004/runtime/hourly-runtime.mjs';
main().catch(()=>{
  console.log(JSON.stringify({status:'launch-stopped',failure:{code:'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD'},detailsWithheld:true}));
  process.exitCode=1;
});
