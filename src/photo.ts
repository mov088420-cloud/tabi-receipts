import {validPhotoTimestamp,type Receipt} from './model';

export type PhotoInput={file:File;importedAt:string;fromCamera:boolean};
export function selectPhotos(files:File[],fromCamera=false):PhotoInput[] {
 const importedAt=localTimestamp(new Date());
 return files.map(file=>({file,importedAt,fromCamera}));
}
export function localTimestamp(date:Date):string {
 const offset=-date.getTimezoneOffset();
 const wall=new Date(date.getTime()+offset*60_000).toISOString().slice(0,19);
 return `${wall}${offset>=0?'+':'-'}${String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')}:${String(Math.abs(offset)%60).padStart(2,'0')}`;
}

// Read only JPEG DateTimeOriginal and OffsetTimeOriginal. No GPS, serial numbers or other EXIF fields are retained.
export function jpegCapturedAt(buffer:ArrayBuffer):string {
 try {
   const v=new DataView(buffer);if(v.byteLength<4||v.getUint16(0)!==0xffd8)return '';
   for(let pos=2;pos+4<=v.byteLength;){
     if(v.getUint8(pos)!==0xff)return '';
     const marker=v.getUint8(pos+1);if(marker===0xda||marker===0xd9)return '';
     if(marker===0xff){pos++;continue;}
     const length=v.getUint16(pos+2);if(length<2||pos+2+length>v.byteLength)return '';
     const start=pos+4,end=pos+2+length;pos=end;
     if(marker!==0xe1||end-start<14||v.getUint32(start)!==0x45786966||v.getUint16(start+4)!==0)continue;
     const tiff=start+6;const order=v.getUint16(tiff);if(order!==0x4949&&order!==0x4d4d)return '';
     const little=order===0x4949;
     const inside=(p:number,n:number)=>p>=tiff&&p+n<=end;
     const u16=(p:number)=>{if(!inside(p,2))throw new Error();return v.getUint16(p,little);};
     const u32=(p:number)=>{if(!inside(p,4))throw new Error();return v.getUint32(p,little);};
     if(u16(tiff+2)!==42)return '';
     const entries=(relative:number)=>{const p=tiff+relative,count=u16(p);if(count>512||!inside(p+2,count*12))throw new Error();return Array.from({length:count},(_,i)=>p+2+i*12);};
     const exif=entries(u32(tiff+4)).find(p=>u16(p)===0x8769&&u16(p+2)===4&&u32(p+4)===1);
     if(exif===undefined)return '';
     const fields=entries(u32(exif+8));
     const ascii=(tag:number,max:number)=>{
       const p=fields.find(p=>u16(p)===tag&&u16(p+2)===2);if(p===undefined)return '';
       const count=u32(p+4);if(count<2||count>max)return '';
       const at=count<=4?p+8:tiff+u32(p+8);if(!inside(at,count))return '';
       return String.fromCharCode(...new Uint8Array(buffer,at,count)).replace(/\0+$/,'');
     };
     const original=ascii(0x9003,20);if(!/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(original))return '';
     const rawOffset=ascii(0x9011,7);const offset=/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(rawOffset)?rawOffset:'';
     const date=original.slice(0,10).replaceAll(':','-')+'T'+original.slice(11)+offset;
     return validPhotoTimestamp(date)?date:'';
   }
 }catch{/* Malformed or truncated metadata is unknown, not a fatal OCR error. */}
 return '';
}
export async function photoMetadata(photo:PhotoInput):Promise<Pick<Receipt,'capturedAt'|'importedAt'|'captureSource'>> {
 let exif='';try{exif=jpegCapturedAt(await photo.file.slice(0,256*1024).arrayBuffer());}catch{/* Import still works if metadata cannot be read. */}
 return {importedAt:photo.importedAt,capturedAt:exif||(photo.fromCamera?photo.importedAt:''),captureSource:exif?'exif':photo.fromCamera?'camera':'unknown'};
}
