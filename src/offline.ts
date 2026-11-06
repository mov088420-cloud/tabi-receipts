export async function prepareOffline(update: (message: string)=>void) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    update('オフライン利用にはHTTPSが必要です'); return;
  }
  if(import.meta.env.DEV) { update('開発モード：オフライン準備対象外'); return; }
  try {
    update('オフライン用ファイルを準備中');
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    const ready=()=>update(reg.waiting?'更新あり：すべてのアプリ画面を閉じて再起動':'オフライン準備完了');
    if(reg.active && !reg.installing) ready();
    const track=()=>{
      const worker=reg.installing;
      worker?.addEventListener('statechange',()=>{
        if(worker.state==='activated'||(worker.state==='installed'&&reg.active)) ready();
        if(worker.state==='redundant') update('オフライン準備失敗：空き容量・接続を確認して再読み込み');
      });
    };
    track(); reg.addEventListener('updatefound',track);
    navigator.serviceWorker.addEventListener('controllerchange',ready);
  } catch { update('オフライン準備失敗：接続を確認して再読み込み'); }
}
