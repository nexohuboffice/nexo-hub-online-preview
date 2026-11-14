import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {createGitHubGateway} from './github-gateway.mjs';

export function onlineConfig(env){
  if(env.RAILWAY_TOKEN||env.RAILWAY_API_TOKEN||env.RAILWAY_PROJECT_TOKEN)
    throw Error('Railway API credentials are forbidden in this deployment');
  if(env.GITHUB_OWNER_ID!=='353932686')throw Error('Unexpected owner');
  if(env.RAILWAY_PROJECT_ID!=='7636e62d-ae69-44eb-ad29-dca7069ac054'||
     env.RAILWAY_ENVIRONMENT_ID!=='af1ae01b-f92e-4ee3-ade6-b849cfb00847')
    throw Error('Unexpected Railway environment');
  const origin=env.GATEWAY_ORIGIN;
  if(!origin||!origin.startsWith('https://'))throw Error('HTTPS origin required');
  if(env.NEXO_PRIVATE_RAILWAY_HEALTH!=='1')throw Error('Private health mode required');
  return {origin,githubClientId:env.GITHUB_OAUTH_CLIENT_ID,
    githubClientSecret:env.GITHUB_OAUTH_CLIENT_SECRET,ownerGitHubId:env.GITHUB_OWNER_ID,
    projectId:env.RAILWAY_PROJECT_ID,environmentId:env.RAILWAY_ENVIRONMENT_ID,
    railwayClientId:env.NEXO_RAILWAY_OAUTH_CLIENT_ID,
    railwayClientSecret:env.NEXO_RAILWAY_OAUTH_CLIENT_SECRET,
    railwayToken:null,privateHealth:true};
}

export function onlineServer(config,injected){
  const gateway=createGitHubGateway(config,injected);
  const expectedHost=new URL(config.origin).host.toLowerCase();
  const server=createServer({maxHeaderSize:8192},async(req,res)=>{
    try{
      const host=String(req.headers.host||'').toLowerCase();
      // Only this public, static endpoint accepts Railway's probe hostname.
      if(host==='healthcheck.railway.app'&&req.method==='GET'&&req.url==='/health'){
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end('{"ok":true}');return;
      }
      if(host!==expectedHost){
        res.writeHead(421,{'Cache-Control':'no-store'});res.end();return;
      }
      if(typeof req.url!=='string'||!req.url.startsWith('/')||
         req.url.startsWith('//')||req.url.includes('\\')||req.url.length>4096){
        res.writeHead(400,{'Cache-Control':'no-store'});res.end();return;
      }
      if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0){
        res.writeHead(413,{'Connection':'close','Cache-Control':'no-store'});res.end();return;
      }
      const request=new Request(config.origin+req.url,{method:req.method,headers:req.headers});
      const response=await gateway.handle(request);
      const headers=Object.fromEntries(response.headers.entries());
      const cookies=response.headers.getSetCookie();
      if(cookies.length)headers['set-cookie']=cookies;
      res.writeHead(response.status,headers);
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500,{'Cache-Control':'no-store'});res.end('Request failed');}
  });
  server.headersTimeout=10000;
  server.requestTimeout=15000;
  server.keepAliveTimeout=5000;
  server.maxRequestsPerSocket=100;
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const config=onlineConfig(process.env);
  const port=Number(process.env.PORT||8080);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
  const server=onlineServer(config);
  server.listen(port,'0.0.0.0',()=>console.log('NEXO online read-only gateway ready'));
  process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
}
