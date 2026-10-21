const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 從 index.html 抽出內嵌的 GS_CODE（自給自足，不需外部 temp 檔）
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i = html.indexOf('const GS_CODE = `') + 'const GS_CODE = `'.length;
const j = html.indexOf('\n`;\n', i); // GS_CODE 模板字串結尾
const raw = html.slice(i, j);
// 重要：測「使用者按『複製備份』真正拿到、貼進 Apps Script 的那份代碼」
// （模板字串求值後，\\n 之類的跳脫會還原成 GS 實際執行的內容）
const code = new Function('return `' + raw + '`')();
if (/\$\{/.test(raw)) { console.error('FAIL: GS_CODE 內含 ${ 插值，複製出去會壞'); process.exit(1); }

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
  MailApp:{
    sendEmail:o=>{ if(global.__mailThrows) throw new Error('Service invoked too many times: email'); emails.push(o); },
    getRemainingDailyQuota:()=>87
  },
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
check(state.apply.headers.length===9,'apply headers built（＋聯絡 Email）');
check(state.apply.headers[7]==='編號' && state.apply.headers[8]==='聯絡 Email','編號 仍在第 8 欄，新欄加在最後（舊資料不受影響）');
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

// ==== v2.5：Email 狀態唔再靜靜吞 + testEmail + ?action=diag ====
const ADMIN = 'playerkousas@hotmail.com';
global.__mailThrows = false;
emails.length=0;
r = post({type:'apply',troopName:'第99旅',backendUrl:'u',apiKey:'k'});
check(r.status==='success' && r.email==='sent','apply 回應帶 email:sent');
check(emails.length===1 && emails[0].subject.indexOf('新旅團登記')>=0,'apply 有寄出通知信');

emails.length=0;
r = post({type:'apply',troopName:'第98旅\n第二行',backendUrl:'u',apiKey:'k'});
check(r.email==='sent' && emails[0].subject.indexOf('\n')===-1 && emails[0].subject.indexOf('\r')===-1,
  '主旨含換行會清乾淨（MailApp 唔會因此拋錯）');

global.__mailThrows = true;
emails.length=0;
const rowsBefore = state.apply.rows.length;
r = post({type:'apply',troopName:'第97旅',backendUrl:'u',apiKey:'k'});
check(r.status==='success' && r.email==='failed','MailApp 失敗 → email:failed（唔再靜靜吞）');
check(/Service invoked/.test(r.emailError),'回應帶 emailError 原因');
check(state.apply.rows.length===rowsBefore+1,'Email 失敗仍然寫入 Sheet（不會漏單）');

const diagKey = sandbox.PropertiesService.getScriptProperties().getProperty('API_KEY');
g = JSON.parse(sandbox.doGet({parameter:{action:'diag',apikey:diagKey}}));
check(g.status==='ok' && g.lastEmail && g.lastEmail.ok===false,'?action=diag 回 LAST_EMAIL（失敗記錄）');
check(g.remainingQuota===87,'?action=diag 回剩餘寄信配額');
g = JSON.parse(sandbox.doGet({parameter:{action:'diag'}}));
check(g.status==='error','?action=diag 冇 API KEY → 拒絕');

global.__mailThrows = false;
emails.length=0;
r = post({type:'testEmail', to:'attacker@example.com'});
check(r.status==='ok' && r.email==='sent','testEmail 寄出成功');
check(emails.length===1 && emails[0].to===ADMIN,'testEmail 只寄 ADMIN_EMAIL（忽略自訂 to，唔會被濫用）');

// ==== v2.5：旅團接入申請「回覆 Email」 ====
global.__mailThrows = false;
emails.length=0;
r = post({type:'apply',troopId:'0091',troopName:'第91旅',backendUrl:'u',apiKey:'k',note:'[roverbadge] 聯絡：leader91@example.com'});
const arow = () => state.apply.rows[state.apply.rows.length-1];
const aId  = () => arow()[state.apply.headers.indexOf('編號')];
check(arow()[state.apply.headers.indexOf('聯絡 Email')]==='leader91@example.com','備注內的 Email 自動抽到「聯絡 Email」欄');

emails.length=0;
r = post({type:'markReq', id:aId(), status:'已接入', notify:true, message:'已幫你設定好，有問題再找我。'});
check(r.status==='ok' && r.email==='sent' && r.to==='leader91@example.com','審核後回覆申請人：已寄出');
check(emails.length===1,'回覆只寄一封給申請人（唔會再發一封畀自己）');
const replyMail = emails.find(e=>e.to==='leader91@example.com');
check(replyMail && replyMail.subject.indexOf('已開通')>=0,'回覆信主旨標明已開通');
check(replyMail && replyMail.body.indexOf('TROOP_')===-1,'通知信不含環境變數（由管理員自己設定）');
check(replyMail && replyMail.body.indexOf('已經開通')>=0 && replyMail.body.length<300,'通知信簡短：只講已開通');
check(replyMail && replyMail.body.indexOf('已幫你設定好')>=0,'回覆信包含管理員附加訊息');
check(arow()[state.apply.headers.indexOf('狀態')]==='已接入','狀態已寫回');

emails.length=0;
r = post({type:'markReq', id:aId(), status:'已拒絕', notify:true});
check(r.email==='sent' && emails.some(e=>e.body.indexOf('未能開通')>=0 && e.subject.indexOf('結果')>=0),'拒絕申請會寄出拒絕信');
check(emails.every(e=>e.body.indexOf('TROOP_')===-1),'拒絕信亦不含技術設定內容');

r = post({type:'apply',troopId:'0092',troopName:'第92旅',backendUrl:'u',apiKey:'k',note:'無留電郵'});
const noMailId = arow()[state.apply.headers.indexOf('編號')];
r = post({type:'markReq', id:noMailId, status:'已接入', notify:true});
check(r.status==='ok' && r.email==='no-address','冇 Email 時回 no-address（唔會假成功）');

r = post({type:'markReq', id:'not-exist', status:'已接入', notify:true});
check(r.status==='error','找不到編號 → error');

r = post({type:'markReq', id:aId(), status:'已接入'});
check(r.status==='ok' && r.notified===false,'冇 notify 時照舊只寫狀態、唔寄信');

// 來源統一：4 個 BADGE APP 全部歸入專章系統
emails.length=0;
[['scoutbadge',null],['進度追蹤',null],['vsbadge',null],['cubbadge',null],['cubsbadge',null],['roverbadge',null],
 ['https://roverbadge.vercel.app/x',null],['幼童軍進度追蹤',null],['樂行童軍進度追蹤',null],['專章',null]].forEach(([src])=>{
  post({type:'feedback', sourceApp:src, fbType:'建議', content:'來源測試'});
});
const srcCol = state.feedback.headers.indexOf('來源APP');
const srcs = state.feedback.rows.slice(-10).map(row=>row[srcCol]);
check(srcs.every(x=>x==='專章系統'), '10 種 BADGE APP 寫法全部統一成「專章系統」（' + Array.from(new Set(srcs)).join('/') + '）');

console.log(fails===0?'ALL GAS OK':(fails+' FAILURES'));
process.exit(fails?1:0);
