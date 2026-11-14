/* NEXO HUB v0.8 — read-only connection UI; no keys, auth simulation or writes. */
(function(){
  'use strict';
  const LIVE_META='meta[name="nexo-backend-mode"][content="same-origin"]';
  const isGateway=!!document.querySelector(LIVE_META);
  const GATEWAY='https://nexo-owner-gateway-production.up.railway.app/';
  const SOURCE='status-snapshot.json';
  const allowedStates=new Set(['online','last_succeeded','unreachable','not_monitored']);
  let last=null, request=null;
  const $=sel=>document.querySelector(sel);
  const el=(name,cls,text)=>{const e=document.createElement(name);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const link=(label,url)=>{const a=el('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  function formatDate(iso){if(typeof iso!=='string'||!Number.isFinite(Date.parse(iso)))return 'Hora não disponível';return new Date(iso).toLocaleString('pt-PT',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'})+' (Alemanha)';}
  function parseSnapshot(data){
    if(!data || data.schema!=='nexo.status.snapshot.v1'||!Array.isArray(data.services)||data.services.length>25) throw new Error('Formato de auditoria inválido');
    return {...data,services:data.services.filter(s=>s&&typeof s.id==='string'&&/^[a-z][a-z0-9-]{2,50}$/.test(s.id)&&allowedStates.has(s.state))};
  }
  function parseLive(data){
    if(!data||data.schema!=='nexo.gateway.status.v1'||!Array.isArray(data.services)||data.services.length>25)throw new Error('Resposta inesperada do gateway');
    return {...data,services:data.services.filter(s=>s&&typeof s.id==='string'&&/^[a-z][a-z0-9-]{2,50}$/.test(s.id)&&allowedStates.has(s.state))};
  }
  async function getData(){
    if(request)return request;
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),7000);
    const url=isGateway?'/api/status':SOURCE;
    request=(async()=>{
      const response=await fetch(url,{method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
      if(response.status===401)throw new Error('Autenticação necessária. Entra pelo portal privado do NEXO.');
      if(!response.ok)throw new Error('Não foi possível carregar o estado ('+response.status+').');
      const raw=await response.text();if(raw.length>15000)throw new Error('Resposta demasiado grande');
      return (isGateway?parseLive:parseSnapshot)(JSON.parse(raw));
    })();
    try{return await request}finally{clearTimeout(timer);request=null}
  }
  function createPanel(){
    const wrap=el('section','nexo-ops-panel');wrap.id='nexo-ops-panel';wrap.setAttribute('aria-labelledby','nexo-ops-title');
    const top=el('div','nexo-ops-top');const left=el('div');
    left.append(el('span','nexo-ops-kicker','NEXO HUB / OPERAÇÕES · v0.8'));
    const h=el('h2','',isGateway?'Centro de estado — privado':'Estado dos serviços · acesso privado');h.id='nexo-ops-title';left.append(h);
    left.append(el('p','',isGateway?'Consulta autenticada do estado dos serviços. Nenhuma ação é executada.':'Entra com GitHub para consultar o estado atual. Os cartões abaixo são apenas a auditoria histórica.'));
    top.append(left,el('span','nexo-ops-chip',isGateway?'🔐 ACESSO AUTENTICADO':'◷ SNAPSHOT VERIFICADO'));
    const actions=el('div','nexo-ops-actions');const button=el('button','',isGateway?'Atualizar verificação':'Recarregar snapshot');button.type='button';button.disabled=false;button.addEventListener('click',async()=>{button.disabled=true;button.textContent='A consultar…';await refresh(wrap);button.disabled=false;button.textContent=isGateway?'Verificar novamente':'Recarregar snapshot';});
    actions.append(button);
    if(!isGateway){const login=link('Entrar com GitHub · estado real',GATEWAY);login.target='_self';actions.prepend(login);}
    const caption=el('div','nexo-ops-caption','');caption.id='nexo-ops-when';caption.textContent='A carregar…';
    const list=el('div','nexo-ops-grid');list.id='nexo-ops-services';list.setAttribute('aria-live','polite');
    const more=el('button','nexo-ops-more','Ver todos os serviços');more.type='button';more.hidden=true;more.addEventListener('click',()=>{more.hidden=true;list.replaceChildren();if(last)last.services.forEach(s=>addService(list,s));});
    const foot=el('p','nexo-ops-note',isGateway?'A leitura de endpoints internos não substitui verificações funcionais. As tarefas agendadas não são consideradas offline.':'O painel das missões, Chat, COMMS e Voice continua DEMONSTRATIVO nesta página. Não usa credenciais nem permite alterações reais.');
    const notice=el('div','nexo-ops-foot',isGateway?'Os dados são tratados no gateway privado e não guardados na app.':'O painel privado NEXO abre no gateway seguro. A sessão GitHub e os estados atuais ficam nesse domínio; esta página mostra apenas a auditoria histórica.');
    wrap.append(top,actions,caption,list,more,foot,notice);return wrap;
  }
  function addService(grid,s){
    const tile=el('div','nexo-ops-service');const title=el('strong','',s.id);const small=el('small','');const dot=el('i','nexo-ops-dot');
    let text='Online';if(s.state==='last_succeeded'){text='Última execução concluída';dot.classList.add('pending')}else if(s.state==='unreachable'){text='Sem resposta à sondagem';dot.classList.add('problem')}else if(s.state==='not_monitored'){text=s.id==='immo-discord-bootstrap'?'Provisionador — não sondado':'Tarefa agendada — não sondada';dot.classList.add('pending')}
    small.append(dot,document.createTextNode(text));tile.append(title,small);grid.append(tile);
  }
  async function refresh(panel){
    const caption=panel.querySelector('#nexo-ops-when'),grid=panel.querySelector('#nexo-ops-services'),more=panel.querySelector('.nexo-ops-more');
    try{const data=await getData();last=data;grid.replaceChildren();data.services.slice(0,6).forEach(s=>addService(grid,s));more.hidden=data.services.length<=6;more.textContent='Ver os '+data.services.length+' serviços';
      const checked=data.checkedAt||data.generatedAt;
      caption.textContent=isGateway?'Verificação do gateway: '+formatDate(checked)+' · '+data.services.length+' serviços':'Última auditoria: '+formatDate(checked)+' · '+data.services.length+' serviços';
    }catch(err){grid.replaceChildren(el('p','',err.message||'Erro ao obter estado'));caption.textContent='Não foi possível atualizar';}
  }
  function install(){
    const view=$('#view');if(!view||document.body.dataset.page!=='Dashboard')return;
    if(view.querySelector('#nexo-ops-panel'))return;
    const panel=createPanel();const heading=view.querySelector('.heading');
    if(heading)heading.after(panel);else view.prepend(panel);
    refresh(panel);
  }
  const watcher=new MutationObserver(()=>{if(document.body?.dataset?.page==='Dashboard'&&!$('#nexo-ops-panel'))install();});
  const view=$('#view');if(view)watcher.observe(view,{childList:true});
  const header=$('main header .row');
  if(header&&!$('#nexo-ops-open')){const btn=el('a','nexo-ops-shortcut');btn.id='nexo-ops-open';btn.href=GATEWAY;btn.rel='noreferrer';btn.title='Entrar com GitHub e ver estado real';btn.setAttribute('aria-label','Entrar com GitHub e ver estado real');const dot=el('span','nexo-ops-indicator');btn.append(dot,el('span','','NEXO · Estado real'));const voice=$('#nexo-voice-open');voice?.before(btn);}
  install();window.NexoOps={mode:isGateway?'authenticated-read-only':'public-snapshot',refresh:()=>{const panel=$('#nexo-ops-panel');if(panel)return refresh(panel);}};
})();