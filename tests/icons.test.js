import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const iconCode=readFileSync(new URL('../ui-icons.js',import.meta.url),'utf8');
test('original inline icons preserve visible text and accessible labels without external resources',()=>{
 for(const file of ['index.html','private.html']){
  const dom=new JSDOM(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{runScripts:'outside-only'}),d=dom.window.document;
  try{const controls=[...d.querySelectorAll('[data-icon],[data-view-btn],[data-kind]')],labels=controls.map(n=>n.textContent);dom.window.eval(iconCode);
   assert.deepEqual(controls.map(n=>n.textContent),labels);assert.ok(controls.every(n=>n.querySelector('svg.ui-icon')));
   const count=d.querySelectorAll('.ui-icon').length;dom.window.DonguriIcons.decorate(d);assert.equal(d.querySelectorAll('.ui-icon').length,count);
   for(const svg of d.querySelectorAll('.ui-icon')){assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');assert.equal(svg.getAttribute('viewBox'),'0 0 24 24');assert.equal(svg.querySelectorAll('image,use,script,foreignObject').length,0);}
  }finally{dom.window.close();}
 }
});
test('photo review is secondary to inventory; public photos and the four record workflows remain directly reachable',()=>{
 const dom=new JSDOM(readFileSync(new URL('../private.html',import.meta.url),'utf8'));try{const d=dom.window.document;
  assert.deepEqual([...d.querySelectorAll('.tabs [data-kind]')].map(n=>n.dataset.kind),['review','task','inventory','request']);
  assert.ok(d.querySelector('.inventory-tools [data-kind=photo]'));assert.ok(d.querySelector('.primary-nav a[href="index.html#works"]'));assert.ok(d.querySelector('a[href="index.html#comments"]'));
  assert.equal(d.querySelector('.journal-dock'),null);assert.ok(d.querySelector('.journal-tools #export-records'));
 }finally{dom.window.close();}
});
test('work summary matches the displayed catalog without treating photos as stock',()=>{
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'));try{const d=dom.window.document,works=[...d.querySelectorAll('article.work')];
  const unknown=works.filter(n=>/価格 未確認|価格 未登録/.test(n.textContent)).length;
  assert.deepEqual([...d.querySelectorAll('.stock-summary .num')].map(n=>Number(n.textContent)),[works.length,works.length-unknown,unknown,works.length]);
  assert.equal(works.length,27);assert.equal(unknown,8);
 }finally{dom.window.close();}
});
test('the public event catalog and private association choices match the source event headings',()=>{
 const board=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8')),privatePage=new JSDOM(readFileSync(new URL('../private.html',import.meta.url),'utf8'));
 try{const events=JSON.parse(readFileSync(new URL('../events.json',import.meta.url),'utf8'));assert.deepEqual(events,[...board.window.document.querySelectorAll('main[id^="view-event-"]')].map(n=>({id:n.id.replace('view-',''),title:n.querySelector('h2').textContent})));
  assert.deepEqual([...privatePage.window.document.querySelectorAll('#record-event option')].filter(n=>n.value).map(n=>({id:n.value,title:n.textContent})),events);
 }finally{board.window.close();privatePage.window.close();}
});
