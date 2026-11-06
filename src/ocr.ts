import {createWorker,OEM,PSM,type Worker} from 'tesseract.js';
import {imageGeometry,imageLimits,stretchContrast,type ImageOptions} from './image-processing';
export {imageLimits,type ImageOptions} from './image-processing';
export type OcrProgress={status:string;progress:number};
export type OcrResult={text:string;confidence:number;seconds:number;width:number;height:number;angle?:number;pages?:number};
export async function prepareImage(file:Blob,options:ImageOptions,preview=false):Promise<HTMLCanvasElement> {
 if(file.size>imageLimits.maxBytes)throw new Error('画像は25MB以下にしてください。');
 const url=URL.createObjectURL(file),img=new Image();let canvas:HTMLCanvasElement|undefined;
 try {
   img.src=url;await img.decode();const w=img.naturalWidth,h=img.naturalHeight;
   const g=imageGeometry(w,h,options,preview);
   canvas=document.createElement('canvas');canvas.width=g.width;canvas.height=g.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:options.contrast});
   if(!ctx)throw new Error('画像処理を開始できません。');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.save();ctx.beginPath();ctx.rect(g.border,g.border,canvas.width-2*g.border,canvas.height-2*g.border);ctx.clip();
   ctx.translate(g.border-g.left*g.scale,g.border-g.top*g.scale);ctx.scale(g.scale,g.scale);
   if(options.rotation===90)ctx.translate(h,0);
   if(options.rotation===180)ctx.translate(w,h);
   if(options.rotation===270)ctx.translate(0,w);
   ctx.rotate(options.rotation*Math.PI/180);ctx.drawImage(img,0,0);ctx.restore();
   if(options.contrast){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);stretchContrast(pixels.data);ctx.putImageData(pixels,0,0);}
   return canvas;
 }catch{if(canvas){canvas.width=1;canvas.height=1;}throw new Error('画像を開けません。JPEG・PNGで再度取り込むか、画像を小さくしてください。');}
 finally {img.src='';URL.revokeObjectURL(url);}
}
// One worker, one canvas and one recognition at a time, even for a multi-photo receipt.
export async function recognizePages(photos:{file:Blob;options:ImageOptions}[],report:(p:OcrProgress)=>void,signal:AbortSignal):Promise<OcrResult[]> {
 let worker:Worker|undefined,canvas:HTMLCanvasElement|undefined,timer:ReturnType<typeof setTimeout>|undefined,index=0,abandoned=false;
 const base=new URL('./ocr/',new URL(import.meta.env.BASE_URL,location.href)).href;
 let rejectFailure:(e:Error)=>void=()=>{};
 const failure=new Promise<never>((_,reject)=>{rejectFailure=reject;});void failure.catch(()=>{});
 const abort=()=>{abandoned=true;void worker?.terminate();rejectFailure(new Error('OCRを中止しました。写真は残っています。'));};
 const resetTimer=()=>{clearTimeout(timer);timer=setTimeout(()=>{abandoned=true;void worker?.terminate();rejectFailure(new Error(`${index+1}枚目のOCRが3分以内に完了しませんでした。範囲を切り取るか、写真を撮り直してください。`));},180_000);};
 const progress=(status:string,n:number)=>{if(!abandoned)report({status:`${photos.length>1?`${index+1} / ${photos.length}枚 · `:''}${status}`,progress:(index+n)/photos.length});};
 signal.addEventListener('abort',abort,{once:true});
 try {
   if(!photos.length||photos.length>6)throw new Error('読み取る写真は1〜6枚で指定してください。');
   if(signal.aborted)throw new Error('OCRを中止しました。');
   resetTimer();progress('OCRエンジンを準備中',0);
   const creation=createWorker('eng',OEM.LSTM_ONLY,{
     workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false,gzip:true,cacheMethod:'none',
     logger:m=>progress(m.status==='recognizing text'?'文字を読み取り中':'OCRエンジンを準備中',m.status==='recognizing text'?Math.max(0,Math.min(1,m.progress||0)):0),
     errorHandler:()=>rejectFailure(new Error('OCRに失敗しました。オフライン準備状態と画像を確認してください。')),
   });
   creation.then(w=>{if(abandoned)void w.terminate();},()=>{});
   try{worker=await Promise.race([creation,failure]);}catch(e){abandoned=true;throw e;}
   const outputs:OcrResult[]=[];
   for(index=0;index<photos.length;index++){
     if(signal.aborted)throw new Error('OCRを中止しました。');
     resetTimer();const start=performance.now();progress('画像を調整中',0);
     const photo=photos[index];canvas=await prepareImage(photo.file,photo.options);
     if(signal.aborted||abandoned)throw new Error('OCRを中止しました。写真は残っています。');
     await Promise.race([worker.setParameters({tessedit_pageseg_mode:photo.options.layout==='auto'?PSM.AUTO:PSM.SINGLE_BLOCK,preserve_interword_spaces:'1',user_defined_dpi:'300'}),failure]);
     const {data}=await Promise.race([worker.recognize(canvas,{rotateAuto:photo.options.deskew!==false}),failure]);
     outputs.push({text:data.text,confidence:data.confidence,seconds:(performance.now()-start)/1000,width:canvas.width,height:canvas.height,angle:(data.rotateRadians||0)*180/Math.PI});
     canvas.width=1;canvas.height=1;canvas=undefined;progress('読み取り完了',1);
   }
   return outputs;
 }finally{abandoned=true;clearTimeout(timer);signal.removeEventListener('abort',abort);await worker?.terminate();if(canvas){canvas.width=1;canvas.height=1;}}
}
export async function recognize(file:Blob,options:ImageOptions,report:(p:OcrProgress)=>void,signal:AbortSignal):Promise<OcrResult>{return (await recognizePages([{file,options}],report,signal))[0];}
