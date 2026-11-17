import {randomBytes} from 'node:crypto';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function chatPage(csrf,{message='',answer='',error=''}={}){
 return `<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXO Chat · Teste privado</title><style>*{box-sizing:border-box}body{margin:0;background:#080d1d;color:#edf4ff;font:16px/1.6 system-ui}main{max-width:900px;margin:32px auto;padding:24px}a{color:#79e7f6}header,.panel{padding:24px;border:1px solid #ffffff20;border-radius:18px;background:linear-gradient(120deg,#10243b,#17182e);margin:24px 0}h1{margin:10px 0}.badge{color:#79e7f6;font-size:12px;letter-spacing:2px}p,small{color:#a9b9d3}.message{white-space:pre-wrap;overflow-wrap:anywhere;padding:18px;border-radius:12px;background:#18283e;margin:12px 0}textarea,select,button{font:inherit;border:1px solid #ffffff30;border-radius:10px;padding:12px;background:#0d172b;color:#edf4ff}textarea{display:block;width:100%;min-height:110px;margin:10px 0}button{background:#79e7f6;color:#092133;cursor:pointer;min-height:44px}label{display:block;margin:16px 0 5px}.error{color:#ffbd94}nav{display:flex;gap:20px;flex-wrap:wrap}:focus-visible{outline:3px solid #79e7f6;outline-offset:3px}@media(max-width:600px){main{padding:16px;margin:0}header,.panel{padding:18px}select{width:100%}}</style><main><nav><a href="/">← Estado real</a><a href="/chat">Nova conversa de teste</a></nav><header><span class="badge">SESSÃO GITHUB · SIMULAÇÃO</span><h1>NEXO Chat privado</h1><p>Testa o envio e a resposta dentro da tua sessão. Respostas fixas, sem IA real nem execução de tarefas.</p><small>A mensagem é enviada apenas a este gateway para gerar a página de resposta. Não é guardado histórico pelo chat. Usa texto fictício, sem dados sensíveis.</small></header><section class="panel" aria-label="Conversa">${error?`<p class="error" role="alert">${escape(error)}</p>`:''}${message?`<h2>Tu</h2><div class="message">${escape(message)}</div>`:''}${answer?`<h2>NEXO · resposta simulada</h2><div class="message">${escape(answer)}</div>`:'<p>Escreve uma mensagem de teste para começar.</p>'}<form method="POST" action="/chat"><input type="hidden" name="csrf" value="${escape(csrf)}"><label for="message">Mensagem de teste · até 1000 caracteres</label><textarea id="message" name="message" maxlength="1000" required autocomplete="off" placeholder="Ex.: ajuda-me a preparar um plano fictício"></textarea><label for="scenario">Cenário de teste</label><select name="scenario" id="scenario"><option value="reply">Resposta simulada</option><option value="error">Erro simulado</option></select><p><button type="submit">Enviar teste</button></p></form><small>Sem memória persistente, missões, Discord, Gmail ou voz real. O Voice Demo da aplicação pública mantém-se separado.</small></section></main></html>`;
}
export function createPrivateChat({now=()=>Date.now()}={}){
 const forms=new Map();
 function forget(owner){forms.delete(owner);}
 function page(owner,payload={},status=200){
  const csrf=randomBytes(32).toString('hex');forms.set(owner,{csrf,until:now()+600000});
  while(forms.size>100)forms.delete(forms.keys().next().value);
  return new Response(chatPage(csrf,payload),{status,headers:{'Content-Type':'text/html; charset=utf-8'}});
 }
 async function handle(req,owner,isActive){
  if(!owner)return Response.json({error:'Login required'},{status:401});
  if(req.method==='GET')return page(owner);
  if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers.get('content-type')||''))return Response.json({error:'Unsupported content type'},{status:415});
  const body=await req.text();
  if(!isActive())return Response.json({error:'Login required'},{status:401});
  if(Buffer.byteLength(body)>16384)return Response.json({error:'Message too large'},{status:413});
  const input=new URLSearchParams(body),form=forms.get(owner);
  if(!form||form.until<=now()||input.getAll('csrf').length!==1||input.get('csrf')!==form.csrf)return page(owner,{error:'Formulário expirado ou já utilizado. Envia um novo teste.'},403);
  forms.delete(owner);
  const message=input.get('message')?.trim(),scenario=input.get('scenario');
  if(input.getAll('message').length!==1||input.getAll('scenario').length!==1||!message||message.length>1000||!['reply','error'].includes(scenario)||[...input.keys()].some(k=>!['csrf','message','scenario'].includes(k)))return page(owner,{error:'Mensagem ou cenário inválido. Usa até 1000 caracteres.'},400);
  if(scenario==='error')return page(owner,{error:'Erro simulado. Nenhum fornecedor foi contactado. Podes repetir o teste.'},503);
  return page(owner,{message,answer:'Resposta simulada: recebi a tua mensagem de teste.\n\n1. Define o objetivo.\n2. Prepara um rascunho fictício.\n3. Revê o resultado.\n\nNenhuma tarefa foi executada. Esta resposta é fixa e não foi gerada por IA.'});
 }
 return {handle,forget};
}
