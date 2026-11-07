import {test,expect} from '@playwright/test';
test('optional local faint-print enhancement works offline without sending the photo',async({page,context})=>{
 const external:string[]=[];context.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4173/'))external.push(r.url());});
 await page.goto('/');await expect(page.getByText('オフライン準備完了',{exact:true})).toBeVisible({timeout:60000});await context.setOffline(true);await page.reload();
 await page.getByRole('button',{name:'読み取り',exact:true}).click();await page.getByLabel('画像を選ぶ',{exact:true}).setInputFiles('tests/fixtures/faint-skewed-receipt.png');
 await page.getByLabel('薄い印字を強調',{exact:true}).check();await expect(page.locator('.scan-preview img')).toBeVisible();
 await page.getByRole('button',{name:'読み取り開始',exact:true}).click();await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('17.99',{timeout:150000});await expect(page.getByLabel('カード下4桁',{exact:true})).toHaveValue('4242');
 expect(external).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
