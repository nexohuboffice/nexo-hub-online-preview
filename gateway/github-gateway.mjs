/** NEXO HUB v0.8 — GitHub OAuth owner-only, read-only gateway candidate.
 * Not deployed. No shared authenticated origin with the mutable public PWA.
 * No access to repository contents, emails, missions, COMMS, OpenAI, or writes.
 */
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const HTTP_SERVICES = Object.freeze([
  'nexo-discord', 'nexo-browser', 'nexo-ui-assets', 'nexo-comms',
  'nexo-autopilot', 'nexo-lyra-studio', 'nexo-transport', 'nexo-sandbox-lab'
]);
// One-off bootstrap has no HTTP server and must never be marked unhealthy by /health.
export const NON_HTTP_SERVICES = Object.freeze(['immo-discord-bootstrap']);
export const CRON_SERVICES = Object.freeze(['nexo-eve-ipad-radar', 'nexo-watchdog', 'immo-radar-hourly']);
export const EXPECTED_SERVICES = Object.freeze([...HTTP_SERVICES, ...NON_HTTP_SERVICES, ...CRON_SERVICES]);
const API = 'https://backboard.railway.com/graphql/v2';
const STATE_TTL = 10 * 60_000;
const SESSION_TTL = 2 * 60 * 60_000;
const HEX_64 = /^[a-f0-9]{64}$/;
const QUERY = `query NexoReadOnlyStatus($id: String!) {
  projectToken { projectId environmentId }
  environment(id: $id) {
    id name
    serviceInstances { edges { node { serviceName latestDeployment { status createdAt } } } }
  }
}`;
const SHA256 = s => createHash('sha256').update(s).digest('hex');
const random = () => randomBytes(32).toString('hex');
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && HEX_64.test(a) && HEX_64.test(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const json = (obj,status=200) => new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const redirect = (url,status=302,headers={}) => new Response(null,{status,headers:{Location:url,...headers}});
const content = html => new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
function cookieValue(request,name){return (request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='))[0]?.slice(name.length+1)||'';}
function cookie(name,val,seconds,secure,sameSite='Lax') {return `${name}=${val}; HttpOnly; ${secure?'Secure; ':''}Path=/; SameSite=${sameSite}; Max-Age=${seconds}`;}
function expiredCookie(name,secure){return cookie(name,'',0,secure);}
function withHeaders(response,secure){
  const headers=new Headers(response.headers);
  for(const [k,v] of Object.entries({
    'Cache-Control':'no-store, private', 'Pragma':'no-cache',
    'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
    'X-Frame-Options':'DENY', 'Cross-Origin-Opener-Policy':'same-origin',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; style-src 'unsafe-inline'",
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
  }))headers.set(k,v);
  if(secure)headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  return new Response(response.body,{status:response.status,headers});
}
function page(isAuthenticated){return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NEXO HUB · Private Gateway</title></head><body style="font:16px system-ui;background:#080f20;color:#ebf6ff;padding:32px;max-width:650px;margin:0 auto"><h1>NEXO HUB · v0.8</h1><p>Gateway privado de consulta. Não executa missões, ações ou envios.</p>${isAuthenticated?'<p>🔒 Sessão de proprietário ativa.</p><p><a style="color:#78dced" href="/api/status">Consultar estado dos 12 serviços (JSON)</a></p><form method="POST" action="/auth/logout"><button>Terminar sessão</button></form>':'<a style="color:#78dced" href="/auth/login">Entrar com GitHub</a>'}<p style="font-size:12px;color:#9cb2d0">A aplicação pública GitHub Pages permanece separada deste gateway.</p></body></html>`;}

/** @param {object} config @param {object} injected - mocks for deterministic tests, never production secrets */
export function createGitHubGateway(config,{http=fetch,now=()=>Date.now(),nonce=random}={}){
  const {origin,githubClientId,githubClientSecret,ownerGitHubId,railwayToken,projectId,environmentId,privateHealth=false}=config;
  let parsed;try{parsed=new URL(origin)}catch{throw Error('Invalid gateway origin')}
  const local=parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'&&!!parsed.port;
  const secure=parsed.protocol==='https:';
  if((!secure&&!local)||origin!==parsed.origin||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||!githubClientId||!githubClientSecret||!/^\d+$/.test(String(ownerGitHubId||'')))throw Error('Invalid OAuth gateway configuration');
  if(!/^[0-9a-f-]{36}$/i.test(projectId||'')||!/^[0-9a-f-]{36}$/i.test(environmentId||''))throw Error('Railway identity not configured');
  const originUrl=parsed.origin;
  const callback=originUrl+'/auth/callback';
  const name=secure?'__Host-nexo_sid':'nexo_local_sid';
  const stateName=secure?'__Host-nexo_oauth':'nexo_local_oauth';
  const states=new Map(),sessions=new Map();
  let cache={until:0,value:null};
  function prune(){
    for(const [key,val] of states)if(val<=now())states.delete(key);
    for(const [key,val] of sessions)if(val.expires<=now())sessions.delete(key);
    while(states.size>100)states.delete(states.keys().next().value);
    while(sessions.size>100)sessions.delete(sessions.keys().next().value);
  }
  function session(req){prune();const raw=cookieValue(req,name);if(!HEX_64.test(raw))return false;const s=sessions.get(SHA256(raw));return !!s&&s.expires>now()&&s.userId===String(ownerGitHubId);}
  async function githubProfile(code){
    const tokenRes=await http('https://github.com/login/oauth/access_token',{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({client_id:githubClientId,client_secret:githubClientSecret,code,redirect_uri:callback}),
      signal:AbortSignal.timeout(8000)
    });
    if(!tokenRes.ok)throw Error('OAuth exchange unavailable');
    const tokenData=await tokenRes.json();
    if(typeof tokenData.access_token!=='string'||!tokenData.access_token||tokenData.error||String(tokenData.scope||'').trim())throw Error('Unauthorized OAuth scopes or token');
    const me=await http('https://api.github.com/user',{
      method:'GET',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+tokenData.access_token,'X-GitHub-Api-Version':'2022-11-28'},
      signal:AbortSignal.timeout(8000)
    });
    if(!me.ok)throw Error('GitHub identity unavailable');
    const user=await me.json();return String(user?.id||'');
  }
  async function status(){
    if(cache.value&&cache.until>now())return cache.value;
    // Token-free mode is preferable for the initial live dashboard: it only probes
    // eight fixed private /health endpoints and never receives a Railway API token.
    // Cron jobs cannot be inferred from HTTP health and remain explicitly unknown.
    if(!railwayToken&&!privateHealth)return null;
    const entries=new Map();
    if(railwayToken){
      const response=await http(API,{
        method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Project-Access-Token':railwayToken},
        body:JSON.stringify({query:QUERY,variables:{id:environmentId}}),signal:AbortSignal.timeout(8000)
      });
      if(!response.ok)throw Error('Railway returned error');
      const payload=await response.json();
      if(payload.errors?.length||payload.data?.projectToken?.projectId!==projectId||payload.data?.projectToken?.environmentId!==environmentId||payload.data?.environment?.id!==environmentId)throw Error('Railway token scope or response rejected');
      const items=payload.data.environment?.serviceInstances?.edges;
      if(!Array.isArray(items)||items.length>80)throw Error('Railway inventory malformed');
      for(const item of items){const instance=item?.node;const id=instance?.serviceName;if(!EXPECTED_SERVICES.includes(id)||entries.has(id))continue;
        entries.set(id,{deployment:instance?.latestDeployment?.status||'UNKNOWN'});
      }
    }else{
      for(const id of EXPECTED_SERVICES)entries.set(id,{deployment:'UNKNOWN'});
    }
    const services=await Promise.all(EXPECTED_SERVICES.map(async id=>{
      if(!entries.has(id))return {id,state:'not_monitored',deployment:'MISSING'};
      const deployment=entries.get(id).deployment;
      if(CRON_SERVICES.includes(id)||NON_HTTP_SERVICES.includes(id))return {id,state:'not_monitored',deployment};
      if(!privateHealth)return {id,state:'not_monitored',deployment};
      try{
        const r=await http(`http://${id}.railway.internal:8080/health`,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(1600)});
        return {id,state:r.ok?'online':'unreachable',deployment};
      }catch{return {id,state:'unreachable',deployment};}
    }));
    const value={schema:'nexo.gateway.status.v1',checkedAt:new Date(now()).toISOString(),serviceCount:services.length,readOnly:true,privateDataIncluded:false,services};
    cache={until:now()+20_000,value};return value;
  }
  async function handle(req){
    const url=new URL(req.url);
    // In production the reverse proxy must retain the original public Host.
    // Never trust an arbitrary Host to initiate an OAuth flow or read owner state.
    const suppliedHost=req.headers.get('host');
    if(url.origin!==originUrl || (suppliedHost && suppliedHost.toLowerCase()!==parsed.host.toLowerCase()))
      return withHeaders(json({error:'Host not allowed'},421),secure);
    const path=url.pathname;prune();
    if(req.method==='GET'&&path==='/health')return withHeaders(json({ok:true,service:'NEXO read-only gateway',version:'0.8-local-candidate'}),secure);
    if(req.method==='GET'&&path==='/auth/login'){
      const state=nonce();if(!HEX_64.test(state))throw Error('Insufficient OAuth state entropy');
      states.set(SHA256(state),now()+STATE_TTL);prune();
      const target=new URL('https://github.com/login/oauth/authorize');
      for(const [k,v] of Object.entries({client_id:githubClientId,redirect_uri:callback,response_type:'code',state,scope:''}))target.searchParams.set(k,v);
      return withHeaders(redirect(target.toString(),302,{'Set-Cookie':cookie(stateName,state,600,secure,'Lax')}),secure);
    }
    if(req.method==='GET'&&path==='/auth/callback'){
      const returned=url.searchParams.get('state'),expected=cookieValue(req,stateName);
      if(!equal(returned,expected)||!states.has(SHA256(returned))||states.get(SHA256(returned))<=now())return withHeaders(json({error:'OAuth state invalid or expired'},403),secure);
      states.delete(SHA256(returned));
      if(url.searchParams.get('error'))return withHeaders(json({error:'GitHub authorization was denied'},403),secure);
      const code=url.searchParams.get('code');if(!code||code.length>1500)return withHeaders(json({error:'Invalid OAuth code'},400),secure);
      try{
        const id=await githubProfile(code);
        if(id!==String(ownerGitHubId))return withHeaders(json({error:'Account not authorized'},403),secure);
        const sid=nonce();if(!HEX_64.test(sid))throw Error('Insufficient session entropy');
        sessions.set(SHA256(sid),{userId:id,expires:now()+SESSION_TTL});prune();
        const r=redirect('/',302);r.headers.append('Set-Cookie',cookie(name,sid,SESSION_TTL/1000,secure,'Lax'));r.headers.append('Set-Cookie',expiredCookie(stateName,secure));return withHeaders(r,secure);
      }catch{return withHeaders(json({error:'GitHub login unavailable'},503),secure);}
    }
    if(req.method==='GET'&&path==='/api/session')return withHeaders(json({authenticated:session(req),readOnly:true}),secure);
    if(req.method==='POST'&&path==='/auth/logout'){
      if(req.headers.get('origin')!==originUrl)return withHeaders(json({error:'Invalid origin'},403),secure);
      const sid=cookieValue(req,name);if(HEX_64.test(sid))sessions.delete(SHA256(sid));
      return withHeaders(new Response(null,{status:204,headers:{'Set-Cookie':expiredCookie(name,secure)}}),secure);
    }
    if(req.method==='GET'&&path==='/')return withHeaders(content(page(session(req))),secure);
    if(req.method==='GET'&&path==='/api/status'){
      if(!session(req))return withHeaders(json({error:'Login required'},401),secure);
      try{const result=await status();return withHeaders(result?json(result):json({error:'Railway source not configured'},503),secure)}catch{return withHeaders(json({error:'Read-only service status unavailable'},503),secure)}
    }
    return withHeaders(json({error:'Not found or method not allowed'},404),secure);
  }
  return {handle,mode:secure?'https':'loopback',_forTests:{activeSessions:()=>sessions.size,pendingStates:()=>states.size}};
}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const origin=process.env.GATEWAY_ORIGIN||'http://127.0.0.1:8788';
  const required=['GITHUB_OAUTH_CLIENT_ID','GITHUB_OAUTH_CLIENT_SECRET','GITHUB_OWNER_ID','RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID'];
  const missing=required.filter(k=>!process.env[k]);
  if(missing.length){console.error('Refused to start. Configure privately:',missing.join(', '));process.exit(1)}
  const gateway=createGitHubGateway({origin,githubClientId:process.env.GITHUB_OAUTH_CLIENT_ID,githubClientSecret:process.env.GITHUB_OAUTH_CLIENT_SECRET,ownerGitHubId:process.env.GITHUB_OWNER_ID,railwayToken:process.env.RAILWAY_PROJECT_TOKEN||null,projectId:process.env.RAILWAY_PROJECT_ID,environmentId:process.env.RAILWAY_ENVIRONMENT_ID,privateHealth:process.env.NEXO_PRIVATE_RAILWAY_HEALTH==='1'});
  const {hostname,port,protocol}=new URL(origin);
  const listenPort=Number(process.env.PORT||port||443);
  if(!Number.isInteger(listenPort)||listenPort<1||listenPort>65535)throw Error('Invalid listening port');
  // Railway terminates TLS at its HTTPS edge and connects over an internal HTTP port.
  // The public DNS name is not a local network interface, so listen on 0.0.0.0.
  const listenHost=protocol==='https:'?'0.0.0.0':hostname;
  createServer(async(req,res)=>{
    try{
      const host=String(req.headers.host||'');
      if(host.toLowerCase()!==new URL(origin).host.toLowerCase()){
        res.writeHead(421,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end('{"error":"Host not allowed"}');return;
      }
      if(typeof req.url!=='string'||!req.url.startsWith('/')||req.url.startsWith('//')){
        res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end('{"error":"Invalid path"}');return;
      }
      const full=new Request(origin+req.url,{method:req.method,headers:req.headers});
      const response=await gateway.handle(full);const headers=Object.fromEntries(response.headers.entries());
      const setCookies=response.headers.getSetCookie?.();if(setCookies?.length)headers['set-cookie']=setCookies;
      res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Internal error')}
  }).listen(listenPort, listenHost,()=>console.log(`NEXO read-only gateway configured for ${origin} (binding ${listenHost}:${listenPort}, OAuth owner-only; no write routes)`));
}
