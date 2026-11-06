export type Crop = {top:number;right:number;bottom:number;left:number};
export type ImageOptions = {rotation:number;contrast:boolean;crop?:Crop;layout?:'block'|'auto';deskew?:boolean};
export const noCrop=():Crop=>({top:0,right:0,bottom:0,left:0});
export const defaultImageOptions=():ImageOptions=>({rotation:0,contrast:false,crop:noCrop(),layout:'block',deskew:true});
export const imageLimits={maxBytes:25*1024*1024,maxPixels:4_000_000,maxSide:6000};
// Crop in the rotated photo's coordinates, before resizing: background must not consume the text's pixel budget.
export function imageGeometry(w:number,h:number,options:ImageOptions,preview=false) {
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||![0,90,180,270].includes(options.rotation))throw new Error('画像サイズ・回転を確認してください。');
 const crop=options.crop||noCrop();
 if(Object.values(crop).length!==4||Object.values(crop).some(n=>!Number.isFinite(n)||n<0||n>45))throw new Error('切り取り範囲を確認してください。');
 const sideways=options.rotation===90||options.rotation===270;
 const width=sideways?h:w,height=sideways?w:h;
 const left=width*crop.left/100,top=height*crop.top/100,cw=width*(1-(crop.left+crop.right)/100),ch=height*(1-(crop.top+crop.bottom)/100);
 const border=12;
 const pixels=preview?700_000:imageLimits.maxPixels;
 const side=preview?1400:imageLimits.maxSide;
 const scale=Math.min(preview?1:2,(preview?850:1500)/cw,Math.sqrt(pixels/(cw*ch)),(side-2*border)/Math.max(cw,ch));
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
