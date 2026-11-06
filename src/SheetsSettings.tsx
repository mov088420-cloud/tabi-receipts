import {useEffect,useState} from 'react';
import {disconnectSheets,getSheetsConfig,saveReceipt,saveSheetsConfig} from './db';
import {callSheet,emptySheetsConfig} from './sheets-data';
import {download} from './csv';
import type {Receipt} from './model';
import bridgeSource from '../integrations/google-apps-script/Code.gs?raw';

export default function SheetsSettings({receipts,onRefresh}:{receipts:Receipt[];onRefresh:()=>Promise<void>}) {
 const [config,setConfig]=useState({...emptySheetsConfig}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[consent,setConsent]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;setReady(false);void getSheetsConfig().then(value=>{if(active){setConfig(value);setReady(true);}}).catch(()=>{if(active)setMessage('接続設定を読み込めません。');});return()=>{active=false;};},[receipts]);
 async function action(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'接続できませんでした。');}finally{setBusy(false);}}
 return <section className="panel"><h2>Googleスプレッドシートに自動保存</h2>
 <p>接続すると「確認して保存」のたびに、専用の表へレシートの項目・商品明細・撮影日時を送信します。画像とOCR全文は送信しません。</p>
 {config.enabled&&config.sheetUrl&&<p><a href={config.sheetUrl} target="_blank" rel="noreferrer">保存先のスプレッドシートを開く ↗</a></p>}
 <details><summary>初回の接続手順</summary><ol>
 <li>Google Apps Scriptで「新しいプロジェクト」を作成します。</li>
 <li>下のボタンでダウンロードしたコードの内容を、エディタの Code.gs に貼り付けて保存します。</li>
 <li>関数「setup」を一度実行し、Googleのアクセス許可を確認します。自分のドライブに専用の「旅のレシート帳」が作成されます。</li>
 <li>「プロジェクトの設定 → スクリプト プロパティ」で TABI_KEY をコピーします。これが連携キーです。</li>
 <li>「デプロイ → 新しいデプロイ → ウェブアプリ」で、実行するユーザーを「自分」、アクセスできるユーザーを「全員」にしてデプロイします。表の共有設定は変更しません。書き込みには連携キーが必須です。</li>
 <li>表示された /exec で終わるURLと連携キーを下に入力し、「接続を確認して有効にする」を押します。Google側の設定や組織の制限で接続できない場合は、有効になりません。</li>
 </ol><button className="secondary" onClick={()=>download(new Blob([bridgeSource],{type:'text/plain;charset=utf-8'}),'Code.gs.txt')}>Google側の設定コードを保存</button></details>
 <div className="fields"><label className="wide"><span>Google Apps ScriptのウェブアプリURL</span><input aria-label="Google Apps ScriptのウェブアプリURL" type="url" value={config.endpoint} disabled={!ready||config.enabled||busy} onChange={e=>setConfig({...config,endpoint:e.target.value.trim()})}/></label><label className="wide"><span>連携キー</span><input aria-label="連携キー" type="password" autoComplete="off" value={config.key} disabled={!ready||config.enabled||busy} onChange={e=>setConfig({...config,key:e.target.value.trim()})}/></label></div>
 <p className="muted">連携キーはこの端末の保存領域に保存します。バックアップ・CSV・公開コードには含めません。キーを知る人は専用の表へ書き込めるため、他人に共有しないでください。</p>
 {!config.enabled&&<><label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>確認して保存した項目をGoogleへ自動送信し、この端末に連携キーを保存する</label><button disabled={!ready||busy||!consent} onClick={()=>void action(async()=>{const result=await callSheet(config);const next={...config,...result,enabled:true};await saveSheetsConfig(next);setConfig(next);await onRefresh();setMessage('接続を確認しました。次に保存するレシートから自動送信します。');})}>接続を確認して有効にする</button></>}
 {config.enabled&&<div className="actions"><button disabled={busy} className="secondary" onClick={()=>{if(confirm(`この端末の${receipts.length}件を、接続済みのGoogleスプレッドシートへ送信しますか？`))void action(async()=>{for(const r of receipts)await saveReceipt(r);await onRefresh();setMessage('保存済みのレシートを送信待ちに追加しました。');});}}>保存済みの全レシートも送信</button><button disabled={busy} className="quiet" onClick={()=>void action(async()=>{await disconnectSheets();setConfig({...emptySheetsConfig});setConsent(false);await onRefresh();setMessage('自動送信を停止し、端末の連携キーを削除しました。送信中の処理は完了する場合があります。');})}>自動送信を停止する</button></div>}
 {message&&<p className="notice" role="status">{message}</p>}
 <p className="muted">オフライン・送信失敗時は端末に保留し、アプリを開いている間に再送します。アプリを閉じている間は送信しません。端末での削除はGoogle側へ反映しません。表を直接編集した内容も端末へ戻りません。バックアップ復元時は自動送信を停止するので、再接続してください。</p></section>;
}
