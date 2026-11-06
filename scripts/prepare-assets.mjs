import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const dir = 'public/ocr';
await mkdir(dir, { recursive: true });
await copyFile(require.resolve('tesseract.js/dist/worker.min.js'), `${dir}/worker.min.js`);
const tessRequire = createRequire(require.resolve('tesseract.js/package.json'));
const core = dirname(tessRequire.resolve('tesseract.js-core/package.json'));
for (const name of await readdir(core)) if (/^tesseract-core.*\.(wasm|js)$/.test(name)) await copyFile(join(core, name), `${dir}/${name}`);
const data = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
await copyFile(join(data, '4.0.0', 'eng.traineddata.gz'), `${dir}/eng.traineddata.gz`);
const records = [];
for (const name of (await readdir(dir)).sort()) {
  const bytes = await readFile(`${dir}/${name}`);
  records.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('public/ocr-assets.json', JSON.stringify(records, null, 2));
await mkdir('public/icons', { recursive: true });
const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="112" fill="#183e38"/><path d="M166 128h180v266l-30-18-30 18-30-18-30 18-30-18-30 18z" fill="#f7f6f1"/><path d="M206 196h100M206 240h100M206 284h60" stroke="#183e38" stroke-width="16" stroke-linecap="round"/><circle cx="344" cy="154" r="46" fill="#d7ef94"/><path d="m324 154 14 14 26-30" fill="none" stroke="#183e38" stroke-width="10" stroke-linecap="round"/></svg>`;
for (const [name, size] of [['icon-192',192],['icon-512',512],['apple-touch-icon',180]]) await sharp(Buffer.from(svg)).resize(size).png().toFile(`public/icons/${name}.png`);
console.log(`Prepared ${records.length} local OCR assets (${(records.reduce((s,r)=>s+r.bytes,0)/1024/1024).toFixed(1)} MiB).`);
