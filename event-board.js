(function(){
'use strict';
var ready=false,viewer='',epoch=0,fingerprint='',box=document.getElementById('private-events-list');
function notice(text){var p=document.createElement('p');p.textContent=text;p.className='workflow-note';return p;}
function clear(){ready=false;viewer='';epoch++;fingerprint='';box.removeAttribute('aria-busy');box.replaceChildren(notice('LINE認証後に、二人で追加した出店を表示'));box.closest('details').hidden=true;}
window.addEventListener('comments-clear',clear);window.addEventListener('comments-suspend',clear);
window.addEventListener('comments-auth',async function(e){
 if(!e.detail.ready||!/^[0-9a-f]{64}$/.test(e.detail.viewer||'')){clear();return;}
 if(viewer!==e.detail.viewer)clear();
 ready=true;viewer=e.detail.viewer;var current=++epoch,events=[],cursor='';box.setAttribute('aria-busy','true');
 try{
  do{var result=await window.DonguriComments.save('/events'+(cursor?'?cursor='+encodeURIComponent(cursor):''),'GET');if(current!==epoch||!ready)return;events.push(...result.events);cursor=result.next;}while(cursor);
  var shown=events.filter(r=>!r.publicReference).sort((a,b)=>(a.data.date||'9999').localeCompare(b.data.date||'9999')),next=JSON.stringify(shown);
  box.querySelector('[data-event-error]')?.remove();if(fingerprint===next)return;
  var fragment=document.createDocumentFragment();shown.forEach(function(event){
   var card=document.createElement('article');card.className='private-event-card';var a=document.createElement('a');a.href='event.html#id='+encodeURIComponent(event.id);a.textContent=event.data.title;
   var p=notice([event.data.date,event.data.start,event.data.venue].filter(Boolean).join(' · '));card.append(a,p);fragment.appendChild(card);
  });if(!fragment.children.length)fragment.appendChild(notice('追加した出店はまだなし'));box.replaceChildren(fragment);box.closest('details').hidden=!shown.length;if(shown.length)box.closest('details').open=true;fingerprint=next;
 }catch(error){if(current===epoch){box.querySelector('[data-event-error]')?.remove();var p=notice(error.message);p.dataset.eventError='';p.setAttribute('role','status');box.appendChild(p);box.closest('details').hidden=false;box.closest('details').open=true;}}
 finally{if(current===epoch)box.removeAttribute('aria-busy');}
});
clear();
})();
