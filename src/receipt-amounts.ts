import {isPaymentLabel} from './payment-label';
import {containsSensitiveText,type Currency} from './model';
export type PaymentCandidate={value:string;printed:string;currency:Currency;placement:'same-line'|'after-label'|'before-label'|'unlabelled'};
const number='-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\s*\\.\\s*\\d{2}';
const currency='(?:SGD|USD|JPY|US\\$|SG\\$|S\\$|\\$)';
const onlyAmount=new RegExp(`^(?:${currency}\\s*)?(${number})(?:\\s*${currency})?\\s*[)]?$`,'i');
const payable=/^(?:(?:grand|net|nett)\s+)?t[o0]ta[l1i!|](?=$|\s|[:=.])|^(?:amount\s+(?:due|paid|payable)|balance\s+due|card\s+payment|payment\s+by)\b/i;
const nonPayment=/^t[o0]ta[l1i!|]\s+(?:quantity|qty|items?|savings?|discount|tax|gst|vat|service|points|cash|tender)\b/i;
const normalize=(s:string)=>s.replace(/[,\s]/g,'');
function currencies(text:string):Currency[]{
 return [...new Set([...(text.match(/\b(?:SGD|USD|JPY)(?=\b|\d)/gi)||[]).map(s=>s.toUpperCase() as Currency),...(/(?:^|[^A-Z])(?:SG|S)\$/i.test(text)?['SGD' as const]:[]),...(/\bUS\$/i.test(text)?['USD' as const]:[])])];
}
// These are explicit review choices, NEVER automatic total or currency guesses.
// Amounts near a label can belong to another row; retain the original context
// and require a user tap. The result is transient and is not part of Receipt.
export function receiptPaymentCandidates(raw:string):PaymentCandidate[]{
 const lines=raw.normalize('NFKC').replace(/[‐‑–—−]/g,'-').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),found:PaymentCandidate[]=[];
 const add=(value:string,labelIndex:number,amountIndex:number,placement:PaymentCandidate['placement'])=>{
   const context=lines.slice(Math.min(labelIndex,amountIndex),Math.max(labelIndex,amountIndex)+1).join(' / ');
   if(containsSensitiveText(context))return;
   const codes=currencies(context);if(codes.length>1)return;
   const cleaned=normalize(value);if(!/^-?\d{1,12}\.\d{2}$/.test(cleaned)||(codes[0]==='JPY'&&!cleaned.endsWith('.00')))return;
   found.push({value:cleaned,printed:context.slice(0,240),currency:codes[0]||'',placement});
 };
 for(let i=0;i<lines.length;i++){
   const label=lines[i].replace(/^[|*_=\s]+/,'');
   if((!payable.test(label)&&!isPaymentLabel(label))||nonPayment.test(label)||containsSensitiveText(label))continue;
   const paymentPart=label.replace(/\((?:incl\.?|including|inclusive of)\s+(?:gst|tax)\)/gi,'').split(/\b(?:gst|vat|tax|change|cash tendered|service charge|tip|savings?|discount)\b/i)[0];
   const inline=[...paymentPart.matchAll(new RegExp(`(?:^|[\\s$:(]|\\b(?:SGD|USD|JPY))(${number})(?=$|\\s|[)])`,'gi'))];
   for(const match of inline)add(match[1],i,i,'same-line');
   if(inline.length)continue;
   // A short bounded neighborhood tolerates OCR that outputs columns out of order.
   // Only amount-only rows qualify: product prices, tax lines and identifiers do not.
   for(const direction of [1,-1])for(let distance=1;distance<=3;distance++){
     const j=i+direction*distance;if(j<0||j>=lines.length)break;
     const candidate=lines[j],match=onlyAmount.exec(candidate);
     if(match)add(match[1],i,j,direction===1?'after-label':'before-label');
     else if(payable.test(candidate)||/^(?:sub[ -]?total|gst|vat|tax|change|cash|discount|savings?)\b/i.test(candidate))break;
   }
 }
 // If no payable-labelled evidence survived, offer standalone currency amounts.
 // This never fills the receipt automatically or treats a plain $ as SGD.
 if(!found.length){
   const otherLabel=/^(?:(?:sub[ -]?total|total\s+(?:tax|gst|quantity|qty|savings?|discount)|gst|vat|tax|cash(?:\s+tendered)?|change|discount|savings?|service(?:\s+charge)?|tips?)(?:\s+(?:@\s*)?\d+(?:\.\d+)?\s*%)?)\s*[:=]?$/i;
   for(let i=0;i<lines.length;i++){
     const match=onlyAmount.exec(lines[i]);
     if(!match||!new RegExp(currency,'i').test(lines[i])||otherLabel.test(lines[i-1]||'')||otherLabel.test(lines[i+1]||''))continue;
     add(match[1],i,i,'unlabelled');
   }
 }
 const rank={'same-line':0,'after-label':1,'before-label':2,unlabelled:3};
 const seen=new Set<string>();
 return found.sort((a,b)=>rank[a.placement]-rank[b.placement]).filter(c=>{const key=c.value+'|'+c.currency;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
}
