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
