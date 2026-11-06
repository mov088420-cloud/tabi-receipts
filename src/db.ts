import {initialSettings,withoutImages,validateReceipt,validateSettings,type Receipt,type Settings} from './model';
import {emptySheetsConfig,validateSheetsConfig,makeSheetJob,type SheetsConfig,type SheetJob} from './sheets-data';
let connection:Promise<IDBDatabase>|undefined;
function db() {
 return connection??=new Promise<IDBDatabase>((resolve,reject)=>{
   const req=indexedDB.open('tabi-receipts',2);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('receipts'))req.result.createObjectStore('receipts',{keyPath:'id'});if(!req.result.objectStoreNames.contains('settings'))req.result.createObjectStore('settings');if(!req.result.objectStoreNames.contains('sheetQueue'))req.result.createObjectStore('sheetQueue',{keyPath:'id'});};
   req.onblocked=()=>{connection=undefined;reject(new Error('ほかのレシート帳のタブを閉じて、開き直してください。'));};
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
export const saveReceipt=(r:Receipt)=>{const valid=validateReceipt(r);return write(['receipts','settings','sheetQueue'],tx=>{
 tx.objectStore('receipts').put(valid);
 const st=tx.objectStore('settings'),config=st.get('sheets'),profile=st.get('profile'),version=st.get('sheetVersion');
 version.onsuccess=()=>{if(config.result?.enabled){const next=Math.max(Date.now(),(version.result||0)+1);tx.objectStore('sheetQueue').put(makeSheetJob(valid,profile.result||initialSettings,next));st.put(next,'sheetVersion');}};
 });};
export const deleteReceipt=(id:string)=>write(['receipts','sheetQueue'],tx=>{tx.objectStore('receipts').delete(id);tx.objectStore('sheetQueue').delete(id);});
export const saveSettings=(s:Settings)=>{const valid=validateSettings(s);return write(['settings'],tx=>tx.objectStore('settings').put(valid,'profile'));};
export async function replaceData(receipts:Receipt[],settings:Settings) {
 const validated=receipts.map(validateReceipt); const profile=validateSettings(settings);
 if(new Set(validated.map(r=>r.id)).size!==validated.length) throw new Error('重複するレシートIDがあります。');
 return write(['receipts','settings','sheetQueue'],tx=>{const rs=tx.objectStore('receipts');rs.clear();for(const r of validated)rs.put(r);const st=tx.objectStore('settings');st.put(profile,'profile');st.delete('sheets');tx.objectStore('sheetQueue').clear();});
}
export const eraseImages=()=>write(['receipts'],tx=>{const req=tx.objectStore('receipts').openCursor();req.onsuccess=()=>{const cursor=req.result;if(cursor){cursor.update(withoutImages(cursor.value));cursor.continue();}};});
export const getSheetsConfig=async()=>await read<SheetsConfig|undefined>('settings','sheets')||{...emptySheetsConfig};
export const sheetQueue=()=>read<SheetJob[]>('sheetQueue');
export const getSheetJob=(id:string)=>read<SheetJob|undefined>('sheetQueue',id);
export const saveSheetsConfig=(c:SheetsConfig)=>{const valid=validateSheetsConfig(c);return write(['settings','sheetQueue'],tx=>{tx.objectStore('settings').put(valid,'sheets');tx.objectStore('sheetQueue').clear();});};
export const disconnectSheets=()=>write(['settings','sheetQueue'],tx=>{tx.objectStore('settings').delete('sheets');tx.objectStore('sheetQueue').clear();});
export const acknowledgeSheetJob=(job:SheetJob,endpoint:string)=>write(['settings','sheetQueue'],tx=>{
 const config=tx.objectStore('settings').get('sheets'),store=tx.objectStore('sheetQueue'),current=store.get(job.id);
 current.onsuccess=()=>{if(config.result?.endpoint===endpoint&&current.result?.revision===job.revision)store.delete(job.id);};
});
