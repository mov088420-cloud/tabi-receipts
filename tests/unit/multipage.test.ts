import {describe,it,expect,vi} from 'vitest';
import {createRecordId,containsSensitiveText,emptyReceipt,initialSettings,validateReceipt,receiptImages,withoutImages,type ReceiptPhoto} from '../../src/model';
import {encryptBackup,decryptBackup} from '../../src/backup';
import {imageGeometry,stretchContrast} from '../../src/image-processing';
import {joinPageResults,overlapSuggestion} from '../../src/receipt-pages';
import {parseReceipt} from '../../src/parser';
import {makeSheetJob} from '../../src/sheets-data';
const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
const photo=(time='2026-11-07T10:00:00+08:00'):ReceiptPhoto=>({capturedAt:time,importedAt:time,captureSource:'exif',image:png});
const output=(text:string)=>({text,confidence:90,seconds:1,width:1000,height:1200});
describe('multi-photo receipts',()=>{
 it('preserves each photo and timestamp but strips unrecognized OCR properties',()=>{
   const r=validateReceipt({...emptyReceipt(),photos:[photo(),photo('2026-11-07T10:01:00+08:00')],text:'private raw OCR'});
   expect(receiptImages(r)).toHaveLength(2);expect(r.photos?.[1].capturedAt).toBe('2026-11-07T10:01:00+08:00');expect(r).not.toHaveProperty('text');
   const removed=validateReceipt(withoutImages(r));expect(receiptImages(removed)).toHaveLength(0);expect(removed.photos).toHaveLength(2);expect(removed.photos?.[0]).not.toHaveProperty('image');
 });
 it('continues to open legacy one-image records',()=>{const r=validateReceipt({...emptyReceipt(),image:png});expect(receiptImages(r)).toEqual([png]);expect(receiptImages(withoutImages(r))).toEqual([]);});
 it('rejects excessive pages, bad timestamps, duplicate legacy image fields, and non-image blobs',()=>{
   for(const data of [{photos:Array.from({length:7},()=>photo())},{photos:[{...photo(),capturedAt:'2026-02-30T10:00:00'}]},{photos:[photo()],image:png},{photos:[{...photo(),image:new Blob(['secret'],{type:'text/html'})}]}])expect(()=>validateReceipt({...emptyReceipt(),...data})).toThrow();
 });
 it('roundtrips all images and dates in an encrypted backup and reads old backups',async()=>{
   for(const r of [{...emptyReceipt(),photos:[photo(),photo()]},{...emptyReceipt(),image:png}]){
     const backup=await encryptBackup([r],initialSettings,'fictional-long-password');const restored=await decryptBackup(backup,'fictional-long-password');
     expect(receiptImages(restored.receipts[0])).toHaveLength(receiptImages(r).length);expect(await receiptImages(restored.receipts[0])[0].arrayBuffer()).toEqual(await png.arrayBuffer());
     expect(restored.receipts[0].photos?.[0].capturedAt).toBe(r.photos?.[0].capturedAt);
   }
 });
 it('keeps images and per-photo metadata out of Google requests',()=>{
   const job=makeSheetJob({...emptyReceipt(),total:'1.23',currency:'SGD',photos:[photo(),photo()]},initialSettings,1);
   expect(Object.keys(job).sort()).toEqual(['id','items','revision','row','version']);expect(JSON.stringify(job)).not.toContain('image');expect(job.row).toHaveLength(24);
 });
});
describe('joining receipt sections',()=>{
 const top='EXAMPLE CAFE\nSGD\n1 Tea 3.00\n2 Rice 12.00\nSERVICE CHARGE 1.50';
 const bottom='2 Rice 12.00\nSERVICE CHARGE 1.50\nGST 1.49\nTOTAL SGD 17.99\nVISA **** 4242';
 it('suggests exact overlap but retains all rows until explicitly accepted',()=>{
   expect(overlapSuggestion(top,bottom)).toBe(2);
   const all=joinPageResults([output(top),output(bottom)],[0,0]);expect(all.text.match(/2 Rice/g)).toHaveLength(2);
   const chosen=joinPageResults([output(top),output(bottom)],[0,2]);expect(chosen.text.match(/2 Rice/g)).toHaveLength(1);
   const parsed=parseReceipt(chosen.text,initialSettings).receipt;expect(parsed.total).toBe('17.99');expect(parsed.last4).toBe('4242');expect(parsed.items).toHaveLength(2);expect(parsed.store).toBe('EXAMPLE CAFE');
 });
 it('does not infer fuzzy overlap or discard repeat purchases',()=>{expect(overlapSuggestion('Tea 3.00\nTea 3.00','Tea 3.00\nTea 3.00')).toBe(0);expect(overlapSuggestion(top,bottom.replace('Rice','Rlce'))).toBe(0);});
 it('rejects invalid removal ranges and preserves conflicting totals for manual review',()=>{
   expect(()=>joinPageResults([output(top),output(bottom)],[0,100])).toThrow();expect(()=>joinPageResults([output(top)],[1])).toThrow();
   const joined=joinPageResults([output('TOTAL SGD 10.00'),output('TOTAL SGD 20.00')],[0,0]);expect(parseReceipt(joined.text,initialSettings).receipt.total).toBe('');
 });
 it.each(['TOTAL: S$ 17.99','TOTAL 17.99 SGD','Total (incl GST) SGD 17.99','AMOUNT PAYABLE\nSGD 17.99'])('extracts labelled total: %s',line=>{expect(parseReceipt(line,initialSettings).receipt.total).toBe('17.99');});
 it('never treats savings, item counts or a following product as the total',()=>{for(const text of ['TOTAL SAVINGS 5.00','TOTAL ITEMS 5.00','TOTAL\n1 Tea 5.00'])expect(parseReceipt(text,initialSettings).receipt.total).toBe('');});
});
describe('OCR image preparation',()=>{
 it('crops in rotated coordinates before resizing and keeps long canvases bounded',()=>{
   const g=imageGeometry(4000,3000,{rotation:90,contrast:false,crop:{top:10,bottom:10,left:25,right:25}});expect(g.left).toBe(750);expect(g.top).toBe(400);
   for(const [w,h] of [[12000,4000],[1000,30000],[30000,1000],[100,100]]){const g=imageGeometry(w,h,{rotation:0,contrast:false});expect(g.width*g.height).toBeLessThanOrEqual(4_000_000);expect(Math.max(g.width,g.height)).toBeLessThanOrEqual(6000);}
 });
 it('stretches faint print without turning a uniform white page into noise',()=>{
   const gray=new Uint8ClampedArray(Array.from({length:100},(_,i)=>[i<10?160:210,i<10?160:210,i<10?160:210,255]).flat());stretchContrast(gray);expect(gray[0]).toBe(0);expect(gray[40]).toBe(255);
   const white=new Uint8ClampedArray([255,255,255,255]);stretchContrast(white);expect(white[0]).toBe(255);
 });
});

it('generates persistable UUIDs without weakening sensitive-number validation',()=>{
 const bad='abcdefab-abcd-4123-8123-123456789012',good='abcdefab-abcd-4abc-8abc-abcdefabcdef';
 expect(containsSensitiveText(bad)).toBe(true);
 const random=vi.spyOn(crypto,'randomUUID').mockReturnValueOnce(bad).mockReturnValueOnce(good);
 try{expect(createRecordId()).toBe(good);}finally{random.mockRestore();}
 expect(()=>validateReceipt({...emptyReceipt(),memo:'4111 1111 1111 1111'})).toThrow();
});
