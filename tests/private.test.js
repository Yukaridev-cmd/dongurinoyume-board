import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM,VirtualConsole } from 'jsdom';
const html=readFileSync(new URL('../private.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../private.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../catalog.json',import.meta.url),'utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function fixture(){
  const errors=[],calls=[],rows=[];let fail=false,delay=null,delayWrite=null;
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(html,{url:'https://yukaridev-cmd.github.io/dongurinoyume-board/private.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;
  w.fetch=async()=>Response.json(catalog);
  const copied=[];Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>copied.push(text)}});
  w.DonguriComments={save:async(path,method,body)=>{
    calls.push({path,method,body});if(fail)throw Error('テストの通信失敗');
    if(method==='GET'){if(delay)await delay;return{records:rows,next:null};}
    if(delayWrite)await delayWrite;
    if(method==='POST'){const record={id:body.id,kind:body.kind,data:body.data,author:'本人',updatedBy:'本人',version:1,canEdit:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};rows.push(record);return{record};}
    const record=rows.find(r=>path.endsWith(r.id));
    if(method==='PATCH'){Object.assign(record,{data:body.data,version:record.version+1});return{record};}
    if(method==='DELETE'){rows.splice(rows.indexOf(record),1);return{deleted:true};}
  }};
  w.eval(source);
  return{dom,w,errors,calls,rows,copied,set fail(v){fail=v;},set delay(v){delay=v;},set delayWrite(v){delayWrite=v;},auth(ready,viewer='a'.repeat(64)){w.dispatchEvent(new w.CustomEvent('comments-auth',{detail:{ready,author:ready?'本人':'',viewer:ready?viewer:''}}));},clear(){w.dispatchEvent(new w.CustomEvent('comments-clear'));},form:w.document.getElementById('record-form')};
}
test('private forms stay locked without LINE identity and contain no seeded financial records',async()=>{
  const b=fixture();try{await tick();assert.equal(b.w.document.getElementById('record-fields').disabled,true);assert.equal(b.calls.length,0);assert.equal(b.form.elements.salesYen.value,'');assert.equal(b.errors.length,0);assert.ok(!b.w.document.body.textContent.includes('1234円'));}finally{b.dom.window.close();}
});
test('reviews preserve zero versus blank and render HTML as text',async()=>{
  const b=fixture();try{b.auth(true);await tick();b.form.elements.title.value='<img src=x onerror=alert(1)>';b.form.elements.salesYen.value='0';b.form.elements.costsYen.value='';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();
    assert.equal(b.rows[0].data.salesYen,0);assert.equal(b.rows[0].data.costsYen,null);const list=b.w.document.getElementById('record-list');assert.ok(list.textContent.includes('売上 0円'));assert.ok(list.textContent.includes('費用 未入力'));assert.equal(list.querySelectorAll('img').length,0);assert.equal(b.form.elements.title.value,'');assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});
test('failed saving keeps form values and retries the same id',async()=>{
  const b=fixture();try{b.auth(true);await tick();b.fail=true;b.form.elements.title.value='架空の記録';b.form.elements.salesYen.value='1234';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();assert.equal(b.form.elements.salesYen.value,'1234');assert.equal(b.rows.length,0);b.fail=false;b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();const posts=b.calls.filter(c=>c.method==='POST');assert.equal(posts[0].body.id,posts[1].body.id);assert.equal(b.rows.length,1);assert.equal(b.errors.length,0);}finally{b.dom.window.close();}
});
test('shared task editing and search work; copy includes only explicitly pending requests',async()=>{
  const b=fixture();try{b.auth(true);await tick();b.w.document.querySelector('[data-kind=task]').click();b.form.elements.title.value='テストの作業';b.form.elements.status.value='未着手';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();
    [...b.w.document.querySelectorAll('.record-card button')].find(x=>x.textContent==='編集').click();b.form.elements.status.value='完了';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();assert.equal(b.rows[0].data.status,'完了');
    b.w.document.getElementById('open-only').checked=true;b.w.document.getElementById('open-only').dispatchEvent(new b.w.Event('change'));assert.equal(b.w.document.querySelectorAll('.record-card').length,0);
    b.w.document.querySelector('[data-kind=request]').click();b.form.elements.title.value='依頼テスト';b.form.elements.notes.value='確認する本文';b.form.elements.status.value='未対応';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();b.w.document.getElementById('copy-requests').click();await tick();assert.ok(b.copied[0].includes('確認する本文'));assert.ok(!b.copied[0].includes('テストの作業'));assert.ok(b.calls.every(c=>c.path.startsWith('/records')));assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});
test('authentication loss clears visible records, amounts, drafts and late responses',async()=>{
  const b=fixture();try{b.auth(true);await tick();b.form.elements.title.value='入力中の秘密';b.form.elements.salesYen.value='1234';b.clear();b.auth(false);await tick();assert.equal(b.form.elements.title.value,'');assert.equal(b.form.elements.salesYen.value,'');assert.equal(b.w.document.getElementById('record-fields').disabled,true);assert.equal(b.w.localStorage.length,0);assert.equal(b.w.sessionStorage.length,0);
    let complete;b.delay=new Promise(resolve=>{complete=resolve;});b.auth(true);b.clear();b.auth(false);complete();await tick();assert.equal(b.w.document.querySelectorAll('.record-card').length,0);assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});
test('catalog contains 27 unique works and existing photos, without inventory or financial values',()=>{
  assert.equal(catalog.length,27);assert.equal(new Set(catalog.map(x=>x.id)).size,27);assert.ok(catalog.some(x=>x.id==='work-heart-bear'&&x.photos.length===0));assert.ok(catalog.find(x=>x.id==='work-happy-pack').photoType.includes('ポップ'));
  for(const row of catalog){assert.equal('stock' in row,false);assert.equal('salesYen' in row,false);for(const photo of row.photos)assert.ok(existsSync(new URL('../'+photo.src,import.meta.url)));}
});

test('pressing the active record kind preserves a draft and generated requests expose a working cancel action',async()=>{
  const b=fixture();try{
    b.auth(true);await tick();b.form.elements.title.value='draft';b.form.dispatchEvent(new b.w.Event('input'));let prompts=0;b.w.confirm=()=>{prompts++;return true;};b.w.document.querySelector('[data-kind=review]').click();assert.equal(b.form.elements.title.value,'draft');assert.equal(prompts,0);
    b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();[...b.w.document.querySelectorAll('.record-card button')].find(e=>e.textContent==='この記録から更新依頼').click();assert.equal(b.w.document.getElementById('record-cancel').hidden,false);assert.equal(b.w.document.activeElement,b.form.elements.title);assert.ok(b.w.document.getElementById('notes-label').textContent.includes('変更内容'));
    b.w.document.getElementById('record-cancel').click();assert.equal(b.form.elements.title.value,'');assert.equal(b.form.hasAttribute('data-private-dirty'),false);assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});

test('pending save blocks navigation and other record mutations until its result is known',async()=>{
  const b=fixture();try{
    b.auth(true);await tick();b.form.elements.title.value='existing record';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();
    b.form.elements.title.value='pending record';b.form.dispatchEvent(new b.w.Event('input'));let finish;b.delayWrite=new Promise(resolve=>{finish=resolve;});b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));
    assert.equal(b.form.getAttribute('aria-busy'),'true');assert.ok([...b.w.document.querySelectorAll('[data-kind],.record-card button')].every(e=>e.disabled));
    b.w.document.querySelector('[data-kind=task]').click();b.w.document.querySelector('.record-card button').dispatchEvent(new b.w.Event('click'));assert.equal(b.form.elements.title.value,'pending record');assert.equal(b.w.document.querySelector('[data-kind=review]').getAttribute('aria-pressed'),'true');
    assert.equal(b.calls.filter(c=>c.method==='POST').length,2);assert.equal(b.calls.some(c=>c.method==='DELETE'),false);finish();await tick();
    assert.equal(b.form.getAttribute('aria-busy'),'false');assert.equal(b.rows.length,2);assert.equal(b.form.elements.title.value,'');assert.ok([...b.w.document.querySelectorAll('[data-kind],.record-card button')].every(e=>!e.disabled));assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});

test('late delete acknowledgement after background cannot reset a restored form',async()=>{
  const b=fixture();try{
    b.auth(true);await tick();b.form.elements.title.value='record to delete';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();
    b.w.document.querySelector('.record-card button').click();b.form.elements.notes.value='preserved edit';b.form.dispatchEvent(new b.w.Event('input'));let finish;b.delayWrite=new Promise(resolve=>{finish=resolve;});[...b.w.document.querySelectorAll('.record-card button')].find(e=>e.textContent==='消す').click();
    assert.equal(b.form.getAttribute('aria-busy'),'true');b.clear();b.auth(false);b.auth(true);await tick();assert.equal(b.form.elements.notes.value,'preserved edit');assert.equal(b.form.getAttribute('aria-busy'),'false');
    finish();await tick();assert.equal(b.form.elements.notes.value,'preserved edit');assert.equal(b.w.document.getElementById('record-fields').disabled,false);assert.ok(!b.w.document.getElementById('record-feedback').textContent.includes('削除済み'));assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});
