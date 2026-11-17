import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRailwayOAuth} from './railway-oauth.mjs';
import {ENVIRONMENT,DEPLOYMENTS_QUERY} from './deployments.mjs';
const origin='https://nexo.example.org',owner='owner-session-digest',project='7636e62d-ae69-44eb-ad29-dca7069ac054';
function setup(options={}){
 let now=100000,calls=[];
 const oauth=createRailwayOAuth({origin,railwayClientId:'client',railwayClientSecret:'PRIVATE_CLIENT'},{now:()=>now,http:async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('/oauth/token'))return Response.json({access_token:'PRIVATE_ACCESS',token_type:'Bearer',scope:options.scope||'openid project:viewer',expires_in:3600});
  if(JSON.parse(init.body).query===DEPLOYMENTS_QUERY){
   if(options.read)return options.read(oauth);
   return Response.json({data:{environment:{id:ENVIRONMENT,projectId:project,serviceInstances:{pageInfo:{hasNextPage:false},edges:[{node:{serviceName:'nexo-owner-gateway',latestDeployment:{status:'SUCCESS',createdAt:'2026-11-17T12:00:00Z',secret:'DO_NOT_RENDER'}}}]}}}});
  }
  if(options.beforeProject)options.beforeProject(oauth);
  return Response.json({data:{externalWorkspaces:[{projects:(options.projects||[project]).map(id=>({id}))}]}});
 }});
 const req=(path,method='GET',headers={})=>new Request(origin+path,{method,headers});
 const page=()=>oauth.handle(req('/railway'),owner);
 async function form(path='/railway/connect'){
  const html=await(await page()).text();const csrf=html.match(/csrf=([a-f0-9]{64})/)[1];
  return oauth.handle(req(path+'?csrf='+csrf,'POST',{Origin:origin}),owner);
 }
 async function start(){const response=await form();assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);const html=await response.text();const u=new URL(html.match(/href="(https:\/\/backboard\.railway\.com[^\"]+)"/)[1].replaceAll('&amp;','&'));return {response,u,state:u.searchParams.get('state')};}
 const finish=(state,who=owner,issuer='https://backboard.railway.com')=>oauth.handle(req('/railway/callback?code=CODE&state='+state+'&iss='+encodeURIComponent(issuer)),who);
 return {oauth,req,page,form,start,finish,calls,advance:ms=>now+=ms};
}
test('Railway flow requires owner, form CSRF and exact origin',async()=>{
 const m=setup();assert.equal((await m.oauth.handle(m.req('/railway'),null)).status,401);
 assert.equal((await m.oauth.handle(m.req('/railway/connect','POST',{Origin:origin}),owner)).status,403);
 assert.equal(m.calls.length,0);
});
test('deployments require Railway grant, use fixed read query and sanitize/cache per session',async()=>{
 const m=setup(),path='/railway/api/deployments';
 assert.equal((await m.oauth.handle(m.req(path),owner)).status,401);assert.equal(m.calls.length,0);
 const {state}=await m.start();await m.finish(state);
 const result=await m.oauth.handle(m.req(path),owner);assert.equal(result.status,200);
 const body=await result.text();assert.match(body,/SUCCESS/);assert.doesNotMatch(body,/PRIVATE|DO_NOT_RENDER/);
 const call=m.calls.at(-1);assert.equal(call.init.redirect,'error');assert.equal(call.init.headers.Authorization,'Bearer PRIVATE_ACCESS');
 assert.deepEqual(JSON.parse(call.init.body).variables,{id:ENVIRONMENT});assert.doesNotMatch(call.init.body,/mutation|variables\s*\{|logs|config/);
 assert.equal((await m.oauth.handle(m.req(path),'other-session')).status,401);
 await m.oauth.handle(m.req(path),owner);assert.equal(m.calls.length,3);
 m.advance(20001);await m.oauth.handle(m.req(path),owner);assert.equal(m.calls.length,4);
 const html=await(await m.oauth.handle(m.req('/railway/deployments'),owner)).text();assert.match(html,/SUCCESS não prova saúde funcional/);
 m.oauth.forget(owner);assert.equal((await m.oauth.handle(m.req(path),owner)).status,401);
});
test('deployments fail closed on partial, wrong environment, malformed, oversized and provider failures',async()=>{
 const good={id:ENVIRONMENT,projectId:project,serviceInstances:{pageInfo:{hasNextPage:false},edges:[]}};
 for(const read of [
  ()=>Response.json({data:{environment:{...good,id:'wrong'}}}),
  ()=>Response.json({data:{environment:{...good,projectId:'wrong'}}}),
  ()=>Response.json({data:{environment:{...good,serviceInstances:{...good.serviceInstances,pageInfo:{hasNextPage:true}}}}}),
  ()=>Response.json({errors:[{message:'PRIVATE'}],data:{environment:good}}),
  ()=>new Response('x'.repeat(65537)),()=>new Response('PRIVATE',{status:403}),()=>{throw Error('PRIVATE')}
 ]){
  const m=setup({read}),{state}=await m.start();await m.finish(state);
  const r=await m.oauth.handle(m.req('/railway/api/deployments'),owner);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE/);
 }
});
test('in-flight deployments share one request and cannot survive disconnect or expiry',async()=>{
 for(const expire of [false,true]){
  let release;const pending=new Promise(resolve=>release=resolve);
  const m=setup({read:()=>pending}),{state}=await m.start();await m.finish(state);
  const first=m.oauth.handle(m.req('/railway/api/deployments'),owner);
  const second=m.oauth.handle(m.req('/railway/api/deployments'),owner);
  assert.equal(m.calls.length,3);
  if(expire)m.advance(3600001);else m.oauth.forget(owner);
  release(Response.json({data:{environment:{id:ENVIRONMENT,projectId:project,serviceInstances:{pageInfo:{hasNextPage:false},edges:[]}}}}));
  assert.equal((await first).status,401);assert.equal((await second).status,401);
 }
});
test('unknown and absent deployments remain explicit, duplicate services fail closed',async()=>{
 for(const duplicate of [false,true]){
  const nodes=[{serviceName:'nexo-owner-gateway',latestDeployment:null},{serviceName:duplicate?'nexo-owner-gateway':'nexo-watchdog',latestDeployment:{status:'FUTURE_STATUS',createdAt:'2026-11-17T12:00:00Z'}}];
  const m=setup({read:()=>Response.json({data:{environment:{id:ENVIRONMENT,projectId:project,serviceInstances:{pageInfo:{hasNextPage:false},edges:nodes.map(node=>({node}))}}}})});
  const {state}=await m.start();await m.finish(state);const r=await m.oauth.handle(m.req('/railway/api/deployments'),owner);
  if(duplicate)assert.equal(r.status,503);else assert.deepEqual((await r.json()).services.map(s=>s.deployment),['NOT_DEPLOYED','UNKNOWN']);
 }
});
test('expired cache is never served on provider failure',async()=>{
 let fail=false;
 const m=setup({read:()=>fail?new Response('denied',{status:403}):Response.json({data:{environment:{id:ENVIRONMENT,projectId:project,serviceInstances:{pageInfo:{hasNextPage:false},edges:[]}}}})});
 const {state}=await m.start();await m.finish(state);
 assert.equal((await m.oauth.handle(m.req('/railway/api/deployments'),owner)).status,200);
 m.advance(20001);fail=true;assert.equal((await m.oauth.handle(m.req('/railway/api/deployments'),owner)).status,503);
});
test('requests only project viewer, explicit consent and S256 PKCE',async()=>{
 const m=setup(),{u}=await m.start();assert.equal(u.origin,'https://backboard.railway.com');
 assert.equal(u.searchParams.get('scope'),'openid project:viewer');assert.equal(u.searchParams.get('prompt'),'consent');
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('redirect_uri'),origin+'/railway/callback');
 assert.ok(!u.href.includes('PRIVATE'));assert.equal(m.calls.length,0);
});
test('session binding, issuer, expiration and replay fail closed',async()=>{
 const m=setup(),{state}=await m.start();assert.equal((await m.finish(state,'different-session')).status,403);
 assert.equal((await m.finish(state,owner,'https://evil.example')).status,403);assert.equal(m.calls.length,0);
 assert.equal((await m.finish(state)).status,403);
 const n=await m.start();m.advance(600001);assert.equal((await m.finish(n.state)).status,403);
});
test('accepts only NEXO project viewer and never renders provider tokens',async()=>{
 const m=setup(),{state}=await m.start();assert.equal((await m.finish(state)).status,303);
 const html=await(await m.page()).text();assert.match(html,/Ligação de leitura verificada/);assert.doesNotMatch(html,/PRIVATE_ACCESS|PRIVATE_CLIENT/);
 assert.equal(m.calls.length,2);assert.doesNotMatch(m.calls[1].init.body,/mutation/);
 assert.equal((await m.finish(state)).status,403);
 m.advance(3600001);assert.doesNotMatch(await(await m.page()).text(),/Ligação de leitura verificada/);
});
test('rejects editor scopes and extra or wrong projects',async()=>{
 for(const options of [{scope:'openid project:member'},{scope:'openid project:viewer offline_access'},{projects:[project,'other']},{projects:['other']}]){
  const m=setup(options),{state}=await m.start();assert.equal((await m.finish(state)).status,403);
  assert.doesNotMatch(await(await m.page()).text(),/Ligação de leitura verificada/);
 }
});
test('logout or disconnect while callback is in flight cannot restore grant',async()=>{
 const m=setup({beforeProject:oauth=>oauth.forget(owner)}),{state}=await m.start();assert.equal((await m.finish(state)).status,403);
 const n=setup(),flow=await n.start();await n.finish(flow.state);assert.equal((await n.form('/railway/disconnect')).status,303);
 assert.doesNotMatch(await(await n.page()).text(),/Ligação de leitura verificada/);
});

