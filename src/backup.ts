import {validateReceipt,validateSettings,receiptImages,type Receipt,type Settings} from './model';
const iterations=310_000;
const limit=100*1024*1024;
const encode=(b:Uint8Array)=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
function decode(s:unknown,max:number):Uint8Array<ArrayBuffer> {
 if(typeof s!=='string'||s.length>Math.ceil(max/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw new Error('バックアップ形式が不正です。');
 const v=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(v.length>max)throw new Error('バックアップが大きすぎます。');return v;
}
async function key(password:string,salt:Uint8Array<ArrayBuffer>) {
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptBackup(receipts:Receipt[],settings:Settings,password:string):Promise<Blob> {
 if(password.length<12)throw new Error('パスワードは12文字以上にしてください。');
 if(receipts.reduce((sum,r)=>sum+receiptImages(r).reduce((n,image)=>n+image.size,0),0)>60*1024*1024)throw new Error('画像合計が60MBを超えています。画像を端末に別途保存したうえで、画像なしバックアップを利用してください。');
 const rows=[];
 const pack=async(image?:Blob)=>image?{type:image.type,data:encode(new Uint8Array(await image.arrayBuffer()))}:undefined;
 for(const input of receipts){const r=validateReceipt(input);rows.push({...r,image:await pack(r.image),photos:r.photos?await Promise.all(r.photos.map(async p=>({...p,image:await pack(p.image)}))):undefined});}
 const plain=new TextEncoder().encode(JSON.stringify({version:receipts.some(r=>r.photos)?2:1,receipts:rows,settings:validateSettings(settings)}));
 if(plain.length>limit)throw new Error('バックアップが大きすぎます。');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('tabi-backup-v1')},await key(password,salt),plain);
 return new Blob([JSON.stringify({format:'tabi-backup',version:1,iterations,salt:encode(salt),iv:encode(iv),data:encode(new Uint8Array(data))})],{type:'application/json'});
}
export async function decryptBackup(file:Blob,password:string):Promise<{receipts:Receipt[];settings:Settings}> {
 if(file.size>limit*1.5)throw new Error('バックアップが大きすぎます。');
 let payload;
 try {
   const envelope=JSON.parse(await file.text());
   if(envelope.format!=='tabi-backup'||envelope.version!==1||envelope.iterations!==iterations)throw new Error();
   const salt=decode(envelope.salt,16),iv=decode(envelope.iv,12);if(salt.length!==16||iv.length!==12)throw new Error();
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('tabi-backup-v1')},await key(password,salt),decode(envelope.data,limit+16));
   payload=JSON.parse(new TextDecoder().decode(plain));
 }catch{throw new Error('復号できません。パスワード・ファイルの破損・形式を確認してください。');}
 if(![1,2].includes(payload.version)||!Array.isArray(payload.receipts)||payload.receipts.length>10_000)throw new Error('バックアップ内容が不正です。');
 const unpack=(value:unknown):Blob|undefined=>{
   if(value===undefined)return undefined;
   if(!value||typeof value!=='object')throw new Error('画像データが不正です。');
   const img=value as {type:string;data:string};const bytes=decode(img.data,25*1024*1024);
   const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
   const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
   if(!((img.type==='image/png'&&png)||(img.type==='image/jpeg'&&jpeg)||(img.type==='image/webp'&&webp)))throw new Error('画像データが不正です。');
   return new Blob([bytes],{type:img.type});
 };
 const receipts=payload.receipts.map((row:Record<string,unknown>)=>{
   if(!row||typeof row!=='object')throw new Error('バックアップ内容が不正です。');
   if(row.photos!==undefined&&(!Array.isArray(row.photos)||row.photos.length>6))throw new Error('写真の枚数が不正です。');
   const photos=Array.isArray(row.photos)?row.photos.map(p=>{
     if(!p||typeof p!=='object')throw new Error('写真の形式が不正です。');
     return {...p,image:unpack(p.image)};
   }):undefined;
   return validateReceipt({...row,image:unpack(row.image),photos});
 });
 if(new Set(receipts.map((r:Receipt)=>r.id)).size!==receipts.length)throw new Error('重複するレシートIDがあります。');
 return {receipts,settings:validateSettings(payload.settings)};
}
