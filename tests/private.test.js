import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM,VirtualConsole } from 'jsdom';
const html=readFileSync(new URL('../private.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../private.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../catalog.json',import.meta.url),'utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function fixture(hash=''){
  const errors=[],calls=[],rows=[],events=[];let fail=false,delay=null,delayWrite=null;
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(html,{url:'https://yukaridev-cmd.github.io/dongurinoyume-board/private.html'+hash,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;
  w.fetch=async()=>Response.json(catalog);
  const copied=[];Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>copied.push(text)}});
  w.DonguriComments={save:async(path,method,body)=>{
    calls.push({path,method,body});if(fail)throw Error('テストの通信失敗');
    if(method==='GET'){if(delay)await delay;return path.startsWith('/events')?{events,next:null}:{records:rows,next:null};}
    if(delayWrite)await delayWrite;
    if(method==='POST'){const record={id:body.id,kind:body.kind,data:body.data,author:'本人',updatedBy:'本人',version:1,canEdit:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};rows.push(record);return{record};}
    const record=rows.find(r=>path.endsWith(r.id));
    if(method==='PATCH'){Object.assign(record,{data:body.data,version:record.version+1});return{record};}
    if(method==='DELETE'){rows.splice(rows.indexOf(record),1);return{deleted:true};}
  }};
  w.eval(source);
  return{dom,w,errors,calls,rows,events,copied,set fail(v){fail=v;},set delay(v){delay=v;},set delayWrite(v){delayWrite=v;},auth(ready,viewer='a'.repeat(64)){w.dispatchEvent(new w.CustomEvent('comments-auth',{detail:{ready,author:ready?'本人':'',viewer:ready?viewer:''}}));},clear(){w.dispatchEvent(new w.CustomEvent('comments-clear'));},form:w.document.getElementById('record-form')};
}
test('compact lists open the requested kind and editor only on demand, preserving drafts through suspension',async()=>{
 const b=fixture('#kind=inventory');try{b.auth(true);await tick();const d=b.w.document;
  assert.equal(d.getElementById('section-title').textContent,'棚卸メモ');assert.equal(b.form.hidden,true);assert.equal(d.querySelector('.records-column').hidden,false);
  d.getElementById('new-record').click();assert.equal(b.form.hidden,false);assert.equal(d.querySelector('.records-column').hidden,true);
  b.form.elements.title.value='架空の棚卸';b.form.elements.stock.value='0';b.form.dispatchEvent(new b.w.Event('input'));
  b.w.confirm=()=>false;d.getElementById('close-composer').click();assert.equal(b.form.hidden,false);assert.equal(b.form.elements.title.value,'架空の棚卸');
  b.clear();assert.equal(b.form.hidden,true);assert.equal(b.form.elements.title.value,'');b.auth(true);await tick();assert.equal(b.form.hidden,false);assert.equal(b.form.elements.stock.value,'0');
  b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();assert.equal(b.form.hidden,true);assert.equal(d.querySelector('.records-column').hidden,false);assert.ok(d.getElementById('record-list').textContent.includes('在庫 0点'));assert.equal(b.errors.length,0);
 }finally{b.dom.window.close();}
});
test('event context filters without migrating legacy records and explicit new records preserve association across suspension',async()=>{
 const b=fixture('#kind=task&event=event-xmas&new=1');try{const d=b.w.document;assert.equal(b.form.hidden,true);assert.equal(b.calls.length,0);b.clear();
  b.auth(true);await tick();assert.equal(b.form.hidden,false);assert.equal(b.form.elements.eventId.value,'event-xmas');b.form.elements.title.value='架空の印刷確認';b.form.dispatchEvent(new b.w.Event('input'));b.clear();assert.equal(b.form.elements.eventId.value,'');b.auth(true);await tick();assert.equal(b.form.elements.eventId.value,'event-xmas');
  b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();assert.equal(b.rows[0].data.eventId,'event-xmas');
  b.rows.push({...b.rows[0],id:'legacy',data:{title:'未分類の作業',notes:'',status:'未着手'}});b.auth(true);await tick();assert.equal(d.getElementById('record-list').textContent.includes('未分類の作業'),false);
  d.getElementById('event-filter').value='unassigned';d.getElementById('event-filter').dispatchEvent(new b.w.Event('change'));assert.ok(d.getElementById('record-list').textContent.includes('未分類の作業'));assert.equal(Object.hasOwn(b.rows[1].data,'eventId'),false);assert.equal(b.calls.filter(c=>c.method==='POST').length,1);
 }finally{b.dom.window.close();}
});
test('request handoff is available only in its list and opening editor hides it without sending',async()=>{
 const b=fixture('#kind=request');try{b.auth(true);await tick();const d=b.w.document;
  assert.equal(d.getElementById('handoff').hidden,false);d.getElementById('new-record').click();assert.equal(d.getElementById('handoff').hidden,true);
  d.getElementById('close-composer').click();assert.equal(d.getElementById('handoff').hidden,false);
  d.querySelector('[data-kind=task]').click();assert.equal(d.getElementById('handoff').hidden,true);assert.equal(b.calls.filter(c=>c.method!=='GET').length,0);
 }finally{b.dom.window.close();}
});
test('dashboard prioritizes dated tasks, completes with original version and hides private previews on suspension',async()=>{
  const b=fixture();try{
    const make=(id,kind,title,data)=>({id,kind,data:{title,notes:'架空の本文',...data},author:'本人',updatedBy:'本人',version:3,canEdit:true,updatedAt:'2026-11-17T00:00:00Z'});
    b.rows.push(make('task-later','task','後の作業',{status:'未着手',dueDate:'2026-12-20'}),make('task-first','task','先の作業',{status:'進行中',dueDate:'2026-12-01'}),make('request','request','架空の依頼',{status:'未対応'}));
    b.auth(true);await tick();const d=b.w.document;
    assert.ok(d.querySelector('.next-action').textContent.includes('先の作業'));
    d.querySelector('[data-kind=task]').click();
    const card=[...d.querySelectorAll('.record-card')].find(x=>x.textContent.includes('先の作業'));
    [...card.querySelectorAll('button')].find(x=>x.textContent==='完了にする').click();await tick();
    assert.equal(b.calls.find(x=>x.method==='PATCH').body.version,3);
    assert.equal(d.getElementById('task-count').textContent,'1');
    assert.ok(!d.getElementById('next-actions').textContent.includes('先の作業'));
    d.querySelector('[data-kind=request]').click();d.querySelector('[data-request-pick]').click();d.getElementById('preview-requests').click();assert.ok(d.getElementById('request-preview').textContent.includes('架空の本文'));
    b.clear();assert.equal(d.getElementById('request-preview').textContent,'');assert.equal(d.getElementById('request-preview').hidden,true);
    assert.ok(!d.getElementById('next-actions').textContent.includes('後の作業'));assert.equal(b.errors.length,0);
  }finally{b.dom.window.close();}
});
test('new record respects an unsaved draft and searches distinguish no matches from empty records',async()=>{
  const b=fixture();try{b.auth(true);await tick();const d=b.w.document;
    b.form.elements.title.value='残す下書き';b.form.dispatchEvent(new b.w.Event('input'));b.w.confirm=()=>false;d.getElementById('new-record').click();assert.equal(b.form.elements.title.value,'残す下書き');
    d.getElementById('record-search').value='ない項目';d.getElementById('record-search').dispatchEvent(new b.w.Event('input'));assert.ok(d.getElementById('record-list').textContent.includes('条件に合う記録なし'));
    assert.equal(b.calls.filter(x=>x.method!=='GET').length,0);
  }finally{b.dom.window.close();}
});
test('empty kinds omit list controls but a no-match filter always remains recoverable',async()=>{
 const b=fixture('#kind=task');try{b.auth(true);await tick();const d=b.w.document;
  assert.equal(d.querySelector('.list-tools').hidden,true);assert.equal(d.querySelector('.event-scope').hidden,true);
  d.getElementById('new-record').click();b.form.elements.title.value='架空の作業';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();
  assert.equal(d.querySelector('.list-tools').hidden,false);assert.equal(d.querySelector('.list-order').hidden,false);assert.equal(d.querySelector('.event-scope').hidden,false);
  d.getElementById('record-search').value='一致なし';d.getElementById('record-search').dispatchEvent(new b.w.Event('input'));assert.equal(d.querySelectorAll('.record-card').length,0);assert.equal(d.querySelector('.list-tools').hidden,false);
  d.getElementById('record-search').value='';d.getElementById('record-search').dispatchEvent(new b.w.Event('input'));assert.equal(d.querySelectorAll('.record-card').length,1);
  b.clear();assert.equal(d.querySelector('.list-tools').hidden,true);assert.equal(d.querySelectorAll('.record-card').length,0);assert.equal(b.errors.length,0);
 }finally{b.dom.window.close();}
});
test('private forms stay locked without LINE identity and contain no seeded financial records',async()=>{
  const b=fixture();try{await tick();assert.equal(b.w.document.getElementById('record-fields').disabled,true);assert.equal(b.calls.length,0);assert.equal(b.form.elements.salesYen.value,'');assert.equal(b.errors.length,0);assert.ok(!b.w.document.body.textContent.includes('1234円'));}finally{b.dom.window.close();}
});
test('AI copies only selected pending requests after preview and clears selection on lock',async()=>{
 const b=fixture('#kind=request');try{const d=b.w.document;for(const [id,status] of [['one','未対応'],['two','未対応'],['done','対応済み']])b.rows.push({id,kind:'request',data:{title:id,notes:'本文'+id,status},author:'本人',version:1,canEdit:true,updatedAt:'2026-11-17'});b.auth(true);await tick();
 d.getElementById('copy-requests').click();await tick();assert.equal(b.copied.length,0);assert.equal(d.querySelectorAll('[data-request-pick]').length,2);
 d.querySelector('[data-request-pick=one]').click();d.getElementById('copy-requests').click();await tick();assert.equal(b.copied.length,0);
 d.getElementById('preview-requests').click();d.getElementById('copy-requests').click();await tick();assert.ok(b.copied[0].includes('本文one'));assert.equal(b.copied[0].includes('本文two'),false);assert.equal(b.copied[0].includes('本文done'),false);
 d.querySelector('[data-request-pick=two]').click();d.getElementById('copy-requests').click();await tick();assert.equal(b.copied.length,1);
 b.clear();assert.equal(d.getElementById('request-preview').textContent,'');b.auth(true);await tick();assert.equal(d.querySelectorAll('[data-request-pick]:checked').length,0);assert.equal(b.calls.filter(c=>c.method!=='GET').length,0);
 }finally{b.dom.window.close();}
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
    b.w.document.querySelector('[data-kind=request]').click();b.form.elements.title.value='依頼テスト';b.form.elements.notes.value='確認する本文';b.form.elements.status.value='未対応';b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();b.w.document.querySelector('[data-request-pick]').click();b.w.document.getElementById('preview-requests').click();b.w.document.getElementById('copy-requests').click();await tick();assert.ok(b.copied[0].includes('確認する本文'));assert.ok(!b.copied[0].includes('テストの作業'));assert.ok(b.calls.every(c=>c.path.startsWith('/records')||(c.path==='/events'&&c.method==='GET')));assert.equal(b.errors.length,0);
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
    b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();[...b.w.document.querySelectorAll('.record-card button')].find(e=>e.textContent==='この記録からAIへの依頼').click();assert.equal(b.w.document.getElementById('record-cancel').hidden,false);assert.equal(b.w.document.activeElement,b.form.elements.title);assert.ok(b.w.document.getElementById('notes-label').textContent.includes('変更内容'));
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

test('private event names and association drafts disappear on lock and restore only for their verified viewer',async()=>{
 const id='11111111-1111-4111-8111-111111111111',b=fixture('#kind=task&event='+id+'&new=1');try{
 b.events.push({id,publicReference:false,data:{title:'架空の私的出店'}});b.auth(true);await tick();const d=b.w.document;assert.equal(b.form.elements.eventId.value,id);assert.equal(d.getElementById('event-filter').value,id);assert.ok(d.getElementById('event-back').href.endsWith('event.html#id='+id));b.form.elements.title.value='架空の持参準備';b.form.dispatchEvent(new b.w.Event('input'));b.clear();assert.equal(d.body.textContent.includes('架空の私的出店'),false);assert.equal(d.querySelectorAll('[data-private-event]').length,0);b.auth(true,'b'.repeat(64));await tick();assert.equal(b.form.elements.title.value,'');b.clear();b.auth(true);await tick();assert.equal(b.form.elements.title.value,'架空の持参準備');assert.equal(b.form.elements.eventId.value,id);b.form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await tick();assert.equal(b.rows[0].data.eventId,id);assert.equal(b.errors.length,0);
 }finally{b.dom.window.close();}
});

test('private event totals group explicit associations, preserve missing versus zero, and clear on lock',async()=>{
 const b=fixture('#kind=review');try{const make=(id,eventId,salesYen,costsYen)=>({id,kind:'review',data:{title:'合成データ',notes:'',eventId,salesYen,costsYen,date:''},author:'本人',canEdit:true,version:1,updatedAt:'2026-01-01'});b.rows.push(make('one','event-xmas',0,null),make('two','event-xmas',200,50),make('three','',300,null));b.auth(true);await tick();const d=b.w.document,p=d.getElementById('event-totals');assert.equal(p.hidden,false);assert.equal(p.querySelectorAll('.event-total-card').length,2);const cards=[...p.querySelectorAll('.event-total-card')];assert.match(cards[0].textContent,/売上 200円/);assert.ok(cards[0].textContent.includes('入力済み 2件 / 未入力 0件'));assert.match(cards[0].textContent,/費用 50円/);assert.match(cards[1].textContent,/未分類/);assert.match(cards[1].textContent,/費用 未入力/);[...d.querySelectorAll('#record-list .record-card .actions button')].find(e=>e.textContent==='出店を変更').click();assert.equal(b.form.elements.eventId.value,'event-xmas');d.getElementById('record-cancel').click();cards[1].querySelector('button').click();assert.equal(d.getElementById('event-filter').value,'unassigned');assert.equal(d.querySelectorAll('#record-list .record-card').length,1);assert.equal(b.rows[2].data.eventId,'');b.clear();assert.equal(p.hidden,true);assert.equal(p.textContent,'');assert.equal(d.body.textContent.includes('売上 300円'),false);
 }finally{b.dom.window.close();}
});
