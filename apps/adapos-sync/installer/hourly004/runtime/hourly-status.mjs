// Read-only inspector. Never imports configuration, SQL, a runner, or main().
import fs from 'node:fs';
import {inspectHourlyStatus} from '../../../src/hourlyStatusStore.js';
try {
  const input=fs.readFileSync(0,'utf8');if(Buffer.byteLength(input)>4096)throw new Error();
  const request=JSON.parse(input);
  if(typeof request.file!=='string'||typeof request.legacyMode!=='boolean')throw new Error();
  console.log(JSON.stringify(inspectHourlyStatus(request.file,{legacyMode:request.legacyMode,latestTaskStartedAt:request.latestTaskStartedAt,taskRunning:request.taskRunning})));
}catch{
  console.log(JSON.stringify({schemaVersion:'hourly004-status-view-v2',availability:'unknown',latestAttempt:{status:'unknown',slot:null,observedProducts:null,backendAcceptedRecords:null,outboxPending:null},lastSuccess:null,receiptState:'unavailable',currentStockCertified:false,detailsWithheld:true}));
}
