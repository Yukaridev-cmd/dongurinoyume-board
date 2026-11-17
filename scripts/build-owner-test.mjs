import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const root=new URL('../',import.meta.url),assets={},imagePaths=new Set();
const names=['index.html','private.html','private.js','private.css','comments-api.js','board-additions.css','accessibility.css','catalog.json','studio.css','ui-icons.js','workflow.js','events.json'];
for(const name of names){
  let body=readFileSync(new URL(name,root),'utf8');
  if(name.endsWith('.html')){
    for(const img of new JSDOM(body).window.document.querySelectorAll('img[src^="assets/"]'))imagePaths.add('/'+img.getAttribute('src'));
    body=body.replace(/<body([^>]*)>/,'<body$1><details class="test-notice"><summary>本人限定テスト · 架空データのみ</summary><p>本人限定の実機保存テスト環境。本番の記録・更新シートには反映しない。</p></details>');
    body=body.replace(/<title>/,'<title>【実機テスト】');
    body=body.replace('<link rel="icon" href="data:," />','<link rel="icon" href="data:," />\n<meta name="robots" content="noindex,nofollow" />');
  }
  const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/javascript';
  assets['/'+name]={body,type:type+'; charset=utf-8'};
}
for(const row of JSON.parse(assets['/catalog.json'].body))for(const photo of row.photos)imagePaths.add('/'+photo.src);
mkdirSync(new URL('.wrangler/owner-test/',root),{recursive:true});
writeFileSync(new URL('.wrangler/owner-test-entry.js',root),'import {createOwnerTestHandler} from "../backend/owner-test.js";\nexport default {fetch:createOwnerTestHandler('+JSON.stringify({assets,imagePaths:[...imagePaths]})+')};\n');
writeFileSync(new URL('.wrangler/owner-test/init.sql',root),['schema.sql','records-schema.sql','owner-test-marker.sql'].map(p=>readFileSync(new URL('backend/'+p,root),'utf8')).join('\n'));
console.log('Prepared isolated test entry: '+names.length+' public source files; '+imagePaths.size+' existing-public image paths. No private/new photos included.');
