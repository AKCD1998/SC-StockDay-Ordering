// Stdin/stdout adapter only. No filesystem, credentials, network, SQL or runner.
import {CLOUD_INSPECTION_BOUNDS,reconcileHourlyDelivery} from '../src/hourlyCloudInspection.js';
let bytes=0;const chunks=[];
try{
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>CLOUD_INSPECTION_BOUNDS.inputBytes)throw new Error();chunks.push(chunk);}
 const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 console.log(JSON.stringify(reconcileHourlyDelivery(input)));
}catch{
 console.log(JSON.stringify({schemaVersion:'hourly004-cloud-inspection-v1',branch:'004',status:'PARTIAL',reason:'INPUT_UNVERIFIED',currentStockCertified:false,action:'report-only',syncRequested:false,taskRunRequested:false,recoveryEnabled:false,detailsWithheld:true}));
 process.exitCode=1;
}
