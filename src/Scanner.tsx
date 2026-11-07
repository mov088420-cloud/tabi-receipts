import {useEffect,useRef,useState} from 'react';
import {recognizePages,prepareImage,type OcrResult,type OcrProgress,type ImageOptions} from './ocr';
import {defaultImageOptions,noCrop,type Crop} from './image-processing';
import {joinPageResults,overlapSuggestion,textLines} from './receipt-pages';
import {receiptDateCandidates} from './receipt-dates';
import {parseReceipt,type Parsed} from './parser';
import {emptyReceipt,maxReceiptPhotos,type Receipt,type ReceiptPhoto,type Settings} from './model';
import Editor,{BlobImage} from './Editor';
import {photoMetadata,selectPhotos,type PhotoInput} from './photo';
type ScanPhoto=PhotoInput&{id:string;options:ImageOptions};
const scanPhotos=(photos:PhotoInput[]):ScanPhoto[]=>photos.map(p=>({...p,id:crypto.randomUUID(),options:defaultImageOptions()}));
function AdjustedPreview({photo}:{photo:ScanPhoto}) {
 const [preview,setPreview]=useState<Blob>(),[error,setError]=useState('');
 useEffect(()=>{
   let active=true;setPreview(undefined);setError('');
   // Debounce slider movement: do not decode the original for every pointer event.
   const timer=setTimeout(()=>{void (async()=>{
     let canvas:HTMLCanvasElement|undefined;
     try{canvas=await prepareImage(photo.file,photo.options,true);if(!active)return;const blob=await new Promise<Blob|null>(resolve=>canvas!.toBlob(resolve,'image/jpeg',.88));if(active&&blob)setPreview(blob);}
     catch{if(active)setError('プレビューを作成できません。別の写真か手入力をお試しください。');}
     finally{if(canvas){canvas.width=1;canvas.height=1;}}
   })();},150);
   return()=>{active=false;clearTimeout(timer);};
 },[photo]);
 return <div className="scan-preview" data-rotation={photo.options.rotation}>{preview?<BlobImage blob={preview}/>:<p role="status">{error||'プレビューを調整中…'}</p>}</div>;
}
export default function Scanner({settings,onSave,onDone,initialFiles=[]}:{settings:Settings;onSave:(r:Receipt)=>Promise<void>;onDone:()=>void;initialFiles?:PhotoInput[]}) {
 const [files,setFiles]=useState<ScanPhoto[]>(()=>scanPhotos(initialFiles)),[grouped,setGrouped]=useState(false),[active,setActive]=useState(0);
 const [result,setResult]=useState<OcrResult>(),[outputs,setOutputs]=useState<OcrResult[]>(),[metadata,setMetadata]=useState<ReceiptPhoto[]>([]),[skip,setSkip]=useState<number[]>([]),[parsed,setParsed]=useState<Parsed>();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState<OcrProgress>({status:'',progress:0});
 const controller=useRef<AbortController|null>(null),running=useRef(false);
 useEffect(()=>()=>controller.current?.abort(),[]);
 function clearResults(){setResult(undefined);setParsed(undefined);setOutputs(undefined);setMetadata([]);setSkip([]);setError('');}
 function canChange(){if(busy)return false;return !(parsed||outputs)||confirm('未保存の読み取り結果と修正内容を破棄して、写真の調整に戻りますか？');}
 function review(results:OcrResult[],meta:ReceiptPhoto[],skips:number[],combine:boolean){
   const output=joinPageResults(results,skips),next=parseReceipt(output.text,settings);
   if(!receiptDateCandidates(output.text).length&&output.dateRecovery?.automatic)next.receipt.date=output.dateRecovery.automatic;
   if(meta[0])Object.assign(next.receipt,meta[0],{image:undefined});
   if(combine)next.receipt.photos=meta.map(({image:_image,...p})=>p);
   if(combine&&results.length>1)next.warnings.push('複数の写真を1件にまとめました。写真の順番、明細の重複・抜け、最終合計を確認してください。写真ごとの金額は合算していません。');
   if(!output.text.trim()||output.confidence<65)next.warnings.push('文字を十分に読み取れませんでした。写真の調整に戻って背景を切り取るか、明暗補正・読み取り方法を変更して再試行してください。');
   setResult(output);setParsed(next);
 }
 async function run(){
   if(!files.length||running.current)return;running.current=true;setBusy(true);clearResults();controller.current=new AbortController();
   const selected=grouped?files:[files[0]],signal=controller.current.signal;
   try{
     const meta:ReceiptPhoto[]=[];for(const photo of selected)meta.push({...await photoMetadata(photo),image:photo.file});
     const out=await recognizePages(selected.map(p=>({file:p.file,options:p.options})),setProgress,signal);
     if(signal.aborted)return;setOutputs(out);setMetadata(meta);setSkip(out.map(()=>0));
     if(out.length===1)review(out,meta,[0],grouped);
   }catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:'読み取りに失敗しました。');else setError('OCRを中止しました。写真は残っています。');}
   finally{running.current=false;setBusy(false);}
 }
 function select(input:FileList|null,fromCamera=false,append=false){
   if(!input?.length||!canChange())return;
   const selected=scanPhotos(selectPhotos(Array.from(input),fromCamera));const next=append?[...files,...selected]:selected;const combined=grouped||append;
   if(next.length>(combined?maxReceiptPhotos:20)){setError(combined?'1件にまとめられる写真は6枚までです。':'一度に選べる画像は20枚までです。');return;}
   if(next.some(p=>p.file.size>25*1024*1024)||next.reduce((s,p)=>s+p.file.size,0)>150*1024*1024){setError('1枚25MB、一括150MB以下にしてください。');return;}
   clearResults();setFiles(next);setGrouped(combined);setActive(append?files.length:0);
 }
 function chooseMode(value:boolean){if(value===grouped||!canChange())return;if(value&&files.length>maxReceiptPhotos){setError('1件にまとめられる写真は6枚までです。');return;}clearResults();setGrouped(value);setActive(0);}
 function changeOptions(options:ImageOptions){setFiles(rows=>rows.map((p,i)=>i===(grouped?active:0)?{...p,options}:p));}
 function remove(index:number){setFiles(rows=>rows.filter((_,i)=>i!==index));setActive(0);clearResults();}
 function move(index:number,delta:number){const next=[...files];[next[index],next[index+delta]]=[next[index+delta],next[index]];setFiles(next);setActive(index+delta);}
 async function manual(){
   if(running.current)return;running.current=true;setBusy(true);setError('');
   try{const meta:ReceiptPhoto[]=[];for(const p of (grouped?files:files.slice(0,1)))meta.push({...await photoMetadata(p),image:p.file});const receipt=emptyReceipt();if(meta[0])Object.assign(receipt,meta[0],{image:undefined});if(grouped&&meta.length)receipt.photos=meta.map(({image:_image,...p})=>p);setMetadata(meta);setParsed({receipt,warnings:[],uncertain:[]});}
   catch{setError('写真の情報を開けませんでした。');}finally{running.current=false;setBusy(false);}
 }
 function next(){clearResults();setActive(0);if(grouped||files.length<=1){setFiles([]);onDone();}else setFiles(s=>s.slice(1));}
 const current=files[grouped?active:0];
 const picker=(label:string,camera:boolean,append=false)=><label className={`button ${camera?'':'secondary'}`}>{label}<input type="file" aria-label={label} accept="image/*" capture={camera?'environment':undefined} multiple={!camera} disabled={busy} onChange={e=>{select(e.target.files,camera,append);e.target.value='';}}/></label>;
 return <><p className="eyebrow">CAPTURE A MOMENT</p><h1>レシートを読み取る</h1><p className="lead">英語のレシートを、端末の中だけで読み取り。<br/>長いレシートは上から順に、分けて撮影できます。</p>
 {!parsed&&!outputs&&<fieldset className="scan-mode" disabled={busy}><legend>写真のまとめ方</legend><label className="check"><input type="radio" name="scan-mode" checked={!grouped} onChange={()=>chooseMode(false)}/>1枚ずつ別のレシート</label><label className="check"><input type="radio" name="scan-mode" checked={grouped} onChange={()=>chooseMode(true)}/>長いレシート（複数枚で1件）</label></fieldset>}
 {!files.length&&!parsed&&<div className="capture-box"><div className="scan-symbol">▤</div><h2>{grouped?'上の部分から、順番に。':'旅の記録を、1枚から。'}</h2><div className="actions">{picker('撮影する',true)}{picker('画像を選ぶ',false)}</div><p className="muted">JPEG / PNG / WebP 推奨 · {grouped?'1件6枚':'最大20枚'}、1枚25MB</p><button disabled={busy} className="quiet" onClick={()=>void manual()}>手入力ではじめる</button></div>}
 {files.length>0&&<section className="panel"><div className="section-heading"><h2>{grouped?`1件のレシート · ${files.length}枚`:`残り ${files.length}枚`} <small>{grouped?'上 → 下の順に':'1枚ずつ確認・保存'}</small></h2>{!grouped&&!parsed&&!outputs&&<button className="quiet" disabled={busy} onClick={()=>{remove(0);if(files.length<=1)onDone();}}>この画像をスキップ</button>}</div>
 {(parsed||outputs)&&!busy?<button className="secondary" onClick={()=>{if(canChange())clearResults();}}>写真の調整に戻る</button>:<>
 {grouped&&<><p className="notice">上から下へ撮り、つなぎ目を2〜3行ほど重ねてください。レシート幅いっぱいに近づき、影や斜め撮りを避けると読み取りやすくなります。</p><div className="photo-tabs" aria-label="読み取る写真">{files.map((p,i)=><div key={p.id} className="photo-entry"><button className={active===i?'selected':'secondary'} aria-pressed={active===i} disabled={busy} onClick={()=>setActive(i)}>{i+1}枚目を調整</button><div><button className="quiet small" aria-label={`${i+1}枚目を前へ`} disabled={busy||i===0} onClick={()=>move(i,-1)}>↑</button><button className="quiet small" aria-label={`${i+1}枚目を後へ`} disabled={busy||i===files.length-1} onClick={()=>move(i,1)}>↓</button><button className="quiet small" aria-label={`${i+1}枚目の写真を外す`} disabled={busy} onClick={()=>remove(i)}>外す</button></div></div>)}</div></>}
 {!busy&&current&&<><AdjustedPreview photo={current}/><p className="muted">{grouped?`${active+1}枚目の`:'この写真の'}読み取り範囲。文字が欠けないよう確認してください。</p></>}
 {current&&<fieldset disabled={busy} className="image-options"><div className="actions"><label>回転<select aria-label="回転" value={current.options.rotation} onChange={e=>changeOptions({...current.options,rotation:Number(e.target.value),crop:noCrop()})}><option value={0}>そのまま</option><option value={90}>右90°</option><option value={180}>180°</option><option value={270}>左90°</option></select></label><label className="check"><input type="checkbox" checked={current.options.contrast} onChange={e=>changeOptions({...current.options,contrast:e.target.checked})}/>明暗を補正</label><label className="check"><input type="checkbox" checked={!!current.options.faint} onChange={e=>changeOptions({...current.options,faint:e.target.checked})}/>薄い印字を強調</label><label className="check"><input type="checkbox" checked={current.options.deskew!==false} onChange={e=>changeOptions({...current.options,deskew:e.target.checked})}/>小さな傾きを自動補正</label></div>
 <p className="muted">薄い文字が抜ける場合は「薄い印字を強調」を試してください。背景の模様も強まるため、紙の外側を切り取り、結果を原本で確認します。</p><details><summary>背景を切り取る・読み取り方法を調整</summary><p className="muted">机などの背景を外すと、文字を大きく読み取れます。元の写真は変更しません。</p><div className="crop-controls">{(['top','bottom','left','right'] as (keyof Crop)[]).map((side,i)=><label key={side}><span>{['上','下','左','右'][i]}を切り取る {current.options.crop?.[side]||0}%</span><input type="range" min="0" max="45" step="1" aria-label={`${['上','下','左','右'][i]}を切り取る`} value={current.options.crop?.[side]||0} onChange={e=>changeOptions({...current.options,crop:{...(current.options.crop||noCrop()),[side]:Number(e.target.value)}})}/></label>)}</div><button className="quiet" onClick={()=>changeOptions({...current.options,crop:noCrop()})}>切り取りをリセット</button><label><span>読み取り方法</span><select value={current.options.layout||'block'} onChange={e=>changeOptions({...current.options,layout:e.target.value as ImageOptions['layout']})}><option value="block">標準（明細の行を優先）</option><option value="auto">レイアウト自動（標準で読めない時）</option></select></label></details></fieldset>}
 {!busy&&<div className="actions">{(grouped?files.length<maxReceiptPhotos:files.length===1)&&<>{picker('続きの写真を撮る',true,true)}{picker('続きの画像を追加',false,true)}</>}<button onClick={()=>void run()}>読み取り開始</button><button className="quiet" onClick={()=>void manual()}>手入力に切り替える</button></div>}
 </>}
 {busy&&<div role="status"><p>{progress.status} · {Math.round(progress.progress*100)}%</p><progress value={progress.progress} max={1}/><button className="quiet" onClick={()=>controller.current?.abort()}>中止する</button></div>}</section>}
 {outputs&&outputs.length>1&&!parsed&&!busy&&<section className="panel"><h2>つなぎ目の重なりを確認</h2><p>同じ商品を複数購入した可能性があるため、重なった行は勝手に削除しません。2枚目以降の先頭に重複があれば、除く行数を指定してください。</p>{outputs.map((out,i)=><div className="overlap-page" key={i}><h3>{i+1}枚目 <small>信頼度 {out.confidence}%</small></h3><textarea readOnly aria-label={`写真${i+1}の認識行`} value={textLines(out.text).map((line,n)=>`${n+1}: ${line}`).join('\n')}/>{i>0&&<><label><span>{i+1}枚目の先頭から除く重複行数</span><input type="number" inputMode="numeric" min="0" max={textLines(out.text).length} value={skip[i]} onChange={e=>setSkip(values=>values.map((v,n)=>n===i?Number(e.target.value):v))}/></label>{overlapSuggestion(outputs[i-1].text,out.text)>0&&<button className="secondary" onClick={()=>setSkip(values=>values.map((v,n)=>n===i?overlapSuggestion(outputs[i-1].text,out.text):v))}>一致する先頭{overlapSuggestion(outputs[i-1].text,out.text)}行を除く</button>}</>}</div>)}<button onClick={()=>{try{review(outputs,metadata,skip,true);setError('');}catch(e){setError(e instanceof Error?e.message:'重複行数を確認してください。');}}}>1件のレシートとして確認</button><p className="muted">認識テキストは一時表示のみです。原本で確認し、次の画面で明細を修正できます。</p></section>}
 {error&&<p className="error" role="alert">{error}</p>}
 {parsed&&!busy&&<Editor key={parsed.receipt.id} initial={parsed.receipt} settings={settings} source={grouped?undefined:files[0]?.file} sourcePhotos={grouped&&metadata.length?metadata:undefined} ocr={result} warnings={parsed.warnings} uncertain={parsed.uncertain} onSave={async r=>{await onSave(r);next();}} onCancel={()=>{if(confirm('未保存の読み取り結果を破棄しますか？')){clearResults();if(!files.length)onDone();}}}/>}
 <p className="privacy-note">◎ OCRは端末内で処理します。Google連携を有効にした場合だけ、確認して保存した項目を送信します。写真・OCR全文は送信しません。</p></>;
}
