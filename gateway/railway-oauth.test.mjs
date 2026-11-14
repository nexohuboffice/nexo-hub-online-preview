import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRailwayOAuth} from './railway-oauth.mjs';
const origin='https://nexo.example.org',owner='owner-session-digest',project='7636e62d-ae69-44eb-ad29-dca7069ac054';
function setup(options={}){
 let now=100000,calls=[];
 const oauth=createRailwayOAuth({origin,railwayClientId:'client',railwayClientSecret:'PRIVATE_CLIENT'},{now:()=>now,http:async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('/oauth/token'))return Response.json({access_token:'PRIVATE_ACCESS',token_type:'Bearer',scope:options.scope||'openid project:viewer',expires_in:3600});
  if(options.beforeProject)options.beforeProject(oauth);
  return Response.json({data:{externalWorkspaces:[{projects:(options.projects||[project]).map(id=>({id}))}]}});
 }});
 const req=(path,method='GET',headers={})=>new Request(origin+path,{method,headers});
 const page=()=>oauth.handle(req('/railway'),owner);
 async function form(path='/railway/connect'){
  const html=await(await page()).text();const csrf=html.match(/csrf=([a-f0-9]{64})/)[1];
  return oauth.handle(req(path+'?csrf='+csrf,'POST',{Origin:origin}),owner);
 }
 async function start(){const response=await form();const u=new URL(response.headers.get('location'));return {response,u,state:u.searchParams.get('state')};}
 const finish=(state,who=owner,issuer='https://backboard.railway.com')=>oauth.handle(req('/railway/callback?code=CODE&state='+state+'&iss='+encodeURIComponent(issuer)),who);
 return {oauth,req,page,form,start,finish,calls,advance:ms=>now+=ms};
}
test('Railway flow requires owner, form CSRF and exact origin',async()=>{
 const m=setup();assert.equal((await m.oauth.handle(m.req('/railway'),null)).status,401);
 assert.equal((await m.oauth.handle(m.req('/railway/connect','POST',{Origin:origin}),owner)).status,403);
 assert.equal(m.calls.length,0);
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

