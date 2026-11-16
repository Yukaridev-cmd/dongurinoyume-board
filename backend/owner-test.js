import { createHandler } from './worker.js';
const MARKER = 'dongurinoyume-owner-test-v1';
const PUBLIC_BOARD = 'https://yukaridev-cmd.github.io/dongurinoyume-board/';
const headers = { 'Cache-Control':'no-store, private', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow' };
function json(error,status){return Response.json({error},{status,headers});}
export function createOwnerTestHandler({ assets = {}, imagePaths = [], fetcher = fetch } = {}) {
  const api = createHandler(fetcher,{memberCount:1});
  const allowedImages = new Set(imagePaths);
  return async function ownerTest(request,env) {
    const url = new URL(request.url);
    try {
      // Refuse a production DB binding and require an independent DB attestation.
      // The worker never creates tables or enrolls a caller's identity.
      if(env.OWNER_TEST_ONLY!=='true'||env.OWNER_TEST_ORIGIN!==url.origin||env.DB||env.LINE_MEMBERS||
        !env.TEST_DB||!/^U[0-9a-f]{32}$/.test(env.TEST_OWNER_LINE_ID||'')||!/^\d+$/.test(env.LINE_CHANNEL_ID||''))return json('本人用テスト環境の設定待ち',503);
      const marker=await env.TEST_DB.prepare('SELECT purpose FROM owner_test_environment WHERE id = 1').bind().first();
      if(marker?.purpose!==MARKER)return json('テスト専用の保存先を確認',503);
      if(/^\/(?:session|comments|records)(?:\/|$)/.test(url.pathname)) {
        const normalized = new Headers(request.headers);
        // Same-origin browser GETs omit Origin. Never replace a supplied Origin.
        if(!normalized.has('Origin')&&request.method==='GET'&&normalized.get('Sec-Fetch-Site')==='same-origin')normalized.set('Origin',url.origin);
        return api(new Request(request,{headers:normalized}),{
          DB:env.TEST_DB,ALLOWED_ORIGIN:url.origin,LINE_CHANNEL_ID:env.LINE_CHANNEL_ID,
          LINE_MEMBERS:JSON.stringify({[env.TEST_OWNER_LINE_ID]:'本人（実機テスト）'})
        });
      }
      if(!['GET','HEAD'].includes(request.method))return json('対象の操作を確認',405);
      let body,type='text/html; charset=utf-8';
      if(url.pathname==='/comments-config.js') {
        if(!/^\d+-[A-Za-z0-9_-]+$/.test(env.TEST_LIFF_ID||''))return json('テスト用LIFFの設定待ち',503);
        type='text/javascript; charset=utf-8';
        body='window.DONGURI_COMMENTS_CONFIG=Object.freeze('+JSON.stringify({liffId:env.TEST_LIFF_ID,apiBase:url.origin})+');';
      } else if(allowedImages.has(url.pathname)) {
        // Only already-public repository images, without incoming headers/query.
        const response=await fetcher(new URL(url.pathname.slice(1),PUBLIC_BOARD).href,{headers:{},redirect:'error'});
        if(!response.ok)return json('既存画像を読み込めず',503);
        const bytes=await response.arrayBuffer();
        return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Type':'image/jpeg'}});
      } else {
        const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
        if(!asset)return json('対象なし',404);
        body=asset.body;type=asset.type;
      }
      return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':type}});
    } catch {return json('本人用テスト環境に接続できず',503);}
  };
}
