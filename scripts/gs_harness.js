const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 從 index.html 抽出內嵌的 GS_CODE（自給自足，不需外部 temp 檔）
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i = html.indexOf('const GS_CODE = `') + 'const GS_CODE = `'.length;
const j = html.indexOf('\n`;\n', i); // GS_CODE 模板字串結尾
const code = html.slice(i, j);

const NAME2KEY = { '申請記錄':'apply', '問題回報':'issue', '意見回饋':'feedback', '作品投稿':'appstore' };
const state = { apply:{rows:[],headers:[]}, issue:{rows:[],headers:[]}, feedback:{rows:[],headers:[]}, appstore:{rows:[],headers:[]} };
const emails = [];
let scriptProps = { API_KEY: 'scout-testkey-123456' };

function RangeStub(sheet,r,c,rn,cn){ this.sheet=sheet; this.r=r; this.c=c; this.rn=rn; this.cn=cn; }
RangeStub.prototype.setValues=function(v){ this.sheet._setValues(this.r,this.c,v); return this; };
RangeStub.prototype.setValue=function(v){ this.sheet._setValues(this.r,this.c,[[v]]); return this; };
RangeStub.prototype.getValues=function(){ return this.sheet._all(); };
RangeStub.prototype.setFontWeight=function(){return this;}; RangeStub.prototype.setBackground=function(){return this;}; RangeStub.prototype.setFontColor=function(){return this;};
function SheetStub(name){ this.name=name; this.st=state[NAME2KEY[name]||name]; }
SheetStub.prototype.getLastRow=function(){ return this.st.rows.length+1; };
SheetStub.prototype.getLastColumn=function(){ return this.st.headers.length; };
SheetStub.prototype.getRange=function(r,c,rn,cn){ return new RangeStub(this,r,c,rn,cn); };
SheetStub.prototype._setValues=function(r,c,v){ const ri=r-1,ci=c-1; for(let i=0;i<v.length;i++)for(let k=0;k<v[i].length;k++){ if(ri+i===0){ this.st.headers[ci+k]=v[i][k]; } else { const idx=ri+i-1; while(this.st.rows.length<=idx)this.st.rows.push([]); this.st.rows[idx][ci+k]=v[i][k]; } } };
SheetStub.prototype._all=function(){ const g=[this.st.headers.map(h=>h===undefined?'':h)]; for(const row of this.st.rows) g.push(this.st.headers.map((_,i)=>row[i]===undefined?'':row[i])); return g; };
SheetStub.prototype.getDataRange=function(){ return { getValues: ()=>this._all() }; };
SheetStub.prototype.setFrozenRows=function(){}; SheetStub.prototype.appendRow=function(row){ this.st.rows.push(this.st.headers.map((_,i)=>row[i]===undefined?'':row[i])); };

const sandbox={
  Utilities:{getUuid:(()=>{let n=0;return()=>'uuu-'+(++n);})()},
  MailApp:{sendEmail:o=>emails.push(o)},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>scriptProps[k]||'',setProperty:(k,v)=>scriptProps[k]=v,deleteProperty:k=>delete scriptProps[k]})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>Object.keys(state).includes(NAME2KEY[n])?new SheetStub(n):null, insertSheet:n=>new SheetStub(n)})},
  ContentService:{createTextOutput:t=>({setMimeType:()=>t}), MimeType:{JSON:'j'}},
  Logger:{log:m=>{}}, console
};
const ctx=vm.createContext(sandbox);
vm.runInContext(code,ctx);
function post(o){ return JSON.parse(sandbox.doPost({postData:{contents:JSON.stringify(o)}})); }

let fails=0;
function check(c,m){ if(!c){fails++;console.error('FAIL:',m);} else console.log('ok  :',m); }

let r = post({type:'apply',troopName:'第82旅',troopId:'0082',backendUrl:'https://x/exec',apiKey:'ak111',note:'hi'});
check(r.status==='success','apply ok');
check(emails.length===1,'email 1');
check(state.apply.headers.length===8,'apply headers built');
check(state.apply.rows.length===1,'apply row written');

emails.length=0;
r = post({type:'apply',troopName:'第83旅',backendUrl:'https://y',apiKey:'ak222',unicorn:'rainbow',urgent:true});
check(r.status==='success','apply unknown ok');
check(state.apply.headers.includes('unicorn')&&state.apply.headers.includes('urgent'),'unknown cols added');
let lr=state.apply.rows[state.apply.rows.length-1];
check(lr[state.apply.headers.indexOf('unicorn')]==='rainbow' && lr[state.apply.headers.indexOf('urgent')]==='true','unknown values stored');
check(emails[0].body.includes('unicorn')&&emails[0].body.includes('rainbow'),'email has unknown');
check(emails[0].body.includes('"apiKey":"ak222"'),'email raw json backup');

emails.length=0;
r = post({type:'issue',sourceApp:'vsbadge',title:'壞了',desc:'詳情',severity:'高',troopId:'0082',name:'小明',contact:'a@b',device:'iPhone'});
check(r.status==='success','issue ok');
check(state.issue.headers.includes('device'),'issue unknown col');
let ir=state.issue.rows[0];
check(ir[state.issue.headers.indexOf('姓名')]==='小明','issue name stored');
check(ir[state.issue.headers.indexOf('狀態')]==='未閱','issue default 未閱');
check(emails[0].body.includes('小明')&&emails[0].body.includes('iPhone'),'issue email has name+unknown');

emails.length=0;
r = post({type:'feedback',sourceApp:'vsbadge',fbType:'建議',content:'加夜間模式'});
check(r.status==='success','feedback anon');
check(state.feedback.rows[0][state.feedback.headers.indexOf('姓名')]==='','feedback name empty');

r = post({type:'issue',title:'',desc:''});
check(r.status==='error','empty rejected');

emails.length=0;
r = post({troopName:'X',backendUrl:'u',apiKey:'k'});
check(r.status==='success','no-type => apply');

// ==== App Store submission ====
emails.length=0;
r = post({type:'appstore', name:'露營裝備清單', url:'https://example.com', author:'小明', page:'apps', category:'小工具', description:'清單工具', tags:'童軍,露營', extra_future_field:'ok'});
check(r.status==='success','appstore submit ok');
check(state.appstore.headers.includes('作品名稱'),'appstore headers');
check(state.appstore.headers.includes('extra_future_field'),'appstore unknown col');
const asrow = state.appstore.rows[0];
check(asrow[state.appstore.headers.indexOf('作品名稱')]==='露營裝備清單','appstore name stored');
check(asrow[state.appstore.headers.indexOf('狀態')]==='待審核','appstore status 待審核');
check(emails.length===1 && emails[0].subject.includes('新作品投稿'),'appstore email subject');
check(emails[0].body.includes('露營裝備清單') && emails[0].body.includes('https://example.com') && emails[0].body.includes('小明'),'appstore email full data');
check(emails[0].body.includes('"extra_future_field":"ok"'),'appstore email raw json backup');

// markRead（寫回狀態不驗 Key——API KEY 只保護後台「讀取」）
let firstId = state.issue.rows[0][state.issue.headers.indexOf('編號')];
r = post({type:'markRead',id:firstId,status:'read'});
check(r.status==='ok','markRead ok (no key needed)');
check(state.issue.rows[0][state.issue.headers.indexOf('狀態')]==='已閱','markRead wrote 已閱');

// markReq（審核寫回也不驗 Key）
r = post({type:'markReq',id:'uuu-1',status:'已接入'});
check(r.status==='ok','markReq ok (no key needed)');
check(state.apply.rows[0][state.apply.headers.indexOf('狀態')]==='已接入','markReq wrote 已接入');

// GET（list 讀取仍受 Key 保護）
let g = JSON.parse(sandbox.doGet({parameter:{action:'list'}}));
check(g.status==='error','list needs key');
g = JSON.parse(sandbox.doGet({parameter:{action:'list',apikey:'scout-testkey-123456'}}));
check(g.status==='ok','list ok');
check(g.applications.length===3,'3 applications');
check(g.applications.some(a=>a.unicorn==='rainbow'),'list carries unknown');
check(g.issues[0].狀態==='已閱','list status 已閱');
check(Array.isArray(g.appstore) && g.appstore.length===1 && g.appstore[0].作品名稱==='露營裝備清單','list carries appstore');

// API key setup
emails.length=0; scriptProps={};
const key = sandbox.setupApiKey();
check(typeof key==='string'&&key.startsWith('scout-'),'setupApiKey gen');
check(scriptProps.API_KEY===key,'key saved');
check(emails.length===1&&emails[0].subject.includes('API KEY'),'setupApiKey emails');

// ==== 統一回報格式 v1：來源正規化 + type 別名 + 未知 type 不漏單 ====
emails.length=0;
const SRCCOL = () => state.issue.headers.indexOf('來源APP');
r = post({type:'issue', sourceApp:'scoutlibrary.vercel.app', title:'圖書館壞了', desc:'借書失敗'});
check(r.status==='success','library issue ok');
check(state.issue.rows[state.issue.rows.length-1][SRCCOL()]==='圖書館','來源正規化 scoutlibrary.vercel.app → 圖書館');

r = post({type:'問題回報', sourceApp:'BRANCH', title:'支部系統問題', desc:'x'});
check(r.status==='success','中文 type 別名 ok');
check(state.issue.rows[state.issue.rows.length-1][SRCCOL()]==='支部系統','來源正規化 BRANCH → 支部系統');

r = post({type:'feedback', sourceApp:'https://scoutprogress.vercel.app/abc', fbType:'建議', content:'進度追蹤想要匯出'});
check(state.feedback.rows[state.feedback.rows.length-1][state.feedback.headers.indexOf('來源APP')]==='進度追蹤','來源正規化 URL → 進度追蹤');

r = post({sourceApp:'區系統', title:'沒寫 type 的回報', desc:'應該進問題回報'});
check(r.status==='success','未知/缺 type 自動判斷');
check(state.issue.rows[state.issue.rows.length-1][state.issue.headers.indexOf('標題')]==='沒寫 type 的回報','缺 type + 有 title → issue');
check(state.issue.rows[state.issue.rows.length-1][SRCCOL()]==='區系統','來源 區系統 保留');

r = post({type:'意見', sourceApp:'未來新系統X', content:'新系統照樣收'});
check(state.feedback.rows[state.feedback.rows.length-1][state.feedback.headers.indexOf('來源APP')]==='未來新系統X','未登記來源原樣保留（不漏單）');
check(state.issue.headers.length===state.issue.headers.length,'欄位數不變（無需改 Sheet）');

console.log(fails===0?'ALL GAS OK':(fails+' FAILURES'));
process.exit(fails?1:0);
