import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';

export type OcrProgress = { status: string; progress: number };
export type OcrResult = { text: string; confidence: number; seconds: number; width: number; height: number };
export type ImageOptions = { rotation: number; contrast: boolean };
export const imageLimits = { maxBytes: 25 * 1024 * 1024, maxPixels: 4_000_000, maxSide: 6000 };

export async function prepareImage(file: Blob, options: ImageOptions): Promise<HTMLCanvasElement> {
  if (file.size > imageLimits.maxBytes) throw new Error('画像は25MB以下にしてください。');
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error('画像サイズを取得できません。');
    // Decoding still needs the source image's memory. Oversized camera files may need OS-side resizing.
    const scale = Math.min(1, Math.sqrt(imageLimits.maxPixels / (w * h)), imageLimits.maxSide / Math.max(w,h));
    const rw = Math.round(w * scale), rh = Math.round(h * scale);
    const sideways = Math.abs(options.rotation % 180) === 90;
    const canvas = document.createElement('canvas');
    canvas.width = sideways ? rh : rw; canvas.height = sideways ? rw : rh;
    const ctx = canvas.getContext('2d', { willReadFrequently: options.contrast });
    if (!ctx) throw new Error('画像処理を開始できません。');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.translate(canvas.width/2,canvas.height/2); ctx.rotate(options.rotation*Math.PI/180);
    ctx.drawImage(img,-rw/2,-rh/2,rw,rh);
    if(options.contrast) {
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      for(let i=0;i<pixels.data.length;i+=4) {
        const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];
        const value=Math.max(0,Math.min(255,(gray-128)*1.35+140));
        pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;
      }
      ctx.putImageData(pixels,0,0);
    }
    return canvas;
  } catch(error) {
    if(error instanceof Error && error.message.includes('25MB')) throw error;
    throw new Error('画像を開けません。JPEG・PNGで再度取り込むか、画像を小さくしてください。');
  } finally { img.src=''; URL.revokeObjectURL(url); }
}

export async function recognize(file: Blob, options: ImageOptions, report: (p: OcrProgress)=>void, signal: AbortSignal): Promise<OcrResult> {
  let worker: Worker | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const start=performance.now();
  const base=new URL('./ocr/',new URL(import.meta.env.BASE_URL,location.href)).href;
  let rejectFailure: (reason: Error)=>void = ()=>{};
  const failure=new Promise<never>((_,reject)=>{rejectFailure=reject;});
  void failure.catch(()=>{});
  const abort=()=>{ void worker?.terminate(); rejectFailure(new Error('OCRを中止しました。')); };
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{ void worker?.terminate(); rejectFailure(new Error('OCRが3分以内に完了しませんでした。画像を小さくして再試行してください。')); },180_000);
  try {
    if(signal.aborted) throw new Error('OCRを中止しました。');
    report({status:'画像を調整中',progress:0});
    canvas=await prepareImage(file,options);
    if(signal.aborted) throw new Error('OCRを中止しました。');
    const creation=createWorker('eng',OEM.LSTM_ONLY,{
      workerPath:base+'worker.min.js', corePath:base, langPath:base,
      workerBlobURL:false, gzip:true, cacheMethod:'none',
      logger:m=>report({status:m.status==='recognizing text'?'文字を読み取り中':'OCRエンジンを準備中',progress:m.progress||0}),
      errorHandler:()=>rejectFailure(new Error('OCRに失敗しました。オフライン準備状態と画像を確認してください。')),
    });
    // A cancelled creation may resolve later; always terminate that worker too.
    let abandoned=false;
    creation.then(w=>{ if(abandoned) void w.terminate(); },()=>{});
    try { worker=await Promise.race([creation,failure]); } catch(e) { abandoned=true; throw e; }
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,preserve_interword_spaces:'1'});
    const {data}=await Promise.race([worker.recognize(canvas),failure]);
    return {text:data.text,confidence:data.confidence,seconds:(performance.now()-start)/1000,width:canvas.width,height:canvas.height};
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort',abort);
    await worker?.terminate();
    if(canvas) { canvas.width=1; canvas.height=1; }
  }
}
