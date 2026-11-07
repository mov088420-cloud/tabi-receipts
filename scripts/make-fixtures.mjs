import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
await mkdir('tests/fixtures',{recursive:true});
function receipt(extra=[]) {
 const lines=['EXAMPLE GARDEN CAFE','123 Example Road','Singapore 000000','06/11/2026  12:34','RECEIPT: DEMO-001','', '2  Chicken Rice        12.00','1  Iced Tea             3.00',...extra,'','SUBTOTAL               15.00','SERVICE CHARGE          1.50','GST 9%                  1.49','TOTAL SGD              17.99','','VISA **** **** **** 4242','THANK YOU','FICTIONAL TEST RECEIPT'];
 const h=lines.length*48+100;
 return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${h}"><rect width="100%" height="100%" fill="white"/><g font-family="monospace" font-size="38" fill="#111">${lines.map((line,i)=>`<text x="60" y="${70+i*48}">${line}</text>`).join('')}</g></svg>`);
}
await sharp(receipt()).png().toFile('tests/fixtures/receipt.png');
await sharp(receipt(Array.from({length:45},(_,i)=>`REFERENCE NOTE ${i+1}`))).png().toFile('tests/fixtures/long-receipt.png');
await sharp(receipt()).rotate(90).png().toFile('tests/fixtures/rotated-receipt.png');
// Two overlapping photos of one fictional receipt, plus faint/tilted print for OCR regression.
const source=await sharp(receipt()).png().toBuffer();
await sharp(source).extract({left:0,top:0,width:1000,height:430}).png().toFile('tests/fixtures/receipt-top.png');
await sharp(source).extract({left:0,top:325,width:1000,height:591}).png().toFile('tests/fixtures/receipt-bottom.png');
await sharp(source).rotate(3,{background:'#fff'}).linear(.35,150).png().toFile('tests/fixtures/faint-skewed-receipt.png');
await sharp({create:{width:2000,height:1516,channels:3,background:'#777'}}).composite([{input:source,left:500,top:300}]).png().toFile('tests/fixtures/receipt-with-background.png');
// Fictional retail layout: intentionally separate merchant, table headings,
// quantities and totals. No user receipt text or image is used in this fixture.
const retailLines=['Merchant Name','FICTIONAL SWEETS','12 Example Gateway','Singapore 000000','Date: 18/Nov/26','','TAX ITEM','TOTAL','GST A123 COCONUT BISCUIT','1 * 3.50 EA','3.50','P001 - Promo -0.25','GST A123 COCONUT BISCUIT','1 * 3.50 EA 3.50','','TOTAL','SGD','6.75','','FICTIONAL TEST RECEIPT'];
const retail=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1100"><rect width="100%" height="100%" fill="white"/><g font-family="monospace" font-size="36" fill="#111">${retailLines.map((line,i)=>`<text x="60" y="${70+i*48}">${line}</text>`).join('')}</g></svg>`);
await sharp(retail).png().toFile('tests/fixtures/retail-receipt.png');

// Fictional close-up for the date-only retry; no user receipt content.
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="160"><rect width="100%" height="100%" fill="white"/><text x="50" y="100" font-family="monospace" font-size="54" fill="#111">Date: 23/09/2027</text></svg>')).png().toFile('tests/fixtures/date-closeup.png');
