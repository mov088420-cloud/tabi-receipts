import {expect,it} from 'vitest';
import {enhanceFaintPrint} from '../../src/image-processing';
it('strengthens faint ink across uneven illumination without altering alpha',()=>{
 const w=80,h=60,pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=180+x/2-(x>=35&&x<=37?25:0),i=(y*w+x)*4;pixels.set([v,v,v,255],i);}
 enhanceFaintPrint(pixels,w,h,12);
 expect(pixels[(30*w+36)*4]).toBeLessThan(pixels[(30*w+25)*4]-60);
 expect(pixels[(30*w+10)*4]).toBeGreaterThan(230);expect(pixels[(30*w+60)*4]).toBeGreaterThan(230);
 expect([...pixels].filter((_,i)=>i%4===3).every(a=>a===255)).toBe(true);
});
it('handles tiny and uniform images without producing artificial dark characters',()=>{const p=new Uint8ClampedArray([200,200,200,255]);enhanceFaintPrint(p,1,1,100);expect([...p]).toEqual([245,245,245,255]);expect(()=>enhanceFaintPrint(p,2,2)).toThrow();});
