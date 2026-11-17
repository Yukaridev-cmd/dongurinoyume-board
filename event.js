(function(){
'use strict';
var form=document.getElementById('event-form'),fields=document.getElementById('event-fields'),detail=document.getElementById('event-detail'),message=document.getElementById('event-message'),title=document.getElementById('event-title');
var ready=false,viewer='',epoch=0,saving=false,dirty=false,editing=false,phase='prepare',tab='basic',saved=null,version=0,drafts=new Map(),refs={events:[],products:[],pops:[]};
var hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('id')||'',isNew=hash.has('new'),keys=['title','date','start','end','venue','notes'];
if(isNew)id=crypto.randomUUID();
function node(tag,text){var n=document.createElement(tag);if(text)n.textContent=text;return n;}
function reference(){return refs.events.find(e=>e.id===id);}
function values(){var d={};keys.forEach(k=>d[k]=form.elements[k].value);d.products=[...form.querySelectorAll('[data-product]:checked')].map(n=>n.value);d.pops=[...form.querySelectorAll('[data-pop]:checked')].map(n=>n.value);return d;}
function fill(d){keys.forEach(k=>form.elements[k].value=d[k]||'');form.querySelectorAll('[data-product]').forEach(n=>n.checked=(d.products||[]).includes(n.value));form.querySelectorAll('[data-pop]').forEach(n=>n.checked=(d.pops||[]).includes(n.value));counts();}
function counts(){document.getElementById('products-count').textContent=form.querySelectorAll('[data-product]:checked').length;document.getElementById('pops-count').textContent=form.querySelectorAll('[data-pop]:checked').length;}
function selectTab(next){tab=next;document.querySelectorAll('[data-plan-tab]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.planTab===tab)));document.querySelectorAll('[data-plan-panel]').forEach(n=>n.hidden=n.dataset.planPanel!==tab);}
function busy(value){saving=value;fields.disabled=!ready||saving;form.setAttribute('aria-busy',String(value));}
function openEditor(){if(!ready||saving)return;editing=true;fill(saved||{title:reference()?.title||'',products:[],pops:[]});form.elements.title.readOnly=!!reference();document.getElementById('event-private-metadata').hidden=!!reference();document.getElementById('event-public-source').hidden=!reference();detail.hidden=true;form.hidden=false;selectTab('basic');}
function render(){
 detail.hidden=!ready||editing;form.hidden=!ready||!editing;title.textContent=ready?(saved?.title||reference()?.title||'出店を作成'):'出店の準備';
 if(!ready||editing)return;
 document.querySelectorAll('[data-plan-phase]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.planPhase===phase)));
 var context=document.getElementById('event-context');context.replaceChildren();if(saved&&!reference())context.appendChild(node('p',[saved.date,saved.start&&(saved.start+'〜'+saved.end),saved.venue].filter(Boolean).join(' · ')));
 if(reference()){var source=node('a','日時・会場の元資料');source.href='index.html#'+id;context.appendChild(source);}
 var actions=document.getElementById('event-actions');actions.replaceChildren();function action(text,kind,write){var a=node('a',text);a.className='workflow-action';a.href='private.html#kind='+kind+'&event='+encodeURIComponent(id)+(write?'&new=1':'');actions.appendChild(a);}
 if(phase==='prepare'){var edit=node('button',saved?'持参品・出店情報を編集':'持参品・ポップを選ぶ');edit.type='button';edit.className='workflow-action';edit.addEventListener('click',openEditor);actions.appendChild(edit);if(saved)action('準備すること','task');}
 if(phase==='day'){action('売上・費用を記録','review',true);action('棚卸メモ','inventory');}
 if(phase==='review'){action('振り返り・売上','review');action('次にやること','task');}
 var selections=document.getElementById('event-selections');selections.replaceChildren();if(!saved){selections.appendChild(node('p','選択内容はまだ未保存'));return;}
 for(const [key,label,catalog,route]of [['products','持参作品',refs.products,'works'],['pops','使用ポップ',refs.pops,'market']]){var group=node('details'),summary=node('summary',label+'（'+saved[key].length+'件）');group.appendChild(summary);group.open=phase==='prepare';var list=node('ul');list.className='event-selected-list';saved[key].forEach(function(itemId){var item=catalog.find(n=>n.id===itemId);if(!item)return;var li=node('li'),a=node('a',item.title);a.href='index.html#'+item.id;li.appendChild(a);list.appendChild(li);});group.appendChild(list);selections.appendChild(group);}
 if(saved.notes){var memo=node('details');memo.append(node('summary','準備メモ'),node('p',saved.notes));selections.appendChild(memo);}
}
function protect(){if(viewer&&editing)drafts.set(viewer,{id,version,values:values(),dirty,tab});ready=false;epoch++;saved=null;version=0;dirty=false;editing=false;fill({});document.getElementById('product-search').value='';document.getElementById('pop-search').value='';document.querySelectorAll('.selection-grid label').forEach(n=>n.hidden=false);document.getElementById('event-context').replaceChildren();document.getElementById('event-actions').replaceChildren();document.getElementById('event-selections').replaceChildren();message.textContent='LINE認証後に出店と準備内容を表示';busy(false);render();}
var references=Promise.all(['events.json','catalog.json','pops.json'].map(p=>fetch(p,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('選択肢を読み込めず');return r.json();}))).then(function([events,products,pops]){refs={events,products,pops};for(const [items,target,attr]of [[products,'product-options','product'],[pops,'pop-options','pop']]){var parent=document.getElementById(target);items.forEach(function(item){var label=node('label'),input=node('input');input.type='checkbox';input.value=item.id;input.setAttribute('data-'+attr,'');label.append(input,node('span',item.title));parent.appendChild(label);});}});
async function load(){var current=++epoch;busy(true);try{await references;if(current!==epoch||!ready)return;if(!reference()&&!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))throw Error('出店一覧から開く');
  if(!isNew){try{var result=await window.DonguriComments.save('/events/'+id,'GET');if(current!==epoch||!ready)return;saved=result.event.data;version=result.event.version;}catch(error){if(!reference()||error.message!=='保存済みの準備なし')throw error;}}
  if(current!==epoch||!ready)return;var draft=drafts.get(viewer);if(draft&&draft.id===id){openEditorAfterLoad();version=draft.version;fill(draft.values);dirty=draft.dirty;selectTab(draft.tab);drafts.delete(viewer);message.textContent='未保存入力を復元。保存済みか不明な場合は同じ内容で再試行';}else if(isNew)openEditorAfterLoad();else{editing=false;render();message.textContent='';}
 }catch(error){if(current===epoch)message.textContent=error.message;}finally{if(current===epoch)busy(false);}}
function openEditorAfterLoad(){saving=false;openEditor();}
window.addEventListener('comments-auth',function(e){if(!e.detail.ready||!/^[0-9a-f]{64}$/.test(e.detail.viewer||'')){protect();return;}if(ready&&viewer===e.detail.viewer&&(saving||editing))return;if(viewer&&viewer!==e.detail.viewer)protect();viewer=e.detail.viewer;ready=true;load();});
window.addEventListener('comments-clear',protect);window.addEventListener('comments-suspend',protect);
form.addEventListener('input',e=>{if(!['product-search','pop-search'].includes(e.target.id))dirty=true;counts();});form.addEventListener('change',()=>{dirty=true;counts();});
document.querySelectorAll('[data-plan-tab]').forEach(b=>b.addEventListener('click',()=>{var top=b.getBoundingClientRect().top;selectTab(b.dataset.planTab);var delta=b.getBoundingClientRect().top-top;if(delta)window.scrollTo({top:window.scrollY+delta,behavior:'instant'});}));
document.querySelectorAll('[data-plan-phase]').forEach(b=>b.addEventListener('click',()=>{var top=b.getBoundingClientRect().top;phase=b.dataset.planPhase;render();var delta=b.getBoundingClientRect().top-top;if(delta)window.scrollTo({top:window.scrollY+delta,behavior:'instant'});}));
for(const [input,items]of [['product-search','product-options'],['pop-search','pop-options']])document.getElementById(input).addEventListener('input',function(){var query=this.value.toLocaleLowerCase();document.getElementById(items).querySelectorAll('label').forEach(n=>n.hidden=!n.textContent.toLocaleLowerCase().includes(query));});
document.getElementById('event-cancel').addEventListener('click',function(){if(saving||dirty&&!confirm('未保存の編集を取消す'))return;editing=false;dirty=false;drafts.delete(viewer);fill({});if(isNew)openEditor();else render();});
form.addEventListener('submit',async function(e){e.preventDefault();if(!ready||saving)return;var current=epoch,data=values();if(!data.title.trim()){selectTab('basic');message.textContent='出店名を記入';form.elements.title.focus();return;}busy(true);message.textContent='保存中';try{var result=await window.DonguriComments.save('/events/'+id,'POST',{version,data});if(current!==epoch||!ready)return;saved=result.event.data;version=result.event.version;isNew=false;dirty=false;editing=false;drafts.delete(viewer);history.replaceState(null,'','#id='+id);render();message.textContent='出店と選択内容を保存済み';}catch(error){if(current===epoch)message.textContent=error.message;}finally{if(current===epoch)busy(false);}});
window.addEventListener('beforeunload',function(e){if(dirty||saving||[...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
references.catch(function(error){message.textContent=error.message;});render();
})();
