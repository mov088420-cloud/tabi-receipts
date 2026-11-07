import {useEffect,useRef,useState} from 'react';
import {recognize,type OcrProgress} from './ocr';
import {defaultImageOptions} from './image-processing';
import {receiptDateCandidates,type DateCandidate} from './receipt-dates';

// A supplemental image is used only in memory: it is never a receipt photo,
// capture timestamp, persisted OCR text, or Google sync payload.
export default function DateRescan({disabled,onApply}:{disabled:boolean;onApply:(date:string)=>void}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[candidates,setCandidates]=useState<DateCandidate[]>([]),[faint,setFaint]=useState(false);
 const [progress,setProgress]=useState<OcrProgress>({status:'',progress:0});
 const controller=useRef<AbortController|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 async function read(file:File|undefined){
   if(!file||controller.current||disabled)return;
   const task=new AbortController();controller.current=task;setBusy(true);setCandidates([]);setMessage('');
   try{
     const result=await recognize(file,{...defaultImageOptions(),contrast:!faint,faint},p=>{if(mounted.current)setProgress(p);},task.signal);
     if(!mounted.current||task.signal.aborted)return;
     const dates=[...new Map([...receiptDateCandidates(result.text),...(result.dateRecovery?.candidates||[])].map(c=>[c.value,c])).values()];setCandidates(dates);
     setMessage(dates.length?'原本の日付と一致する候補を選んでください。':'日付を読み取れませんでした。ピントを合わせて撮り直すか、取引日付を手入力してください。');
   }catch(e){if(mounted.current)setMessage(task.signal.aborted?'日付の読み直しを中止しました。':e instanceof Error?e.message:'日付を読み取れませんでした。');}
   finally{controller.current=null;if(mounted.current)setBusy(false);}
 }
 return <details className="wide notice"><summary>日付だけ読み直す</summary>
   <p>日付の行が大きく写るように近づき、ピントを合わせて撮影してください。写真アプリで日付部分を切り取った画像も使えます。ほかの入力項目はそのままです。</p>
   <label className="check"><input type="checkbox" checked={faint} disabled={busy||disabled} onChange={e=>setFaint(e.target.checked)}/>日付の薄い印字を強調</label>
   <div className="actions">{[true,false].map(camera=><label key={String(camera)} className="button secondary">{camera?'日付を近くで撮る':'日付部分の画像を選ぶ'}<input type="file" aria-label={camera?'日付を近くで撮る':'日付部分の画像を選ぶ'} accept="image/*" capture={camera?'environment':undefined} disabled={busy||disabled} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void read(file);}}/></label>)}</div>
   {busy&&<div role="status"><p>{progress.status} · {Math.round(progress.progress*100)}%</p><progress value={progress.progress} max={1}/><button type="button" className="quiet" onClick={()=>controller.current?.abort()}>日付の読み直しを中止</button></div>}
   {message&&<p role="status">{message}</p>}
   {!busy&&candidates.length>0&&<div className="actions" aria-label="読み直した日付の候補">{candidates.slice(0,20).map(c=><button type="button" className="secondary" key={c.value} disabled={disabled} onClick={()=>{onApply(c.value);setMessage('取引日付へ反映しました。原本と照合してから保存してください。');}}>{c.value} を取引日付に反映<small>（読取：{c.printed}）{c.needsCentury?' 年が2桁のため20xx年の候補です。':''}{c.ambiguousOrder?' 日と月の順序を確認してください。':''}</small></button>)}</div>}
   <p className="muted">この追加写真と認識テキストは保存・送信しません。元の写真・撮影日時は変わりません。</p>
 </details>;
}
