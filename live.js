/* v0.8 private data never enters the v0.7.3 demo state, exports or storage. */
(() => {
  'use strict';
  const real = window.NexoRealGateway === true;
  let session = null, data = null, message = '', pending = false, generation = 0, expiryTimer, staleTimer;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action) => {const b=el('button',text);b.type='button';b.onclick=action;return b;};
  function forget() {session=null;data=null;clearTimeout(expiryTimer);clearTimeout(staleTimer);generation++;}
  async function api(path, options = {}) {
    const response = await fetch(path, {...options,credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    if (response.status === 401) {forget();throw new Error('A sessão terminou. Inicia sessão novamente.');}
    if (!response.ok) throw new Error(response.status === 429 ? 'Limite temporário. Aguarda um minuto.' : 'Não foi possível consultar o serviço. Nenhum estado real foi confirmado.');
    return response.json();
  }
  async function refresh() {
    if (pending) return;
    pending=true;data=null;message='A verificar a sessão e a consultar Railway…';paint();
    const ticket=++generation;
    try {
      const nextSession=await api('/api/session');
      if (ticket!==generation) return;
      session=nextSession;
      clearTimeout(expiryTimer);
      expiryTimer=setTimeout(()=>{forget();message='A sessão terminou. Inicia sessão novamente.';paint();},Math.max(0,session.expiresAt-Date.now()));
      const result=await api('/api/dashboard');
      if (ticket!==generation) return;
      if (result.source!=='railway'||result.readOnly!==true||!Array.isArray(result.services)) throw new Error('Resposta inesperada. Estado não confirmado.');
      data=result;message='';
      clearTimeout(staleTimer);
      staleTimer=setTimeout(paint,Math.max(0,Date.parse(data.checkedAt)+60001-Date.now()));
    } catch(e) {if(ticket===generation || !session) message=e.message;}
    finally {pending=false;paint();}
  }
  async function logout() {
    if (!session || pending) return;
    pending=true;paint();
    try {await api('/auth/logout',{method:'POST',headers:{'X-Nexo-CSRF':session.csrf}});forget();message='Sessão terminada.';}
    catch(e) {data=null;message='Não foi possível confirmar a saída. Tenta novamente. '+e.message;}
    finally {pending=false;paint();}
  }
  function gatewayURL() {
    try {const value=window.NexoPublicConfig?.gatewayOrigin;
      const url=new URL(value);
      if(url.protocol==='https:' && url.origin===value && !url.username && !url.password) return url.origin+'/app/';
    } catch {}
    return null;
  }
  function paint() {
    const panel=document.querySelector('#nexo-live');if(!panel)return;
    panel.replaceChildren(el('span','NEXO HUB v0.8 · LEITURA','eyebrow'),el('h2','Estado real dos serviços'));
    if (!real) {
      panel.append(el('p','A demonstração continua disponível em todas as secções, incluindo Voice Demo. O acesso aos dados reais exige uma sessão separada e autorizada.'));
      const url=gatewayURL();
      if(url){const a=el('a','Entrar na área segura','button primary');a.href=url;panel.append(a);}
      else panel.append(el('p','Ligação real ainda não ativada. O backend aguarda configuração, testes reais e autorização de publicação.','live-note'));
      return;
    }
    panel.append(el('p','Consulta do último deployment no Railway. SUCCESS não comprova a saúde da aplicação, execução de tarefas, Gmail ou Discord.','live-note'));
    if(!session){const a=el('a','Entrar com GitHub','button primary');a.href='/auth/start';panel.append(a);}
    else {
      panel.append(el('p','Sessão autorizada · apenas leitura. Os perfis em Settings continuam a ser demonstrativos.','live-note'));
      const update=button('Atualizar estado',refresh),out=button('Terminar sessão',logout);update.disabled=out.disabled=pending;panel.append(update,out);
    }
    if(message){const status=el('p',message);status.setAttribute('role',pending?'status':'alert');panel.append(status);}
    if(data){
      panel.append(el('p',`${data.summary.known}/${data.expected} estados conhecidos · ${data.summary.successfulDeployments} deployments SUCCESS · ${data.summary.failedDeployments} falhas`,'live-metrics'));
      panel.append(el('p',`Consultado: ${new Date(data.checkedAt).toLocaleString('pt-PT')} · cache máxima de 60 segundos · atualização manual.`,'live-note'));
      if(Date.now()-Date.parse(data.checkedAt)>60000) panel.append(el('p','Esta consulta tem mais de um minuto. Atualiza para confirmar o estado atual.','live-note'));
      if(!data.inventoryMatches){const warning=el('p','O inventário recebido difere dos 12 serviços esperados. Rever antes de concluir que está tudo operacional.');warning.setAttribute('role','alert');panel.append(warning);}
      const grid=el('div',undefined,'live-grid');
      for(const service of data.services){const card=el('article',undefined,'live-service');
        card.append(el('strong',service.name),el('span',service.present?service.deploymentStatus:'Não encontrado'),el('small',service.deploymentCreatedAt?`Deployment criado: ${new Date(service.deploymentCreatedAt).toLocaleString('pt-PT')}`:'Sem data confirmada'));grid.append(card);}
      panel.append(grid);
    }
    panel.append(el('p','As secções abaixo e o Voice permanecem demonstrativos. Nenhuma missão, mensagem, email ou alteração de produção é executada.','live-note'));
  }
  function mount() {
    const view=document.querySelector('#view');
    if(real && view && document.body.dataset.page==='Settings' && !view.querySelector('#real-settings-note')) {
      const note=el('p','Estes controlos pertencem apenas à demonstração v0.7.3. A sessão real e o estado Railway são geridos no Dashboard. Os dados demonstrativos desta área segura são temporários.','live-panel');
      note.id='real-settings-note';view.insertBefore(note,view.children[1]||null);
    }
    if(!view || document.body.dataset.page!=='Dashboard' || view.querySelector('#nexo-live')) return;
    const panel=el('section',undefined,'live-panel');panel.id='nexo-live';panel.setAttribute('aria-label','Estado real Railway');
    view.insertBefore(panel,view.children[1]||null);
    if(real){const tag=view.querySelector('.heading .tag');if(tag)tag.textContent='DASHBOARD REAL + DEMO IDENTIFICADA';}
    paint();
  }
  if(real){
    const badge=document.querySelector('header .badge');if(badge)badge.textContent='v0.8 · ACESSO SEGURO';
    const note=document.querySelector('.disclaimer');if(note)note.textContent='Só o painel de estado usa dados Railway após autenticação. Restantes secções e Voice: demonstração.';
  }
  const view=document.querySelector('#view');if(view)new MutationObserver(mount).observe(view,{childList:true});
  mount();
  // A restored back/forward page must revalidate, not display old private data.
  addEventListener('pageshow',e=>{if(real&&e.persisted){forget();refresh();}});
  addEventListener('pagehide',()=>{if(real){forget();message='Sessão por verificar.';paint();}});
  if(real)refresh();
})();
