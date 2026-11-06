import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir) {
  const out=[];
  for (const e of await readdir(dir,{withFileTypes:true})) {
    const p=`${dir}/${e.name}`;
    if(e.isDirectory()) out.push(...await walk(p)); else if(e.name!=='sw.js') out.push(p);
  }
  return out;
}
const files=(await walk('dist')).sort();
const hash=createHash('sha256');
hash.update(await readFile('scripts/build-sw.mjs'));
for(const f of files) hash.update(await readFile(f));
const version=hash.digest('hex').slice(0,16);
const assets=files.map(f=>`./${f.slice(5)}`);
await writeFile('dist/sw.js', `
const PREFIX='tabi-'+self.registration.scope;
const CACHE=PREFIX+'-${version}';
const FILES=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 // Sequential fetching limits peak memory on mobile. Install fails unless all assets are cached.
 try { for(const file of FILES) await cache.add(new Request(file,{cache:'reload'})); }
 catch(error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys()) if(name.startsWith(PREFIX)&&name!==CACHE) await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin || event.request.method!=='GET' || !url.href.startsWith(self.registration.scope)) return;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const key=event.request.mode==='navigate' ? new URL('index.html',self.registration.scope).href : event.request;
   // Only same-origin, build-owned static files are cached. Development preview adds
   // Vary: Origin, which otherwise prevents module requests from finding the precache.
   const hit=await cache.match(key,{ignoreVary:true});
   return hit || fetch(event.request);
 })());
});
`);
console.log('Service worker generated:',version,assets.length,'files');
