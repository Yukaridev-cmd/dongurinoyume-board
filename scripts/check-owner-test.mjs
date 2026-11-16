// No valid token or private payload. This must never create a record.
const base=process.env.DONGURI_OWNER_TEST_ORIGIN;
if(!base||new URL(base).origin!==base||!base.startsWith('https://'))throw Error('Specify the exact isolated test HTTPS origin');
let failed=0;
function check(ok,label){console.log((ok?'PASS ':'FAIL ')+label);if(!ok)failed++;}
for(const path of ['/','/private.html','/comments-config.js']){
 const r=await fetch(base+path,{signal:AbortSignal.timeout(15000)}),body=await r.text();
 check(r.status===200&&/no-store/.test(r.headers.get('cache-control')||'')&&!/\bU[0-9a-f]{32}\b/.test(body),path+' public shell/config contains no identity');
 if(path.endsWith('.html')||path==='/')check(body.includes('本人限定の実機保存テスト環境'),path+' isolation notice');
}
for(const path of ['/session','/comments','/records'])for(const h of [{},{Origin:base},{Origin:base,Authorization:'Bearer invalid.token'},{Origin:'https://untrusted.example'}]){
 const r=await fetch(base+path,{headers:h,signal:AbortSignal.timeout(15000)}),body=await r.json();
 check([401,403].includes(r.status)&&typeof body.error==='string'&&!body.comments&&!body.records&&/no-store/.test(r.headers.get('cache-control')||''),path+' rejects anonymous/forged access ('+r.status+')');
}
if(failed)process.exitCode=1;
