export type DateCandidate={value:string;printed:string;needsCentury:boolean;ambiguousOrder:boolean};
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const validDate=(y:string,m:number,d:number)=>{const v=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:'';};
// Short years are suggestions only. No current-year window, photograph date, or
// system clock is used to silently decide which century the transaction belongs to.
export function receiptDateCandidates(text:string):DateCandidate[]{
 const found:DateCandidate[]=[];
 const add=(printed:string,year:string,month:number,day:number,ambiguousOrder=false)=>{const value=validDate(year.length===2?'20'+year:year,month,day);if(value)found.push({value,printed,needsCentury:year.length===2,ambiguousOrder});};
 const named='(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
 for(const line of text.normalize('NFKC').replace(/[‐‑–—−]/g,'-').split(/\r?\n/)){
   if(/\b(?:expir|exp\.?\s*date|valid\s*(?:until|thru)|member\s*since)/i.test(line))continue;
   for(const m of line.matchAll(/\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g))add(m[0],m[1],+m[2],+m[3]);
   for(const m of line.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-]((?:19|20)\d{2}|\d{2})\b/g)){
     const a=+m[1],b=+m[2];
     if(a>12)add(m[0],m[3],b,a);
     else if(b>12)add(m[0],m[3],a,b);
     else {add(m[0],m[3],b,a,a!==b);if(a!==b)add(m[0],m[3],a,b,true);}
   }
   for(const m of line.matchAll(new RegExp(`\\b(\\d{1,2})[\\s/.-]+${named}[\\s,/.-]+((?:19|20)\\d{2}|\\d{2})\\b`,'gi')))add(m[0],m[3],months.indexOf(m[2].slice(0,3).toLowerCase())+1,+m[1]);
   for(const m of line.matchAll(new RegExp(`\\b${named}[\\s/.-]+(\\d{1,2})(?:st|nd|rd|th)?[,\\s/.-]+((?:19|20)\\d{2}|\\d{2})\\b`,'gi')))add(m[0],m[3],months.indexOf(m[1].slice(0,3).toLowerCase())+1,+m[2]);
 }
 // If the same date is also printed with four digits, prefer that direct evidence.
 return [...new Map(found.sort((a,b)=>Number(b.needsCentury)-Number(a.needsCentury)).map(c=>[c.value,c])).values()];
}
