import {test,expect} from '@playwright/test';
import {emptyReceipt} from '../../src/model';
test('shows transaction times and sorts both directions, including missing times and dates',async({page})=>{
 await page.route('**/sort-fixture',r=>r.fulfill({contentType:'text/html',body:'<title>Sort fixture</title>'}));await page.goto('/sort-fixture');
 const rows=[['Early','2027-01-02','09:30'],['Late','2027-01-02','18:45'],['No time','2027-01-02',''],['No date','',''],['Previous','2027-01-01','23:59']].map(([store,date,time],i)=>({...emptyReceipt(),id:'sort-'+i,store,date,time,total:'1.00',currency:'SGD',createdAt:`2027-02-0${5-i}T00:00:00Z`}));
 await page.evaluate(rows=>new Promise<void>((resolve,reject)=>{const req=indexedDB.open('tabi-receipts',2);req.onupgradeneeded=()=>{req.result.createObjectStore('receipts',{keyPath:'id'});req.result.createObjectStore('settings');req.result.createObjectStore('sheetQueue',{keyPath:'id'});};req.onsuccess=()=>{const db=req.result,tx=db.transaction('receipts','readwrite');rows.forEach(r=>tx.objectStore('receipts').put(r));tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),rows);
 await page.goto('/');await expect(page.locator('.receipt-row').first()).toContainText('09:30');await page.getByRole('button',{name:'一覧',exact:true}).click();
 const names=page.locator('.receipt-title > b');await expect(names).toHaveText(['Late','Early','No time','Previous','No date']);await expect(page.locator('.receipt-row').nth(2)).toContainText('時刻未確認');
 await page.getByLabel('並び順',{exact:true}).selectOption('date-old');await expect(names).toHaveText(['Previous','Early','Late','No time','No date']);
 await page.getByRole('searchbox').fill('Early');await expect(names).toHaveText(['Early']);await page.locator('.receipt-row').click();await expect(page.getByLabel('時刻',{exact:true})).toHaveValue('09:30');await page.reload();await page.getByRole('button',{name:'一覧',exact:true}).click();await expect(page.locator('.receipt-row').first()).toContainText('18:45');
 await page.setViewportSize({width:320,height:740});await page.locator('.receipt-list').scrollIntoViewIfNeeded();await page.locator('.receipt-list').screenshot({path:'test-results/receipt-time-list.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
