import {it,expect} from 'vitest';
import {emptyReceipt} from '../../src/model';
import {compareReceiptDate} from '../../src/receipt-order';
const r=(id:string,date:string,time:string,createdAt='2027-01-01T00:00:00Z')=>({...emptyReceipt(),id,date,time,createdAt});
it('orders printed date and time instead of creation order',()=>{const a=r('early','2027-01-02','09:30','2027-02-01T00:00:00Z'),b=r('late','2027-01-02','18:45');expect([a,b].sort(compareReceiptDate).map(r=>r.id)).toEqual(['late','early']);expect([a,b].sort((a,b)=>compareReceiptDate(a,b,true)).map(r=>r.id)).toEqual(['early','late']);});
it.each([false,true])('keeps unknown dates and times last with oldest=%s',oldest=>{const rows=[r('unknown','','23:59'),r('missing-time','2027-01-02',''),r('midnight','2027-01-02','00:00')];expect(rows.sort((a,b)=>compareReceiptDate(a,b,oldest)).map(r=>r.id)).toEqual(['midnight','missing-time','unknown']);});
it('compares dates before times and uses deterministic ties',()=>{expect(compareReceiptDate(r('a','2027-01-03','00:00'),r('b','2027-01-02','23:59'))).toBeLessThan(0);expect(compareReceiptDate(r('a','2027-01-03','00:00'),r('b','2027-01-03','00:00'))).toBeLessThan(0);});
