import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
const entries=[];const notices=[`English traineddata: obtained from @tesseract.js-data/eng 1.0.0 (package metadata MIT). The underlying Tesseract language data is Apache-2.0: https://github.com/tesseract-ocr/tessdata/blob/main/LICENSE . The Apache-2.0 terms reproduced below also apply to that data. No changes were made to the traineddata.`];
for(const store of await readdir('node_modules/.pnpm')) {
 if(store==='node_modules')continue;
 const base=`node_modules/.pnpm/${store}/node_modules`;
 let children;try{children=await readdir(base,{withFileTypes:true});}catch{continue;}
 const paths=[];
 for(const e of children){if(e.isSymbolicLink())continue;if(e.name.startsWith('@')){for(const sub of await readdir(`${base}/${e.name}`,{withFileTypes:true}))if(!sub.isSymbolicLink())paths.push(`${base}/${e.name}/${sub.name}`);}else paths.push(`${base}/${e.name}`);}
 for(const p of paths){let pkg;try{pkg=JSON.parse(await readFile(`${p}/package.json`,'utf8'));}catch{continue;}
 const licenseFiles=(await readdir(p)).filter(n=>/^(license|licence|copying|notice)(\.|$|-)/i.test(n));
 entries.push({name:pkg.name,version:pkg.version,license:pkg.license||'UNKNOWN',licenseFiles,repository:pkg.repository?.url||pkg.repository||''});
 for(const name of licenseFiles)try{notices.push(`\n===== ${pkg.name}@${pkg.version} / ${name} =====\n${await readFile(`${p}/${name}`,'utf8')}`);}catch{}
 }
}
entries.sort((a,b)=>a.name.localeCompare(b.name));
await mkdir('docs',{recursive:true});await mkdir('public',{recursive:true});
await writeFile('docs/dependencies.json',JSON.stringify(entries,null,2));
await writeFile('public/THIRD-PARTY-NOTICES.txt',notices.join('\n'));
console.log('Recorded dependency licenses:',entries.length,'packages.');
