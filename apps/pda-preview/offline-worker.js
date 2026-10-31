// Isolated demo app shell only. API responses, sessions and receipts are NEVER
// cached or synthesized here. Pending evidence lives in the IndexedDB outbox.
const CACHE='sc-pda-isolated-shell-v1';
const ASSETS=['/','/style.css','/app.mjs','/api-client.mjs','/mobile-contract.mjs','/domain.mjs','/camera-scanner.mjs','/scanner-core.mjs','/barcode-decoder.mjs','/assets/sample-barcode.png','/vendor/zxing/reader/index.js','/vendor/zxing/share.js','/vendor/zxing/reader/zxing_reader.wasm'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sc-pda-isolated-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(event.request).catch(async()=>{const cached=await caches.match(url.pathname);if(cached)return cached;throw new Error('Offline app shell is not cached');}));
});
