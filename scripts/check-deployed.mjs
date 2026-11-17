// Anonymous smoke test only: no tokens, personal data or record bodies are sent.
const base=process.env.DONGURI_API_BASE||'https://dongurinoyume-comments.joshapass.workers.dev';
const origin='https://yukaridev-cmd.github.io';
const cases=[
  ['/comments','GET',{}],['/records','GET',{}],
  ['/events','GET',{}],['/events','GET',{Origin:origin}],
  ['/events/11111111-1111-4111-8111-111111111111','GET',{Origin:origin}],
  ['/comments','GET',{Origin:origin}],['/records','GET',{Origin:origin}],
  ['/session','GET',{Origin:origin,Authorization:'Bearer invalid.token'}],
  ['/comments','POST',{Origin:origin,'Content-Type':'application/json'}],
  ['/records','POST',{Origin:origin,'Content-Type':'application/json'}],
  ['/records/11111111-1111-4111-8111-111111111111','DELETE',{Origin:origin,'Content-Type':'application/json'}],
  ['/records','GET',{Origin:'https://untrusted.example'}]
];
let failures=0;
await Promise.all(cases.map(async([path,method,headers])=>{
  const response=await fetch(base+path,{method,headers,signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  const safe=[401,403,503].includes(response.status)&&typeof data.error==='string'&&!('records'in data)&&!('comments'in data)&&!('events'in data)&&!('event'in data)&&/no-store/.test(response.headers.get('cache-control')||'')&&
    (headers.Origin===origin ? response.headers.get('access-control-allow-origin')===origin : !response.headers.get('access-control-allow-origin'));
  console.log(`${safe?'PASS':'FAIL'} ${method} ${path}: ${response.status}`);if(!safe)failures++;
}));
if(failures)process.exitCode=1;
