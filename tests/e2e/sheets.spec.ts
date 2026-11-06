import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('camera timestamp, review, local persistence and save-time CSV prompt',async({page})=>{
 await page.goto('/');
 await page.getByLabel('ホームから撮影').setInputFiles('tests/fixtures/receipt.png');
 await page.getByRole('button',{name:'手入力に切り替える'}).click();
 const date=await page.getByLabel('撮影日時',{exact:true}).inputValue();expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
 await expect(page.getByText(/シャッター時刻ではなく/)).toBeVisible();
 await page.getByLabel('店舗名',{exact:true}).fill('Timestamp example');await page.getByLabel('支払金額',{exact:true}).fill('2.50');await page.getByLabel('通貨',{exact:true}).selectOption('SGD');
 await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();await page.getByRole('button',{name:'確認して保存',exact:true}).click();
 await expect(page.getByLabel('保存後のCSV案内')).toBeVisible();
 const csvDownload=page.waitForEvent('download');await page.getByRole('button',{name:'表計算用CSVを保存'}).click();
 const path=await (await csvDownload).path();const text=await readFile(path!,'utf8');expect(text).toContain(date);expect(text).toContain('カメラからの取り込み時刻（目安）');
 await page.reload();await page.getByRole('button',{name:/Timestamp example/}).click();await expect(page.getByLabel('撮影日時',{exact:true})).toHaveValue(date);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('opt-in Google connection and durable offline retry without image upload',async({page,context})=>{
 const endpoint='https://script.google.com/macros/s/'+'A'.repeat(24)+'/exec',sheetUrl='https://docs.google.com/spreadsheets/d/fictional-test-sheet';
 let fail=true;const jobs:any[]=[];
 await context.route('https://script.google.com/**',async route=>{
  const body=route.request().postDataJSON();
  expect(route.request().url()).toBe(endpoint);expect(body.key).toBe('a'.repeat(64));
  const j=body.job;if(j)jobs.push(j);
  await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(!j?{ok:true,sheetUrl}:fail?{ok:false}:{ok:true,id:j.id,revision:j.revision,sheetUrl})});
 });
 await page.goto('/');await expect(page.getByText('オフライン準備完了',{exact:true})).toBeVisible({timeout:60_000});
 await page.getByRole('button',{name:'設定',exact:true}).click();
 await page.getByLabel('Google Apps ScriptのウェブアプリURL',{exact:true}).fill(endpoint);await page.getByLabel('連携キー',{exact:true}).fill('a'.repeat(64));
 await expect(page.getByRole('button',{name:'接続を確認して有効にする'})).toBeDisabled();
 await page.getByLabel('確認して保存した項目をGoogleへ自動送信し、この端末に連携キーを保存する').check();
 await page.getByRole('button',{name:'接続を確認して有効にする'}).click();await expect(page.getByRole('link',{name:'保存先のスプレッドシートを開く ↗'})).toHaveAttribute('href',sheetUrl);
 await page.getByRole('button',{name:'ホーム',exact:true}).click();await page.getByLabel('ホームから画像を選ぶ').setInputFiles('tests/fixtures/receipt-top.png');await page.getByLabel('続きの画像を追加',{exact:true}).setInputFiles('tests/fixtures/receipt-bottom.png');await page.getByRole('button',{name:'手入力に切り替える'}).click();
 await expect(page.getByLabel('撮影日時',{exact:true})).toHaveValue('');
 await page.getByLabel('店舗名',{exact:true}).fill('Queue example');await page.getByLabel('支払金額',{exact:true}).fill('4.20');await page.getByLabel('通貨',{exact:true}).selectOption('SGD');await page.getByLabel('原本画像をこの端末に保存する').check();
 await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();await page.getByRole('button',{name:'確認して保存',exact:true}).click();
 await expect(page.getByLabel('Googleへの保存状況')).toContainText('未送信分はこの端末に残っています');
 expect(jobs).toHaveLength(1);expect(jobs[0].row[20]).toBe('');expect(jobs[0].row[22]).toMatch(/^\d{4}-/);expect(jobs[0]).not.toHaveProperty('image');expect(jobs[0]).not.toHaveProperty('text');expect(jobs[0]).not.toHaveProperty('photos');expect(jobs[0].row).toHaveLength(24);await expect(page.locator('.receipt-row')).toHaveCount(1);
 await context.setOffline(true);await page.reload();await expect(page.getByLabel('Googleへの保存状況')).toContainText('送信待ち 1件');
 fail=false;await context.setOffline(false);await expect(page.getByLabel('Googleへの保存状況')).toContainText('保存を確認しました');expect(jobs).toHaveLength(2);expect(jobs[1].revision).toBe(jobs[0].revision);
 await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('button',{name:'自動送信を停止する'}).click();await expect(page.getByText('◎ この端末だけに保存',{exact:true})).toBeVisible();
 const state=await page.evaluate(()=>new Promise<any>((resolve,reject)=>{const r=indexedDB.open('tabi-receipts');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(['settings','sheetQueue']);const c=tx.objectStore('settings').get('sheets'),q=tx.objectStore('sheetQueue').getAll();tx.oncomplete=()=>{resolve({config:c.result,queue:q.result});db.close();};tx.onerror=()=>reject(tx.error);};}));
 expect(state.config).toBeUndefined();expect(state.queue).toEqual([]);
});
test('upgrades an existing v1 database without losing receipts or fabricating dates',async({page})=>{
 await page.route('**/legacy-bootstrap',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Migration fixture</title>'}));
 await page.goto('/legacy-bootstrap');
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open('tabi-receipts',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('receipts',{keyPath:'id'});req.result.createObjectStore('settings');};
  req.onsuccess=()=>{const db=req.result,tx=db.transaction('receipts','readwrite');tx.objectStore('receipts').put({id:'legacy-test',createdAt:'2026-11-06T10:00:00.000Z',date:'2026-11-06',time:'',store:'Legacy example',address:'',total:'1.20',currency:'SGD',subtotal:'',discount:'',tax:'',service:'',tip:'',taxMode:'unknown',payment:'',brand:'',last4:'',transaction:'',memo:'',payer:'unknown',user:'',items:[]});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
 }));
 await page.goto('/');await page.getByRole('button',{name:/Legacy example/}).click();await expect(page.getByLabel('撮影日時',{exact:true})).toHaveValue('');await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('1.20');
 await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();await page.getByRole('button',{name:'確認して保存',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:/Legacy example/})).toBeVisible();
});
