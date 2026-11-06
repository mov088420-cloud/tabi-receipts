import {useEffect,useState} from 'react';
import {createRecordId,identifyPayer,reconciliation,validateReceipt,captureSourceLabels,receiptImages,withoutImages,type Receipt,type ReceiptPhoto,type Settings,type Payer} from './model';
import type {OcrResult} from './ocr';
export function BlobImage({blob}:{blob:Blob}) {
 const [url,setUrl]=useState('');
 useEffect(()=>{const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[blob]);
 return <img className="receipt-image" src={url||undefined} alt="レシートの原本画像"/>;
}
type Props={initial:Receipt;settings:Settings;source?:Blob;sourcePhotos?:ReceiptPhoto[];ocr?:OcrResult;warnings?:string[];uncertain?:string[];onSave:(r:Receipt)=>Promise<void>;onCancel:()=>void;onDelete?:()=>Promise<void>};
export default function Editor({initial,settings,source,sourcePhotos,ocr,warnings=[],uncertain=[],onSave,onCancel,onDelete}:Props) {
 const [r,setR]=useState(initial),[keep,setKeep]=useState(receiptImages(initial).length>0),[checked,setChecked]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const photos=sourcePhotos||initial.photos;
 const visiblePhotos=photos?.filter(p=>p.image);
 const images=photos?photos.flatMap(p=>p.image?[p.image]:[]):source?[source]:receiptImages(initial);
 const [photoIndex,setPhotoIndex]=useState(0);const image=images[photoIndex];
 const update=(key:keyof Receipt,value:unknown)=>{setR(s=>({...s,[key]:value,...(key==='capturedAt'?{captureSource:value?'manual' as const:'unknown' as const}:{})}));setChecked(false);};
 function field(key:keyof Receipt,label:string,type='text',placeholder='未確認',wide=false) {
   const low=!!ocr&&(uncertain.includes(key)||ocr.confidence<85||!r[key]);
   return <label className={`${wide?'wide ':''}${low?'uncertain':''}`} key={key}><span>{label}{low&&<small>要確認</small>}</span><input aria-label={label} type={type} value={String(r[key]??'')} placeholder={placeholder} inputMode={['total','subtotal','discount','tax','service','tip'].includes(key)?'decimal':key==='last4'?'numeric':undefined} maxLength={key==='last4'?4:500} onChange={e=>update(key,e.target.value)}/></label>;
 }
 async function save() {
   setError('');setSaving(true);
   try {
     if(!checked)throw new Error('原本との照合にチェックしてください。');
     if(!r.total||!r.currency)throw new Error('支払金額と通貨を入力してください。');
     const content=photos?{...withoutImages(r),photos:photos.map(p=>keep?{...p}:{capturedAt:p.capturedAt,importedAt:p.importedAt,captureSource:p.captureSource})}:{...r,image:keep?image:undefined};
     await onSave(validateReceipt(content));
   }catch(e){setError(e instanceof Error?e.message:'保存できませんでした。');}finally{setSaving(false);}
 }
 return <section className="editor"><div className="section-heading"><div><p className="eyebrow">REVIEW & SAVE</p><h2>原本と見比べて、確認</h2></div><button className="quiet" onClick={onCancel} disabled={saving}>閉じる</button></div>
 <div className="review-grid"><aside>{photos&&<p className="notice">このレシートは{photos.length}枚の写真で登録されています。{images.length===0?'原本画像は保存していません。':''}</p>}{images.length>1&&<div className="photo-tabs" aria-label="原本写真の切り替え">{images.map((_,i)=><button className={i===photoIndex?'selected':'secondary'} key={i} onClick={()=>setPhotoIndex(i)} aria-pressed={i===photoIndex}>{i+1}枚目</button>)}</div>}{visiblePhotos?.[photoIndex]&&image&&<p className="muted">この写真の撮影日時：{visiblePhotos[photoIndex].capturedAt||'不明'} / {captureSourceLabels[visiblePhotos[photoIndex].captureSource]}</p>}{image?<div className="image-frame"><BlobImage blob={image}/></div>:<div className="empty compact">原本画像はありません</div>}
 {ocr&&<div className="metrics"><span>処理時間 <b>{ocr.seconds.toFixed(1)}秒</b></span><span>OCR信頼度 <b>{ocr.confidence}%</b></span><span>{ocr.pages&&ocr.pages>1?'写真枚数':'処理画像'} <b>{ocr.pages&&ocr.pages>1?`${ocr.pages}枚`:`${ocr.width} × ${ocr.height}`}</b></span></div>}
 {ocr&&<details><summary>認識したテキスト（一時表示）</summary><textarea aria-label="OCR結果" readOnly value={ocr.text}/><p className="muted">全文は保存されません。信頼度は画像全体の値で、各項目の正しさを保証しません。</p></details>}
 </aside><div className="panel form-panel"><div className="notice">{(warnings.length?warnings:['内容を確認して保存してください。']).map((w,i)=><p key={i}>{w}</p>)}</div>
 <div className="notice"><b>写真の日時{photos&&photos.length>1?'（先頭の写真）':''}</b><p>{captureSourceLabels[r.captureSource||'unknown']}{r.captureSource==='camera'?'。シャッター時刻ではなく、撮影後アプリに戻った時刻です。':''}</p>{field('capturedAt','撮影日時','text','例：2026-11-07T14:30:00+08:00',true)}<p className="muted">末尾の +08:00 はシンガポール、+09:00 は日本の時差です。時差が付いていない写真はタイムゾーン不明として扱います。</p><p>取り込み日時：<time>{r.importedAt||'記録なし'}</time></p></div>
 <div className="fields">{field('store','店舗名','text','店舗名を入力',true)}{field('date','取引日付','date')}{field('time','時刻','time')}{field('address','店舗住所','text','住所を入力',true)}
 {field('total','支払金額')}<label><span>通貨</span><select aria-label="通貨" value={r.currency} onChange={e=>update('currency',e.target.value)}><option value="">未判定</option><option>SGD</option><option>JPY</option><option>USD</option></select></label>
 {field('subtotal','小計')}{field('discount','割引')}{field('tax','GST・税額')}<label><span>税区分</span><select value={r.taxMode} onChange={e=>update('taxMode',e.target.value)}><option value="unknown">未確認</option><option value="included">小計に税込み</option><option value="excluded">小計に税別</option></select></label>{field('service','サービス料')}{field('tip','チップ')}
 </div><div className="validation" aria-live="polite">{reconciliation(r).map((m,i)=><p key={i}>{m}</p>)}</div>
 <h3>支払いと利用者</h3><div className="fields">{field('payment','支払方法')}{field('brand','カードブランド')}{field('last4','カード下4桁')}{field('transaction','取引番号')}
 <label><span>支払者</span><select value={r.payer} onChange={e=>update('payer',e.target.value as Payer)}><option value="unknown">未判定</option><option value="self">{settings.selfName}</option><option value="wife">{settings.wifeName}</option></select></label>{field('user','実際の利用者','text','本人・妻・ふたり など')}
 </div><button className="quiet small" onClick={()=>update('payer',identifyPayer(r.brand,r.last4,settings.cards))}>カード設定から再判定</button>
 <div className="section-heading"><h3>商品明細 <small>{r.items.length}件</small></h3><button className="quiet small" onClick={()=>update('items',[...r.items,{id:createRecordId(),name:'',quantity:'',unitPrice:'',amount:''}])}>＋ 明細を追加</button></div>
 <div className="items">{r.items.map((item,index)=><div className="item-edit" key={item.id}><label className="wide"><span>商品名 {index+1}</span><input aria-label={`商品名 ${index+1}`} value={item.name} onChange={e=>update('items',r.items.map((v,i)=>i===index?{...v,name:e.target.value}:v))}/></label>{(['quantity','unitPrice','amount'] as const).map((key,i)=><label key={key}><span>{['数量','単価','金額'][i]}</span><input inputMode="decimal" aria-label={`${['数量','単価','金額'][i]} ${index+1}`} value={item[key]} onChange={e=>update('items',r.items.map((v,j)=>j===index?{...v,[key]:e.target.value}:v))}/></label>)}<button className="quiet small" aria-label={`明細 ${index+1} を削除`} onClick={()=>update('items',r.items.filter((_,i)=>i!==index))}>削除</button></div>)}</div>
 <label><span>メモ</span><textarea className="memo" value={r.memo} maxLength={2000} onChange={e=>update('memo',e.target.value)}/></label>
 {image&&<div className="notice"><label className="check"><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)}/>原本画像をこの端末に保存する</label><p>画像にはカード番号や位置情報などが含まれる場合があります。保存時は画像の内容・メタデータも残ります。{photos&&photos.length>1?` ${photos.length}枚すべてを保存します。`:null}</p></div>}
 <label className="check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>金額・通貨・支払者を原本と照合しました</label>
 {error&&<p role="alert" className="error">{error}</p>}<div className="actions"><button onClick={()=>void save()} disabled={!checked||saving}>{saving?'保存中…':'確認して保存'}</button>{onDelete&&<button className="danger" disabled={saving} onClick={async()=>{if(confirm('このレシートを削除します。元に戻せません。')){try{await onDelete();}catch{setError('削除できませんでした。');}}}}>削除</button>}</div>
 </div></div></section>;
}
