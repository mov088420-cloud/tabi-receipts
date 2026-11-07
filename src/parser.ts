import {isPaymentLabel} from './payment-label';
import {labelledCardTails,labelledAddresses,identityAddressLine,normalizeCardMask,storesAboveAddresses} from './receipt-identity';
import {receiptDateCandidates} from './receipt-dates';
import {createRecordId,emptyReceipt,identifyPayer,type Settings,type Receipt,type Item,containsSensitiveText} from './model';
export type Parsed={receipt:Receipt;warnings:string[];uncertain:string[]};
const safe=(s:string)=>containsSensitiveText(s)?'':s;
const moneyToken='(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\s*\\.\\s*\\d{2}';
const currencyToken='(?:SGD|USD|JPY|SG\\$|S\\$|US\\$|\\$)';
const moneyEnd=new RegExp(`(^|[^\\w.,+\\-])(?:${currencyToken}\\s*)?(-?${moneyToken})\\s*(?:${currencyToken}|[A-Z])?$`,'i');
const moneyOnly=new RegExp(`^\\s*(?:${currencyToken}\\s*)?(-?${moneyToken})\\s*(?:${currencyToken})?\\s*$`,'i');
const stripMoney=(s:string)=>s.replace(/[,\s]/g,'');
const moneyAtEnd=(s:string)=>{const m=moneyEnd.exec(s);return m?{amount:stripMoney(m[2]),prefix:s.slice(0,m.index+m[1].length).trim()}:null;};
const normalizedLabel=(s:string)=>s.toLowerCase().replace(/\bt[o0]ta[l1i!|](?=\s|$|[:.=])/g,'total').replace(/\((?:incl\.?|including|inclusive\s+of)\s+(?:gst|tax)\)/g,'').replace(/\b(?:sgd|usd|jpy)\b|(?:us|s)?\$/g,'').replace(/\((\d+(?:\.\d+)?\s*%)\)/g,' $1 ').replace(/[:：=]/g,' ').replace(/^[|*._-]+|[|*._-]+$/g,' ').replace(/\s+/g,' ').trim();
type MoneyKey='total'|'subtotal'|'discount'|'tax'|'service'|'tip';
function moneyLabel(s:string):MoneyKey|undefined {
 const label=normalizedLabel(s);
 if(isPaymentLabel(s))return 'total';
 if(/^sub[ -]?total$/.test(label))return 'subtotal';
 if(/^(?:(?:total|member|promo) )?(?:discount|savings?)(?: \d+(?:\.\d+)?\s*%)?$/.test(label))return 'discount';
 if(new RegExp(`^(?:gst|vat|tax)\\s+\\d+(?:\\.\\d+)?\\s*%\\s+of\\s+${moneyToken}$`,'i').test(label))return 'tax';
 if(/^(?:(?:\d+(?:\.\d+)?\s*%)\s*)?(?:gst|vat|tax)(?: (?:amount|included|inclusive|incl\.?))?(?: (?:@\s*)?\d+(?:\.\d+)?\s*%)?$/.test(label))return 'tax';
 if(/^(?:(?:\d+(?:\.\d+)?\s*%)\s*)?(?:service(?: charge| fee)?|svc(?: chg| charge)?|s\/?c)(?: (?:@\s*)?\d+(?:\.\d+)?\s*%)?$/.test(label))return 'service';
 if(/^(?:tips?|gratuity)$/.test(label))return 'tip';
}
const administrative=/^(?:tax\s+invoice|receipt|invoice|transaction|address|date|time|tel(?:ephone)?|phone|fax|gst\s*(?:reg|no)|uen|table|server|cashier|pax|order|bill|auth|approval|terminal|batch|pos\b|staff\b|operator\b|merchant\s*id|reference|ref\b|rrn\b|aid\b|tvr\b|tsi\b|www\.|https?:|thank\b|welcome\b|customer\s*copy|merchant\s*copy)/i;
const addressLine=identityAddressLine;
const summaryLine=/^(?:(?:\d+(?:\.\d+)?\s*%\s*)?(?:sub[ -]?total|grand\s+total|total|amount\s+(?:due|paid|payable)|net(?:t)?\s+total|balance|gst|vat|tax|service|svc|s\/c|discount|savings?|tip|gratuity)|cash\b|change\b|rounding\b|visa\b|master\s*card\b|amex\b|payment\b|tender\b|paid\b)/i;
const itemHeader=/^tax\s+ite[nm]\s+total$|\b(?:item|description|product)\b.*\b(?:qty|quantity|price|amount|total)\b|^\s*(?:qty|quantity)\b.*\b(?:item|description|product)\b/i;
const numericProductRow=/^[\d\s.,*x×@'’"=:+\-£OIlZz]*(?:EA|EN|EACH|PCS?)[\d\s.,*x×@'’"=:+\-£OIlZz]*$/i;
function parseItem(line:string,quantityAfterName:boolean):Item|null {
 if(numericProductRow.test(line))return null;
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
 const candidates=receiptDateCandidates(lines.join('\n'));
 const explicit=candidates.filter(c=>!c.needsCentury);
 if(candidates.some(c=>c.needsCentury)){uncertain.push('date');warnings.push('年が2桁の日付は、取引日付の下に候補を表示しています。西暦を確認して選んでください。');}
 if(explicit.length===1)return explicit[0].value;
 if(explicit.length>1&&explicit.every(c=>c.ambiguousOrder)&&new Set(explicit.map(c=>c.printed)).size===1){uncertain.push('date');warnings.push('日付は日/月/年の候補です。取引日付の下で月/日/年との取り違えを確認できます。');return explicit[0].value;}
 if(explicit.length>1){warnings.push('日付候補が複数あります。取引日付の下で原本に合う候補を選んでください。');uncertain.push('date');}
 return '';
}
const trimDecoration=(s:string)=>s.replace(/^[|{}<>=_%:;~]+\s*|\s+[|{}<>=_%:;~]+$/g,'').trim();
// Rejoin only explicit table headings split by OCR; never reorder arbitrary lines.
function receiptLines(raw:string):string[]{
 const input=raw.normalize('NFKC').split(/\r?\n/).map(l=>trimDecoration(l.replace(/\((SGD|USD|JPY|SG\$|S\$|US\$)\)/gi,' $1 ').replace(/[‐‑–—−]/g,'-').replace(/\u00a0/g,' '))).filter(Boolean),out:string[]=[];
 for(let i=0;i<input.length;i++){
   if(/^(?:tax\s+)?(?:item|description|product)(?:\s+(?:qty|quantity|unit|price))*$/i.test(input[i])&&/^(?:total|amount)$/i.test(input[i+1]||'')){out.push(input[i]+' '+input[++i]);}
   else out.push(input[i]);
 }
 return out;
}
const retailCode=/^(?:GST|VAT|TAX)\s+[A-Z0-9-]*\d[A-Z0-9-]*\s+/i;
const retailCodeOnly=/^(?:GST|VAT|TAX)\s+[A-Z0-9-]*\d[A-Z0-9-]*$/i;
const productName=(s:string)=>s.replace(retailCode,'').trim();
export function parseReceipt(raw:string,settings:Settings):Parsed {
 const r=emptyReceipt(),warnings=['OCRの候補です。原本と照合してから保存してください。'],uncertain:string[]=[];
 // Normalize typography only; do not turn O into 0 or guess missing digits.
 const lines=receiptLines(raw),text=lines.join('\n');
 const used=new Set<number>(),candidates:Record<MoneyKey,string[]>={total:[],subtotal:[],discount:[],tax:[],service:[],tip:[]};
 for(let i=0;i<lines.length;i++){
   const tail=moneyAtEnd(lines[i]),field=moneyLabel(tail?tail.prefix:lines[i]);
   if(!field)continue;
   let nextIndex=i+1;
   if(!tail)while(nextIndex<=i+3&&new RegExp(`^(?:${currencyToken}|[-=_]{2,})$`,'i').test(lines[nextIndex]||''))nextIndex++;
   if(nextIndex>i+3)continue;
   const next=moneyOnly.exec(lines[nextIndex]||'');
   const amount=tail?.amount||(next?stripMoney(next[1]):'');
   used.add(i);if(amount){candidates[field].push(field==='discount'?amount.replace(/^-/,''):amount);if(!tail&&next)for(let j=i+1;j<=nextIndex;j++)used.add(j);}
 }
 const labels:Record<MoneyKey,string>={total:'支払金額',subtotal:'小計',discount:'割引',tax:'税額',service:'サービス料',tip:'チップ'};
 for(const field of Object.keys(candidates) as MoneyKey[]){const values=[...new Set(candidates[field].map(v=>Number(v)===0?'0.00':v))];if(values.length===1)r[field]=values[0];else if(values.length>1){warnings.push(`${labels[field]}の候補が複数あります。原本で確認してください。`);uncertain.push(field);}}
 const currencyMatches=[...new Set([...(text.match(/\b(?:SGD|USD|JPY)\b/gi)||[]).map(s=>s.toUpperCase()),...(/(?:^|[^A-Z])(?:SG|S)\$/i.test(text)?['SGD']:[]),...(/\bUS\$/i.test(text)?['USD']:[])])];
 if(currencyMatches.length===1)r.currency=currencyMatches[0] as Receipt['currency'];
 r.date=parseDates(lines,warnings,uncertain);

 const times=[...new Set(lines.filter(l=>!/^\s*(?:open|opening|hours|business hours|closed)\b/i.test(l)).flatMap(l=>[...l.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM)?\b/gi)].flatMap(m=>{let h=Number(m[1]);if(m[3]){if(h<1||h>12)return [];h=h%12+(m[3].toUpperCase()==='PM'?12:0);}return [`${String(h).padStart(2,'0')}:${m[2]}`];})))];if(times.length===1)r.time=times[0];else if(times.length>1)uncertain.push('time');
 const brands=[...new Set((text.match(/\b(?:visa|master\s*card|amex|american express|unionpay|jcb)\b/gi)||[]).map(b=>b.toUpperCase().replace(/MASTER\s+CARD/,'MASTERCARD').replace('AMERICAN EXPRESS','AMEX')))];if(brands.length===1)r.brand=brands[0];
 const cardLines=lines.map(normalizeCardMask),tails:string[]=labelledCardTails(cardLines);
 for(const line of cardLines){
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
 const merchantLabel=/^(?:merchant(?: name)?|store(?: name)?|outlet)\s*[:=]?\s*$/i;
 const usableStore=(v:string)=>!!v&&!!safe(v)&&/[A-Za-z]{3}/.test(v)&&!administrative.test(v)&&!addressLine.test(v)&&!summaryLine.test(v)&&!itemHeader.test(v)&&!moneyOnly.test(v)&&!receiptDateCandidates(v).length;
 const named=lines.flatMap((line,i)=>{const m=line.match(/^(?:merchant(?: name)?|store(?: name)?|outlet)\s*[:=]\s*(.+)$/i);const value=m?.[1]||(merchantLabel.test(line)?lines[i+1]||'':'');return usableStore(value)?[trimDecoration(value)]:[];});
 const addressStores=storesAboveAddresses(lines.slice(0,Math.min(40,boundary)),usableStore);
 if(new Set(named).size===1)r.store=named[0];
 else if(!named.length&&addressStores.length===1)r.store=addressStores[0];
 else if(!named.length&&addressStores.length>1){warnings.push('住所付近の店名候補が複数あります。原本で確認してください。');}
 else if(!named.length){const store=header.find(l=>usableStore(l)&&!merchantLabel.test(l)&&!/^(?:merchant(?: name)?|store(?: name)?|outlet)\s*[:=]/i.test(l)&&!/^\s*(?:SGD|USD|JPY|S\$|US\$)\s*$/i.test(l)&&!/[\d]{7}/.test(l));r.store=safe(store||'');}
 const footerStores=[...new Set(lines.flatMap((line,i)=>{const m=line.match(/^[^A-Za-z0-9]*THANK\s+YOU\s+FOR\s+SH[O0C]?PPING\s+AT(?:\s+(.+))?$/i);const value=m?(m[1]||lines[i+1]||''):'';return usableStore(value)?[trimDecoration(value)]:[];}))];
 if(!named.length&&!addressStores.length&&footerStores.length===1)r.store=footerStores[0];
 uncertain.push('store','address');
 const addresses=labelledAddresses(lines);
 r.address=addresses.length===1?addresses[0]:addresses.length>1?'':header.filter(l=>addressLine.test(l)).map(safe).filter(Boolean).join(', ');
 if(addresses.length>1)warnings.push('住所候補が複数あります。原本の店舗住所を確認してください。');
 const transactions=lines.flatMap(l=>{const m=l.match(/^(?:receipt|invoice|transaction|bill)\s*(?:(?:no\.?|number|id|#)\s*[.:#]*|[.:#]+)\s*([\w/-]+)(?=\s*$|\s+date\s*[.:#])/i);return m&&safe(m[1])?[m[1]]:[];});if(new Set(transactions).size===1)r.transaction=transactions[0];else if(transactions.length>1)uncertain.push('transaction');
 if(/(?:inclusive\s+of|includes?|incl\.?)\s+(?:gst|tax)/i.test(text)||/(?:gst|tax)\s+(?:included|inclusive)/i.test(text))r.taxMode='included';else if(/(?:exclusive\s+of|excl\.?)\s+(?:gst|tax)/i.test(text))r.taxMode='excluded';
 let inItems=false,quantityAfterName=false;
 for(let i=0;i<lines.length;i++){
   const line=lines[i];if(itemHeader.test(line)){inItems=true;quantityAfterName=/\b(?:item|description|product)\b.*\b(?:qty|quantity)\b/i.test(line);continue;}
   // GST is also a product tax-code column. A wrapped item requires an explicit
   // item table and a fully numeric quantity/unit/amount row, not just a GST prefix.
   if(inItems&&retailCodeOnly.test(line))continue;
   const taxCodedItem=/^(?:GST|VAT|TAX)\s+[A-Z0-9-]*\d[A-Z0-9-]*\s+.+[A-Za-z]/i.test(line);
   if(inItems&&!used.has(i)&&!numericProductRow.test(line)&&(!summaryLine.test(line)||taxCodedItem)&&!moneyAtEnd(line)&&/[A-Za-z]/.test(line)&&safe(line)&&!administrative.test(line)&&!addressLine.test(line)){
     let next=lines[i+1]||'',consumed=1;
     if(new RegExp(`^\\d{1,4}(?:\\.\\d{1,3})?\\s*[*x×@]{1,2}\\s*(?:${currencyToken}\\s*)?${moneyToken}\\s+(?:EA|EACH|PCS?)$`,'i').test(next)&&moneyOnly.test(lines[i+2]||'')){next+=' '+lines[i+2];consumed=2;}
     const numeric=new RegExp(`^(?:(\\d{1,4}(?:\\.\\d{1,3})?)\\s*(?:[x×@*'’]{1,2}\\s*)?\\s+)?(?:(?:${currencyToken}\\s*)?(${moneyToken})\\s+(?:(?:EA|EACH|PCS?)\\s+)?)?(?:${currencyToken}\\s*)?(-?${moneyToken})\\s*(?:${currencyToken})?$`,'i').exec(next);
     if(numeric&&!used.has(i+1)){r.items.push({id:createRecordId(),name:productName(line),quantity:numeric[1]||'',unitPrice:numeric[2]?stripMoney(numeric[2]):'',amount:stripMoney(numeric[3])});uncertain.push('items');i+=consumed;continue;}
     const partial=moneyAtEnd(next);
     if(!used.has(i+1)&&partial&&/^[\d\s.,*x×@'’"=:+\-£OIlZz]*(?:(?:EA|EN|EACH|PCS?)[\d\s.,*x×@'’"=:+\-£OIlZz]*)?$/i.test(partial.prefix)&&partial.prefix.trim()){r.items.push({id:createRecordId(),name:productName(line),quantity:'',unitPrice:'',amount:partial.amount});uncertain.push('items');warnings.push('数量・単価が読めない明細があります。金額だけを候補として取り込みました。');i+=consumed;continue;}
   }
   if(inItems&&taxCodedItem){const retail=parseItem(productName(line),quantityAfterName);if(retail){r.items.push(retail);uncertain.push('items');continue;}}
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
