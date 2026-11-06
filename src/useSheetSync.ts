import {useCallback,useEffect,useRef,useState} from 'react';
import {acknowledgeSheetJob,getSheetsConfig,getSheetJob,sheetQueue} from './db';
import {callSheet} from './sheets-data';

export function useSheetSync(refreshToken:unknown) {
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState(''),[pending,setPending]=useState(0),[busy,setBusy]=useState(false);
 const running=useRef(false),rerun=useRef(false);
 const sync=useCallback(async():Promise<void>=>{
   if(running.current){rerun.current=true;return;}running.current=true;setBusy(true);
   try {
     const config=await getSheetsConfig();setEnabled(config.enabled);
     if(!config.enabled){setPending(0);setStatus('');return;}
     const jobs=await sheetQueue();setPending(jobs.length);
     if(!jobs.length){setStatus('Google連携オン · 保存した内容を自動送信');return;}
     if(!navigator.onLine){setStatus(`オフライン · Googleへの送信待ち ${jobs.length}件`);return;}
     setStatus(`Googleへ保存中 · ${jobs.length}件`);
     const work=async()=>{
       for(const job of jobs){
         const current=await getSheetsConfig();
         if(!current.enabled||current.endpoint!==config.endpoint||current.key!==config.key)return;
         if((await getSheetJob(job.id))?.revision!==job.revision)continue;
         await callSheet(current,job);await acknowledgeSheetJob(job,current.endpoint);
       }
     };
     if(navigator.locks)await navigator.locks.request('tabi-google-sheets',work);else await work();
     const remaining=(await sheetQueue()).length;setPending(remaining);
     setStatus(remaining?`Googleへの送信待ち ${remaining}件`:'Googleスプレッドシートへの保存を確認しました');
   }catch(e){setStatus(e instanceof Error?e.message:'Googleへの送信待ちです。');}
   finally{running.current=false;setBusy(false);if(rerun.current){rerun.current=false;queueMicrotask(()=>void sync());}}
 },[]);
 useEffect(()=>{void sync();},[refreshToken,sync]);
 useEffect(()=>{
   const retry=()=>{if(document.visibilityState==='visible')void sync();};
   window.addEventListener('online',retry);document.addEventListener('visibilitychange',retry);
   const timer=setInterval(retry,60_000);
   return()=>{clearInterval(timer);window.removeEventListener('online',retry);document.removeEventListener('visibilitychange',retry);};
 },[sync]);
 return {enabled,status,pending,busy,sync};
}
