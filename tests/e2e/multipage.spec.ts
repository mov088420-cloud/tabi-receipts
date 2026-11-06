import {test,expect} from '@playwright/test';
async function records(page:any){return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const req=indexedDB.open('tabi-receipts');req.onsuccess=()=>{const db=req.result;const r=db.transaction('receipts').objectStore('receipts').getAll();r.onsuccess=()=>{resolve(r.result.map((v:any)=>({...v,photos:v.photos?.map((p:any)=>({...p,image:p.image?{size:p.image.size,type:p.image.type}:undefined}))})));db.close();};r.onerror=()=>reject(r.error);};}));}
test('two overlapping photos become one receipt, retain both originals, export and restore',async({page,context})=>{
 page.on('dialog',d=>d.accept());const external:string[]=[];context.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173/')&&/^https?:/.test(r.url()))external.push(r.url());});
 await page.goto('/');await expect(page.getByText('オフライン準備完了',{exact:true})).toBeVisible({timeout:60000});await context.setOffline(true);await page.reload();
 await page.getByRole('button',{name:'読み取り',exact:true}).click();await page.getByLabel('撮影する',{exact:true}).setInputFiles('tests/fixtures/receipt-top.png');
 await page.getByLabel('続きの写真を撮る',{exact:true}).setInputFiles('tests/fixtures/receipt-bottom.png');
 await expect(page.getByRole('heading',{name:/1件のレシート · 2枚/})).toBeVisible();
 await page.getByRole('button',{name:'2枚目を前へ',exact:true}).click();await page.getByRole('button',{name:'1枚目を後へ',exact:true}).click();
 await page.getByRole('button',{name:'読み取り開始',exact:true}).click();await expect(page.getByRole('heading',{name:'つなぎ目の重なりを確認'})).toBeVisible({timeout:150000});
 expect(await page.getByLabel('写真1の認識行').inputValue()).toContain('EXAMPLE GARDEN CAFE');expect(await page.getByLabel('写真2の認識行').inputValue()).toContain('17.99');
 await page.screenshot({path:'test-results/multipage-overlap.png',fullPage:true});
 await expect(page.getByLabel('2枚目の先頭から除く重複行数')).toHaveValue('0');
 const suggestion=page.getByRole('button',{name:/一致する先頭\d+行を除く/});await expect(suggestion).toBeVisible();await suggestion.click();
 await page.getByRole('button',{name:'1件のレシートとして確認',exact:true}).click();
 await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('17.99');await expect(page.getByLabel('店舗名',{exact:true})).toHaveValue('EXAMPLE GARDEN CAFE');await expect(page.getByRole('heading',{name:'商品明細 2件'})).toBeVisible();
 await page.getByRole('button',{name:'2枚目',exact:true}).click();await expect(page.getByRole('img',{name:'レシートの原本画像'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('原本画像をこの端末に保存する').check();await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();await page.getByRole('button',{name:'確認して保存',exact:true}).click();
 await expect(page.locator('.receipt-row')).toHaveCount(1);const data=await records(page);expect(data).toHaveLength(1);expect(data[0].photos).toHaveLength(2);expect(data[0].photos.every((p:any)=>p.image.size>0&&p.captureSource==='camera')).toBe(true);expect(data[0].capturedAt).toBe(data[0].photos[0].capturedAt);expect(data[0]).not.toHaveProperty('text');
 await page.reload();await page.locator('.receipt-row').click();await expect(page.getByRole('button',{name:'2枚目',exact:true})).toBeVisible();await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByLabel('バックアップ用パスワード',{exact:true}).fill('fictional-page-backup');const dl=page.waitForEvent('download');await page.getByRole('button',{name:'バックアップを作成',exact:true}).click();const backupPath=await(await dl).path();
 await page.getByRole('button',{name:'原本画像のみ削除',exact:true}).click();await expect(page.getByText('原本画像を削除しました。',{exact:true})).toBeVisible();expect((await records(page))[0].photos.every((p:any)=>!p.image)).toBe(true);
 await page.getByLabel('バックアップ用パスワード',{exact:true}).fill('fictional-page-backup');await page.getByLabel('バックアップを開く',{exact:true}).setInputFiles(backupPath!);await page.getByRole('button',{name:'全データを置き換えて復元',exact:true}).click();await expect(page.getByText('復元が完了しました。')).toBeVisible();expect((await records(page))[0].photos.every((p:any)=>p.image.size>0)).toBe(true);
 // An images-off export must remove every photo, not just the old single-image field.
 await page.getByLabel('保存済み原本画像を含める（画像合計60MBまで）').uncheck();await page.getByLabel('バックアップ用パスワード',{exact:true}).fill('fictional-page-backup');const bareDl=page.waitForEvent('download');await page.getByRole('button',{name:'バックアップを作成',exact:true}).click();const barePath=await(await bareDl).path();await page.getByLabel('バックアップ用パスワード',{exact:true}).fill('fictional-page-backup');await page.getByLabel('バックアップを開く',{exact:true}).setInputFiles(barePath!);await page.getByRole('button',{name:'全データを置き換えて復元',exact:true}).click();await expect(page.getByText('復元が完了しました。')).toBeVisible();expect((await records(page))[0].photos.every((p:any)=>!p.image)).toBe(true);
 expect(external).toEqual([]);
});
test('faint tilted receipt and background crop use real OCR',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'読み取り',exact:true}).click();await page.getByLabel('画像を選ぶ',{exact:true}).setInputFiles(['tests/fixtures/faint-skewed-receipt.png','tests/fixtures/receipt-with-background.png']);
 await page.getByLabel('明暗を補正').check();await page.getByRole('button',{name:'読み取り開始',exact:true}).click();await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('17.99',{timeout:150000});await expect(page.getByLabel('カード下4桁',{exact:true})).toHaveValue('4242');console.log('FAINT SKEW OCR',await page.locator('.metrics').innerText());
 await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();await page.getByRole('button',{name:'確認して保存',exact:true}).click();
 await page.getByText('背景を切り取る・読み取り方法を調整',{exact:true}).click();
 for(const [label,value] of [['左を切り取る','25'],['右を切り取る','25'],['上を切り取る','19'],['下を切り取る','19']])await page.getByRole('slider',{name:label,exact:true}).fill(value);
 await expect(page.locator('.scan-preview img')).toBeVisible();await page.screenshot({path:'test-results/ocr-crop-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'読み取り開始',exact:true}).click();await expect(page.getByLabel('店舗名',{exact:true})).toHaveValue('EXAMPLE GARDEN CAFE',{timeout:150000});await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('17.99');console.log('CROPPED OCR',await page.locator('.metrics').innerText());
});
test('multi-photo limits, retry, removal and manual fallback',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await page.getByRole('button',{name:'読み取り',exact:true}).click();await page.getByLabel('長いレシート（複数枚で1件）').check();
 await page.getByLabel('画像を選ぶ',{exact:true}).setInputFiles(Array.from({length:7},()=> 'tests/fixtures/receipt.png'));await expect(page.getByRole('alert')).toContainText('6枚');
 await page.getByLabel('画像を選ぶ',{exact:true}).setInputFiles(Array.from({length:6},()=> 'tests/fixtures/long-receipt.png'));await page.getByRole('button',{name:'読み取り開始',exact:true}).click();await page.getByRole('button',{name:'中止する',exact:true}).click();await expect(page.getByRole('alert')).toContainText('OCRを中止しました');await expect(page.getByRole('heading',{name:/1件のレシート · 6枚/})).toBeVisible();for(let i=0;i<6;i++)await page.getByRole('button',{name:'1枚目の写真を外す',exact:true}).click();
 await page.getByLabel('画像を選ぶ',{exact:true}).setInputFiles(['tests/fixtures/receipt-top.png','tests/fixtures/receipt-bottom.png']);await page.getByRole('button',{name:'2枚目の写真を外す',exact:true}).click();await expect(page.getByRole('heading',{name:/1件のレシート · 1枚/})).toBeVisible();
 await page.getByLabel('続きの画像を追加',{exact:true}).setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not an image')});await page.getByRole('button',{name:'読み取り開始',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible({timeout:150000});await expect(page.getByRole('button',{name:'確認して保存',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:/1件のレシート · 2枚/})).toBeVisible();
 await page.getByRole('button',{name:'2枚目の写真を外す',exact:true}).click();await page.getByLabel('続きの画像を追加',{exact:true}).setInputFiles('tests/fixtures/receipt-bottom.png');await page.getByRole('button',{name:'手入力に切り替える',exact:true}).click();await page.getByLabel('店舗名',{exact:true}).fill('Fictional manual multi-photo');await page.getByLabel('通貨',{exact:true}).selectOption('SGD');await page.getByLabel('支払金額',{exact:true}).fill('17.99');await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();await page.getByRole('button',{name:'確認して保存',exact:true}).click();
 const data=await records(page);expect(data).toHaveLength(1);expect(data[0].photos).toHaveLength(2);expect(data[0].photos.every((p:any)=>!p.image)).toBe(true);
});
