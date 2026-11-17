import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
const A='a'.repeat(64), B='b'.repeat(64);
function fixture(){
  const errors=[],calls=[],intervals=[],rows=[];
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(read('private.html'),{url:'https://yukaridev-cmd.github.io/dongurinoyume-board/private.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window;let viewer=A,hidden=false,failure=0,postDelay=null,sessionDelay=null,token='signed.id.token';
  w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  w.setInterval=fn=>intervals.push(fn);w.AbortSignal=AbortSignal;
  w.DONGURI_COMMENTS_CONFIG={liffId:'test-liff',apiBase:'https://api.example'};
  w.liff={init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>token};
  w.fetch=async(url,options={})=>{
    if(url==='catalog.json')return Response.json(JSON.parse(read('catalog.json')));
    calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
    if(failure===-1)throw Error('offline');
    if(failure===-403)return new Response('<html>denied</html>',{status:403});
    if(failure)return Response.json({error:'authentication failed'},{status:failure});
    if(url.endsWith('/session')){const captured=viewer;if(sessionDelay)await sessionDelay;return Response.json({author:'same display name',viewer:captured});}
    if(url.endsWith('/comments'))return Response.json({comments:[],next:null});
    if(options.method==='POST'){
      if(postDelay)await postDelay;
      const body=JSON.parse(options.body);const record={...body,author:'same display name',updatedBy:'same display name',version:1,canEdit:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      if(!rows.some(r=>r.id===record.id))rows.push(record);
      return Response.json({record});
    }
    if(options.method==='PATCH')return Response.json({error:'version conflict'},{status:409});
    return Response.json({records:rows,next:null});
  };
  w.eval(read('private.js'));w.eval(read('comments-api.js'));
  const form=w.document.getElementById('record-form');
  return {dom,w,errors,calls,intervals,rows,form,
    set viewer(v){viewer=v;},set token(v){token=v;},set failure(v){failure=v;},set postDelay(v){postDelay=v;},set sessionDelay(v){sessionDelay=v;},
    visibility(v){hidden=v;w.document.dispatchEvent(new w.Event('visibilitychange'));},
    draft(title='private draft'){form.elements.title.value=title;form.elements.salesYen.value='0';form.elements.costsYen.value='';form.elements.notes.value='private notes';form.dispatchEvent(new w.Event('input',{bubbles:true}));},
    submit(){form.dispatchEvent(new w.Event('submit',{cancelable:true}));},
    unload(){const e=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(e);return e.defaultPrevented;},
    assertProtected(){assert.equal(form.elements.title.value,'');assert.equal(form.elements.notes.value,'');assert.equal(form.elements.salesYen.value,'');assert.equal(w.document.getElementById('record-fields').disabled,true);assert.equal(w.document.querySelectorAll('.record-card').length,0);},
    close(){assert.equal(errors.length,0);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);dom.window.close();}
  };
}
test('app switching protects DOM and restores exact unsaved amounts only after same identity verification',async()=>{
  const b=fixture();try{
    await tick();b.draft();b.w.document.getElementById('record-search').value='private search';assert.equal(b.unload(),true);
    b.visibility(true);b.assertProtected();assert.equal(b.w.document.getElementById('record-search').value,'');
    assert.equal(b.calls.filter(c=>c.method==='POST').length,0);assert.equal(b.unload(),true);
    b.visibility(false);await tick();assert.equal(b.form.elements.title.value,'private draft');assert.equal(b.form.elements.salesYen.value,'0');assert.equal(b.form.elements.costsYen.value,'');assert.equal(b.w.document.getElementById('record-search').value,'private search');
    assert.equal(b.calls.filter(c=>c.method==='POST').length,0);
    b.w.document.getElementById('record-cancel').click();assert.equal(b.unload(),false);
  }finally{b.close();}
});
test('network failure preserves active editing; authentication denial protects it until same member returns',async()=>{
  const b=fixture();try{
    await tick();b.draft();b.failure=-1;await b.intervals[0]();assert.equal(b.form.elements.title.value,'private draft');assert.equal(b.w.document.getElementById('record-fields').disabled,false);
    b.failure=401;await b.intervals[0]();b.assertProtected();
    b.failure=0;await b.w.DonguriComments.connect();await tick();assert.equal(b.form.elements.title.value,'private draft');
    b.visibility(true);b.failure=-1;b.visibility(false);await tick();b.assertProtected();
    b.failure=0;await b.w.DonguriComments.connect();await tick();assert.equal(b.form.elements.notes.value,'private notes');
  }finally{b.close();}
});
test('different members with same display name receive separate draft vaults and no automatic writes',async()=>{
  const b=fixture();try{
    await tick();b.draft('member A secret');b.visibility(true);b.viewer=B;b.visibility(false);await tick();assert.equal(b.form.elements.title.value,'');assert.ok(!b.w.document.body.textContent.includes('member A secret'));
    b.draft('member B secret');b.visibility(true);b.viewer=A;b.visibility(false);await tick();assert.equal(b.form.elements.title.value,'member A secret');
    b.visibility(true);b.viewer=B;b.visibility(false);await tick();assert.equal(b.form.elements.title.value,'member B secret');assert.equal(b.calls.filter(c=>c.method==='POST').length,0);
  }finally{b.close();}
});
test('uncertain save across suspension keeps idempotency id; late acknowledgement cannot clear restored draft',async()=>{
  const b=fixture();try{
    await tick();b.draft();let finish;b.postDelay=new Promise(resolve=>{finish=resolve;});b.submit();
    const first=b.calls.find(c=>c.method==='POST');b.visibility(true);b.assertProtected();b.visibility(false);await tick();assert.equal(b.form.elements.title.value,'private draft');
    finish();await tick();assert.equal(b.form.elements.title.value,'private draft');
    b.postDelay=null;b.submit();await tick();const posts=b.calls.filter(c=>c.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].body.id,posts[1].body.id);assert.equal(b.rows.length,1);assert.equal(b.form.elements.title.value,'');assert.equal(b.unload(),false);
  }finally{b.close();}
});
test('editing across background preserves original version and a conflict keeps the draft',async()=>{
  const b=fixture();try{
    await tick();b.draft();b.submit();await tick();b.w.document.querySelector('.record-card button').click();b.form.elements.notes.value='unsaved edit';
    b.visibility(true);b.rows[0].version=4;b.visibility(false);await tick();assert.equal(b.form.elements.notes.value,'unsaved edit');b.submit();await tick();
    const sent=b.calls.find(c=>c.method==='PATCH');assert.equal(sent.body.version,1);assert.equal(b.form.elements.notes.value,'unsaved edit');assert.equal(b.unload(),true);
  }finally{b.close();}
});
test('late session cannot expose a draft while hidden and reconnect queue verifies current identity',async()=>{
  const b=fixture();try{
    await tick();b.draft();b.visibility(true);let finish;b.sessionDelay=new Promise(resolve=>{finish=resolve;});b.visibility(false);await tick();b.visibility(true);b.viewer=B;b.visibility(false);b.sessionDelay=null;finish();await tick();await tick();assert.equal(b.form.elements.title.value,'');assert.equal(b.w.document.getElementById('record-fields').disabled,false);
    b.visibility(true);b.viewer=A;b.visibility(false);await tick();assert.equal(b.form.elements.title.value,'private draft');
  }finally{b.close();}
});
test('old server without verified viewer cannot unlock records',async()=>{
  const b=fixture();try{b.viewer=undefined;await tick();b.assertProtected();assert.equal(b.calls.some(c=>c.url.endsWith('/records')),false);}finally{b.close();}
});

test('changed LIFF token cannot submit previous member draft before identity revalidation',async()=>{
  const b=fixture();try{
    await tick();b.draft('member A secret');b.viewer=B;b.token='other.signed.token';b.submit();await tick();
    assert.equal(b.calls.some(c=>c.method==='POST'),false);assert.equal(b.form.elements.title.value,'');
    b.viewer=A;b.token='refreshed.original.token';await b.intervals[0]();await tick();assert.equal(b.form.elements.title.value,'member A secret');
  }finally{b.close();}
});

test('non-JSON authentication denial also clears visible confidential drafts',async()=>{
  const b=fixture();try{await tick();b.draft();b.failure=-403;await b.intervals[0]();b.assertProtected();b.failure=0;await b.w.DonguriComments.connect();await tick();assert.equal(b.form.elements.title.value,'private draft');}finally{b.close();}
});
