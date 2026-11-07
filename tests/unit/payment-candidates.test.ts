import {expect,it} from 'vitest';
import {receiptPaymentCandidates as candidates} from '../../src/receipt-amounts';
import {parseReceipt} from '../../src/parser';
import {initialSettings} from '../../src/model';
it('offers intact digits from damaged card payment context without guessing currency',()=>{const text='Card payment VISA 560 14.50 )';expect(parseReceipt(text,initialSettings).receipt.total).toBe('');expect(candidates(text)).toEqual([{value:'14.50',currency:'',printed:text,placement:'same-line'}]);});
it('offers a value printed before the total label as an explicit choice',()=>{const text='14.50\n--\nTotal';expect(parseReceipt(text,initialSettings).receipt.total).toBe('');expect(candidates(text)).toMatchObject([{value:'14.50',placement:'before-label'}]);});
it('keeps conflicting payable amounts as distinct choices, never auto-selects one',()=>{const text='Total SGD 14.50\nCard payment VISA SGD 14.60';expect(candidates(text).map(c=>c.value)).toEqual(['14.50','14.60']);expect(parseReceipt(text,initialSettings).receipt.total).toBe('');});
it('does not mistake counts, tax totals, cash, change, items or IDs for payable labels',()=>{expect(candidates('Total quantity 3.00\nTotal tax 1.20\nSUBTOTAL 15.00\nGST 1.20\nCash 20.00\nChange 5.00\nRice 3.00\nReceipt 123.45')).toEqual([]);});
it.each(['TOTAL 14.OO','TOTAL 14.500','TOTAL X14.50','TOTAL 14.345.67'])('does not repair or partially match damaged amount %s',line=>expect(candidates(line)).toEqual([]));
it('deduplicates equal candidates, preserves cents and explicit currencies',()=>{expect(candidates('Total S$ 1,234. 50\nCard payment VISA SGD 1,234.50')).toHaveLength(1);expect(candidates('Total US$ 3.50')[0]).toMatchObject({value:'3.50',currency:'USD'});});
it('omits sensitive contexts and mixed-currency rows from suggestions',()=>{expect(candidates('Card payment VISA 4111 1111 1111 1111 14.50')).toEqual([]);expect(candidates('TOTAL SGD 14.50 USD 10.50')).toEqual([]);});
it('never scans beyond three nearby lines or takes a product price as an amount-only row',()=>{expect(candidates('14.50\na\nb\nc\nTotal')).toEqual([]);expect(candidates('Total\nRice 3.50')).toEqual([]);});

it('omits amounts that cannot be stored in the explicit currency',()=>{expect(candidates('TOTAL JPY 3.50')).toEqual([]);expect(candidates('TOTAL SGD 999,999,999,999,999.00')).toEqual([]);});

it('does not offer tax or change amounts printed on the same payment line',()=>{expect(candidates('Total SGD 14.50 GST 1.20').map(c=>c.value)).toEqual(['14.50']);expect(candidates('Total (incl GST) SGD 14.50').map(c=>c.value)).toEqual(['14.50']);});
