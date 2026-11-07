import {receiptDateCandidates,type DateCandidate} from './receipt-dates';
export type DateRecovery={candidates:DateCandidate[];automatic:string;attempts:number};
export type DateRead={text:string;confidence:number};
export type DateLine={text:string;bbox:{x0:number;y0:number;x1:number;y1:number}};
// Find damaged date-shaped text without replacing any characters with digits.
export function dateRetryLines(lines:DateLine[],width:number,height:number):DateLine[]{
 return lines.filter(l=>!/(?:expir|valid\s*(?:until|thru)|member\s*since)/i.test(l.text)&&(/\bdate\b/i.test(l.text)||/[\dA-Za-z]{1,4}\s*[/.-]\s*(?:\d{1,2}|[A-Za-z]{3})\s*[/.-]\s*(?:\d{2}|\d{4})\b/.test(l.text))&&Object.values(l.bbox).every(Number.isFinite)&&l.bbox.x0>=0&&l.bbox.y0>=0&&l.bbox.x1<=width&&l.bbox.y1<=height&&l.bbox.x1>l.bbox.x0&&l.bbox.y1>l.bbox.y0).slice(0,2);
}
export function dateRecovery(reads:DateRead[],attempts=reads.length):DateRecovery {
 const groups=reads.map(r=>receiptDateCandidates(r.text));
 const candidates=[...new Map(groups.flat().map(c=>[c.value,c])).values()];
 // Agreement across two recognitions is additional evidence, not guaranteed accuracy.
 // Ambiguous order, short years and any conflicting reading remain tap-to-confirm.
 const automatic=candidates.length===1&&reads.filter((r,i)=>r.confidence>=85&&groups[i].length===1&&!groups[i][0].needsCentury&&!groups[i][0].ambiguousOrder).length>=2?candidates[0].value:'';
 return {candidates,automatic,attempts};
}
export function mergeDateRecoveries(values:(DateRecovery|undefined)[]):DateRecovery|undefined {
 const recoveries=values.filter((v):v is DateRecovery=>!!v);if(!recoveries.length)return undefined;
 const candidates=[...new Map(recoveries.flatMap(v=>v.candidates).map(c=>[c.value,c])).values()];
 return {candidates,automatic:candidates.length===1&&recoveries.some(v=>v.automatic===candidates[0].value)?candidates[0].value:'',attempts:recoveries.reduce((n,v)=>n+v.attempts,0)};
}
