import {useEffect,useRef,useState} from 'react';
import {recognize,type OcrResult,type OcrProgress} from './ocr';
import {parseReceipt,type Parsed} from './parser';
import {emptyReceipt,type Receipt,type Settings} from './model';
import Editor,{BlobImage} from './Editor';
import {photoMetadata,selectPhotos,type PhotoInput} from './photo';
export default function Scanner({settings,onSave,onDone,initialFiles=[]}:{settings:Settings;onSave:(r:Receipt)=>Promise<void>;onDone:()=>void;initialFiles?:PhotoInput[]}) {
 const [files,setFiles]=useState<PhotoInput[]>(initialFiles),[result,setResult]=useState<OcrResult>(),[parsed,setParsed]=useState<Parsed>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState<OcrProgress>({status:'',progress:0}),[rotation,setRotation]=useState(0),[contrast,setContrast]=useState(false);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function run(photo=files[0]) {
   if(!photo||busy)return;setResult(undefined);setParsed(undefined);setError('');setBusy(true);controller.current=new AbortController();
   try {const metadata=await photoMetadata(photo);const output=await recognize(photo.file,{rotation,contrast},setProgress,controller.current.signal);setResult(output);const parsed=parseReceipt(output.text,settings);setParsed({...parsed,receipt:{...parsed.receipt,...metadata}});}
   catch(e){setError(e instanceof Error?e.message:'読み取りに失敗しました。');}finally{setBusy(false);}
 }
 function select(input:FileList|null,fromCamera=false) {
   if(!input?.length)return;const selected=Array.from(input);
   if(selected.length>20){setError('一度に選べる画像は20枚までです。');return;}
   if(selected.some(f=>f.size>25*1024*1024)||selected.reduce((s,f)=>s+f.size,0)>150*1024*1024){setError('1枚25MB、一括150MB以下にしてください。');return;}
   setFiles(selectPhotos(selected,fromCamera));setResult(undefined);setParsed(undefined);setError('');setRotation(0);setContrast(false);
 }
 async function manual(){const receipt=emptyReceipt();if(files[0])Object.assign(receipt,await photoMetadata(files[0]));setParsed({receipt,warnings:[],uncertain:[]});}
 function next() {setFiles(s=>s.slice(1));setParsed(undefined);setResult(undefined);setRotation(0);setError('');if(files.length<=1)onDone();}
 return <><p className="eyebrow">CAPTURE A MOMENT</p><h1>レシートを読み取る</h1><p className="lead">英語のレシートを、端末の中だけで読み取り。<br/>明るい場所で、文字がまっすぐ写るように撮影してください。</p>
 {!files.length&&!parsed&&<div className="capture-box"><div className="scan-symbol">▤</div><h2>旅の記録を、1枚から。</h2><div className="actions"><label className="button">撮影する<input type="file" aria-label="撮影する" accept="image/*" capture="environment" disabled={busy} onChange={e=>select(e.target.files,true)}/></label><label className="button secondary">画像を選ぶ<input type="file" aria-label="画像を選ぶ" accept="image/*" multiple disabled={busy} onChange={e=>select(e.target.files)}/></label></div><p className="muted">JPEG / PNG / WebP 推奨 · 最大20枚、1枚25MB</p><button className="quiet" onClick={()=>void manual()}>手入力ではじめる</button></div>}
 {files.length>0&&<section className="panel"><div className="section-heading"><h2>残り {files.length}枚 <small>1枚ずつ確認・保存</small></h2><button className="quiet" disabled={busy} onClick={next}>この画像をスキップ</button></div>
 {!parsed&&!busy&&<div className="scan-preview" data-rotation={rotation}><BlobImage blob={files[0].file}/></div>}
 <div className="actions"><label>回転<select aria-label="回転" disabled={busy} value={rotation} onChange={e=>setRotation(Number(e.target.value))}><option value={0}>そのまま</option><option value={90}>右90°</option><option value={180}>180°</option><option value={270}>左90°</option></select></label><label className="check"><input type="checkbox" checked={contrast} disabled={busy} onChange={e=>setContrast(e.target.checked)}/>明暗を補正</label><button disabled={busy} onClick={()=>void run()}>{result?'もう一度読み取る':'読み取り開始'}</button></div>
 {busy&&<div role="status"><p>{progress.status} · {Math.round(progress.progress*100)}%</p><progress value={progress.progress} max={1}/><button className="quiet" onClick={()=>controller.current?.abort()}>中止する</button></div>}
 {!busy&&!parsed&&<button className="quiet" onClick={()=>void manual()}>手入力に切り替える</button>}</section>}
 {error&&<p className="error" role="alert">{error}</p>}
 {parsed&&!busy&&<Editor key={parsed.receipt.id} initial={parsed.receipt} settings={settings} source={files[0]?.file} ocr={result} warnings={parsed.warnings} uncertain={parsed.uncertain} onSave={async r=>{await onSave(r);next();}} onCancel={()=>{if(confirm('未保存の読み取り結果を破棄しますか？')){setParsed(undefined);setResult(undefined);if(!files.length)onDone();}}}/>}
 <p className="privacy-note">◎ OCRは端末内で処理します。Google連携を有効にした場合だけ、確認して保存した項目を送信します。写真・OCR全文は送信しません。</p></>;
}
