import {containsSensitiveText} from './model';
// Explicit labels only: a bare four-digit row can be a date or transaction ID.
export function labelledCardTails(lines:string[]):string[]{
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
