import {it,expect} from 'vitest';
import {parseReceipt,fillMissingFields} from '../../src/parser';
import {initialSettings,emptyReceipt} from '../../src/model';
const parse=(s:string)=>parseReceipt(s,initialSettings).receipt;
it.each(['TOTAL (SGD) : 73.25','GRAND TOTAL (incl. GST) SGD 73.25','Total Amt. SGD 73.25','TOTAL (GST inclusive) SGD 73.25','TOTAL INCLUSIVE OF GST SGD 73.25','TOTAL\n------\nSGD\n73.25','Total SGD\n====\n$73.25','PAYMENT TOTAL SGD 73.25','NETT TOTAL AMOUNT SGD 73.25','CARD PAYMENT SGD 73.25','TOTAL SG$73.25','TOTAL 73.25 (SGD)'])('maps an explicit final payment: %s',text=>expect(parse(text)).toMatchObject({total:'73.25',currency:'SGD'}));
it.each(['TOTAL\nGST 9%\n7.25','TOTAL\nRice 73.25','TOTAL\nTOTAL QTY 73.25','SUBTOTAL 73.25','TOTAL GST 73.25','TOTAL\nA\nB\n73.25','TOTAL\n---\nSGD\n---\n73.25','TOTAL AMOUNT 73.OO'])('does not promote unrelated/damaged amounts: %s',text=>expect(parse(text).total).toBe(''));
it('does not replace a conflicting total or a user correction',()=>{expect(parse('TOTAL (SGD) 73.25\nGRAND TOTAL SGD 74.25').total).toBe('');expect(fillMissingFields({...emptyReceipt(),total:'90.00'},parse('TOTAL (SGD) 73.25'),initialSettings).total).toBe('90.00');});
it('keeps item, tax, cash tender and change separate from the payment',()=>{const r=parse('EXAMPLE CAFE\n1 Tea 3.00\nSUBTOTAL 3.00\nGST 0.27\nTOTAL (SGD) 3.27\nCASH 10.00\nCHANGE 6.73');expect(r).toMatchObject({subtotal:'3.00',tax:'0.27',total:'3.27'});expect(r.items[0].amount).toBe('3.00');});
