import {captureSourceLabels,validateReceipt,type Receipt,type Settings} from './model';
export const sheetHeaders=['レシートID','取引日付','取引時刻','店舗名','住所','金額','通貨','小計','割引','税額','税区分','サービス料','チップ','支払者','利用者','支払方法','カードブランド','カード下4桁','取引番号','メモ','撮影日時','撮影日時の取得方法','取り込み日時','登録日時'];
export type SheetsConfig={endpoint:string;key:string;enabled:boolean;sheetUrl:string};
export type SheetJob={id:string;revision:string;version:number;row:string[];items:string[][]};
export const emptySheetsConfig:SheetsConfig={endpoint:'',key:'',enabled:false,sheetUrl:''};
export function validateSheetsConfig(config:SheetsConfig):SheetsConfig {
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(config.endpoint))throw new Error('Google Apps ScriptのウェブアプリURL（末尾 /exec）を入力してください。');
 if(!/^[a-f0-9]{64}$/.test(config.key))throw new Error('連携キーは設定手順で作成した64文字を入力してください。');
 if(config.sheetUrl&&!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+\/?$/.test(config.sheetUrl))throw new Error('スプレッドシートのURLを確認してください。');
 return {endpoint:config.endpoint,key:config.key,enabled:config.enabled===true,sheetUrl:config.sheetUrl};
}
export function receiptRow(input:Receipt,settings:Settings):string[] {
 const r=validateReceipt(input);
 return [r.id,r.date,r.time,r.store,r.address,r.total,r.currency,r.subtotal,r.discount,r.tax,r.taxMode,r.service,r.tip,r.payer==='self'?settings.selfName:r.payer==='wife'?settings.wifeName:'未判定',r.user,r.payment,r.brand,r.last4?`末尾 ${r.last4}`:'',r.transaction,r.memo,r.capturedAt,captureSourceLabels[r.captureSource],r.importedAt,r.createdAt];
}
export function makeSheetJob(r:Receipt,s:Settings,version:number):SheetJob {
 return {id:r.id,revision:crypto.randomUUID(),version,row:receiptRow(r,s),items:r.items.map(i=>[r.id,i.name,i.quantity,i.unitPrice,i.amount])};
}
export async function callSheet(config:SheetsConfig,job?:SheetJob):Promise<{sheetUrl:string}> {
 const valid=validateSheetsConfig(config);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30_000);
 let conflict=false;
 try {
   // text/plain avoids a CORS preflight unsupported by Apps Script. Never use opaque no-cors responses as proof of saving.
   const response=await fetch(valid.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key:valid.key,action:job?'save':'ping',job}),credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error();
   const data=await response.json();conflict=data?.conflict===true;
   if(data?.ok!==true||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+\/?$/.test(data.sheetUrl)||job&&(data.id!==job.id||data.revision!==job.revision))throw new Error();
   if(valid.sheetUrl&&data.sheetUrl!==valid.sheetUrl)throw new Error('destination');
   return {sheetUrl:data.sheetUrl};
 }catch{throw new Error(conflict?'Google側に新しい更新があるため送信を保留しました。端末の日時を確認し、レシートを開いて再保存してください。':'Googleへの保存を確認できませんでした。通信・連携キー・Google側の公開設定を確認してください。未送信分はこの端末に残っています。');}
 finally{clearTimeout(timeout);}
}
