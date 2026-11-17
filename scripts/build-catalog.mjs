import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const d = new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8')).window.document;
const catalog = [...d.querySelectorAll('.work')].map(card => ({
  id: card.id, title: card.querySelector('h3').textContent,
  ...(card.dataset.sale==='excluded'?{saleStatus:'excluded',saleNote:'別家族の出品・非売品として確認待ち（個別区分は未確定）'}:{}),
  photos: [...card.querySelectorAll('img,[data-reference-src]')].map(img => ({src:img.getAttribute('src')||img.dataset.referenceSrc,label:img.alt||img.dataset.referenceAlt,...(img.dataset.referenceSrc?{display:'hidden'}:{})})),
  photoType: card.id === 'work-happy-pack' ? 'ポップ画像・実物写真は未確認' : card.querySelector('[data-reference-src]') ? '既存写真は人物が写るため非表示' : card.querySelector('img') ? '既存写真・現物との照合待ち' : '実物写真は未確認'
}));
for (const item of catalog) for (const photo of item.photos) if (!existsSync(new URL('../'+photo.src,import.meta.url))) throw Error('Missing photo: '+photo.src);
writeFileSync(new URL('../catalog.json',import.meta.url),JSON.stringify(catalog,null,2)+'\n');
console.log('Validated '+catalog.length+' catalog entries; no stock values included.');
