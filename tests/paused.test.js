import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('published paused configuration explains unavailable private features and starts no authentication or API calls',async()=>{
 const dom=new JSDOM('<header><button id="quick-memo-btn">コメントを書く</button></header><p id="comments-status"></p><button id="comments-login"></button>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://example.test'}),w=dom.window;let calls=0;
 try{w.liff={init:async()=>{calls++;}};w.fetch=async()=>{calls++;throw Error('unexpected network');};w.eval(read('comments-config.js'));w.eval(read('comments-api.js'));await w.DonguriComments.connect();
 assert.equal(calls,0);assert.match(w.document.getElementById('comments-status').textContent,/保存・閲覧は停止中/);assert.match(w.document.querySelector('.sharing-paused').textContent,/二人の設定待ち/);assert.equal(w.document.getElementById('comments-login').disabled,true);await assert.rejects(w.DonguriComments.save('/comments','POST',{text:'synthetic'}));assert.equal(calls,0);
 }finally{dom.window.close();}
});
