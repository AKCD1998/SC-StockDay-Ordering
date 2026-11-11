import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reader=path.join(root,'scripts','Read-Hourly004DirectSource.ps1');
const source=fs.readFileSync(reader,'utf8');
test('direct reader has only read actions and no arbitrary target/path CLI',()=>{
 assert.match(source,/ValidateSet\('Preflight','Status'\)/);
 assert.doesNotMatch(source,/Get-CimInstance|Get-WmiObject|Invoke-Sqlcmd|mssql|dotenv|\.env\b|Start-Process|Invoke-Command|RegisterTaskDefinition|\.RunEx?\(|\.Stop\(|Set-Acl|Set-ExecutionPolicy|New-Service|Set-Service|Start-Service|Register-ScheduledTask|schtasks|net use|tailscale/i);
 assert.doesNotMatch(source,/FileAccess\]::Write|FileMode\]::(?:Create|OpenOrCreate)|WriteAllText|WriteAllBytes|Set-Content|Add-Content|Remove-Item/);
 assert.match(source,/\$service\.Connect\(\)/);
 assert.doesNotMatch(source,/\$service\.Connect\([^)]*[^\s)]\)/);
});
test('native grant and caller deadline remain external prerequisites',()=>{
 assert.match(source,/platformAuthorization='NOT_EVALUATED_LOCALLY'/);
 assert.match(source,/requiresTrustedNativeAuthorization=\$true/);
 assert.match(source,/requiresNativeInvocationDeadlineMs=30000/);
 assert.match(source,/expectedGuardBudgetMs=12000/);
 assert.match(source,/expectedRecoveryEnabled=\$false/);
 assert.match(source,/releaseIntegrity='NOT_FULLY_REVALIDATED'/);
});
test('native PS5.1 reader fixtures include real filesystem and wrong-host CLI',{skip:process.platform!=='win32'},()=>{
 const exe=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const env={};for(const[k,v]of Object.entries(process.env))if(/^(SystemRoot|WINDIR|ComSpec|PATH|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|ProgramFiles|ProgramData|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k))env[k]=v;
 const f=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(root,'tests','hourly-direct-source-native.ps1'),'-Reader',reader],{env,encoding:'utf8',windowsHide:true,timeout:30000});
 let report;try{report=JSON.parse(f.stdout.replace(/^\uFEFF/,''));}catch{assert.fail('Native fixture did not return a sanitized report.');}
 assert.equal(f.status,0,JSON.stringify({passed:report.passed,failed:report.failed,failures:report.failures}));
 assert.equal(report.failed,0);assert.equal(report.sourceWrites,0);assert.equal(report.taskRuns,0);assert.equal(report.deviceGrantPerformed,false);assert.ok(report.passed>=31);
 let actualWrongHostGatePassed=null;
 if(os.hostname().toUpperCase()!=='SERVER004'){
  const wrongHost=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',reader],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  const actual=JSON.parse(wrongHost.stdout.replace(/^\uFEFF/,''));
  assert.equal(actual.accessStatus,'BLOCKED');assert.equal(actual.safeError,'WRONG_EXECUTION_HOST');assert.equal(actual.taskReadsPassed,0);assert.equal(actual.fileRead,'not-attempted');assert.equal(actual.sourceFileWrites,0);actualWrongHostGatePassed=true;
 }
 console.log(JSON.stringify({simulation:true,nativePowerShell:report.nativePowerShell,passed:report.passed,failed:report.failed,actualWrongHostGatePassed,sourceWrites:0,taskRuns:0,sqlQueries:0}));
});
