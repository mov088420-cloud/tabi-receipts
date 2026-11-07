import {describe,it,expect} from 'vitest';
import {dateRecovery,dateRetryLines,mergeDateRecoveries} from '../../src/date-recovery';
const read=(text:string,confidence=95)=>({text,confidence});
describe('automatic date retry evidence',()=>{
 it('automatically accepts only an unambiguous full date agreed by two confident readings',()=>{expect(dateRecovery([read('Date: 23/09/2027'),read('23-Sep-2027')])).toMatchObject({automatic:'2027-09-23',attempts:2});});
 it.each([[read('23/09/2027')],[read('23/09/2027'),read('23/09/2027',40)],[read('23/09/27'),read('23/09/27')],[read('03/04/2027'),read('03/04/2027')],[read('23/09/2027'),read('24/09/2027')]])('requires selection when readings are incomplete, uncertain or conflict',(...reads)=>expect(dateRecovery(reads).automatic).toBe(''));
 it('does not turn letters into date digits or use expiry dates',()=>{expect(dateRecovery([read('Q7x/09/2027'),read('Expiry Date: 23/09/2027')]).candidates).toEqual([]);});
 it('finds damaged date rows but excludes expiry and invalid bounds, with two-row limit',()=>{
  const line=(text:string)=>({text,bbox:{x0:5,y0:10,x1:120,y1:35}});
  expect(dateRetryLines([line('Q7x/09/2027'),line('Expiry Date: 23/09/2027'),{...line('Date'),bbox:{x0:0,y0:0,x1:Infinity,y1:20}},line('Date: ??'),line('Date: more')],200,100).map(l=>l.text)).toEqual(['Q7x/09/2027','Date: ??']);
 });
 it('keeps all cross-photo conflicts for review and sums bounded attempts',()=>{const a=dateRecovery([read('23/09/2027'),read('23/09/2027')]),b=dateRecovery([read('24/09/2027'),read('24/09/2027')]);expect(mergeDateRecoveries([a,b])).toMatchObject({automatic:'',attempts:4});expect(mergeDateRecoveries([undefined])).toBeUndefined();});
});

import {imageGeometry,defaultImageOptions} from '../../src/image-processing';
it('enlarges small receipt regions for retries while keeping the pixel and side limits',()=>{
 expect(imageGeometry(400,1200,defaultImageOptions(),false,true).width).toBeGreaterThan(imageGeometry(400,1200,defaultImageOptions()).width);
 for(const [w,h] of [[400,1200],[1000,30000],[30000,1000],[100,100]]){const g=imageGeometry(w,h,defaultImageOptions(),false,true);expect(g.width*g.height).toBeLessThanOrEqual(4_000_000);expect(Math.max(g.width,g.height)).toBeLessThanOrEqual(6000);}
});
