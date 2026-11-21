// Fixed read-only query; no user-supplied query, URL or environment.
export const PROJECT='7636e62d-ae69-44eb-ad29-dca7069ac054';
export const ENVIRONMENT='af1ae01b-f92e-4ee3-ade6-b849cfb00847';
export const DEPLOYMENTS_QUERY=`query NexoOwnerDeployments($id: String!) {
  environment(id: $id) {
    id projectId
    serviceInstances(first: 80) {
      pageInfo { hasNextPage }
      edges { node { serviceName latestDeployment { status createdAt } } }
    }
  }
}`;
const statuses=new Set(['BUILDING','CRASHED','DEPLOYING','FAILED','INITIALIZING','NEEDS_APPROVAL','QUEUED','REMOVED','REMOVING','SKIPPED','SLEEPING','SUCCESS','WAITING']);
export async function readDeployments(http,accessToken,now){
  const response=await http('https://backboard.railway.com/graphql/v2',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+accessToken},
    body:JSON.stringify({query:DEPLOYMENTS_QUERY,variables:{id:ENVIRONMENT}})
  });
  if(!response.ok)throw Error('Deployment source unavailable');
  // Bound the body before parsing; discard all fields except the projection below.
  const reader=response.body?.getReader();if(!reader)throw Error('Missing response');
  let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('Response too large');chunks.push(value);}}
  finally{await reader.cancel();}
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const env=payload.data?.environment,instances=env?.serviceInstances;
  if(payload.errors?.length||env?.id!==ENVIRONMENT||env?.projectId!==PROJECT||instances?.pageInfo?.hasNextPage!==false||!Array.isArray(instances?.edges)||instances.edges.length>80)throw Error('Inventory rejected');
  const seen=new Set();
  const services=instances.edges.map(({node}={})=>{
    if(!node||typeof node.serviceName!=='string'||!/^[a-z][a-z0-9-]{2,63}$/.test(node.serviceName)||seen.has(node.serviceName))throw Error('Invalid service');
    seen.add(node.serviceName);const dep=node.latestDeployment;
    if(dep!==null&&(!dep||typeof dep.status!=='string'||typeof dep.createdAt!=='string'||!Number.isFinite(Date.parse(dep.createdAt))))throw Error('Invalid deployment');
    return {id:node.serviceName,deployment:dep?(statuses.has(dep.status)?dep.status:'UNKNOWN'):'NOT_DEPLOYED',createdAt:dep?new Date(dep.createdAt).toISOString():null};
  });
  return {schema:'nexo.gateway.deployments.v1',readOnly:true,source:'railway-oauth',checkedAt:new Date(now()).toISOString(),serviceCount:services.length,services};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function deploymentsPage(data){
  const rows=data.services.map(s=>'<tr><td>'+escape(s.id)+'</td><td>'+escape(s.deployment)+'</td><td>'+escape(s.createdAt?new Date(s.createdAt).toLocaleString('pt-PT',{timeZone:'Europe/Berlin'}):'Sem deployment')+'</td></tr>').join('');
  return '<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXO · Deployments Railway</title><style>body{background:#080d1d;color:#edf4ff;font:16px/1.6 system-ui;margin:0;padding:24px}main{max-width:1050px;margin:auto}a{color:#79e7f6}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:14px;border-bottom:1px solid #ffffff24}td{overflow-wrap:anywhere}section{overflow:auto;background:#142039;border-radius:15px}p{color:#a9b9d3}</style><main><a href="/">← Painel NEXO HUB</a> · <a href="/railway">Ligação Railway</a><h1>Deployments · só de leitura</h1><p>Último deployment de cada serviço no ambiente production, incluindo o gateway. SUCCESS não prova saúde funcional nem uma execução recente de tarefas agendadas.</p><p>Consulta: '+escape(new Date(data.checkedAt).toLocaleString('pt-PT',{timeZone:'Europe/Berlin'}))+' · Alemanha · '+data.serviceCount+' serviços · cache até 20 segundos.</p><a href="/railway/deployments">Atualizar consulta</a><section><table><thead><tr><th>Serviço</th><th>Estado do deployment</th><th>Criado em · Alemanha</th></tr></thead><tbody>'+rows+'</tbody></table></section></main></html>';
}
