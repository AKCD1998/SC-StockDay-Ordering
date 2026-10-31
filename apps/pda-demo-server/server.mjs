import { inspectRuntime, inspectDatabase, parseOptions, StartupError } from './runtime.mjs';
import { createRequire } from 'node:module';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { randomBytes,createHash,scryptSync,timingSafeEqual,randomUUID } from 'node:crypto';
import { DemoStore,DemoError } from './store.mjs';
import { actors } from './fixtures.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const digest=v=>createHash('sha256').update(v).digest('hex');
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const hashes=new Map(actors.map(a=>[a.id,scryptSync(a.pin,'public-fixture-'+a.id,32)]));
export function createDemoApp({databaseFile,backendRoot,now=()=>Date.now()}){
 const runtime=inspectRuntime(backendRoot);inspectDatabase(databaseFile,runtime.backendRoot);
 const require=createRequire(join(runtime.backendRoot,'package.json'));const express=require('express');
 const {createMobileProductsRouter}=require(runtime.route);
 const store=new DemoStore(databaseFile,{now});const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
 app.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-PDA-Environment':'isolated-fixture-demo'});req.requestId=randomUUID();
  // Local fixture PINs are intentionally NOT suitable for an exposed deployment.
  // Refuse DNS-rebinding/cross-origin requests and never bind outside loopback.
  const host=req.headers.host||'';
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))return res.status(403).json({error:'Loopback host required',code:'LOOPBACK_ONLY'});
  if(req.headers.origin&&req.headers.origin!=='http://'+host)return res.status(403).json({error:'Same-origin request required',code:'ORIGIN_REJECTED'});
  if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Cross-site request rejected',code:'ORIGIN_REJECTED'});
  next();
 });
 app.use(express.json({limit:'256kb',strict:true}));
 const session=req=>{
  const match=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pda_demo_session='));
  const token=match?.slice('pda_demo_session='.length);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const row=store.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),now());
  const identity=actors.find(a=>a.id===row?.actor);if(!identity)return null;
  const {pin,...actor}=identity;return {...row,actor};
 };
 const auth=(req,res,next)=>{const s=session(req);if(!s)return res.status(401).json({error:'Sign in to the isolated demo',code:'AUTH_REQUIRED'});req.demo=s;req.mobile={staffId:s.actor.id,branchCode:s.actor.branchCode,role:s.actor.role,deviceId:s.device,enrollmentId:'fixture-session'};if(req.query.branchCode&&req.query.branchCode!==s.actor.branchCode)return res.status(403).json({error:'Branch outside session scope',code:'BRANCH_SCOPE'});next();};
 const csrf=(req,res,next)=>safeEqual(req.headers['x-csrf-token'],req.demo.csrf)?next():res.status(403).json({error:'CSRF check failed',code:'CSRF_REJECTED'});
 app.get('/api/demo/health',(_req,res)=>res.json({environment:'isolated-fixture-demo',storage:'sqlite-wal',officialStockWrites:false,productionAuth:false,entryMode:'integrated-fixture-api',mobileRouteSha256:runtime.routeSha256,ownerReadContractRevision:runtime.ownerRevision,node:process.version}));
 app.post('/api/demo/auth/login',(req,res)=>{
  const {accountId,pin,deviceId}=req.body||{};
  if(typeof accountId!=='string'||accountId.length>50||typeof pin!=='string'||!/^\d{4}$/.test(pin)||typeof deviceId!=='string'||deviceId.length>100||deviceId.length<10)return res.status(400).json({error:'Account, 4-digit fixture PIN and device ID are required'});
  const limit=store.db.prepare('SELECT * FROM login_limits WHERE account=?').get(accountId);
  if(limit?.locked_until>now())return res.status(429).json({error:'Too many failed attempts; try later',code:'LOGIN_LOCKED'});
  const actor=actors.find(a=>a.id===accountId);const candidate=scryptSync(pin,'public-fixture-'+accountId,32);const valid=actor&&timingSafeEqual(candidate,hashes.get(actor.id));
  if(!valid){const failures=(limit?.failures||0)+1;store.db.prepare('INSERT INTO login_limits VALUES (?,?,?) ON CONFLICT(account) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until').run(accountId,failures,failures>=5?now()+15*60000:0);return res.status(401).json({error:'Invalid fixture credentials',code:'LOGIN_FAILED'});}
  store.db.prepare('DELETE FROM login_limits WHERE account=?').run(accountId);
  const token=randomBytes(32).toString('hex'),csrfToken=randomBytes(24).toString('hex');const prior=session(req);if(prior)store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(prior.token_hash);
  store.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(digest(token),actor.id,deviceId,csrfToken,now()+3600000);
  res.setHeader('Set-Cookie',`pda_demo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
  const {pin:ignored,...identity}=actor;res.json({identity,csrfToken,environment:'isolated-fixture-demo'});
 });
 app.post('/api/demo/auth/logout',auth,csrf,(req,res)=>{store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.demo.token_hash);res.setHeader('Set-Cookie','pda_demo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.json({loggedOut:true});});
 app.get('/api/demo/bootstrap',auth,(req,res)=>res.json({...store.bootstrap(req.demo.actor),csrfToken:req.demo.csrf,sessionExpiresAt:new Date(req.demo.expires).toISOString()}));
 app.post('/api/demo/count-events',auth,csrf,(req,res,next)=>{try{const receipt=store.submit(req.demo.actor,req.demo.device,req.body);res.status(receipt.replayed?200:201).json(receipt);}catch(e){next(e);}});
 // Actual existing handler, unchanged. Fixture session auth and SQLite catalog are
 // injected ONLY into this separate loopback app. Production middleware is untouched.
 app.use('/api/mobile',createMobileProductsRouter({config:{featureMobilePda:true},db:store.mobileDb(),requireMobileTokenMiddleware:auth}));
 const frontend=resolve(here,'../pda-preview');
 app.get(['/', '/index.html'],(_req,res)=>res.type('html').send(readFileSync(join(frontend,'index.html'),'utf8').replace('</head>','<meta name="pda-api" content="/api/demo"></head>')));
 app.use(express.static(frontend,{index:false,dotfiles:'deny'}));
 app.use((_req,res)=>res.status(404).json({error:'Not found'}));
 app.use((error,_req,res,_next)=>{if(error instanceof DemoError)return res.status(error.status).json({error:error.message,code:error.code});if(error.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON'});if(error.type==='entity.too.large')return res.status(413).json({error:'Body too large'});res.status(500).json({error:'Isolated demo error',code:'DEMO_ERROR'});});
 return {app,store};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const options=parseOptions(process.argv.slice(2));if(!options.fixture)throw new StartupError('FIXTURE_OPT_IN_REQUIRED','Explicit --fixture-demo is required; never use production credentials or DBs.');
  const backendRoot=resolve(options['--backend-root']||resolve(here,'../../..','PaaSRTSM-project'));
  const databaseFile=options['--database'];if(!databaseFile)throw new StartupError('DATABASE_REQUIRED','Provide --database /absolute/isolated/path.sqlite');
  const port=Number(options['--port']||'4180');if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new StartupError('PORT_INVALID','Use an unprivileged local port');
  const {app,store}=createDemoApp({databaseFile,backendRoot});
  const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({environment:'isolated-fixture-demo',url:`http://127.0.0.1:${port}`,officialStockWrites:false})));
  server.once('error',error=>{store.close();console.error(JSON.stringify({ok:false,action:'start-isolated-demo',code:error.code||'LISTEN_FAILED',reason:error.code==='EADDRINUSE'?'Port is already in use; the existing service was not stopped.':'Unable to start the loopback listener',port,productionAccess:false}));process.exitCode=1;});
  const stop=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
 }catch(error){console.error(JSON.stringify({ok:false,action:'start-isolated-demo',code:error.code||'STARTUP_FAILED',reason:error.message,productionAccess:false}));process.exitCode=1;}
}
