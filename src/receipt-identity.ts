import {containsSensitiveText} from './model';
export const normalizeCardMask=(text:string)=>text.normalize('NFKC').replace(/[※∗✱﹡]/g,'*');
// Explicit labels only: a bare four-digit row can be a date or transaction ID.
export function labelledCardTails(lines:string[]):string[]{
 lines=lines.map(normalizeCardMask);
 const tails:string[]=[];
 const label=/^(?:(?:(?:credit|debit)\s+)?card\s*(?:no\.?|number|#)?|(?:card\s+)?(?:last\s*(?:4|four)(?:\s*digits)?|ending(?:\s+in)?))\s*[.:#=]*\s*$/i;
 for(let i=0;i<lines.length;i++){
  let text=lines[i];
  const numericRun:string[]=[];
  for(let j=i+1;j<Math.min(lines.length,i+7)&&/^[\d\s-]+$/.test(lines[j]);j++)numericRun.push(lines[j]);
  if(containsSensitiveText(text+' '+numericRun.join(' ')))continue;
  if(label.test(text)&&lines[i+1])text+=' '+lines[i+1];
  if(/(?:[*xX•●]{2,})\s*$/.test(text)&&/^\d{4}$/.test(lines[i+1]||''))text+=' '+lines[i+1];
  if(containsSensitiveText(text))continue;
  const match=text.match(/^(?:(?:(?:credit|debit)\s+)?card\s*(?:no\.?|number|#)?|(?:card\s+)?(?:last\s*(?:4|four)(?:\s*digits)?|ending(?:\s+in)?))\s*[.:#=]*\s*(?:[*xX•●\s-]+)?(\d{4})$/i)
   ||text.match(/^(?:(?:VISA|MASTER\s*CARD|AMEX|JCB|UNIONPAY)\s*)?[*xX•●][*xX•●\s-]+(\d{4})$/i);
  if(match)tails.push(match[1]);
 }
 return [...new Set(tails)];
}
export const identityAddressLine=/(?:^\d+[A-Za-z]?[.,\s]+.*\b(?:road|street|avenue|drive|boulevard|lane|crescent|highway|gateway|walk|way|place|terrace|quay|link|close)\b|\b\d+\s+.+\b(?:rd|st|ave|dr|blvd|ln)\b|\b(?:singapore|s'pore)\s*\d{3}\s*\d{3}\b|^#\s*\d{1,3}\s*-\s*\d{1,4}\b)/i;
export function labelledAddresses(lines:string[]):string[]{
 const found:string[]=[];
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/^(?:(?:store|merchant|outlet)\s+)?address\s*[:=]\s*(.*)$/i)||lines[i].match(/^address\s*$/i);
  if(!match)continue;
  const start=match[1]?.trim();const parts=start?[start]:[];
  // Only geographically recognizable continuation lines; do not collect phone/card rows.
  for(let j=i+1;j<Math.min(lines.length,i+4)&&identityAddressLine.test(lines[j]);j++)parts.push(lines[j]);
  if(parts.length&&!parts.some(containsSensitiveText))found.push(parts.join(', '));
 }
 return [...new Set(found)];
}

// Prefer a printed venue name next to a street address over a stylized logo.
// Do not treat malls, legal entities or arbitrary nearby words as a venue name.
export function storesAboveAddresses(lines:string[],usable:(s:string)=>boolean):string[]{
 const venue=/\b(?:restaurant|bar|cafe|café|bistro|brasserie|kitchen|eatery|bakery|coffee|grill|diner|pizzeria)\b/i;
 const descriptor=/^(?:(?:restaurant|bar|cafe|café|bistro|brasserie|kitchen|eatery|bakery|coffee|grill|diner|pizzeria)|[&/,+\s]|and)+$/i;
 const excluded=/\b(?:pte|ltd|limited|mall|centre|center|operated|managed|owned|gst|uen)\b/i;
 const found:string[]=[];
 for(let i=1;i<lines.length;i++){
  if(!identityAddressLine.test(lines[i])&&!/^(?:(?:store|merchant|outlet)\s+)?address\s*[:=]/i.test(lines[i]))continue;
  let name=lines[i-1];
  if(!venue.test(name)||excluded.test(name)||!usable(name))continue;
  if(descriptor.test(name)){
   const previous=lines[i-2]||'';
   if(!usable(previous)||excluded.test(previous)||descriptor.test(previous))continue;
   name=previous+' '+name;
  }
  found.push(name);
 }
 return [...new Set(found)];
}
