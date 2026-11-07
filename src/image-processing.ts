export type Crop = {top:number;right:number;bottom:number;left:number};
export type ImageOptions = {rotation:number;contrast:boolean;faint?:boolean;crop?:Crop;layout?:'block'|'auto';deskew?:boolean};
export const noCrop=():Crop=>({top:0,right:0,bottom:0,left:0});
export const defaultImageOptions=():ImageOptions=>({rotation:0,contrast:false,crop:noCrop(),layout:'block',deskew:true});
export const imageLimits={maxBytes:25*1024*1024,maxPixels:4_000_000,maxSide:6000};
// Crop in the rotated photo's coordinates, before resizing: background must not consume the text's pixel budget.
export function imageGeometry(w:number,h:number,options:ImageOptions,preview=false,detail=false) {
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||![0,90,180,270].includes(options.rotation))throw new Error('画像サイズ・回転を確認してください。');
 const crop=options.crop||noCrop();
 if(Object.values(crop).length!==4||Object.values(crop).some(n=>!Number.isFinite(n)||n<0||n>45))throw new Error('切り取り範囲を確認してください。');
 const sideways=options.rotation===90||options.rotation===270;
 const width=sideways?h:w,height=sideways?w:h;
 const left=width*crop.left/100,top=height*crop.top/100,cw=width*(1-(crop.left+crop.right)/100),ch=height*(1-(crop.top+crop.bottom)/100);
 const border=12;
 const pixels=preview?700_000:imageLimits.maxPixels;
 const side=preview?1400:imageLimits.maxSide;
 const scale=Math.min(preview?1:detail?3:2,(preview?850:1500)/cw,Math.sqrt(pixels/(cw*ch)),(side-2*border)/Math.max(cw,ch));
 // Keep the canvas including its white border within the memory budget.
 const edge=2*border,linear=edge*(cw+ch),area=cw*ch,available=pixels-edge*edge;
 const safeScale=Math.min(scale,2*available/(linear+Math.sqrt(linear*linear+4*area*available)));
 return {left,top,scale:safeScale,border,width:Math.max(1,Math.floor(cw*safeScale))+2*border,height:Math.max(1,Math.floor(ch*safeScale))+2*border};
}
// Percentile stretching preserves faint print better than a fixed brightness boost.
export function stretchContrast(data:Uint8ClampedArray):void {
 const bins=new Uint32Array(256);let count=0;
 for(let i=0;i<data.length;i+=4){const gray=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]);bins[gray]++;count++;}
 const percentile=(fraction:number)=>{let sum=0;for(let n=0;n<256;n++){sum+=bins[n];if(sum>=count*fraction)return n;}return 255;};
 const low=percentile(.01),high=percentile(.95);
 if(high-low<10)return;
 const range=Math.max(30,high-low);
 for(let i=0;i<data.length;i+=4){const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2];const value=Math.max(0,Math.min(255,(gray-low)*255/range));data[i]=data[i+1]=data[i+2]=value;}
}
// Local illumination removal for faint thermal print. A rolling box mean needs
// one luminance buffer and one column buffer, not a large integral-image array.
// This is opt-in: texture and compression noise can also be strengthened.
export function enhanceFaintPrint(data:Uint8ClampedArray,width:number,height:number,radius=32):void {
 if(data.length!==width*height*4||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('画像サイズが一致しません。');
 radius=Math.max(1,Math.min(128,Math.round(radius)));
 const gray=new Uint8Array(width*height),columns=new Float64Array(width);
 for(let i=0;i<gray.length;i++)gray[i]=Math.round(.299*data[4*i]+.587*data[4*i+1]+.114*data[4*i+2]);
 for(let y=0;y<=Math.min(radius,height-1);y++)for(let x=0;x<width;x++)columns[x]+=gray[y*width+x];
 for(let y=0;y<height;y++){
   if(y>0){const remove=y-radius-1,add=y+radius;for(let x=0;x<width;x++){if(remove>=0)columns[x]-=gray[remove*width+x];if(add<height)columns[x]+=gray[add*width+x];}}
   const rows=Math.min(height-1,y+radius)-Math.max(0,y-radius)+1;let sum=0;
   for(let x=0;x<=Math.min(radius,width-1);x++)sum+=columns[x];
   for(let x=0;x<width;x++){
     if(x>0){if(x-radius-1>=0)sum-=columns[x-radius-1];if(x+radius<width)sum+=columns[x+radius];}
     const count=rows*(Math.min(width-1,x+radius)-Math.max(0,x-radius)+1),i=y*width+x;
     const value=Math.max(0,Math.min(255,245+4*(gray[i]-sum/count)));
     data[i*4]=data[i*4+1]=data[i*4+2]=value;
   }
 }
}
