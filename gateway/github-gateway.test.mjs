import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubGateway,EXPECTED_SERVICES} from './github-gateway.mjs';
const origin='http://127.0.0.1:8788';
const projectId='7636e62d-ae69-44eb-ad29-dca7069ac054',environmentId='af1ae01b-f92e-4ee3-ade6-b849cfb00847';
const owner='353932686';
function setup(opts={}){
  let now=1700000000000,calls=[],health=0;
  const config={origin,githubClientId:'test_client',githubClientSecret:'test_client_private_secret',ownerGitHubId:owner,projectId,environmentId,railwayToken:opts.noToken?null:'fake-project-token',privateHealth:!!opts.health};
  const http=async(url,init={})=>{
    calls.push({url:String(url),init});
    if(url==='https://github.com/login/oauth/access_token')return Response.json({access_token:'FAKE_ACCESS_TOKEN',scope:opts.scope||''});
    if(url==='https://api.github.com/user')return Response.json({id:opts.userId||owner,login:'nexohuboffice',email:'SHOULD_NOT_LEAK'});
    if(url==='https://backboard.railway.com/graphql/v2'){
      const ids=opts.shortInventory?EXPECTED_SERVICES.slice(0,4):EXPECTED_SERVICES;
      return Response.json({data:{projectToken:{projectId,environmentId:opts.wrongEnvironment?'bad':environmentId},environment:{id:environmentId,serviceInstances:{edges:ids.map(serviceName=>({node:{serviceName,latestDeployment:{status:'SUCCESS',createdAt:'2026-11-13T05:00:00Z'}}}))}}}});
    }
    if(String(url).includes('.railway.internal')){health++;if(opts.failHealth&&String(url).includes(opts.failHealth))throw Error('down');return Response.json({status:'success',secret:'SHOULD_NEVER_LEAK'});}
    throw Error('unexpected url: '+url);
  };
  const g=createGitHubGateway(config,{http,now:()=>now});
  const request=(path,headers={},method='GET')=>new Request(origin+path,{method,headers});
  const login=async()=>{
    const init=await g.handle(request('/auth/login'));
    const state=new URL(init.headers.get('location')).searchParams.get('state');
    const stateCookie=init.headers.get('set-cookie').split(';')[0];
    const callback=await g.handle(request('/auth/callback?state='+state+'&code=CODE',{Cookie:stateCookie}));
    const sessionCookie=callback.headers.getSetCookie?.().find(x=>x.includes('nexo_local_sid='))?.split(';')[0];
    return {init,callback,sessionCookie,state,stateCookie};
  };
  return {g,request,login,calls,clock:{advance:t=>now+=t},countHealth:()=>health};
}
test('requires exact secure origin or local IPv4 loopback',()=>{
 const x={githubClientId:'c',githubClientSecret:'s',ownerGitHubId:owner,projectId,environmentId};
 for(const bad of ['http://example.org','http://localhost:8788','https://example.com/abc','http://0.0.0.0:8788'])assert.throws(()=>createGitHubGateway({...x,origin:bad}),/Invalid OAuth/);
 assert.equal(createGitHubGateway({...x,origin}).mode,'loopback');
 assert.equal(createGitHubGateway({...x,origin:'https://nexo.example.org'}).mode,'https');
});
test('public health and session reveal no secrets',async()=>{
 const m=setup();const r=await m.g.handle(m.request('/health'));assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null);
 assert.match(r.headers.get('content-security-policy'),/default-src 'none'/);
 assert.equal((await m.g.handle(m.request('/api/session'))).status,200);
 assert.equal((await m.g.handle(m.request('/api/session'))).headers.get('cache-control'),'no-store, private');
});
test('no login cannot fetch service status and no outbound calls',async()=>{
 const m=setup();const r=await m.g.handle(m.request('/api/status'));
 assert.equal(r.status,401);assert.equal(m.calls.length,0);
});
test('OAuth login requests no repo or email scopes and uses exact callback',async()=>{
 const m=setup();const r=await m.g.handle(m.request('/auth/login'));
 const u=new URL(r.headers.get('location'));
 assert.equal(u.origin,'https://github.com');assert.equal(u.searchParams.get('redirect_uri'),origin+'/auth/callback');
 assert.equal(u.searchParams.get('scope'),'');assert.equal(r.headers.get('set-cookie').includes('HttpOnly'),true);
});
test('missing or mismatched OAuth state is rejected',async()=>{
 const m=setup(), {state,stateCookie}=await m.login();
 const bad=await m.g.handle(m.request('/auth/callback?state=bad&code=a',{Cookie:stateCookie}));assert.equal(bad.status,403);
 const missing=await m.g.handle(m.request('/auth/callback?state='+state+'&code=a'));assert.equal(missing.status,403);
});
test('state is single use: callback replay rejected',async()=>{
 const m=setup();const x=await m.login();assert.equal(x.callback.status,302);
 const replay=await m.g.handle(m.request('/auth/callback?state='+x.state+'&code=a',{Cookie:x.stateCookie}));assert.equal(replay.status,403);
});
test('non-owner GitHub identity refused by numeric ID',async()=>{
 const m=setup({userId:'87654321'}),x=await m.login();assert.equal(x.callback.status,403);assert.equal(m.g._forTests.activeSessions(),0);
});
test('user token with extra scopes rejected',async()=>{
 const m=setup({scope:'repo,user:email'}),x=await m.login();assert.equal(x.callback.status,503);assert.equal(m.g._forTests.activeSessions(),0);
});
test('owner login issues HttpOnly local cookie and authenticates private API',async()=>{
 const m=setup(),x=await m.login();assert.equal(x.callback.status,302);assert.match(x.sessionCookie,/nexo_local_sid=/);
 const raw=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));assert.equal(raw.status,200);
 const data=await raw.json();assert.equal(data.serviceCount,12);
 assert.equal(data.services.filter(x=>x.state==='not_monitored').length,12);
 assert.ok(!JSON.stringify(data).includes('SHOULD_NOT_LEAK'));
 assert.ok(!JSON.stringify(data).includes('FAKE_ACCESS_TOKEN'));
 assert.ok(!JSON.stringify(data).includes('fake-project-token'));
 assert.equal(m.calls.filter(x=>x.url.includes('backboard.railway.com')).length,1);
});
test('read-only query uses correct project access token and no mutation',async()=>{
 const m=setup(),x=await m.login();await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));
 const call=m.calls.find(x=>x.url.includes('backboard.railway.com'));
 assert.equal(call.init.headers['Project-Access-Token'],'fake-project-token');
 assert.equal(call.init.method,'POST');const body=JSON.parse(call.init.body);
 assert.match(body.query,/query NexoReadOnlyStatus/);assert.doesNotMatch(body.query,/mutation /);
 assert.equal(body.variables.id,environmentId);
});
test('token scoped to wrong Railway environment rejected without inventory',async()=>{
 const m=setup({wrongEnvironment:true}),x=await m.login();const resp=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));assert.equal(resp.status,503);
 assert.ok(!(await resp.text()).includes('fake-project-token'));
});
test('12 expected names returned including MISSING without inventing status',async()=>{
 const m=setup({shortInventory:true}),x=await m.login();const resp=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));const data=await resp.json();assert.equal(data.services.length,12);assert.equal(data.services.filter(x=>x.deployment==='MISSING').length,8);
});
test('optional private health probes never expose internal /health secrets',async()=>{
 const m=setup({health:true,failHealth:'nexo-comms'}),x=await m.login();const resp=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));const data=await resp.json();assert.equal(m.countHealth(),8);
 assert.equal(data.services.find(x=>x.id==='nexo-comms').state,'unreachable');assert.equal(data.services.find(x=>x.id==='nexo-discord').state,'online');
 assert.equal(data.services.filter(x=>x.state==='not_monitored').length,4);
 assert.ok(!JSON.stringify(data).includes('SHOULD_NEVER_LEAK'));
});
test('status cached for 20s and refetched after TTL',async()=>{
 const m=setup(),x=await m.login();for(let i=0;i<2;i++)await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));
 assert.equal(m.calls.filter(x=>x.url.includes('backboard')).length,1);
 m.clock.advance(20001);await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));assert.equal(m.calls.filter(x=>x.url.includes('backboard')).length,2);
});
test('tampered sessions, expiration and logout revocation',async()=>{
 const m=setup(),x=await m.login();
 const invalid=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie+'f'}));assert.equal(invalid.status,401);
 const blocked=await m.g.handle(m.request('/auth/logout',{Cookie:x.sessionCookie,Origin:'https://attacker.com'},'POST'));assert.equal(blocked.status,403);
 const out=await m.g.handle(m.request('/auth/logout',{Cookie:x.sessionCookie,Origin:origin},'POST'));assert.equal(out.status,204);
 assert.equal((await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}))).status,401);
 const second=await m.login();m.clock.advance(2*3600_000+1);
 assert.equal((await m.g.handle(m.request('/api/status',{Cookie:second.sessionCookie}))).status,401);
});
test('no POST api routes, no CORS and no public PWA proxy',async()=>{
 const m=setup(),x=await m.login();for(const path of ['/api/task','/api/comms/send','/app','/api/status']){
 const r=await m.g.handle(m.request(path,{Cookie:x.sessionCookie,Origin:origin},'POST'));
 assert.equal(r.status,404);assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
});
test('without Railway token the owner receives 503 and no external requests',async()=>{
 const m=setup({noToken:true}),x=await m.login();const r=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));assert.equal(r.status,503);assert.equal(m.calls.some(x=>x.url.includes('backboard')),false);
});


test('Host header spoofing is rejected even with a valid-looking URL and session',async()=>{
  const m=setup(),x=await m.login();
  const spoofed=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie,Host:'evil.example.org'}));
  assert.equal(spoofed.status,421);
  const localHost=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie,Host:'127.0.0.1:8788'}));
  assert.equal(localHost.status,200);
});
test('callback refuses an unexpected Host before contacting GitHub',async()=>{
  const m=setup();const r=await m.g.handle(m.request('/auth/callback?code=x&state=y',{Host:'evil.example.org'}));
  assert.equal(r.status,421);assert.equal(m.calls.length,0);
});
test('owner session cookies use secure __Host- prefix under HTTPS',async()=>{
  const github='https://nexo-secure.example.org';
  const params={origin:github,githubClientId:'test',githubClientSecret:'test-private',ownerGitHubId:owner,projectId,environmentId};
  const g=createGitHubGateway(params,{http:async()=>{throw Error('outbound forbidden')}});
  const response=await g.handle(new Request(github+'/auth/login',{headers:{Host:'nexo-secure.example.org'}}));
  assert.equal(response.status,302);
  assert.match(response.headers.get('set-cookie'),/__Host-nexo_oauth=/);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.match(response.headers.get('set-cookie'),/Secure/);
  assert.match(response.headers.get('set-cookie'),/Path=\//);
  assert.match(response.headers.get('strict-transport-security'),/max-age=/);
});

test('token-free private health mode probes 8 fixed services and no Railway API',async()=>{
 const m=setup({health:true,noToken:true}),x=await m.login();
 const r=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));
 assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.services.length,12);
 assert.equal(data.services.filter(s=>s.state==='online').length,8);
 assert.equal(data.services.filter(s=>s.state==='not_monitored').length,4);
 assert.equal(data.services.filter(s=>s.deployment==='UNKNOWN').length,12);
 assert.equal(m.countHealth(),8);
 assert.equal(m.calls.filter(c=>c.url.includes('backboard.railway.com')).length,0);
});
test('token-free private health mode safely distinguishes failed probes',async()=>{
 const m=setup({health:true,noToken:true,failHealth:'nexo-browser'}),x=await m.login();
 const r=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));
 assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.services.find(s=>s.id==='nexo-browser').state,'unreachable');
 assert.equal(data.services.find(s=>s.id==='nexo-eve-ipad-radar').state,'not_monitored');
});

test('one-off IMMO bootstrap is never treated as an HTTP service',async()=>{
 const m=setup({health:true,noToken:true}),x=await m.login();
 const r=await m.g.handle(m.request('/api/status',{Cookie:x.sessionCookie}));
 const data=await r.json();
 assert.equal(data.services.find(s=>s.id==='immo-discord-bootstrap').state,'not_monitored');
 assert.equal(m.calls.filter(c=>c.url.includes('immo-discord-bootstrap.railway.internal')).length,0);
});
