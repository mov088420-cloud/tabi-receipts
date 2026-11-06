import {type Receipt,type Settings} from './model';
export function csvCell(value:unknown):string {
 let s=String(value??'');
 if(/^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(s)||/^[\t\r\n]/.test(s)) s="'"+s;
 return `"${s.replace(/"/g,'""')}"`;
}
export const csv=(rows:unknown[][])=>'\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
export function receiptsCsv(receipts:Receipt[],settings:Settings) {
 return csv([['レシートID','日付','時刻','店舗名','住所','金額','通貨','小計','割引','税額','税区分','サービス料','チップ','支払者','利用者','支払方法','カードブランド','カード下4桁','取引番号','メモ'],...receipts.map(r=>[r.id,r.date,r.time,r.store,r.address,r.total,r.currency,r.subtotal,r.discount,r.tax,r.taxMode,r.service,r.tip,r.payer==='self'?settings.selfName:r.payer==='wife'?settings.wifeName:'未判定',r.user,r.payment,r.brand,r.last4?`末尾 ${r.last4}`:'',r.transaction,r.memo])]);
}
export function itemsCsv(receipts:Receipt[]) {return csv([['レシートID','商品名','数量','単価','金額'],...receipts.flatMap(r=>r.items.map(i=>[r.id,i.name,i.quantity,i.unitPrice,i.amount]))]);}
export function download(blob:Blob,name:string) {
 const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
