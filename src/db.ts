import {initialSettings,validateReceipt,validateSettings,type Receipt,type Settings} from './model';
let connection:Promise<IDBDatabase>|undefined;
function db() {
 return connection??=new Promise<IDBDatabase>((resolve,reject)=>{
   const req=indexedDB.open('tabi-receipts',1);
   req.onupgradeneeded=()=>{req.result.createObjectStore('receipts',{keyPath:'id'});req.result.createObjectStore('settings');};
   req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();connection=undefined;};resolve(req.result);};
   req.onerror=()=>{connection=undefined;reject(new Error('端末の保存領域を開けません。プライベートモードや容量を確認してください。'));};
 });
}
async function read<T>(store:string,key?:string):Promise<T> {
 const d=await db(); return new Promise((resolve,reject)=>{const tx=d.transaction(store);const req=key?tx.objectStore(store).get(key):tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
async function write(stores:string[],action:(tx:IDBTransaction)=>void) {
 const d=await db();return new Promise<void>((resolve,reject)=>{const tx=d.transaction(stores,'readwrite');tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('保存できませんでした。空き容量とブラウザの設定を確認してください。'));try{action(tx);}catch(e){tx.abort();reject(e);}});
}
export const listReceipts=()=>read<Receipt[]>('receipts');
export const getSettings=async()=>await read<Settings|undefined>('settings','profile')||structuredClone(initialSettings);
export const saveReceipt=(r:Receipt)=>{const valid=validateReceipt(r);return write(['receipts'],tx=>tx.objectStore('receipts').put(valid));};
export const deleteReceipt=(id:string)=>write(['receipts'],tx=>tx.objectStore('receipts').delete(id));
export const saveSettings=(s:Settings)=>{const valid=validateSettings(s);return write(['settings'],tx=>tx.objectStore('settings').put(valid,'profile'));};
export async function replaceData(receipts:Receipt[],settings:Settings) {
 const validated=receipts.map(validateReceipt); const profile=validateSettings(settings);
 if(new Set(validated.map(r=>r.id)).size!==validated.length) throw new Error('重複するレシートIDがあります。');
 return write(['receipts','settings'],tx=>{const rs=tx.objectStore('receipts');rs.clear();for(const r of validated)rs.put(r);tx.objectStore('settings').put(profile,'profile');});
}
export const eraseImages=()=>write(['receipts'],tx=>{const req=tx.objectStore('receipts').openCursor();req.onsuccess=()=>{const cursor=req.result;if(cursor){const value=cursor.value;delete value.image;cursor.update(value);cursor.continue();}};});
