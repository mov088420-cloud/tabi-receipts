import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const html=await readFile('dist/index.html','utf8');
assert(html.includes("default-src 'self'"));assert(html.includes("worker-src 'self'"));
assert(!/(?:src|href)=["']https?:/.test(html));
for(const asset of JSON.parse(await readFile('dist/ocr-assets.json','utf8'))){const bytes=await readFile(`dist/ocr/${asset.name}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
for(const name of await readdir('src')){if(!/\.(ts|tsx)$/.test(name))continue;const source=await readFile(`src/${name}`,'utf8');assert(!/dangerouslySetInnerHTML|sendBeacon|XMLHttpRequest|console\.(log|debug|info)/.test(source),`Review runtime source: ${name}`);if(name!=='sheets-data.ts')assert(!/https?:\/\//.test(source),`Unexpected outbound URL: ${name}`);}
console.log('Static audit passed: CSP, no remote HTML assets, local OCR hashes, no logging/HTML injection; Google bridge URLs isolated in sheets-data.ts.');
