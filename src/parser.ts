import {createRecordId, emptyReceipt, identifyPayer, type Settings, type Receipt, containsSensitiveText } from './model';
export type Parsed = {receipt:Receipt; warnings:string[]; uncertain:string[]};
export function parseReceipt(raw:string,settings:Settings):Parsed {
 const r=emptyReceipt(); const warnings=['OCRの候補です。原本と照合してから保存してください。']; const uncertain:string[]=[];
 const lines=raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const safe=(s:string)=>containsSensitiveText(s)?'':s;
 const lastMoney=(line:string)=>line.match(/(-?\d[\d,]*\.\d{2})\s*(?:SGD|USD|JPY|S\$|US\$|[A-Z])?$/i)?.[1].replace(/,/g,'')||'';
 const totalLabel=/^(?:grand\s+total|total(?:\s+(?:amount|due|paid|payable))?|amount\s+(?:due|paid|payable)|net\s+total|balance\s+due)(?:\s*\((?:incl\.?|including|inclusive\s+of)\s+(?:gst|tax)\))?\s*(?:[:：=]\s*)?(?:SGD|S\$|USD|US\$|JPY|\$)?\s*$/i;
 const totalCandidates:string[]=[];
 for(let lineIndex=0;lineIndex<lines.length;lineIndex++) {
   const line=lines[lineIndex],money=lastMoney(line);
   const amountStart=money?line.search(/-?\d[\d,]*\.\d{2}\s*(?:SGD|USD|JPY|S\$|US\$|[A-Z])?$/i):-1;
   const nextLine=lines[lineIndex+1]||'';
   if(totalLabel.test(line)&&/^(?:SGD|USD|JPY|S\$|US\$|\$)?\s*-?\d[\d,]*\.\d{2}\s*(?:SGD|USD|JPY)?$/i.test(nextLine)){totalCandidates.push(lastMoney(nextLine));lineIndex++;continue;}
   if(money&&totalLabel.test(line.slice(0,amountStart))) totalCandidates.push(money);
   else if(/\bsub[ -]?total\b/i.test(line)&&money) r.subtotal=money;
   else if(/\b(?:discount|saving)\b/i.test(line)&&money) r.discount=money.replace('-','');
   else if(/\b(?:gst|vat|tax)\b/i.test(line)&&money) r.tax=money;
   else if(/\bservice\s*(?:charge|fee)?\b/i.test(line)&&money) r.service=money;
   else if(/\b(?:tip|gratuity)\b/i.test(line)&&money) r.tip=money;
   else if(money&&!/\b(?:cash|change|balance|total|visa|mastercard|payment|tender|gst|tax|service|rounding)\b/i.test(line)) {
     const m=line.match(/^(?:(\d+(?:\.\d{1,3})?)\s+(?:x\s+)?)?(.+?)\s+(?:(\d+\.\d{2})\s+)?(-?\d[\d,]*\.\d{2})\s*$/i);
     if(m&&safe(m[2])) r.items.push({id:createRecordId(),name:m[2],quantity:m[1]||'',unitPrice:m[3]||'',amount:m[4].replace(/,/g,'')});
   }
 }
 const uniqueTotals=[...new Set(totalCandidates)];
 if(uniqueTotals.length===1) r.total=uniqueTotals[0]; else if(uniqueTotals.length>1) warnings.push('合計候補が複数あります。支払金額を手入力してください。');
 const currencyMatches=[...new Set([...(raw.match(/\b(?:SGD|USD|JPY)\b/gi)||[]).map(s=>s.toUpperCase()),...(/S\$/i.test(raw)?['SGD']:[]),...(/US\$/i.test(raw)?['USD']:[])])];
 if(currencyMatches.length===1) r.currency=currencyMatches[0] as Receipt['currency'];
 const iso=raw.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/);
 const dmy=raw.match(/\b(\d{2})[/-](\d{2})[/-](20\d{2})\b/);
 const month=raw.match(/\b(\d{1,2})[\s-]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]+(20\d{2})\b/i);
 if(iso) r.date=`${iso[1]}-${iso[2]}-${iso[3]}`;
 else if(dmy) { r.date=`${dmy[3]}-${dmy[2]}-${dmy[1]}`; if(Number(dmy[1])<=12) {warnings.push('日付は日/月/年の候補です。月/日/年との取り違えを確認してください。');uncertain.push('date');} }
 else if(month) r.date=`${month[3]}-${String(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month[2].toLowerCase())+1).padStart(2,'0')}-${month[1].padStart(2,'0')}`;
 if(r.date&&(!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)) r.date='';
 const time=raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?\s*(AM|PM)?\b/i);
 if(time) {let h=Number(time[1]); if(time[3]&&h<=12) h=h%12+(time[3].toUpperCase()==='PM'?12:0);r.time=`${String(h).padStart(2,'0')}:${time[2]}`;}
 const brands=[...new Set((raw.match(/\b(?:visa|mastercard|amex|american express|unionpay|jcb)\b/gi)||[]).map(b=>b.toUpperCase().replace('AMERICAN EXPRESS','AMEX')))];
 if(brands.length===1) r.brand=brands[0];
 const tails=[...raw.matchAll(/(?:[*Xx•]{2,}[\s*-]*)+(\d{4})\b|(?:ending\s+(?:in\s+)?|last\s*4\s*[:#]?\s*)(\d{4})\b/gi)].map(m=>m[1]||m[2]);
 // Asterisks are commonly recognized as s/k/o. Require a card-brand prefix,
 // 8+ mask-like characters and exactly 4 terminal digits; never derive digits from letters.
 for(const line of lines) {
   const masked=line.match(/^(?:VISA|MASTERCARD|AMEX|JCB|UNIONPAY)\s+([*xX•#skKoO -]{8,})\s+(\d{4})$/);
   if(masked&&/[skKoO]/.test(masked[1])){tails.push(masked[2]);uncertain.push('last4');warnings.push('カードのマスク文字に認識の揺れがあります。下4桁の候補を原本で確認してください。');}
 }
 if(new Set(tails).size===1) r.last4=tails[0]; else if(tails.length>1) warnings.push('カード下4桁の候補が複数あるため未判定です。');
 if(r.brand||r.last4) r.payment='カード'; else if(/\bCASH\b/i.test(raw)) r.payment='現金（要確認）';
 r.payer=identifyPayer(r.brand,r.last4,settings.cards);
 const store=lines.slice(0,4).find(l=>/[A-Za-z]{3}/.test(l)&&!/(receipt|invoice|welcome|tax|date|tel|www\.|https?:)/i.test(l)&&!/\d{3}/.test(l));
 r.store=safe(store||''); uncertain.push('store');
 r.address=lines.filter(l=>/\b(?:road|street|avenue|drive|boulevard|lane|singapore\s+\d{6}|\d+\s+.*\brd\b|\d+\s+.*\bst\b)\b/i.test(l)).map(safe).filter(Boolean).join(', '); uncertain.push('address');
 const tx=raw.match(/(?:receipt|invoice|transaction)\s*(?:no\.?|number|#|id)?\s*[:#]\s*([\w-]+)/i);
 r.transaction=safe(tx?.[1]||'');
 if(/(?:inclusive\s+of|includes?|incl\.?)\s+(?:gst|tax)/i.test(raw)||/(?:gst|tax)\s+(?:included|inclusive)/i.test(raw)) r.taxMode='included';
 else if(/(?:exclusive\s+of|excl\.?)\s+(?:gst|tax)/i.test(raw)) r.taxMode='excluded';
 return {receipt:r,warnings,uncertain};
}
