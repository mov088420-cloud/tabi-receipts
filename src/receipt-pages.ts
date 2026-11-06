import type {OcrResult} from './ocr';
export const textLines=(text:string)=>text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
// A suggestion only. Even an exact repeated line can be a legitimate repeat purchase.
export function overlapSuggestion(previous:string,next:string):number {
 const a=textLines(previous),b=textLines(next);const normalized=(s:string)=>s.replace(/\s+/g,' ').toUpperCase();
 for(let n=Math.min(a.length,b.length,40);n>=2;n--){const end=a.slice(-n).map(normalized);if(new Set(end).size>=2&&end.every((s,i)=>s===normalized(b[i])))return n;}
 return 0;
}
export function joinPageResults(results:OcrResult[],skip:number[]):OcrResult {
 if(!results.length||skip.length!==results.length)throw new Error('写真の読み取り結果を確認してください。');
 const texts=results.map((r,i)=>{
   const lines=textLines(r.text),n=skip[i];if(!Number.isInteger(n)||n<0||n>lines.length||(i===0&&n!==0))throw new Error('重複行の範囲を確認してください。');
   return lines.slice(n).join('\n');
 });
 return {text:texts.join('\n'),confidence:Math.min(...results.map(r=>r.confidence)),seconds:results.reduce((s,r)=>s+r.seconds,0),width:Math.max(...results.map(r=>r.width)),height:Math.max(...results.map(r=>r.height)),pages:results.length};
}
