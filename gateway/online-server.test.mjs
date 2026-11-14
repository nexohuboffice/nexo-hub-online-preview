import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {onlineConfig,onlineServer} from './online-server.mjs';
import {createGitHubGateway} from './github-gateway.mjs';
const env={GATEWAY_ORIGIN:'https://gateway.example.org',GITHUB_OAUTH_CLIENT_ID:'mock',
 GITHUB_OAUTH_CLIENT_SECRET:'mock-only',GITHUB_OWNER_ID:'353932686',
 RAILWAY_PROJECT_ID:'7636e62d-ae69-44eb-ad29-dca7069ac054',
 RAILWAY_ENVIRONMENT_ID:'af1ae01b-f92e-4ee3-ade6-b849cfb00847',NEXO_PRIVATE_RAILWAY_HEALTH:'1'};
test('online startup rejects HTTP, wrong identities and all Railway API credential variants',()=>{
 for(const key of ['RAILWAY_TOKEN','RAILWAY_API_TOKEN','RAILWAY_PROJECT_TOKEN'])
   assert.throws(()=>onlineConfig({...env,[key]:'mock'}),/forbidden/);
 assert.throws(()=>onlineConfig({...env,GATEWAY_ORIGIN:'http://gateway.example.org'}),/HTTPS/);
 assert.throws(()=>onlineConfig({...env,GITHUB_OWNER_ID:'1'}),/owner/);
 assert.throws(()=>onlineConfig({...env,RAILWAY_ENVIRONMENT_ID:'wrong'}),/environment/);
 assert.equal(onlineConfig(env).railwayToken,null);
});
test('global auth limit survives forged forwarded addresses and resets after window',async()=>{
 let now=0;
 const g=createGitHubGateway(onlineConfig(env),{now:()=>now});
 for(let i=0;i<20;i++)assert.equal((await g.handle(new Request(env.GATEWAY_ORIGIN+'/auth/login',{headers:{'X-Forwarded-For':String(i)}}))).status,302);
 assert.equal((await g.handle(new Request(env.GATEWAY_ORIGIN+'/auth/login'))).status,429);
 now=60001;
 assert.equal((await g.handle(new Request(env.GATEWAY_ORIGIN+'/auth/login'))).status,302);
});
test('healthcheck host grants only exact GET health, HTTPS callback and cookies preserved',async t=>{
 const server=onlineServer(onlineConfig(env),{http:async()=>{throw Error('No outbound expected')}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 function get(path,host='gateway.example.org',method='GET'){
  return new Promise((resolve,reject)=>{
   const r=request({host:'127.0.0.1',port:server.address().port,path,method,headers:{Host:host}},s=>{
    let body='';s.on('data',c=>body+=c);s.on('end',()=>resolve({status:s.statusCode,headers:s.headers,body}));
   });r.on('error',reject);r.end();
  });
 }
 assert.equal((await get('/health','healthcheck.railway.app')).status,200);
 for(const path of ['/auth/login','/api/status','/auth/callback?code=fake','/health?extra=1'])
  assert.equal((await get(path,'healthcheck.railway.app')).status,421);
 assert.equal((await get('/health','healthcheck.railway.app','POST')).status,421);
 assert.equal((await get('/api/status')).status,401);
 assert.equal((await get('/auth/login','evil.example')).status,421);
 const login=await get('/auth/login');
 assert.equal(new URL(login.headers.location).searchParams.get('redirect_uri'),env.GATEWAY_ORIGIN+'/auth/callback');
 assert.match(login.headers['set-cookie'][0],/__Host-nexo_oauth=.*Secure/);
 assert.equal(login.headers['access-control-allow-origin'],undefined);
});
test('private probes never follow redirect or expose bodies; concurrent status shares one batch',async()=>{
 let health=0;
 const http=async(url,init)=>{
  if(url.includes('/access_token'))return Response.json({access_token:'mock',scope:''});
  if(url==='https://api.github.com/user')return Response.json({id:353932686});
  assert.match(url,/^http:\/\/nexo-[a-z-]+\.railway\.internal:8080\/health$/);
  assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');health++;
  return new Response('private-body',{status:302,headers:{Location:'https://outside.example/'}})
 };
 const g=createGitHubGateway(onlineConfig(env),{http});
 const login=await g.handle(new Request(env.GATEWAY_ORIGIN+'/auth/login'));
 const state=new URL(login.headers.get('location')).searchParams.get('state');
 const cb=await g.handle(new Request(env.GATEWAY_ORIGIN+'/auth/callback?state='+state+'&code=mock',{headers:{Cookie:login.headers.get('set-cookie').split(';')[0]}}));
 const cookie=cb.headers.getSetCookie().find(c=>c.startsWith('__Host-nexo_sid=')).split(';')[0];
 const results=await Promise.all(Array.from({length:10},()=>g.handle(new Request(env.GATEWAY_ORIGIN+'/api/status',{headers:{Cookie:cookie}}))));
 assert.equal(health,8);
 const body=await results[0].text();assert.ok(!body.includes('private-body'));
 assert.equal(JSON.parse(body).services.filter(s=>s.state==='unreachable').length,8);
});
