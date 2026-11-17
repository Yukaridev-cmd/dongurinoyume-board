import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),tick=()=>new Promise(r=>setTimeout(r,15));
function fixture(hash='#new'){
 const errors=[],calls=[],rows=new Map();let waitWrite=null,fail=false;const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));const dom=new JSDOM(read('event.html'),{url:'https://test.example/event.html'+hash,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};
 w.fetch=async p=>Response.json(JSON.parse(read(p)));w.DonguriComments={save:async(path,method,body)=>{calls.push({path,method,body});const id=path.split('/').at(-1);if(method==='GET'){if(!rows.has(id))throw Error('保存済みの準備なし');return{event:rows.get(id)};}if(waitWrite)await waitWrite;if(fail)throw Error('テスト通信失敗');const event={id,data:body.data,version:body.version+1};rows.set(id,event);return{event};}};w.eval(read('event.js'));
 return{w,dom,calls,rows,errors,form:w.document.getElementById('event-form'),auth(viewer='a'.repeat(64)){w.dispatchEvent(new w.CustomEvent('comments-auth',{detail:{ready:true,viewer}}));},suspend(){w.dispatchEvent(new w.CustomEvent('comments-suspend'));},set waitWrite(v){waitWrite=v},set fail(v){fail=v}};
}
test('new event saves explicit choices, repeated auth preserves editing, and background restores only the same viewer',async()=>{
 const b=fixture();try{await tick();assert.equal(b.form.hidden,true);b.auth();await tick();b.form.elements.title.value='秘密の架空出店';b.form.elements.venue.value='架空会場';b.form.querySelector('[data-product]').checked=true;b.form.querySelector('[data-pop]').checked=true;b.form.dispatchEvent(new b.w.Event('input'));b.auth();await tick();assert.equal(b.form.elements.title.value,'秘密の架空出店');
  b.suspend();assert.equal(b.form.elements.title.value,'');assert.equal(b.form.querySelector('[data-product]').checked,false);assert.equal(b.w.document.body.textContent.includes('秘密の架空出店'),false);b.auth('b'.repeat(64));await tick();assert.equal(b.form.elements.title.value,'');b.suspend();b.auth();await tick();assert.equal(b.form.elements.title.value,'秘密の架空出店');assert.equal(b.form.querySelector('[data-product]').checked,true);
  b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();const row=[...b.rows.values()][0];assert.equal(row.data.products.length,1);assert.equal(row.data.pops.length,1);assert.equal(b.w.document.getElementById('event-detail').hidden,false);assert.equal(b.w.localStorage.length,0);assert.equal(b.w.sessionStorage.length,0);assert.equal(b.errors.length,0);
 }finally{b.dom.window.close();}
});
test('uncertain save does not show private late responses and retries the same event id and version',async()=>{
 const b=fixture();try{await tick();b.auth();await tick();b.form.elements.title.value='架空の再試行';b.form.dispatchEvent(new b.w.Event('input'));let release;b.waitWrite=new Promise(r=>release=r);b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));const first=b.calls.find(c=>c.method==='POST');b.suspend();release();await tick();assert.equal(b.w.document.getElementById('event-detail').hidden,true);b.waitWrite=null;b.auth();await tick();assert.equal(b.form.elements.title.value,'架空の再試行');b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();const writes=b.calls.filter(c=>c.method==='POST');assert.equal(writes[1].path,first.path);assert.equal(writes[1].body.version,first.body.version);assert.equal(b.errors.length,0);
 }finally{b.dom.window.close();}
});

test('canceling an unsaved event stays in its editor and never exposes record links to an unsaved id',async()=>{
 const b=fixture();try{await tick();b.auth();await tick();b.form.elements.title.value='架空の未保存';b.form.dispatchEvent(new b.w.Event('input'));b.w.document.getElementById('event-cancel').click();assert.equal(b.form.hidden,false);assert.equal(b.form.elements.title.value,'');assert.equal(b.w.document.getElementById('event-detail').hidden,true);assert.equal(b.calls.length,0);assert.equal(b.errors.length,0);}finally{b.dom.window.close();}
});
test('existing choices reload and save empty selections with the original version; background hides every private field',async()=>{
 const id='11111111-1111-4111-8111-111111111111',b=fixture('#id='+id),d=b.w.document;try{
 b.rows.set(id,{id,version:4,data:{title:'架空の登録済み出店',date:'2026-12-20',start:'10:00',end:'16:00',venue:'架空会場',notes:'私的な準備メモ',products:['work-haniwa'],pops:['pop-haniwa']}});await tick();b.auth();await tick();assert.equal(d.getElementById('event-title').textContent,'架空の登録済み出店');d.querySelector('#event-actions button').click();d.querySelector('[data-plan-tab=products]').click();assert.equal(b.form.querySelector('[value=work-haniwa]').checked,true);b.form.querySelector('[value=work-haniwa]').checked=false;b.form.querySelector('[value=pop-haniwa]').checked=false;b.form.dispatchEvent(new b.w.Event('change'));b.auth();await tick();assert.equal(d.querySelector('[data-plan-panel=products]').hidden,false);assert.equal(b.form.querySelector('[value=work-haniwa]').checked,false);
 b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();assert.equal(b.calls.at(-1).body.version,4);assert.deepEqual([...b.rows.get(id).data.products],[]);assert.deepEqual([...b.rows.get(id).data.pops],[]);b.suspend();assert.equal(d.body.textContent.includes('架空の登録済み出店'),false);assert.equal(d.body.textContent.includes('私的な準備メモ'),false);assert.equal(b.form.elements.venue.value,'');assert.equal(b.errors.length,0);
 }finally{b.dom.window.close();}
});

test('excluded works are absent from new carry choices but previously saved selections survive edits',async()=>{
 const b=fixture('#id=event-xmas');try{await tick();assert.equal(b.form.querySelectorAll('[data-product]').length,19);assert.equal(b.form.querySelector('[data-product][value="work-magnet"]'),null);
 b.rows.set('event-xmas',{id:'event-xmas',version:2,data:{title:'クリスマスマルシェ（2026年12月）',date:'',start:'',end:'',venue:'',notes:'架空の準備',products:['work-magnet','work-haniwa'],pops:[]}});b.auth();await tick();assert.match(b.w.document.getElementById('event-selections').textContent,/販売候補から除外・以前の選択を保管/);
 [...b.w.document.querySelectorAll('button')].find(n=>n.textContent==='持参品・出店情報を編集').click();b.form.elements.notes.value='架空の編集';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();assert.deepEqual([...b.rows.get('event-xmas').data.products].sort(),['work-haniwa','work-magnet']);assert.equal(b.errors.length,0);
 }finally{b.dom.window.close();}
});
