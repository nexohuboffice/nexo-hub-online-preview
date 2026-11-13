import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer,request as httpRequest} from 'node:http';

async function freePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
function query(port,path,host){
  return new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port,path,method:'GET',headers:host?{Host:host}:{}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });req.on('error',reject);req.end();
  });
}
test('actual HTTP loopback server requires login and rejects forged Host, without secrets or external calls',{timeout:10000},async t=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const env={...process.env,
    GATEWAY_ORIGIN:origin,GITHUB_OAUTH_CLIENT_ID:'mock-client-id',
    GITHUB_OAUTH_CLIENT_SECRET:'mock-client-secret',GITHUB_OWNER_ID:'353932686',
    RAILWAY_PROJECT_ID:'7636e62d-ae69-44eb-ad29-dca7069ac054',
    RAILWAY_ENVIRONMENT_ID:'af1ae01b-f92e-4ee3-ade6-b849cfb00847'
  };
  delete env.RAILWAY_PROJECT_TOKEN;
  const child=spawn(process.execPath,['github-gateway.mjs'],{cwd:new URL('.',import.meta.url),env,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(!child.killed)child.kill('SIGTERM')});
  let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  await new Promise((resolve,reject)=>{
    const deadline=setTimeout(()=>reject(new Error('gateway failed to start: '+stderr.slice(0,400))),5000);
    const probe=setInterval(()=>{if(stdout.includes('gateway configured for')){clearInterval(probe);clearTimeout(deadline);resolve()}},15);
    child.once('exit',code=>{clearInterval(probe);clearTimeout(deadline);reject(new Error('gateway exited '+code+': '+stderr.slice(0,400)))});
  });
  const health=await query(port,'/health');assert.equal(health.status,200);
  assert.equal(JSON.parse(health.body).ok,true);
  const session=await query(port,'/api/session');assert.equal(session.status,200);
  assert.equal(JSON.parse(session.body).authenticated,false);
  const anon=await query(port,'/api/status');assert.equal(anon.status,401);
  const spoof=await query(port,'/api/status','attacker.example.net');assert.equal(spoof.status,421);
  assert.equal(spoof.headers['access-control-allow-origin'],undefined);
  assert.equal(health.headers['cache-control'],'no-store, private');
});
