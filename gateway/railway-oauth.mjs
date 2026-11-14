import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const ISSUER='https://backboard.railway.com';
export const RAILWAY_SCOPE='openid project:viewer';
const PROJECT='7636e62d-ae69-44eb-ad29-dca7069ac054';
const PROJECT_QUERY='query NexoGrantedProjects { externalWorkspaces { projects { id } } }';
const hash=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const json=(error,status)=>Response.json({error},{status});
const redirect=()=>new Response(null,{status:303,headers:{Location:'/railway'}});
// Tokens never leave this closure, are never logged/persisted, and are bounded
// by the owner session and provider expiry. No refresh/offline access is requested.
export function createRailwayOAuth({origin,railwayClientId,railwayClientSecret},{http=fetch,now=()=>Date.now()}={}){
 if((!!railwayClientId)!=(!!railwayClientSecret))throw Error('Incomplete Railway OAuth client');
 const configured=!!railwayClientId;
 if(configured&&new URL(origin).protocol!=='https:')throw Error('Railway OAuth requires HTTPS');
 const callback=origin+'/railway/callback',pending=new Map(),grants=new Map(),forms=new Map(),active=new Map();
 let windowEnd=0,attempts=0;
 function prune(){for(const map of [pending,grants,forms,active])for(const [k,v] of map)if(v.until<=now())map.delete(k);}
 function forget(owner){grants.delete(owner);forms.delete(owner);active.delete(owner);for(const [k,v] of pending)if(v.owner===owner)pending.delete(k);}
 function page(owner){
  prune();const csrf=token();forms.set(owner,{csrf,until:now()+600000});
  const connected=grants.has(owner);
  return new Response('<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXO · Ligação Railway</title><body style="background:#080d1d;color:#edf4ff;font:16px/1.6 system-ui;max-width:760px;margin:40px auto;padding:24px"><a style="color:#79e7f6" href="/">← Painel NEXO HUB</a><h1>Railway · Só de leitura</h1><p>'+(connected?'Ligação de leitura verificada para o projeto NEXO HUB. A integração dos estados de execução aguarda validação; os cartões atuais continuam a usar sondagens HTTP.':configured?'Aprova a consulta do projeto NEXO HUB no Railway.':'Preparação concluída. Falta configurar o identificador e segredo da aplicação OAuth no servidor.')+'</p><ul><li>Permissões pedidas: identidade técnica e visualização do projeto.</li><li>Seleciona apenas NEXO HUB. O Railway concede visualização ao projeto, não apenas a um serviço.</li><li>Sem permissões de edição, deploy, envio de mensagens ou acesso permanente.</li><li>O token fica apenas na memória do servidor, durante esta sessão, por até uma hora. Sair do NEXO ou reiniciar o gateway elimina a ligação.</li></ul>'+(configured?'<form method="POST" action="/railway/'+(connected?'disconnect':'connect')+'?csrf='+csrf+'"><button style="padding:14px;background:#79e7f6;border:0;border-radius:9px" type="submit">'+(connected?'Desligar Railway nesta sessão':'Rever e aprovar no Railway')+'</button></form>':'')+'<p>CORE, Discord e Gmail não são alterados.</p></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
 }
 async function handle(req,owner){
  prune();const url=new URL(req.url),path=url.pathname;
  if(!path.startsWith('/railway'))return null;
  if(!owner)return json('Login required',401);
  if(req.method==='GET'&&path==='/railway')return page(owner);
  if(req.method==='POST'&&['/railway/connect','/railway/disconnect'].includes(path)){
   const form=forms.get(owner);
   if(req.headers.get('origin')!==origin||!form||!same(url.searchParams.get('csrf'),form.csrf))return json('Invalid origin or form',403);
   forms.delete(owner);
   if(path==='/railway/disconnect'){forget(owner);return redirect();}
   if(!configured)return json('Railway OAuth not configured',503);
   if(windowEnd<=now()){windowEnd=now()+60000;attempts=0;}
   if(++attempts>10)return json('Try again later',429);
   forget(owner);
   const state=token(),verifier=token();
   pending.set(hash(state),{owner,verifier,until:now()+600000});
   active.set(owner,{key:hash(state),until:now()+600000});
   const target=new URL(ISSUER+'/oauth/auth');
   for(const [k,v] of Object.entries({client_id:railwayClientId,response_type:'code',redirect_uri:callback,scope:RAILWAY_SCOPE,prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))target.searchParams.set(k,v);
   return new Response(null,{status:303,headers:{Location:target.href}});
  }
  if(req.method==='GET'&&path==='/railway/callback'){
   const state=url.searchParams.get('state');
   if(!/^[a-f0-9]{64}$/.test(state||''))return json('Invalid Railway state',403);
   const flow=pending.get(hash(state));
   if(!flow||flow.owner!==owner)return json('Invalid Railway state',403);
   pending.delete(hash(state));
   if(url.searchParams.get('error'))return json('Railway access was not approved',403);
   if(url.searchParams.get('iss')!==ISSUER)return json('Unexpected Railway issuer',403);
   const code=url.searchParams.get('code');if(!code||code.length>2048)return json('Invalid Railway code',400);
   try{
    const response=await http(ISSUER+'/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(encodeURIComponent(railwayClientId)+':'+encodeURIComponent(railwayClientSecret)).toString('base64')},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callback,code_verifier:flow.verifier}).toString()});
    if(!response.ok)throw Error();const grant=await response.json();
    const scopes=typeof grant.scope==='string'?grant.scope.split(/\s+/).filter(Boolean):[];
    if(scopes.length!==2||!scopes.includes('openid')||!scopes.includes('project:viewer')||grant.refresh_token||String(grant.token_type).toLowerCase()!=='bearer'||typeof grant.access_token!=='string'||!grant.access_token||grant.access_token.length>16384||!Number.isFinite(grant.expires_in)||grant.expires_in<=0)throw Error();
    const check=await http(ISSUER+'/graphql/v2',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+grant.access_token},body:JSON.stringify({query:PROJECT_QUERY})});
    if(!check.ok)throw Error();const result=await check.json();
    const workspaces=result.data?.externalWorkspaces;if(result.errors?.length||!Array.isArray(workspaces))throw Error();
    const ids=workspaces.flatMap(w=>Array.isArray(w.projects)?w.projects.map(p=>p.id):['invalid']);
    if(ids.length!==1||ids[0]!==PROJECT)throw Error();
    // Logout/disconnect may happen while the provider request is in flight.
    if(active.get(owner)?.key!==hash(state))throw Error();
    active.delete(owner);
    grants.set(owner,{accessToken:grant.access_token,until:now()+Math.min(grant.expires_in,3600)*1000});
    return redirect();
   }catch{return json('Railway connection refused: check read-only permission and select only NEXO HUB',403);}
  }
  return json('Not found or method not allowed',404);
 }
 return {handle,forget};
}

