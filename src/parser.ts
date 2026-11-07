import {createRecordId,emptyReceipt,identifyPayer,type Settings,type Receipt,type Item,containsSensitiveText} from './model';
export type Parsed={receipt:Receipt;warnings:string[];uncertain:string[]};
const safe=(s:string)=>containsSensitiveText(s)?'':s;
const moneyToken='(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}';
const currencyToken='(?:SGD|USD|JPY|S\\$|US\\$|\\$)';
const moneyEnd=new RegExp(`(?:${currencyToken}\\s*)?(-?${moneyToken})\\s*(?:${currencyToken}|[A-Z])?$`,'i');
const moneyOnly=new RegExp(`^\\s*(?:${currencyToken}\\s*)?(-?${moneyToken})\\s*(?:${currencyToken})?\\s*$`,'i');
const stripMoney=(s:string)=>s.replace(/,/g,'');
const moneyAtEnd=(s:string)=>{const m=moneyEnd.exec(s);return m?{amount:stripMoney(m[1]),prefix:s.slice(0,m.index).trim()}:null;};
const normalizedLabel=(s:string)=>s.toLowerCase().replace(/\((?:incl\.?|including|inclusive\s+of)\s+(?:gst|tax)\)/g,'').replace(/\b(?:sgd|usd|jpy)\b|(?:us|s)?\$/g,'').replace(/\((\d+(?:\.\d+)?\s*%)\)/g,' $1 ').replace(/[:：=]/g,' ').replace(/\s+/g,' ').trim();
type MoneyKey='total'|'subtotal'|'discount'|'tax'|'service'|'tip';
function moneyLabel(s:string):MoneyKey|undefined {
 const label=normalizedLabel(s);
 if(/^(?:card payment|payment by)\s+(?:visa|master\s*card|amex|jcb|unionpay)$/.test(label))return 'total';
 if(/^(?:grand total|total(?: amount)?(?: due|paid|payable)?|amount (?:due|paid|payable)|net(?:t)? total|balance due)$/.test(label))return 'total';
 if(/^sub[ -]?total$/.test(label))return 'subtotal';
 if(/^(?:(?:total|member|promo) )?(?:discount|savings?)(?: \d+(?:\.\d+)?\s*%)?$/.test(label))return 'discount';
 if(new RegExp(`^(?:gst|vat|tax)\\s+\\d+(?:\\.\\d+)?\\s*%\\s+of\\s+${moneyToken}$`,'i').test(label))return 'tax';
 if(/^(?:(?:\d+(?:\.\d+)?\s*%)\s*)?(?:gst|vat|tax)(?: (?:amount|included|inclusive|incl\.?))?(?: (?:@\s*)?\d+(?:\.\d+)?\s*%)?$/.test(label))return 'tax';
 if(/^(?:(?:\d+(?:\.\d+)?\s*%)\s*)?(?:service(?: charge| fee)?|svc(?: chg| charge)?|s\/?c)(?: (?:@\s*)?\d+(?:\.\d+)?\s*%)?$/.test(label))return 'service';
 if(/^(?:tips?|gratuity)$/.test(label))return 'tip';
}
const administrative=/^(?:tax\s+invoice|receipt|invoice|transaction|date|time|tel(?:ephone)?|phone|fax|gst\s*(?:reg|no)|uen|table|server|cashier|pax|order|bill|auth|approval|terminal|batch|pos\b|staff\b|operator\b|merchant\s*id|reference|ref\b|rrn\b|aid\b|tvr\b|tsi\b|www\.|https?:|thank\b|welcome\b|customer\s*copy|merchant\s*copy)/i;
const addressLine=/(?:\b(?:road|street|avenue|drive|boulevard|lane|crescent|highway|gateway)\b|\b\d+\s+.+\b(?:rd|st|ave|dr|blvd|ln)\b|\b(?:singapore|s'pore)\s*\d{6}\b|^#\d{1,3}-\d{1,4}\b)/i;
const summaryLine=/^(?:(?:\d+(?:\.\d+)?\s*%\s*)?(?:sub[ -]?total|grand\s+total|total|amount\s+(?:due|paid|payable)|net(?:t)?\s+total|balance|gst|vat|tax|service|svc|s\/c|discount|savings?|tip|gratuity)|cash\b|change\b|rounding\b|visa\b|master\s*card\b|amex\b|payment\b|tender\b|paid\b)/i;
const itemHeader=/^tax\s+ite[nm]\s+total$|\b(?:item|description|product)\b.*\b(?:qty|quantity|price|amount|total)\b|^\s*(?:qty|quantity)\b.*\b(?:item|description|product)\b/i;
function parseItem(line:string,quantityAfterName:boolean):Item|null {
 if(/^[\d\s.,*x×@'’"=:+\-£OIlZz]*(?:EA|EN|EACH|PCS?)[\d\s.,*x×@'’"=:+\-£OIlZz]*$/i.test(line))return null;
 const last=moneyAtEnd(line);if(!last)return null;
 let name=last.prefix,quantity='',unitPrice='';
 // Two monetary columns: only the explicitly printed price is used, never total/quantity.
 const price=moneyAtEnd(name);if(price){unitPrice=price.amount;name=price.prefix.replace(/\s*@$/,'');}
 let m=name.match(/^(\d{1,4}(?:\.\d{1,3})?)\s*[x×]\s+(.+)$/i);
 if(m){quantity=m[1];name=m[2];}
 else {
   m=name.match(/^(.+?)\s+(\d{1,4}(?:\.\d{1,3})?)\s*[x×@]$/i);
   if(m){name=m[1];quantity=m[2];}
   else if(quantityAfterName&&(m=name.match(/^(.+?)\s+(\d{1,4}(?:\.\d{1,3})?)$/))){name=m[1];quantity=m[2];}
   else if(!quantityAfterName&&(m=name.match(/^(\d{1,4}(?:\.\d{1,3})?)\s+(.+)$/))){quantity=m[1];name=m[2];}
 }
 name=name.trim();if(!/[A-Za-z]/.test(name)||!safe(name)||administrative.test(name)||addressLine.test(name)||summaryLine.test(name)||itemHeader.test(name))return null;
 return {id:createRecordId(),name,quantity,unitPrice,amount:last.amount};
}
function parseDates(lines:string[],warnings:string[],uncertain:string[]):string {
 const candidates:string[]=[];
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const add=(year:string,month:string,day:string)=>{const d=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;if(Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)candidates.push(d);};
 for(const line of lines){
   if(/\b(?:expir|exp\.?\s*date|valid\s*(?:until|thru)|member\s*since)/i.test(line))continue;
   for(const m of line.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g))add(m[1],m[2],m[3]);
   for(const m of line.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/g)){
     if(Number(m[2])>12&&Number(m[1])<=12)add(m[3],m[1],m[2]);
     else {add(m[3],m[2],m[1]);if(Number(m[1])<=12&&Number(m[2])<=12){uncertain.push('date');warnings.push('日付は日/月/年の候補です。月/日/年との取り違えを確認してください。');}}
   }
   const month='(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
   for(const m of line.matchAll(new RegExp(`\\b(\\d{1,2})[\\s-]+${month}[\\s,-]+(20\\d{2})\\b`,'gi')))add(m[3],String(months.indexOf(m[2].toLowerCase())+1),m[1]);
   for(const m of line.matchAll(new RegExp(`\\b${month}[\\s-]+(\\d{1,2})(?:st|nd|rd|th)?[,\\s-]+(20\\d{2})\\b`,'gi')))add(m[3],String(months.indexOf(m[1].toLowerCase())+1),m[2]);
 }
 const unique=[...new Set(candidates)];if(unique.length>1){warnings.push('日付候補が複数あります。取引日付を確認してください。');uncertain.push('date');}return unique.length===1?unique[0]:'';
}
export function parseReceipt(raw:string,settings:Settings):Parsed {
 const r=emptyReceipt(),warnings=['OCRの候補です。原本と照合してから保存してください。'],uncertain:string[]=[];
 // Normalize typography only; do not turn O into 0 or guess missing digits.
 const lines=raw.normalize('NFKC').split(/\r?\n/).map(l=>l.replace(/[‐‑–—−]/g,'-').replace(/\u00a0/g,' ').trim()).filter(Boolean),text=lines.join('\n');
 const used=new Set<number>(),candidates:Record<MoneyKey,string[]>={total:[],subtotal:[],discount:[],tax:[],service:[],tip:[]};
 for(let i=0;i<lines.length;i++){
   const tail=moneyAtEnd(lines[i]),field=moneyLabel(tail?tail.prefix:lines[i]);
   if(!field)continue;
   const next=moneyOnly.exec(lines[i+1]||'');
   const amount=tail?.amount||(next?stripMoney(next[1]):'');
   used.add(i);if(amount){candidates[field].push(field==='discount'?amount.replace(/^-/,''):amount);if(!tail&&next)used.add(i+1);}
 }
 const labels:Record<MoneyKey,string>={total:'支払金額',subtotal:'小計',discount:'割引',tax:'税額',service:'サービス料',tip:'チップ'};
 for(const field of Object.keys(candidates) as MoneyKey[]){const values=[...new Set(candidates[field].map(v=>Number(v)===0?'0.00':v))];if(values.length===1)r[field]=values[0];else if(values.length>1){warnings.push(`${labels[field]}の候補が複数あります。原本で確認してください。`);uncertain.push(field);}}
 const currencyMatches=[...new Set([...(text.match(/\b(?:SGD|USD|JPY)\b/gi)||[]).map(s=>s.toUpperCase()),...(/(?:^|[^A-Z])S\$/i.test(text)?['SGD']:[]),...(/\bUS\$/i.test(text)?['USD']:[])])];
 if(currencyMatches.length===1)r.currency=currencyMatches[0] as Receipt['currency'];
 r.date=parseDates(lines,warnings,uncertain);
 if(!r.date&&/\b\d{1,2}[\s/.-]+(?:[A-Za-z]{3,9}|\d{1,2})[\s/.-]+\d{2}\b/.test(text)){warnings.push('年が2桁の日付は西暦を確定できません。原本を確認して取引日付を入力してください。');uncertain.push('date');}
 const times=[...new Set(lines.filter(l=>!/^\s*(?:open|opening|hours|business hours|closed)\b/i.test(l)).flatMap(l=>[...l.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM)?\b/gi)].flatMap(m=>{let h=Number(m[1]);if(m[3]){if(h<1||h>12)return [];h=h%12+(m[3].toUpperCase()==='PM'?12:0);}return [`${String(h).padStart(2,'0')}:${m[2]}`];})))];if(times.length===1)r.time=times[0];else if(times.length>1)uncertain.push('time');
 const brands=[...new Set((text.match(/\b(?:visa|master\s*card|amex|american express|unionpay|jcb)\b/gi)||[]).map(b=>b.toUpperCase().replace(/MASTER\s+CARD/,'MASTERCARD').replace('AMERICAN EXPRESS','AMEX')))];if(brands.length===1)r.brand=brands[0];
 const tails:string[]=[];
 for(const line of lines){
   // Never derive the tail from a full PAN. Masked, labelled endings remain candidates.
   if(containsSensitiveText(line))continue;
   for(const m of line.matchAll(/(?:[*Xx•#]{2,}[\s*-]*)+(\d{4})(?!\d|[\s-]+\d)|(?:ending\s+(?:in\s+)?|last\s*4\s*[:#]?\s*)(\d{4})(?!\d)/gi))tails.push(m[1]||m[2]);
   const explicit=line.match(/^(?:(?:credit|debit)\s+)?card\s*(?:no\.?|number|#)?\s*[:#]\s*(\d{4})$/i);if(explicit)tails.push(explicit[1]);
   const damaged=line.match(/^(?:VISA|MASTER\s*CARD|AMEX|JCB|UNIONPAY)\s+([*xX•#skKoO -]{8,})\s+(\d{4})$/i);if(damaged&&/[skKoO]/.test(damaged[1])){tails.push(damaged[2]);uncertain.push('last4');}
 }
 if(new Set(tails).size===1)r.last4=tails[0];else if(tails.length>1){warnings.push('カード下4桁の候補が複数あるため未判定です。');uncertain.push('last4');}
 if(r.brand||r.last4)r.payment='カード';else if(/\bCASH\b/i.test(text))r.payment='現金（要確認）';else if(/\bPAYNOW\b/i.test(text))r.payment='PayNow（要確認）';else if(/\bNETS\b/i.test(text))r.payment='NETS（要確認）';
 r.payer=identifyPayer(r.brand,r.last4,settings.cards);
 const headerIndex=lines.findIndex(l=>itemHeader.test(l));
 const moneyIndex=lines.findIndex((l,i)=>!used.has(i)&&!administrative.test(l)&&!addressLine.test(l)&&!!moneyAtEnd(l));
 const boundary=headerIndex>=0?headerIndex:moneyIndex>=0?moneyIndex:lines.length;
 const header=lines.slice(0,Math.min(16,boundary));
 const named=header.map(l=>l.match(/^(?:merchant(?: name)?|store(?: name)?|outlet)\s*:\s*(.+)$/i)?.[1]).filter((v):v is string=>!!v&&!!safe(v));
 if(new Set(named).size===1)r.store=named[0];
 else if(named.length===0){const store=header.find(l=>/[A-Za-z]{3}/.test(l)&&!administrative.test(l)&&!addressLine.test(l)&&!summaryLine.test(l)&&!/^\s*(?:SGD|USD|JPY|S\$|US\$)\s*$/i.test(l)&&!/^\d/.test(l)&&!/[\d]{7}/.test(l));r.store=safe(store||'');}
 const footerStores=[...new Set(lines.flatMap(l=>{const m=l.match(/^[^A-Za-z0-9]*THANK\s+YOU\s+FOR\s+SHOPPING\s+AT\s+(.+)$/i);return m&&safe(m[1])?[m[1]]:[];}))];
 if(!named.length&&footerStores.length===1)r.store=footerStores[0];
 uncertain.push('store','address');
 r.address=header.filter(l=>addressLine.test(l)).map(safe).filter(Boolean).join(', ');
 const transactions=lines.flatMap(l=>{const m=l.match(/^(?:receipt|invoice|transaction|bill)\s*(?:(?:no\.?|number|id|#)\s*[.:#]*|[.:#]+)\s*([\w/-]+)(?=\s*$|\s+date\s*[.:#])/i);return m&&safe(m[1])?[m[1]]:[];});if(new Set(transactions).size===1)r.transaction=transactions[0];else if(transactions.length>1)uncertain.push('transaction');
 if(/(?:inclusive\s+of|includes?|incl\.?)\s+(?:gst|tax)/i.test(text)||/(?:gst|tax)\s+(?:included|inclusive)/i.test(text))r.taxMode='included';else if(/(?:exclusive\s+of|excl\.?)\s+(?:gst|tax)/i.test(text))r.taxMode='excluded';
 let inItems=false,quantityAfterName=false;
 for(let i=0;i<lines.length;i++){
   const line=lines[i];if(itemHeader.test(line)){inItems=true;quantityAfterName=/\b(?:item|description|product)\b.*\b(?:qty|quantity)\b/i.test(line);continue;}
   // GST is also a product tax-code column. A wrapped item requires an explicit
   // item table and a fully numeric quantity/unit/amount row, not just a GST prefix.
   const taxCodedItem=/^(?:GST|VAT|TAX)\s+[A-Z0-9-]*\d[A-Z0-9-]*\s+.+[A-Za-z]/i.test(line);
   if(inItems&&!used.has(i)&&(!summaryLine.test(line)||taxCodedItem)&&!moneyAtEnd(line)&&/[A-Za-z]/.test(line)&&safe(line)&&!administrative.test(line)&&!addressLine.test(line)){
     const next=lines[i+1]||'';
     const numeric=new RegExp(`^(?:(\\d{1,4}(?:\\.\\d{1,3})?)\\s*(?:[x×@*'’]\\s*)?\\s+)?(?:(?:${currencyToken}\\s*)?(${moneyToken})\\s+(?:(?:EA|EACH|PCS?)\\s+)?)?(?:${currencyToken}\\s*)?(-?${moneyToken})\\s*(?:${currencyToken})?$`,'i').exec(next);
     if(numeric&&!used.has(i+1)){r.items.push({id:createRecordId(),name:line,quantity:numeric[1]||'',unitPrice:numeric[2]?stripMoney(numeric[2]):'',amount:stripMoney(numeric[3])});uncertain.push('items');i++;continue;}
     const partial=moneyAtEnd(next);
     if(!used.has(i+1)&&partial&&/^[\d\s.,*x×@'’"=:+\-£OIlZz]*(?:(?:EA|EN|EACH|PCS?)[\d\s.,*x×@'’"=:+\-£OIlZz]*)?$/i.test(partial.prefix)&&partial.prefix.trim()){r.items.push({id:createRecordId(),name:line,quantity:'',unitPrice:'',amount:partial.amount});uncertain.push('items');warnings.push('数量・単価が読めない明細があります。金額だけを候補として取り込みました。');i++;continue;}
   }
   if(used.has(i)||summaryLine.test(line)){
     // An unreadable product's following rows may still be valid items.
     if(!taxCodedItem)inItems=false;
     continue;
   }
   if(administrative.test(line)||addressLine.test(line))continue;
   const item=parseItem(line,quantityAfterName);if(item){r.items.push(item);uncertain.push('items');}
 }
 if(!r.total)warnings.push('支払金額を抽出できませんでした。「認識したテキスト」で合計の文字を確認してください。');
 if(!r.currency)warnings.push('通貨は未判定です。「$」だけではSGDとUSDを区別できません。');
 return {receipt:r,warnings:[...new Set(warnings)],uncertain:[...new Set(uncertain)]};
}
// Explicit re-application fills missing fields only; never discard edits or append duplicate items.
export function fillMissingFields(current:Receipt,candidate:Receipt,settings:Settings):Receipt {
 const next={...current};
 const currencyConflict=!!current.currency&&!!candidate.currency&&current.currency!==candidate.currency;
 const cardConflict=!!current.brand&&!!candidate.brand&&current.brand.toUpperCase()!==candidate.brand.toUpperCase()||!!current.last4&&!!candidate.last4&&current.last4!==candidate.last4;
 const moneyFields=new Set(['total','subtotal','discount','tax','service','tip','currency']);
 const cardFields=new Set(['brand','last4','payment']);
 for(const key of ['store','address','date','time','total','currency','subtotal','discount','tax','service','tip','payment','brand','last4','transaction'] as const){
   if(currencyConflict&&moneyFields.has(key)||cardConflict&&cardFields.has(key))continue;
   if(!next[key]&&candidate[key])Object.assign(next,{[key]:candidate[key]});
 }
 if(!currencyConflict){if(next.taxMode==='unknown')next.taxMode=candidate.taxMode;if(next.items.length===0)next.items=candidate.items;}
 if(next.payer==='unknown')next.payer=identifyPayer(next.brand,next.last4,settings.cards);
 return next;
}
