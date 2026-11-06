import {describe,it,expect} from 'vitest';
import {jpegCapturedAt,photoMetadata,selectPhotos} from '../../src/photo';
import {emptyReceipt,initialSettings,validateReceipt,validPhotoTimestamp} from '../../src/model';
import {receiptsCsv} from '../../src/csv';
import {encryptBackup,decryptBackup} from '../../src/backup';
function jpeg(date='2026:11:07 14:30:59',offset='+08:00',little=true){
 const buffer=new ArrayBuffer(130),v=new DataView(buffer),u16=(p:number,n:number)=>v.setUint16(p,n,little),u32=(p:number,n:number)=>v.setUint32(p,n,little);
 v.setUint16(0,0xffd8);v.setUint16(2,0xffe1);v.setUint16(4,126);v.setUint32(6,0x45786966);v.setUint16(10,0);
 v.setUint16(12,little?0x4949:0x4d4d);u16(14,42);u32(16,8);u16(20,1);u16(22,0x8769);u16(24,4);u32(26,1);u32(30,26);
 u16(38,2);u16(40,0x9003);u16(42,2);u32(44,20);u32(48,56);u16(52,0x9011);u16(54,2);u32(56,7);u32(60,76);
 new Uint8Array(buffer,68,20).set(new TextEncoder().encode(date+'\0'));new Uint8Array(buffer,88,7).set(new TextEncoder().encode(offset+'\0'));
 return buffer;
}
describe('photo timestamp provenance',()=>{
 it.each([true,false])('reads DateTimeOriginal and its own zone, endian %s',little=>expect(jpegCapturedAt(jpeg(undefined,undefined,little))).toBe('2026-11-07T14:30:59+08:00'));
 it('does not assume timezone for offset-less metadata',()=>expect(jpegCapturedAt(jpeg(undefined,''))).toBe('2026-11-07T14:30:59'));
 it('ignores corrupt offsets and impossible dates',()=>{const b=jpeg();new DataView(b).setUint32(30,0xffffffff,true);expect(jpegCapturedAt(b)).toBe('');expect(jpegCapturedAt(jpeg('2026:02:31 14:30:59'))).toBe('');expect(jpegCapturedAt(b.slice(0,40))).toBe('');});
 it('does not use file lastModified as a photograph date',async()=>{const f=new File(['png'],'test.png',{lastModified:12345});const p=selectPhotos([f])[0];const metadata=await photoMetadata(p);expect(metadata).toEqual({capturedAt:'',captureSource:'unknown',importedAt:p.importedAt});expect(validPhotoTimestamp(metadata.importedAt)).toBe(true);});
 it('labels the camera return time as an estimate, and prefers real EXIF',async()=>{const p=selectPhotos([new File(['png'],'test.png')],true)[0];expect(await photoMetadata(p)).toMatchObject({captureSource:'camera',capturedAt:p.importedAt});expect(await photoMetadata({...p,file:new File([jpeg()],'test.jpg')})).toMatchObject({captureSource:'exif',capturedAt:'2026-11-07T14:30:59+08:00'});});
 it('accepts legacy receipts without inventing photography dates',()=>{const r:Record<string,unknown>={...emptyReceipt()};delete r.capturedAt;delete r.importedAt;delete r.captureSource;expect(validateReceipt(r)).toMatchObject({capturedAt:'',importedAt:'',captureSource:'unknown'});});
 it('rejects bad provenance and timestamp injection',()=>{expect(()=>validateReceipt({...emptyReceipt(),capturedAt:'=SUM(A1)',captureSource:'manual'})).toThrow();expect(()=>validateReceipt({...emptyReceipt(),captureSource:'camera'})).toThrow();expect(validPhotoTimestamp('2026-11-07T23:30:00+14:01')).toBe(false);});
 it('exports and restores photo metadata without changing the transaction date',async()=>{const r={...emptyReceipt(),date:'2026-11-06',capturedAt:'2026-11-07T14:30:59+08:00',captureSource:'exif' as const,importedAt:'2026-11-08T15:40:00+09:00'};const csv=receiptsCsv([r],initialSettings);expect(csv).toContain('撮影日時');expect(csv).toContain(r.capturedAt);expect(csv).toContain(r.date);const restored=await decryptBackup(await encryptBackup([r],initialSettings,'fictional-password'),'fictional-password');expect(restored.receipts[0]).toEqual(r);});
});
