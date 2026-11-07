import {describe,it,expect} from 'vitest';
import {parseReceipt,fillMissingFields} from '../../src/parser';
import {initialSettings,emptyReceipt,validateReceipt} from '../../src/model';
const settings={...initialSettings,cards:[{id:'wife-card',payer:'wife' as const,brand:'MASTERCARD',last4:'0042',alias:'wallet'}]};
const parse=(text:string)=>parseReceipt(text,settings);
describe('receipt field mapping across English layouts',()=>{
 it('maps a labelled receipt with split totals, named date, trailing quantities and a masked card',()=>{
 const p=parse(`TAX INVOICE
Customer Copy
Merchant Name: FICTIONAL HARBOUR CAFE
123 Example Rd
#02-12 Example Centre
Singapore 000000
Invoice No. DEMO-002
Date: November 7, 2026 7:05 PM
Description Qty Unit Price Amount
Chicken Rice 2 6.00 12.00
Iced Tea 1 S$3.00 S$3.00
SUB TOTAL
SGD 15.00
SVC CHG 10%
S$ 1.50
GST 9%
S$ 1.49
GRAND TOTAL
SGD 17.99
Master Card
Card No: XXXX-XXXX-XXXX-0042`);
 expect(p.receipt).toMatchObject({store:'FICTIONAL HARBOUR CAFE',address:'123 Example Rd, #02-12 Example Centre, Singapore 000000',date:'2026-11-07',time:'19:05',transaction:'DEMO-002',subtotal:'15.00',service:'1.50',tax:'1.49',total:'17.99',currency:'SGD',brand:'MASTERCARD',last4:'0042',payer:'wife'});
 expect(p.receipt.items.map(({id,...i})=>i)).toEqual([{name:'Chicken Rice',quantity:'2',unitPrice:'6.00',amount:'12.00'},{name:'Iced Tea',quantity:'1',unitPrice:'3.00',amount:'3.00'}]);expect(()=>validateReceipt(p.receipt)).not.toThrow();
 });
 it('joins wrapped items only inside an explicit item table',()=>{
 const p=parse('EXAMPLE CAFE\nQTY DESCRIPTION PRICE AMOUNT\nChicken Rice\n2 x 6.00 12.00\nTea\n3.00\nTOTAL SGD 15.00');
 expect(p.receipt.items.map(({id,...i})=>i)).toEqual([{name:'Chicken Rice',quantity:'2',unitPrice:'6.00',amount:'12.00'},{name:'Tea',quantity:'',unitPrice:'',amount:'3.00'}]);
 expect(parse('EXAMPLE CAFE\n15.00\nTOTAL SGD 15.00').receipt.items).toEqual([]);
 });
 it('accepts currency amounts in item rows and explicit multiplication',()=>{
 const p=parse('EXAMPLE CAFE\n2x Chicken Rice S$6.00 S$12.00\nIced Tea 1 x 3.00 3.00\nTOTAL S$15.00');
 expect(p.receipt.items).toHaveLength(2);expect(p.receipt.items[0]).toMatchObject({quantity:'2',name:'Chicken Rice',unitPrice:'6.00',amount:'12.00'});expect(p.receipt.items[1]).toMatchObject({quantity:'1',name:'Iced Tea',unitPrice:'3.00'});
 });
 it.each([['2026/11/7','2026-11-07'],['7.11.2026','2026-11-07'],['11/17/2026','2026-11-17'],['7-November-2026','2026-11-07'],['Nov 7th, 2026','2026-11-07']])('reads date %s',(text,want)=>expect(parse(text).receipt.date).toBe(want));
 it('does not choose between different dates or invent the century',()=>{expect(parse('7 Nov 2026\n8 Nov 2026').receipt.date).toBe('');expect(parse('7/11/26').receipt.date).toBe('');expect(parse('Expiry: 8 Nov 2026\n7 Nov 2026').receipt.date).toBe('2026-11-07');});
 it('does not turn US dollars into mixed SGD and USD',()=>{expect(parse('TOTAL US$ 12.00').receipt.currency).toBe('USD');expect(parse('TOTAL $ 12.00').receipt.currency).toBe('');expect(parse('SGD 12.00\nUSD 9.00').receipt.currency).toBe('');});
 it('keeps ambiguous fees empty rather than selecting the last one',()=>{const p=parse('GST 1.20\nGST 1.30\nTOTAL SGD 12.00');expect(p.receipt.tax).toBe('');expect(p.uncertain).toContain('tax');});
 it('never confuses amount paid with tendered cash, change, savings, or metadata',()=>{
 const r=parse('EXAMPLE CAFE\n1 Tea 3.00\nAmount Paid: SGD 3.00\nCash Tendered 10.00\nChange 7.00\nTotal Savings 1.00\nReceipt No 123.45\nGST Reg No 123.45').receipt;
 expect(r.total).toBe('3.00');expect(r.discount).toBe('1.00');expect(r.items).toHaveLength(1);
 });
 it('does not treat an adjacent product as the amount of a label',()=>{const r=parse('TOTAL\n1 Tea 3.00\nGST\n1 Cake 4.00').receipt;expect(r.total).toBe('');expect(r.tax).toBe('');expect(r.items).toHaveLength(2);});
 it('reads explicit four-digit card fields and rejects full PANs and conflicting endings',()=>{
 expect(parse('Master Card\nCard No: 0042').receipt).toMatchObject({last4:'0042',payer:'wife'});
 expect(parse('Master Card\nCard No: 4111 1111 1111 0042').receipt.last4).toBe('');
 expect(parse('Master Card\nCard No: 0042\nVISA **** 4242').receipt.payer).toBe('unknown');
 });
 it('preserves numeric store names while excluding address, greeting and receipt headers',()=>{expect(parse('Welcome\nTAX INVOICE\nCustomer Copy\nCAFE 123\n123 Example Street\n1 Tea 3.00\nTOTAL SGD 3.00').receipt.store).toBe('CAFE 123');});
 it('preserves user edits, metadata and existing items when filling empty fields',()=>{
 const current={...emptyReceipt(),store:'Corrected Store',total:'99.00',currency:'SGD' as const,brand:'VISA',last4:'4242',items:[{id:'manual-item',name:'Manual Tea',quantity:'1',unitPrice:'',amount:'99.00'}]};
 const candidate=parse('Other Store\n7 Nov 2026\n2 Rice 12.00\nTOTAL SGD 12.00\nMASTERCARD ****0042').receipt;
 const next=fillMissingFields(current,candidate,settings);expect(next).toMatchObject({id:current.id,store:current.store,total:current.total,date:'2026-11-07',brand:'VISA',last4:'4242',payer:'unknown',items:current.items});expect(next).not.toHaveProperty('text');
 });
});

it('does not combine incompatible currencies or conflicting card identities on re-application',()=>{
 const candidate=parse('EXAMPLE CAFE\n1 Tea 3.00\nTOTAL USD 3.00\nMaster Card\nCard No: 0042').receipt;
 const next=fillMissingFields({...emptyReceipt(),currency:'SGD',brand:'VISA'},candidate,settings);
 expect(next.total).toBe('');expect(next.items).toEqual([]);expect(next.last4).toBe('');expect(next.payer).toBe('unknown');
});
it('supports percentage parentheses and explicit unit-price markers',()=>{
 const r=parse('EXAMPLE CAFE\n2 Rice @ 6.00 12.00\nGST (9%) 1.08\nTOTAL SGD 13.08').receipt;
 expect(r.tax).toBe('1.08');expect(r.items[0]).toMatchObject({name:'Rice',quantity:'2',unitPrice:'6.00'});
 expect(parse('Card XXXX 1234 5678').receipt.last4).toBe('');
});

describe('thermal retail receipts (fictional data only)',()=>{
 it('keeps GST-coded items, EA units and repeated purchases, with promo adjustments',()=>{
  const r=parse(`EXAMPLE SWEET SHOP
12 Example Gateway
#01-010
Singapore 000000
Receipt .: DEMO-123 Date .: 18-Nov-2026
Time .: 14:35
TAX ITEM TOTAL
GST A123 COCONUT BISCUIT
1 * 3.50 EA 3.50
P001 - Promo -0.25
GST A123 COCONUT BISCUIT
1 * 3.50 EA 3.50
P001 - Promo -0.25
GST B456 COCOA BOX
2 * 4.00 EA 8.00
Total 14.50
Card payment VISA SGD 14.50
GST 9.00% of 14.50 = 1.20
GST INCLUDED`).receipt;
  expect(r).toMatchObject({store:'EXAMPLE SWEET SHOP',address:'12 Example Gateway, #01-010, Singapore 000000',transaction:'DEMO-123',date:'2026-11-18',time:'14:35',total:'14.50',tax:'1.20',taxMode:'included',currency:'SGD',brand:'VISA',last4:'',payer:'unknown',discount:''});
  expect(r.items).toHaveLength(5);expect(r.items[0]).toMatchObject({name:'COCONUT BISCUIT',quantity:'1',unitPrice:'3.50',amount:'3.50'});expect(r.items[2].name).toBe(r.items[0].name);expect(r.items[1]).toMatchObject({name:'P001 - Promo',amount:'-0.25'});expect(r.items[4]).toMatchObject({quantity:'2',unitPrice:'4.00',amount:'8.00'});expect(()=>validateReceipt(r)).not.toThrow();
 });
 it('keeps a legible amount but never repairs damaged quantity or unit digits',()=>{const p=parse('EXAMPLE SHOP\nTAX ITEN TOTAL\nGST A123 COCOA BOX\nI * Z.50 EA 5.00\nTOTAL SGD 5.00');expect(p.receipt.items).toHaveLength(1);expect(p.receipt.items[0]).toMatchObject({quantity:'',unitPrice:'',amount:'5.00'});expect(p.uncertain).toContain('items');});
 it('does not turn GST summaries or registration numbers into items',()=>{const r=parse('EXAMPLE SHOP\nTAX ITEM TOTAL\nGST Reg No 123456\n1 * 2.00 EA 2.00\nGST 9% of 12.00 = 0.99\nTOTAL SGD 12.00').receipt;expect(r.items).toHaveLength(0);expect(r.tax).toBe('0.99');});
 it('rejects conflicting payable totals, including the card payment row',()=>{const p=parse('TOTAL 18.90\nCard payment VISA SGD 18.00');expect(p.receipt.total).toBe('');expect(p.uncertain).toContain('total');});
 it('can use an explicit footer merchant when a logo is missed, but preserves an explicit header merchant',()=>{expect(parse('EXAMPLE MALL\nTOTAL SGD 3.00\n% THANK YOU FOR SHOPPING AT FICTIONAL SWEETS').receipt.store).toBe('FICTIONAL SWEETS');expect(parse('Merchant Name: FICTIONAL BRANCH\nTHANK YOU FOR SHOPPING AT FICTIONAL GROUP').receipt.store).toBe('FICTIONAL BRANCH');});
 it('explains why a two-digit year stays empty and never infers a hidden card',()=>{const p=parse('EXAMPLE SHOP\nDate .: 18-Nov-26\nCard payment VISA SGD 3.00');expect(p.receipt.date).toBe('');expect(p.warnings.join(' ')).toContain('年が2桁');expect(p.receipt.last4).toBe('');expect(p.receipt.payer).toBe('unknown');});
});
