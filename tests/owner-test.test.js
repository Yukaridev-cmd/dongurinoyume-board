import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createOwnerTestHandler} from '../backend/owner-test.js';
import {createHandler} from '../backend/worker.js';
const owner='U'+'1'.repeat(32),other='U'+'2'.repeat(32),origin='https://owner-test.example';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of ['schema.sql','records-schema.sql','owner-test-marker.sql'])sqlite.exec(readFileSync(new URL('../backend/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){return{bind(...args){const s=sqlite.prepare(sql);return{first:async()=>s.get(...args)||null,all:async()=>({results:s.all(...args)}),run:async()=>({meta:{changes:Number(s.run(...args).changes)}})};}};}};
 const env={TEST_DB:db,OWNER_TEST_ONLY:'true',OWNER_TEST_ORIGIN:origin,TEST_OWNER_LINE_ID:owner,LINE_CHANNEL_ID:'123456',TEST_LIFF_ID:'123456-test'};
 let subject=owner;const external=[];
 const fetcher=async(url,options)=>{external.push({url,options});if(url==='https://api.line.me/oauth2/v2.1/verify')return Response.json({iss:'https://access.line.me',aud:env.LINE_CHANNEL_ID,sub:subject,exp:Date.now()/1000+300,iat:Date.now()/1000});return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}});};
 const handler=createOwnerTestHandler({assets:{'/index.html':{body:'public fixture',type:'text/html; charset=utf-8'}},imagePaths:['/assets/existing.jpg'],fetcher});
 return{env,db,sqlite,external,fetcher,set subject(v){subject=v;},request(path='/',method='GET',body,headers={}){return handler(new Request(origin+path,{method,headers:{Origin:origin,Authorization:'Bearer signed.id.token',...headers},body:body?JSON.stringify(body):undefined}),env);}};
}
test('owner test refuses missing secrets, production bindings, wrong origin and unattested DB',async()=>{
 const f=fixture();try{
  for(const key of ['TEST_OWNER_LINE_ID','TEST_DB','OWNER_TEST_ONLY','OWNER_TEST_ORIGIN','LINE_CHANNEL_ID']){const v=f.env[key];delete f.env[key];assert.equal((await f.request('/session')).status,503);f.env[key]=v;}
  f.env.DB=f.db;assert.equal((await f.request('/session')).status,503);delete f.env.DB;
  f.env.LINE_MEMBERS='{}';assert.equal((await f.request('/session')).status,503);delete f.env.LINE_MEMBERS;
  f.env.OWNER_TEST_ORIGIN='https://production.example';assert.equal((await f.request('/session')).status,503);f.env.OWNER_TEST_ORIGIN=origin;
  f.sqlite.exec('DROP TABLE owner_test_environment');assert.equal((await f.request('/session')).status,503);assert.equal(f.external.length,0);
 }finally{f.sqlite.close();}
});
test('only the preconfigured server-verified owner can persist synthetic data in the isolated store',async()=>{
 const f=fixture();try{
  const h={'Content-Type':'application/json'};const body={id:'11111111-1111-4111-8111-111111111111',target:'実機テスト',text:'架空の確認用コメント'};
  assert.equal((await f.request('/comments','POST',body,h)).status,201);
  assert.equal((await(await f.request('/comments')).json()).comments[0].text,body.text);
  f.subject=other;for(const method of ['GET','POST'])assert.equal((await f.request('/comments',method,method==='POST'?body:undefined,h)).status,403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
  f.subject=owner;assert.equal((await f.request('/session','GET',undefined,{Authorization:''})).status,401);
  assert.equal((await f.request('/session','GET',undefined,{Origin:'https://untrusted.example'})).status,403);
 }finally{f.sqlite.close();}
});
test('same-origin GET needs browser provenance and supplied foreign Origin is never replaced',async()=>{
 const f=fixture();try{
  const make=headers=>new Request(origin+'/session',{headers:{Authorization:'Bearer signed.id.token',...headers}});
  const handler=createOwnerTestHandler({fetcher:f.fetcher});
  assert.equal((await handler(make({}),f.env)).status,403);
  assert.equal((await handler(make({'Sec-Fetch-Site':'same-origin'}),f.env)).status,200);
  assert.equal((await handler(make({'Sec-Fetch-Site':'same-origin',Origin:'https://untrusted.example'}),f.env)).status,403);
 }finally{f.sqlite.close();}
});
test('test assets contain public config only and proxy only whitelisted public images without credentials',async()=>{
 const f=fixture();try{
  const root=await f.request();assert.equal(await root.text(),'public fixture');assert.equal(root.headers.get('Cache-Control'),'no-store, private');
  const config=await(await f.request('/comments-config.js')).text();assert.ok(config.includes('123456-test'));assert.ok(!config.includes(owner));assert.ok(!config.includes('signed.id.token'));
  await f.request('/assets/existing.jpg?private=do-not-forward');assert.equal(f.external[0].url,'https://yukaridev-cmd.github.io/dongurinoyume-board/assets/existing.jpg');assert.deepEqual(f.external[0].options.headers,{});
  assert.equal((await f.request('/assets/unknown.jpg')).status,404);assert.equal(f.external.length,1);
 }finally{f.sqlite.close();}
});
test('production entry still rejects one member even with owner-test flags present',async()=>{
 const f=fixture();try{
  const response=await createHandler(f.fetcher)(new Request(origin+'/session',{headers:{Origin:origin,Authorization:'Bearer signed.id.token'}}),{...f.env,DB:f.db,ALLOWED_ORIGIN:origin,LINE_MEMBERS:JSON.stringify({[owner]:'本人'})});
  assert.equal(response.status,503);assert.equal(f.external.length,0);
 }finally{f.sqlite.close();}
});
