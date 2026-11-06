import {describe,it,expect} from 'vitest';
import {minor,major,identifyPayer,emptyReceipt,initialSettings,validateReceipt,validateSettings,reconciliation,type Card} from '../../src/model';
import {parseReceipt} from '../../src/parser';
import {csvCell,receiptsCsv,itemsCsv} from '../../src/csv';
import {encryptBackup,decryptBackup} from '../../src/backup';
const card:Card={id:'c1',payer:'self',brand:'VISA',last4:'4242',alias:'Apple Pay'};
describe('exact money and reconciliation',()=>{
 it('adds decimals exactly',()=>expect(major(minor('0.10','SGD')!+minor('0.20','SGD')!,'SGD')).toBe('0.30'));
 it.each(['1e4','12x','0.123','NaN','Infinity','1,234.00'])('rejects invalid money %s',v=>expect(minor(v,'SGD')).toBeNull());
 it('supports JPY and negative values',()=>{expect(minor('120.00','JPY')).toBe(120n);expect(minor('120.01','JPY')).toBeNull();expect(major(-99n,'SGD')).toBe('-0.99');});
 it('does not assume unknown currency',()=>expect(minor('2.00','')).toBeNull());
 it('detects exact included and excluded taxes',()=>{const r={...emptyReceipt(),currency:'SGD' as const,subtotal:'15.00',total:'17.99',tax:'1.49',service:'1.50',discount:'0',tip:'0',taxMode:'excluded' as const};expect(reconciliation(r).join()).toContain('一致しています');expect(reconciliation({...r,total:'18.00'}).join()).toContain('不一致');expect(reconciliation({...r,taxMode:'included',total:'16.50'}).join()).toContain('一致しています');});
 it('never treats missing fee as zero',()=>expect(reconciliation({...emptyReceipt(),currency:'SGD',subtotal:'10',total:'10',taxMode:'included'}).join()).toContain('空欄は未確認'));
 it('checks fractional item quantities',()=>{const r={...emptyReceipt(),currency:'SGD' as const,items:[{id:'i',name:'fruit',quantity:'1.5',unitPrice:'2.00',amount:'3.00'}]};expect(reconciliation(r).join()).not.toContain('数量×');expect(reconciliation({...r,items:[{...r.items[0],amount:'4.00'}]}).join()).toContain('数量×');});
});
describe('payer classification',()=>{
 it('matches only registered last4',()=>{expect(identifyPayer('VISA','4242',[card])).toBe('self');expect(identifyPayer('VISA','0000',[card])).toBe('unknown');});
 it('rejects conflicting brands and duplicates',()=>{expect(identifyPayer('AMEX','4242',[card])).toBe('unknown');expect(identifyPayer('VISA','4242',[card,{...card,id:'c2',payer:'wife'}])).toBe('unknown');expect(identifyPayer('VISA','4242',[card,{...card,id:'c2'}])).toBe('unknown');});
 it('allows unique virtual card aliases',()=>expect(identifyPayer('','4242',[card])).toBe('self'));
});
describe('receipt parser',()=>{
 const source='EXAMPLE CAFE\n123 Example Road\nSingapore 000000\n06/11/2026 12:34\n2 Chicken Rice        12.00\n1 Iced Tea             3.00\nSUBTOTAL 15.00\nSERVICE CHARGE 1.50\nGST 9% 1.49\nTOTAL SGD 17.99\nVISA **** **** **** 4242';
 it('extracts totals independently from items and tax',()=>{const p=parseReceipt(source,{...initialSettings,cards:[card]});expect(p.receipt).toMatchObject({store:'EXAMPLE CAFE',date:'2026-11-06',total:'17.99',subtotal:'15.00',tax:'1.49',service:'1.50',currency:'SGD',last4:'4242',payer:'self'});expect(p.receipt.items).toHaveLength(2);expect(p.uncertain).toContain('date');expect(p.receipt.taxMode).toBe('unknown');});
 it('does not interpret $ as SGD',()=>expect(parseReceipt('TOTAL $ 12.34',initialSettings).receipt.currency).toBe(''));
 it('does not select one of conflicting totals',()=>expect(parseReceipt('TOTAL SGD 12.34\nAMOUNT PAID 13.34',initialSettings).receipt.total).toBe(''));
 it('rejects invalid and ambiguous card data',()=>{expect(parseReceipt('VISA 4111 1111 1111 1111',initialSettings).receipt.last4).toBe('');expect(parseReceipt('VISA ****4242\nVISA ****1234',initialSettings).receipt.last4).toBe('');});
 it('handles OCR-damaged mask symbols only with card context and flags review',()=>{const p=parseReceipt('VISA skkkk skkokx skokkk 4242',initialSettings);expect(p.receipt.last4).toBe('4242');expect(p.uncertain).toContain('last4');expect(parseReceipt('REFERENCE skkkk skkokx skokkk 4242',initialSettings).receipt.last4).toBe('');});
 it('recognizes tax included and named dates',()=>{expect(parseReceipt('7 Nov 2026\nTOTAL SGD 9.90\nIncludes GST',initialSettings).receipt).toMatchObject({date:'2026-11-07',taxMode:'included'});});
 it('clears impossible dates',()=>expect(parseReceipt('31/02/2026',initialSettings).receipt.date).toBe(''));
 it('does not invent missing store, amounts or quantities',()=>{expect(parseReceipt('',initialSettings).receipt.store).toBe('');expect(parseReceipt('Tea       3.00',initialSettings).receipt.items[0].quantity).toBe('');});
});
describe('storage boundary and CSV',()=>{
 it('persists only allowlisted fields',()=>expect(validateReceipt({...emptyReceipt(),ocrText:'secret',cvv:'123'})).not.toHaveProperty('ocrText'));
 it.each(['4111 1111 1111 1111','４１１１－１１１１－１１１１－１１１１','CVV: 123','EXP DATE 11/26','有効期限 11/26','セキュリティコード：123'])('rejects sensitive free text %s',memo=>expect(()=>validateReceipt({...emptyReceipt(),memo})).toThrow());
 it('rejects full card numbers in dedicated field',()=>expect(()=>validateReceipt({...emptyReceipt(),last4:'4111111111111111'})).toThrow());
 it('rejects malformed settings and money',()=>{expect(()=>validateSettings({...initialSettings,cards:[{...card,last4:'12345'}]})).toThrow();expect(()=>validateReceipt({...emptyReceipt(),currency:'JPY',total:'1.50'})).toThrow();});
 it.each(['=HYPERLINK("x")','+cmd','-cmd','@SUM(A1)',' \t=1','\r=1'])('neutralizes formula %s',v=>expect(csvCell(v)).toMatch(/^"'/));
 it('escapes quotes, commas, and newlines',()=>expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"'));
 it('links two UTF-8 CSVs by ID and keeps last4 zeros',()=>{const r={...emptyReceipt(),last4:'0042',items:[{id:'i',name:'tea',quantity:'1',unitPrice:'3',amount:'3'}]};const a=receiptsCsv([r],initialSettings),b=itemsCsv([r]);expect(a.charCodeAt(0)).toBe(0xfeff);expect(a).toContain(r.id);expect(b).toContain(r.id);expect(a).toContain('末尾 0042');});
});
describe('encrypted backup',()=>{
 const password='fictional-test-password';
 it('round-trips records with authenticated encryption',async()=>{const r={...emptyReceipt(),store:'Fictional cafe',currency:'SGD' as const,total:'12.34'};const file=await encryptBackup([r],initialSettings,password);expect(await file.text()).not.toContain(r.store);const out=await decryptBackup(file,password);expect(out.receipts[0]).toEqual(r);});
 it('rejects short passwords',async()=>await expect(encryptBackup([],initialSettings,'short')).rejects.toThrow());
 it('rejects wrong password and altered ciphertext',async()=>{const file=await encryptBackup([],initialSettings,password);await expect(decryptBackup(file,'wrong password')).rejects.toThrow();const e=JSON.parse(await file.text());e.data=(e.data[0]==='A'?'B':'A')+e.data.slice(1);await expect(decryptBackup(new Blob([JSON.stringify(e)]),password)).rejects.toThrow();});
 it('rejects unbounded KDF parameters',async()=>{const file=await encryptBackup([],initialSettings,password);const e=JSON.parse(await file.text());e.iterations=1e12;await expect(decryptBackup(new Blob([JSON.stringify(e)]),password)).rejects.toThrow();});
});
