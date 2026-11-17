(function(){
'use strict';
function el(tag,text,className){var n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;}
function link(label,href,icon){var a=el('a',label,'workflow-action');a.href=href;a.dataset.icon=icon;return a;}
function recordLink(kind,id){return 'private.html#kind='+kind+'&event='+encodeURIComponent(id);}
var market=document.getElementById('view-market');
['pops','booth'].forEach(function(name){var source=document.getElementById('view-'+name),panel=market.querySelector('[data-market-panel='+name+']');Array.from(source.children).forEach(function(n){panel.appendChild(n);});});
window.DonguriMarket=function(name){market.querySelectorAll('[data-market-panel]').forEach(function(p){p.hidden=p.dataset.marketPanel!==name;});market.querySelectorAll('[data-market]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.market===name));});};
market.querySelectorAll('[data-market]').forEach(function(b){b.addEventListener('click',function(){window.DonguriMarket(b.dataset.market);});});
// Move existing nodes, including comments; never duplicate their targets or contents.
document.querySelectorAll('.pop-entry').forEach(function(card){var head=card.querySelector('.head'),body=el('details',null,'compact-detail'),summary=el('summary','画像・価格・印刷内容を開く');body.appendChild(summary);Array.from(card.children).filter(function(n){return n!==head;}).forEach(function(n){body.appendChild(n);});card.appendChild(body);});
document.querySelectorAll('.work').forEach(function(card){var body=card.querySelector('.body');if(!body)return;var more=el('details',null,'work-more'),summary=el('summary','詳細・棚卸・相談');more.appendChild(summary);Array.from(body.children).filter(function(n){return !n.matches('h3,.price');}).forEach(function(n){more.appendChild(n);});body.appendChild(more);});
document.querySelectorAll('main[id^="view-event-"]').forEach(function(view){
 var id=view.id.replace('view-',''),head=view.querySelector('.view-head'),facts=view.querySelector(':scope > .facts'),memo=view.querySelector('[data-memo-zone]');
 var original=Array.from(view.children).filter(function(n){return n!==head&&n!==facts&&n!==memo&&!n.matches('.backlink,.view-lead');});
 var tabs=el('div',null,'event-phases');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','出店で行うこと');
 var panels=el('div',null,'event-phase-content'),names={prepare:'準備',day:'当日',review:'振り返り'},icons={prepare:'task',day:'events',review:'review'};
 function select(phase){tabs.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.phase===phase));});panels.querySelectorAll('[data-phase-panel]').forEach(function(p){p.hidden=p.dataset.phasePanel!==phase;});}
 Object.keys(names).forEach(function(phase){var b=el('button',names[phase]);b.type='button';b.dataset.phase=phase;b.dataset.icon=icons[phase];b.addEventListener('click',function(){select(phase);});tabs.appendChild(b);var p=el('section',null,'phase-panel');p.dataset.phasePanel=phase;p.setAttribute('aria-label',names[phase]);var actions=el('div',null,'workflow-actions');p.appendChild(actions);
  if(phase==='prepare'){actions.append(link('準備すること',recordLink('task',id),'task'),link('作品・在庫を見る','#works','works'),link('ポップ・ブースを見る','#market','booth'));p.appendChild(el('p','この出店の作業を確認。作品・売り場は共通の資料。','workflow-note'));}
  if(phase==='day'){actions.append(link('売上・費用を記録',recordLink('review',id)+'&new=1','review'),link('在庫を確認・記録',recordLink('inventory',id),'inventory'));if(memo)p.appendChild(memo);}
  if(phase==='review'){actions.append(link('振り返り・売上を見る',recordLink('review',id),'review'),link('次にやること',recordLink('task',id),'task'));p.appendChild(el('p','金額・振り返りはLINE認証後に表示。未分類の記録は自動で紐付けない。','workflow-note'));}
  panels.appendChild(p);
 });
 head.after(tabs,panels);
 if(facts){var info=el('details',null,'event-info');info.appendChild(el('summary','日時・会場・確認事項'));info.appendChild(facts);panels.after(info);}
 var archive=el('details',null,'event-source');archive.append(el('summary','既存の準備資料・出店写真'),el('p','以前の記載と写真を保管。私的な作業の進み具合とは別に確認。','workflow-note'));original.forEach(function(n){archive.appendChild(n);});view.appendChild(archive);
 var lead=view.querySelector(':scope > .view-lead');if(lead)lead.hidden=true;
 select(['event-xmas','event-tabashita'].includes(id)?'prepare':'review');
});
// Event lists stay compact; older events are available without filling the initial screen.
var events=document.getElementById('view-events'),past=Array.from(events.querySelectorAll(':scope > h3')).find(function(n){return n.textContent==='終わったイベント';});
if(past){var archive=el('details',null,'past-events');archive.appendChild(el('summary','過去の出店（7件）'));var next=past.nextElementSibling;past.replaceWith(archive);if(next)archive.appendChild(next);}
var eventMemo=events.querySelector('[data-memo-zone]');if(eventMemo){var disclosure=el('details',null,'event-source');disclosure.appendChild(el('summary','出店全体への相談'));eventMemo.before(disclosure);disclosure.appendChild(eventMemo);}
events.querySelectorAll('.event-card .body').forEach(function(body){var heading=body.querySelector('h3'),actions=body.querySelector('.pop-actions'),date=body.querySelector('.m-line'),more=el('details',null,'event-card-more');more.appendChild(el('summary','会場・補足・相談'));Array.from(body.children).filter(function(n){return n!==heading&&n!==actions;}).forEach(function(n){more.appendChild(n);});if(date)heading.after(el('p',date.textContent,'event-date'));body.appendChild(more);});
var actions=el('div',null,'workflow-shortcuts');actions.append(link('未分類の振り返り','private.html#kind=review&event=unassigned','review'),link('すべての作業','private.html#kind=task','task'));events.appendChild(actions);
var originalShow=window.DonguriBoard.showView;
window.addEventListener('board-view',function(e){if(e.detail.id==='market')document.querySelector('[data-view-btn=market]').setAttribute('aria-controls','view-market');});
if(window.DonguriIcons)window.DonguriIcons.decorate(document);
// Preserve old URLs after moving the actual content into its new parent.
var hash=location.hash.slice(1);if(['booth','pops'].includes(hash))originalShow(hash);else if(hash){var target=document.getElementById(hash);if(target&&target.closest('#view-market'))originalShow('market',hash);}
})();
