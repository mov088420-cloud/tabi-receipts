import type {Receipt} from './model';
// Receipt date/time are local printed values, not capture time or UTC timestamps.
// Unknown dates sort last; unknown times sort last within their known day.
export function compareReceiptDate(a:Receipt,b:Receipt,oldest=false):number {
 if(!a.date!==!b.date)return a.date?-1:1;
 const direction=oldest?1:-1;
 if(a.date!==b.date)return direction*a.date.localeCompare(b.date);
 if(a.date){
  if(!a.time!==!b.time)return a.time?-1:1;
  const time=direction*a.time.localeCompare(b.time);if(time)return time;
 }
 return b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id);
}
