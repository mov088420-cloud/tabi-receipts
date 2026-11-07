import {it,expect,vi,afterEach} from 'vitest';
const mock=vi.hoisted(()=>({createWorker:vi.fn()}));
vi.mock('tesseract.js',()=>({...mock,OEM:{LSTM_ONLY:1},PSM:{AUTO:'3',SINGLE_BLOCK:'6',SPARSE_TEXT:'11',SINGLE_LINE:'7'}}));
import {recognizePages} from '../../src/ocr';
import {defaultImageOptions} from '../../src/image-processing';
function setup(outputs:any[]){
 const canvases:any[]=[];
 vi.stubGlobal('location',{href:'http://localhost/'});
 vi.stubGlobal('Image',class {naturalWidth=1000;naturalHeight=1000;src='';async decode(){}});
 vi.stubGlobal('document',{createElement:()=>{const canvas={width:0,height:0,getContext:()=>({fillRect(){},save(){},beginPath(){},rect(){},clip(){},translate(){},scale(){},rotate(){},drawImage(){},restore(){},getImageData(){return {data:new Uint8ClampedArray(16)};},putImageData(){}})};canvases.push(canvas);return canvas;}});
 const worker={setParameters:vi.fn().mockResolvedValue(undefined),recognize:vi.fn(),terminate:vi.fn().mockResolvedValue(undefined)};
 for(const data of outputs)worker.recognize.mockResolvedValueOnce({data});
 mock.createWorker.mockResolvedValue(worker);return {worker,canvases};
}
const result=(text:string,withBox=false)=>({text,confidence:96,rotateRadians:0,blocks:withBox?[{paragraphs:[{lines:[{text,bbox:{x0:100,y0:100,x1:600,y1:130}}]}]}]:null});
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('retries a damaged date in two enlarged views, preserves primary text and frees canvases',async()=>{
 const {worker,canvases}=setup([result('Date: Q7x/09/2027',true),result('Date: Q7x/09/2027',true),result('Date: 23/09/2027'),result('Date: 23/09/2027')]);
 const output=await recognizePages([{file:new Blob(['image']),options:defaultImageOptions()}],()=>{},new AbortController().signal);
 expect(output[0].text).toBe('Date: Q7x/09/2027');expect(output[0].dateRecovery).toMatchObject({automatic:'2027-09-23',attempts:3});expect(worker.recognize).toHaveBeenCalledTimes(4);expect(worker.terminate).toHaveBeenCalled();expect(canvases.every(c=>c.width===1&&c.height===1)).toBe(true);
});
it('skips extra OCR when a date is already readable',async()=>{
 const {worker}=setup([result('Date: 23/09/2027')]);const output=await recognizePages([{file:new Blob(['image']),options:defaultImageOptions()}],()=>{},new AbortController().signal);expect(worker.recognize).toHaveBeenCalledTimes(1);expect(output[0].dateRecovery).toBeUndefined();
});
it('bounds attempts when no date location is found and does not fabricate candidates',async()=>{
 const {worker}=setup([result('EXAMPLE SHOP'),result('EXAMPLE SHOP')]);const output=await recognizePages([{file:new Blob(['image']),options:defaultImageOptions()}],()=>{},new AbortController().signal);expect(worker.recognize).toHaveBeenCalledTimes(2);expect(output[0].dateRecovery).toEqual({automatic:'',candidates:[],attempts:1});
});
it('aborts an in-flight retry and releases the worker and images',async()=>{
 const {worker,canvases}=setup([result('Date: Q7x/09/2027',true)]);const controller=new AbortController();worker.recognize.mockImplementationOnce(()=>{controller.abort();return new Promise(()=>{});});
 await expect(recognizePages([{file:new Blob(['image']),options:defaultImageOptions()}],()=>{},controller.signal)).rejects.toThrow('中止');expect(worker.terminate).toHaveBeenCalled();expect(canvases.every(c=>c.width===1&&c.height===1)).toBe(true);
});
