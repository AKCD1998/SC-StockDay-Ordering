const types=new Set(['System.Exception','System.InvalidOperationException','System.TimeoutException','System.UnauthorizedAccessException','System.IO.IOException','System.ComponentModel.Win32Exception','System.Management.ManagementException','System.Management.Automation.RuntimeException','System.Management.Automation.ActionPreferenceStopException','System.Management.Automation.CmdletInvocationException','System.Management.Automation.PipelineStoppedException','Microsoft.Management.Infrastructure.CimException','OtherException']);
const categories=new Set(['NotSpecified','OpenError','CloseError','DeviceError','DeadlockDetected','InvalidArgument','InvalidData','InvalidOperation','InvalidResult','InvalidType','MetadataError','NotImplemented','NotInstalled','ObjectNotFound','OperationStopped','OperationTimeout','SyntaxError','ParserError','PermissionDenied','ResourceBusy','ResourceExists','ResourceUnavailable','ReadError','WriteError','FromStdErr','SecurityError','ProtocolError','ConnectionError','AuthenticationError','LimitsExceeded','QuotaExceeded','NotEnabled']);
const ids=new Set(['Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand','CimJob_BrokenCimSession','CimJob_UnhandledException','GetCimInstanceCommand','CimJob_InvalidOperation']);
const validations=new Set(['CPU_CLOCK_UNVERIFIED','CPU_BUDGET_EXHAUSTED','CPU_SCOPE_UNSUPPORTED','CPU_SAMPLE_INVALID','CPU_SAMPLE_STALE','CPU_WINDOW_INVALID']);
const int=(x,lo,hi)=>Number.isSafeInteger(x)&&x>=lo&&x<=hi;
export function safeProviderFailure(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.exceptions))return null;
 const exceptions=value.exceptions.slice(0,4).flatMap(e=>{if(!e||!types.has(e.type)||!int(e.hresult,-2147483648,2147483647))return [];return [{type:e.type,hresult:e.hresult,...(int(e.nativeErrorCode,-2147483648,4294967295)?{nativeErrorCode:e.nativeErrorCode}:{}),...(int(e.cimStatusCode,0,100)?{cimStatusCode:e.cimStatusCode}:{})}];});
 if(!exceptions.length)return null;
 return {exceptions,category:categories.has(value.category)?value.category:'NotSpecified',qualifiedErrorIdParts:Array.isArray(value.qualifiedErrorIdParts)?value.qualifiedErrorIdParts.slice(0,4).filter(x=>typeof x==='string'&&(ids.has(x)||/^HRESULT 0x[0-9A-Fa-f]{8}$/.test(x))):[],additionalInnerException:value.additionalInnerException===true,...(validations.has(value.validation)?{validation:value.validation}:{}),detailsWithheld:true};
}
export function validCpuMeasurement(value,now,percent,started=0){
 return value&&typeof value==='object'&&!Array.isArray(value)&&value.provider==='windows-system-times-v1'&&value.hostWide===true&&value.rawSamples===2&&value.groups===1&&int(value.processors,1,64)&&Number.isFinite(value.PercentProcessorTime)&&value.PercentProcessorTime===percent&&percent>=0&&percent<=100&&Number.isFinite(value.windowMs)&&value.windowMs>=1000&&value.windowMs<=1500&&Number.isFinite(value.startedMs)&&value.startedMs>=started&&Number.isFinite(value.endedMs)&&Math.abs(value.endedMs-value.startedMs-value.windowMs)<0.001&&value.endedMs<=now&&now-value.endedMs<=1000&&Number.isFinite(value.ageMs)&&value.ageMs>=0&&value.ageMs<=1000;
}
export function safeCpuEvidence(value,now){
 if(!validCpuMeasurement(value,now,value?.PercentProcessorTime))return null;
 return {provider:value.provider,hostWide:true,rawSamples:2,windowMs:value.windowMs,ageMsAtGuard:now-value.endedMs,groups:1,processors:value.processors};
}
export function safeCpuObservation(value){
 if(!value||value.provider!=='windows-system-times-v1'||value.hostWide!==true||value.rawSamples!==2||value.groups!==1||!int(value.processors,1,64)||!Number.isFinite(value.windowMs)||value.windowMs<1000||value.windowMs>1500||!Number.isFinite(value.ageMsAtGuard)||value.ageMsAtGuard<0||value.ageMsAtGuard>1000)return null;
 return {provider:value.provider,hostWide:true,rawSamples:2,windowMs:value.windowMs,ageMsAtGuard:value.ageMsAtGuard,groups:1,processors:value.processors};
}
