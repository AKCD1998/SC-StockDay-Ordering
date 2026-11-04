// File-specific document scope preserves the existing R2/index service worker.
const CACHE='sc-pda-pilot-001-shell-v1';
const SHELL=['/pilot-001.html','/style.css','/pilot-001-worker-ui.css','/pilot-001-ui.mjs','/operator-display.mjs','/count-choice.mjs','/quantity-policy.mjs','/pilot-001-outbox.mjs','/mobile-count-pilot.mjs','/camera-scanner.mjs','/scanner-core.mjs','/barcode-decoder.mjs','/vendor/zxing/reader/index.js','/vendor/zxing/share.js','/vendor/zxing/reader/zxing_reader.wasm'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async cache=>{for(const path of SHELL){const response=await fetch(path,{cache:'reload'});if(!response.ok)throw new Error('Shell unavailable');await cache.put(path,response);}}).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('sc-pda-pilot-001-shell-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;
  event.respondWith(fetch(event.request).then(async response=>{if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}return response;}).catch(()=>caches.match(event.request).then(response=>response||Response.error())));
});
