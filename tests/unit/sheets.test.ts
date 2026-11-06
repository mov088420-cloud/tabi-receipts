import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {callSheet,makeSheetJob,validateSheetsConfig,sheetHeaders} from '../../src/sheets-data';
import {emptyReceipt,initialSettings} from '../../src/model';
const config={endpoint:'https://script.google.com/macros/s/'+'A'.repeat(24)+'/exec',key:'a'.repeat(64),enabled:true,sheetUrl:'https://docs.google.com/spreadsheets/d/fictional-test-sheet'};
const job=()=>makeSheetJob({...emptyReceipt(),store:'=1+1',total:'1.20',currency:'SGD',items:[{id:'i',name:'Tea',quantity:'1',unitPrice:'1.20',amount:'1.20'}]},initialSettings,1794000000000);
afterEach(()=>vi.unstubAllGlobals());
describe('Google bridge client',()=>{
 it('sends only reviewed fields, not images or OCR',()=>{const j=makeSheetJob({...emptyReceipt(),image:new Blob(['private'],{type:'image/png'})},initialSettings,1);expect(j.row).toHaveLength(sheetHeaders.length);expect(JSON.stringify(j)).not.toContain('image');expect(JSON.stringify(j)).not.toContain('private');});
 it.each(['https://evil.example/exec','https://script.google.com.evil.example/macros/s/aaaaaaaaaaaaaaaaaaaaaaaa/exec','http://script.google.com/macros/s/aaaaaaaaaaaaaaaaaaaaaaaa/exec',config.endpoint+'?key=secret'])('rejects other endpoints %s',endpoint=>expect(()=>validateSheetsConfig({...config,endpoint})).toThrow());
 it('requires an acknowledged receipt ID/revision, not just HTTP success',async()=>{const j=job(),fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,id:j.id,revision:'wrong',sheetUrl:config.sheetUrl})});vi.stubGlobal('fetch',fetch);await expect(callSheet(config,j)).rejects.toThrow('保存を確認できません');const options=fetch.mock.calls[0][1];expect(options.credentials).toBe('omit');expect(options.mode).not.toBe('no-cors');expect(JSON.parse(options.body).key).toBe(config.key);expect(fetch.mock.calls[0][0]).not.toContain(config.key);});
 it('accepts a matching acknowledgement and detects destination changes',async()=>{const j=job();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,id:j.id,revision:j.revision,sheetUrl:config.sheetUrl})}));await expect(callSheet(config,j)).resolves.toEqual({sheetUrl:config.sheetUrl});await expect(callSheet({...config,sheetUrl:config.sheetUrl+'other'},j)).rejects.toThrow();});
 it('keeps conflicts and network failures visible',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:false,conflict:true})}));await expect(callSheet(config,job())).rejects.toThrow('新しい更新');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('secret detail')));await expect(callSheet(config,job())).rejects.toThrow('未送信分');});
});
class Sheet {
 rows:any[][]=[]; fail=false;
 getLastRow(){return this.rows.length;} getMaxRows(){return 100000;} insertRowsAfter(){} setFrozenRows(){} setColumnWidths(){}
 deleteRow(row:number){this.rows.splice(row-1,1);}
 getRange(row:number,col:number,height=1,width=1){const self=this;return {
  setValues(values:any[][]){if(self.fail&&row>1){self.fail=false;throw new Error('simulated partial failure');}for(let r=0;r<height;r++){self.rows[row+r-1]??=[];for(let c=0;c<width;c++)self.rows[row+r-1][col+c-1]=values[r][c];}return this;},
  getValues(){return Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>self.rows[row+r-1]?.[col+c-1]??''));},
  setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},setNumberFormat(){return this;},
  createTextFinder(id:string){return {matchEntireCell(){return this;},useRegularExpression(){return this;},findNext(){for(let r=row;r<row+height;r++)if(self.rows[r-1]?.[col-1]===id)return {getRow:()=>r};return null;}};}
 };}
}
function server(){
 const sheets=new Map<string,Sheet>();const properties=new Map([['TABI_KEY',config.key],['TABI_SHEET_ID','fictional-test-sheet']]);
 const book={getId:()=>properties.get('TABI_SHEET_ID'),getSheetByName:(name:string)=>sheets.get(name),insertSheet:(name:string)=>{const s=new Sheet();sheets.set(name,s);return s;}};
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>properties.get(k)})},SpreadsheetApp:{openById:()=>book,flush:()=>{}},ContentService:{MimeType:{JSON:'json'},createTextOutput:(s:string)=>({setMimeType:()=>JSON.parse(s)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})}};
 const api=vm.runInNewContext(readFileSync('integrations/google-apps-script/Code.gs','utf8')+';({doPost,doGet,safeCell_})',context);
 return {sheets,api,send:(j:any,key=config.key)=>api.doPost({postData:{contents:JSON.stringify({action:'save',key,job:j})}})};
}
describe('Google-side authorization and idempotent writes',()=>{
 it('rejects wrong/missing keys before accessing the sheet; GET reveals nothing',()=>{const s=server();expect(s.send(job(),'bad')).toEqual({ok:false});expect(s.sheets.size).toBe(0);expect(s.api.doGet()).toEqual({ok:false});});
 it('stores one receipt and one set of items across retries and edits',()=>{const s=server(),j=job();expect(s.send(j).ok).toBe(true);expect(s.send(j).ok).toBe(true);expect(s.sheets.get('レシート一覧')!.rows).toHaveLength(2);expect(s.sheets.get('商品明細')!.rows).toHaveLength(2);expect(s.sheets.get('レシート一覧')!.rows[1][3]).toBe("'=1+1");expect(s.sheets.get('レシート一覧')!.rows[1][5]).toBe(1.2);expect(s.sheets.get('商品明細')!.rows[1][4]).toBe(1.2);expect(s.send({...j,revision:'new',version:j.version+1,items:[]}).ok).toBe(true);expect(s.sheets.get('商品明細')!.rows).toHaveLength(1);expect(s.send(j)).toMatchObject({ok:false,conflict:true});});
 it('repairs a partial failure without duplicated items',()=>{const s=server(),j=job();expect(s.send(j).ok).toBe(true);s.sheets.get('レシート一覧')!.fail=true;const edit={...j,revision:'edit',version:j.version+1};expect(s.send(edit).ok).toBe(false);expect(s.send(edit).ok).toBe(true);expect(s.sheets.get('商品明細')!.rows).toHaveLength(2);});
 it('rejects full card numbers and malformed rows on the server too',()=>{const s=server(),j=job();j.row[19]='4111 1111 1111 1111';expect(s.send(j).ok).toBe(false);expect(s.send({...job(),items:[['wrong','tea','1','1','1']]}).ok).toBe(false);});
});
