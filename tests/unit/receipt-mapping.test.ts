import {expect,it,describe} from 'vitest';
import {parseReceipt} from '../../src/parser';
import {receiptDateCandidates} from '../../src/receipt-dates';
import {initialSettings,validateReceipt} from '../../src/model';
const parse=(s:string)=>parseReceipt(s,initialSettings);
describe('printed date candidates',()=>{
 it.each(['18-Nov-26','18/Nov/26','18 November 26','Nov 18, 26','18.11.26'])('retains %s as a candidate requiring century confirmation',s=>{expect(parse(s).receipt.date).toBe('');expect(receiptDateCandidates(s)).toEqual([{value:'2026-11-18',printed:s,needsCentury:true,ambiguousOrder:false}]);});
 it('supports four-digit named years with slashes and existing historical dates',()=>{expect(parse('Date: 18/Nov/2026').receipt.date).toBe('2026-11-18');expect(parse('18-Nov-1999').receipt.date).toBe('1999-11-18');});
 it('does not invent digits in malformed dates or use an expiry date',()=>{expect(receiptDateCandidates('Date: 1X-Nov-26\nExpiry Date: 18-Nov-26')).toEqual([]);expect(receiptDateCandidates('31/02/26')).toEqual([]);expect(receiptDateCandidates('Date: 18-0ct-26')).toEqual([]);});
 it('offers both orders for an ambiguous short date without selecting either',()=>{expect(receiptDateCandidates('03/04/26').map(c=>c.value)).toEqual(['2026-04-03','2026-03-04']);expect(parse('03/04/26').receipt.date).toBe('');});
 it('prefers matching four-digit evidence and keeps genuinely different dates unresolved',()=>{expect(parse('18-Nov-26\n18-Nov-2026').receipt.date).toBe('2026-11-18');expect(parse('18-Nov-2026\n19-Nov-2026').receipt.date).toBe('');});
});
describe('store, products and payment mapping, independent of OCR engine',()=>{
 it('maps a merchant on the next line instead of the label or branch code',()=>{expect(parse('Merchant Name\nEXAMPLE SWEETS\nStore: H101\nTAX ITEM TOTAL\n1 Tea 3.00\nTOTAL SGD 3.00').receipt.store).toBe('EXAMPLE SWEETS');expect(parse('Store: H101\n18-Nov-26\nTOTAL SGD 3.00').receipt.store).toBe('');});
 it.each(['SHOPPING','SHCPPING','SH0PPING','SHPPING'])('uses the explicit footer %s with a wrapped merchant without changing its spelling',word=>{expect(parse(`EXAMPLE MALL\nTotal SGD 3.00\nTHANK YOU FOR ${word} AT\nEXAMPLE SWEETS`).receipt.store).toBe('EXAMPLE SWEETS');});
 it('joins explicit split table headers and three-line products, keeps repeats and promo negatives',()=>{
 const p=parse(`Merchant Name
EXAMPLE SWEETS
Date: 18/Nov/26
TAX ITEM
TOTAL
GST A123 COCONUT BISCUIT
1 * 3.50 EA
3.50
P001 - Promo -0.25
GST A123 COCONUT BISCUIT
1 * 3.50 EA 3.50
GST B456
COCOA BOX
2 * 4.00 EA 8.00
GRAND T0TAL
SGD
14.75`);
 expect(p.receipt).toMatchObject({store:'EXAMPLE SWEETS',total:'14.75',currency:'SGD',date:''});expect(p.receipt.items.map(({id,...item})=>item)).toEqual([{name:'COCONUT BISCUIT',quantity:'1',unitPrice:'3.50',amount:'3.50'},{name:'P001 - Promo',quantity:'',unitPrice:'',amount:'-0.25'},{name:'COCONUT BISCUIT',quantity:'1',unitPrice:'3.50',amount:'3.50'},{name:'COCOA BOX',quantity:'2',unitPrice:'4.00',amount:'8.00'}]);expect(()=>validateReceipt(p.receipt)).not.toThrow();
 });
 it('maps GST-coded single-line products rather than dropping them as taxes',()=>{const p=parse('EXAMPLE SHOP\nTAX ITEM TOTAL\nGST A123 COCOA 2.00\nGST B456 2 BISCUITS 3.00 6.00\nGST 9% of 8.00 = 0.66\nTOTAL SGD 8.00');expect(p.receipt.items).toHaveLength(2);expect(p.receipt.items[0]).toMatchObject({name:'COCOA',amount:'2.00'});expect(p.receipt.items[1]).toMatchObject({name:'BISCUITS',quantity:'2',unitPrice:'3.00',amount:'6.00'});expect(p.receipt.tax).toBe('0.66');});
 it.each(['Tota! SGD 12. 30','TOTAL: SGD 12 .30','TOTAL\nSGD\n12.30','TOTAL\n-----\n12.30'])('accepts whitespace and damaged label, not guessed amount digits: %s',s=>expect(parse(s).receipt.total).toBe('12.30'));
 it.each(['TOTAL 12.OO','TOTAL A12.30','TOTAL 12.345.67','TOTAL 12.000','TOTAL\n1 Tea 12.30','TOTAL\nSGD\n1 Tea 12.30'])('does not coerce or borrow an amount: %s',s=>expect(parse(s).receipt.total).toBe(''));
 it('does not borrow adjacent numeric rows outside a product table or after TOTAL',()=>{expect(parse('EXAMPLE SHOP\nGST A123 COCOA\n1 * 3.50 EA\n3.50').receipt.items).toEqual([]);expect(parse('EXAMPLE SHOP\nTAX ITEM TOTAL\nTOTAL SGD 3.50\nGST A123 COCOA\n1 * 3.50 EA\n3.50').receipt.items).toEqual([]);});
});

it('retains masked standalone card numbers when cleaning OCR decoration',()=>{expect(parse('EXAMPLE SHOP\n****4242\nTOTAL SGD 3.00').receipt.last4).toBe('4242');});

it('recognizes doubled multiplication marks without mistaking the quantity row for a product name',()=>{const r=parse('EXAMPLE SHOP\nTAX ITEM TOTAL\nGST A123 COCONUT BISCUIT\n1 *x 3.50 EA\n3.50\nTOTAL SGD 3.50').receipt;expect(r.items).toHaveLength(1);expect(r.items[0]).toMatchObject({name:'COCONUT BISCUIT',quantity:'1',unitPrice:'3.50',amount:'3.50'});expect(parse('EXAMPLE SHOP\nTAX ITEM TOTAL\n1 *** 3.50 EA\n3.50').receipt.items).toEqual([]);});
