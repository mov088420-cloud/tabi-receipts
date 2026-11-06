export type Payer = 'self' | 'wife' | 'unknown';
export type Currency = '' | 'SGD' | 'JPY' | 'USD';
export type Card = { id: string; payer: 'self'|'wife'; brand: string; last4: string; alias: string };
export type Settings = { selfName: string; wifeName: string; cards: Card[] };
export type Item = { id: string; name: string; quantity: string; unitPrice: string; amount: string };
export type ReceiptPhoto = {capturedAt:string;importedAt:string;captureSource:'unknown'|'exif'|'camera'|'manual';image?:Blob};
export const maxReceiptPhotos=6;
export type Receipt = {
 id: string; createdAt: string; date: string; time: string; store: string; address: string;
 capturedAt: string; importedAt: string; captureSource: 'unknown'|'exif'|'camera'|'manual';
 total: string; currency: Currency; subtotal: string; discount: string; tax: string;
 service: string; tip: string; taxMode: 'unknown'|'included'|'excluded';
 payment: string; brand: string; last4: string; transaction: string; memo: string;
 payer: Payer; user: string; items: Item[]; image?: Blob; photos?:ReceiptPhoto[];
};
export const initialSettings: Settings = { selfName:'本人', wifeName:'妻', cards:[] };
export function emptyReceipt(): Receipt {
 return {id:createRecordId(),createdAt:new Date().toISOString(),capturedAt:'',importedAt:'',captureSource:'unknown',date:'',time:'',store:'',address:'',total:'',currency:'',subtotal:'',discount:'',tax:'',service:'',tip:'',taxMode:'unknown',payment:'',brand:'',last4:'',transaction:'',memo:'',payer:'unknown',user:'',items:[]};
}
export const captureSourceLabels={unknown:'不明',exif:'写真の撮影情報',camera:'カメラからの取り込み時刻（目安）',manual:'手入力'};
export function receiptImages(r:Receipt):Blob[] {return r.photos?.flatMap(p=>p.image?[p.image]:[])??(r.image?[r.image]:[]);}
export function withoutImages(r:Receipt):Receipt {const {image:_image,...rest}=r;return {...rest,...(r.photos?{photos:r.photos.map(({image:_image,...p})=>p)}:{})};}
// An EXIF timestamp may lack an offset. Keep it as a wall-clock time; never guess a zone.
export function validPhotoTimestamp(value:string):boolean {
 const m=/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.exec(value);
 if(!m||!Number.isFinite(Date.parse(m[1]))||new Date(m[1]).toISOString().slice(0,10)!==m[1])return false;
 return !m[5]||!/[+-]14:(?!00)/.test(m[5]);
}
export const currencies: Currency[]=['','SGD','JPY','USD'];
export function minor(value: string, currency: Currency): bigint | null {
 if(!currency || !/^-?\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
 const negative=value.startsWith('-'); const [whole,frac='']=value.replace('-','').split('.');
 if(currency==='JPY' && /[1-9]/.test(frac)) return null;
 const scale=currency==='JPY'?0:2;
 const amount=BigInt(whole)*10n**BigInt(scale)+BigInt(scale?frac.padEnd(scale,'0'):'0');
 return negative?-amount:amount;
}
export function major(value: bigint,currency: Currency): string {
 const negative=value<0n; const a=negative?-value:value;
 const out=currency==='JPY'?a.toString():`${a/100n}.${(a%100n).toString().padStart(2,'0')}`;
 return (negative?'-':'')+out;
}
export function identifyPayer(brand:string,last4:string,cards:Card[]):Payer {
 if(!/^\d{4}$/.test(last4)) return 'unknown';
 const matches=cards.filter(c=>c.last4===last4);
 // A duplicated number is ambiguous even if the brands or owners differ.
 if(matches.length!==1) return 'unknown';
 const c=matches[0];
 if(brand && c.brand && brand.toUpperCase()!==c.brand.toUpperCase()) return 'unknown';
 return c.payer;
}
export function containsSensitiveText(value: string): boolean {
 const normalized=value.normalize('NFKC').replace(/[‐‑–—−]/g,'-');
 return /(?:\d[\s-]?){13,19}/.test(normalized) || /(?:\b(?:cvv|cvc|cid|expiry|expires|exp\.?\s*date)\b|有効期限|セキュリティコード)\s*[:#]?\s*\d/i.test(normalized);
}
// Keep UUIDs compatible with the same sensitive-number checks used by the deployed
// Google bridge. A random UUID can otherwise resemble a 13–19 digit card number.
export function createRecordId():string {
 for(let attempt=0;attempt<16;attempt++){const id=crypto.randomUUID();if(!containsSensitiveText(id))return id;}
 throw new Error('識別番号を作成できませんでした。もう一度お試しください。');
}
export function reconciliation(r:Receipt):string[] {
 const messages:string[]=[]; const read=(s:string)=>minor(s,r.currency);
 const total=read(r.total), sub=read(r.subtotal);
 if(!r.currency) return ['通貨を確認してください。「$」だけでは通貨を判定しません。'];
 if(total===null) messages.push('支払金額を確認してください。');
 if(r.items.length && r.items.every(i=>read(i.amount)!==null)) {
   const sum=r.items.reduce((s,i)=>s+read(i.amount)!,0n);
   if(sub!==null && sum!==sub) messages.push(`明細合計 ${major(sum,r.currency)} と小計が一致しません。`);
 }
 for(const item of r.items) {
   const price=read(item.unitPrice), amount=read(item.amount);
   if(price!==null && amount!==null && /^\d+(\.\d{1,3})?$/.test(item.quantity)) {
     const [a,b='']=item.quantity.split('.'); const qty=BigInt(a)*1000n+BigInt(b.padEnd(3,'0'));
     if(price*qty!==amount*1000n) messages.push(`「${item.name}」の数量×単価と金額を確認してください（端数処理の可能性あり）。`);
   }
 }
 if(sub!==null && total!==null) {
   const required=[r.discount,r.service,r.tip,...(r.taxMode==='excluded'?[r.tax]:[])];
   if(r.taxMode==='unknown') messages.push('税込・税別が不明なため、支払合計の検算は保留です。');
   else if(required.some(v=>read(v)===null)) messages.push('割引・サービス料・チップ・税額の空欄は未確認です。該当なしは0を入力すると検算できます。');
   else {
     const calculated=sub-read(r.discount)!+read(r.service)!+read(r.tip)!+(r.taxMode==='excluded'?read(r.tax)!:0n);
     messages.push(calculated===total?'小計からの支払合計は一致しています。':`支払合計が不一致：計算値 ${major(calculated,r.currency)} / 入力値 ${r.total}`);
   }
 }
 return messages;
}
function obj(v:unknown):Record<string,unknown> { if(!v||typeof v!=='object'||Array.isArray(v)) throw new Error('データ形式が不正です。'); return v as Record<string,unknown>; }
function text(o:Record<string,unknown>,key:string,max=500):string {
 const v=o[key]; if(typeof v!=='string'||v.length>max||containsSensitiveText(v)) throw new Error(`項目 ${key} の形式を確認してください。カード番号全体・CVV・有効期限は保存できません。`); return v;
}
export function validateReceipt(input:unknown):Receipt {
 const o=obj(input); const r=emptyReceipt();
 for(const k of ['id','createdAt','date','time','store','address','total','subtotal','discount','tax','service','tip','payment','brand','last4','transaction','memo','user'] as const) r[k]=text(o,k,k==='memo'?2000:500);
 for(const k of ['capturedAt','importedAt'] as const){r[k]=o[k]===undefined?'':text(o,k,40);if(r[k]&&!validPhotoTimestamp(r[k]))throw new Error('撮影・取り込み日時を確認してください。');}
 r.captureSource=o.captureSource===undefined?'unknown':o.captureSource as Receipt['captureSource'];
 if(!Object.hasOwn(captureSourceLabels,r.captureSource)||(!r.capturedAt&&r.captureSource!=='unknown')||(r.capturedAt&&r.captureSource==='unknown'))throw new Error('撮影日時の取得方法を確認してください。');
 if(!/^[\w-]{1,80}$/.test(r.id)||!Number.isFinite(Date.parse(r.createdAt))) throw new Error('ID・登録日時が不正です。');
 if(!currencies.includes(o.currency as Currency)) throw new Error('通貨が不正です。'); r.currency=o.currency as Currency;
 if(!['self','wife','unknown'].includes(o.payer as string)) throw new Error('支払者が不正です。'); r.payer=o.payer as Payer;
 if(!['unknown','included','excluded'].includes(o.taxMode as string)) throw new Error('税区分が不正です。'); r.taxMode=o.taxMode as Receipt['taxMode'];
 if(r.last4&&!/^\d{4}$/.test(r.last4)) throw new Error('カード番号は下4桁のみ入力してください。');
 if(r.date && (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)) throw new Error('日付が不正です。');
 if(r.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) throw new Error('時刻が不正です。');
 for(const k of ['total','subtotal','discount','tax','service','tip'] as const) if(r[k] && minor(r[k],r.currency)===null) throw new Error('金額と通貨を確認してください。JPYは整数で入力します。');
 if(!Array.isArray(o.items)||o.items.length>500) throw new Error('明細が多すぎるか、不正です。');
 r.items=o.items.map(v=>{const a=obj(v);const i={id:text(a,'id',80),name:text(a,'name'),quantity:text(a,'quantity',20),unitPrice:text(a,'unitPrice',20),amount:text(a,'amount',20)};
   if(i.quantity&&!/^\d{1,9}(\.\d{1,3})?$/.test(i.quantity)) throw new Error('数量が不正です。');
   for(const s of [i.unitPrice,i.amount]) if(s&&minor(s,r.currency)===null) throw new Error('明細金額が不正です。');
   return i;
 });
 if(o.image!==undefined) {
   if(!(o.image instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(o.image.type)||o.image.size>25*1024*1024) throw new Error('保存画像の形式・サイズが不正です。');
   r.image=o.image;
 }
 if(o.photos!==undefined) {
   if(!Array.isArray(o.photos)||o.photos.length<1||o.photos.length>maxReceiptPhotos||o.image!==undefined)throw new Error('写真は1件につき6枚までです。');
   r.photos=o.photos.map(value=>{
     const p=obj(value);const capturedAt=text(p,'capturedAt',40),importedAt=text(p,'importedAt',40),captureSource=p.captureSource as ReceiptPhoto['captureSource'];
     if((capturedAt&&!validPhotoTimestamp(capturedAt))||(importedAt&&!validPhotoTimestamp(importedAt))||!Object.hasOwn(captureSourceLabels,captureSource)||(!capturedAt&&captureSource!=='unknown')||(capturedAt&&captureSource==='unknown'))throw new Error('写真ごとの日時を確認してください。');
     if(p.image!==undefined&&(!(p.image instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(p.image.type)||p.image.size>25*1024*1024))throw new Error('保存画像の形式・サイズが不正です。');
     return {capturedAt,importedAt,captureSource,...(p.image instanceof Blob?{image:p.image}:{})};
   });
 }
 return r;
}
export function validateSettings(input:unknown):Settings {
 const o=obj(input);
 if(!Array.isArray(o.cards)||o.cards.length>200) throw new Error('カード設定が不正です。');
 return {selfName:text(o,'selfName',40),wifeName:text(o,'wifeName',40),cards:o.cards.map(v=>{
   const c=obj(v); const last4=text(c,'last4',4);
   if(!/^\d{4}$/.test(last4)||!['self','wife'].includes(c.payer as string)) throw new Error('カード設定を確認してください。');
   return {id:text(c,'id',80),payer:c.payer as 'self'|'wife',brand:text(c,'brand',30),last4,alias:text(c,'alias',80)};
 })};
}
