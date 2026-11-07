import {test,expect} from '@playwright/test';
test('corrected recognition text fills missing fields without discarding edits or duplicating items',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'読み取り',exact:true}).click();await page.getByLabel('撮影する',{exact:true}).setInputFiles('tests/fixtures/receipt.png');await page.getByRole('button',{name:'読み取り開始',exact:true}).click();await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('17.99',{timeout:150000});
 const captured=await page.getByLabel('撮影日時',{exact:true}).inputValue();
 await page.getByLabel('店舗名',{exact:true}).fill('Manually corrected shop');await page.getByLabel('支払金額',{exact:true}).fill('88.00');
 for(const label of ['取引日付','店舗住所','カードブランド','カード下4桁'])await page.getByLabel(label,{exact:true}).fill('');
 while(await page.getByRole('button',{name:'明細 1 を削除',exact:true}).count())await page.getByRole('button',{name:'明細 1 を削除',exact:true}).click();
 await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();
 await page.getByText('認識したテキスト（一時表示）',{exact:true}).click();await page.getByLabel('OCR結果',{exact:true}).fill('FICTIONAL SHOP\n123 Example Rd\nNov 7, 2026\nDescription Qty Unit Price Amount\nRice 2 6.00 12.00\nTea 1 3.00 3.00\nSUBTOTAL\n15.00\nTOTAL SGD\n17.99\nMaster Card\nCard No: 0042');
 await page.getByRole('button',{name:'空欄へ再反映',exact:true}).click();await expect(page.getByText('空欄へ再反映しました。原本と照合してください。')).toBeVisible();
 await expect(page.getByLabel('店舗名',{exact:true})).toHaveValue('Manually corrected shop');await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('88.00');await expect(page.getByLabel('取引日付',{exact:true})).toHaveValue('2026-11-07');await expect(page.getByLabel('店舗住所',{exact:true})).toHaveValue('123 Example Rd');await expect(page.getByLabel('カード下4桁',{exact:true})).toHaveValue('0042');await expect(page.getByLabel('カードブランド',{exact:true})).toHaveValue('MASTERCARD');await expect(page.getByLabel('数量 1',{exact:true})).toHaveValue('2');await expect(page.getByLabel('単価 1',{exact:true})).toHaveValue('6.00');await expect(page.getByLabel('撮影日時',{exact:true})).toHaveValue(captured);await expect(page.getByRole('button',{name:'確認して保存',exact:true})).toBeDisabled();
 await page.getByLabel('支払金額',{exact:true}).fill('');await page.getByRole('button',{name:'空欄へ再反映',exact:true}).click();await expect(page.getByLabel('支払金額',{exact:true})).toHaveValue('17.99');await expect(page.getByRole('heading',{name:'商品明細 2件'})).toBeVisible();
 await page.getByLabel('金額・通貨・支払者を原本と照合しました').check();await page.getByRole('button',{name:'確認して保存',exact:true}).click();await expect(page.locator('.receipt-row')).toHaveCount(1);await page.reload();await page.locator('.receipt-row').click();await expect(page.getByLabel('カード下4桁',{exact:true})).toHaveValue('0042');await expect(page.getByLabel('OCR結果',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
