import {summarize,dailyRevenue,levelAt,shortestPath} from './core.mjs';

// This is a PUBLIC, IN-MEMORY DEMO. No credentials, persistent financial data,
// financial APIs, ads, BestPlay automation or cloud Android connections.
const $=id=>document.getElementById(id);
const euro=cents=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(cents/100);
const integer=n=>new Intl.NumberFormat('pt-PT').format(n);
const daysAgo=n=>{
  const d=new Date();
  d.setUTCDate(d.getUTCDate()-n);
  return d.toISOString();
};
const examples=[
  {id:'ex-payout-1',at:daysAgo(6),kind:'payout',status:'confirmed',cents:720,source:'Plataforma fictícia A'},
  {id:'ex-coins-1',at:daysAgo(5),kind:'coins',coins:350000,source:'Moedas fictícias'},
  {id:'ex-payout-2',at:daysAgo(4),kind:'payout',status:'confirmed',cents:980,source:'Plataforma fictícia A'},
  {id:'ex-cost-1',at:daysAgo(3),kind:'expense',cents:420,source:'Cloud de exemplo'},
  {id:'ex-payout-3',at:daysAgo(2),kind:'payout',status:'pending',cents:550,source:'Plataforma fictícia B'},
  {id:'ex-coins-2',at:daysAgo(1),kind:'coins',coins:850000,source:'Moedas fictícias'},
  {id:'ex-payout-4',at:daysAgo(0),kind:'payout',status:'confirmed',cents:1150,source:'Plataforma fictícia B'}
];
let entries=[...examples];
function cell(tag,text,cls=''){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  e.textContent=text;
  return e;
}
function renderFinances(){
  const goalEuros=Number($('monthly-goal').value);
  const goalCents=Number.isSafeInteger(goalEuros)&&goalEuros>=1&&goalEuros<=100000?goalEuros*100:10000;
  const s=summarize(entries,goalCents);
  $('revenue').textContent=euro(s.revenueCents);
  $('costs').textContent=euro(s.expenseCents);
  const profit=$('profit');
  profit.textContent=euro(s.netCents);
  profit.classList.toggle('positive',s.netCents>0);
  profit.classList.toggle('negative',s.netCents<0);
  $('coins').textContent=integer(s.coins);
  $('pending').textContent=euro(s.pendingCents);
  $('goal-current').textContent=euro(s.revenueCents)+' / '+euro(goalCents);
  $('goal-percent').textContent=s.goalPercent+'%';
  $('goal-fill').style.width=s.goalPercent+'%';
  $('goal-progress').setAttribute('aria-valuenow',String(s.goalPercent));
  $('toggle-demo').textContent=entries.length?'Limpar dados de exemplo':'Mostrar dados de exemplo';

  const chart=$('revenue-chart');
  chart.replaceChildren();
  const rows=dailyRevenue(entries,7,new Date());
  const max=Math.max(1,...rows.map(row=>row.cents));
  for(const row of rows){
    const column=cell('div','','barcol');
    const bar=cell('div','','bar');
    bar.style.height=(row.cents?Math.max(4,Math.round(row.cents/max*145)):2)+'px';
    bar.title=row.day+': '+euro(row.cents)+' (fictício)';
    column.append(bar,cell('small',new Date(row.day+'T12:00:00Z').toLocaleDateString('pt-PT',{weekday:'short',timeZone:'UTC'})));
    chart.append(column);
  }
  chart.setAttribute('aria-label','Receitas confirmadas de exemplo: '+rows.map(r=>r.day+' '+euro(r.cents)).join(', '));

  const tbody=$('ledger-rows');tbody.replaceChildren();
  if(!entries.length){
    const tr=document.createElement('tr'),td=cell('td','Nenhum dado de demonstração carregado.');
    td.colSpan=5;tr.append(td);tbody.append(tr);return;
  }
  for(const e of [...entries].sort((a,b)=>b.at.localeCompare(a.at))){
    const tr=document.createElement('tr');
    const kind=e.kind==='payout'?'Pagamento':e.kind==='expense'?'Despesa':'Moedas';
    const status=e.kind==='payout'?(e.status==='confirmed'?'Confirmado':'Pendente'):'Exemplo';
    const amount=e.kind==='coins'?integer(e.coins)+' coins':(e.kind==='expense'?'−':'')+euro(e.cents);
    const pill=cell('span',status,'pill '+(e.status==='confirmed'?'ok':e.status==='pending'?'pending':''));
    const statusCell=document.createElement('td');statusCell.append(pill);
    tr.append(cell('td',new Date(e.at).toLocaleDateString('pt-PT',{day:'2-digit',month:'short'})),
              cell('td',e.source),cell('td',kind,'event-kind'),statusCell,cell('td',amount));
    tbody.append(tr);
  }
}
$('toggle-demo').addEventListener('click',()=>{entries=entries.length?[]:[...examples];renderFinances()});
$('monthly-goal').addEventListener('change',()=>{const x=Number($('monthly-goal').value);if(!Number.isSafeInteger(x)||x<1||x>100000)$('monthly-goal').value='100';renderFinances()});
$('export-csv').addEventListener('click',()=>{
  const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const lines=[['id','date','type','status','eur_cents','coins','origin','DEMO_ONLY'].join(',')];
  for(const e of entries)lines.push([e.id,e.at,e.kind,e.status||'',e.cents??'',e.coins??'',e.source,'TRUE'].map(quote).join(','));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nexo-game-agent-DEMO.csv';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// Genuine rule-based agent prototype: solve three obstacle maps using BFS,
// observe its position, choose an adjacent step, verify target and repeat.
const game={running:false,level:0,position:0,levels:0,moves:0,elapsed:0,started:0,timer:null};
let feed=[];
function log(message){
  const time=new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  feed.unshift({time,message});feed=feed.slice(0,7);
  const target=$('agent-log');target.replaceChildren();
  for(const item of feed){
    const row=cell('div','','log-row');
    row.append(cell('span',item.time,'time'),cell('span',item.message,'event'));
    target.append(row);
  }
}
function updateRuntime(){
  const ms=game.elapsed+(game.running?Date.now()-game.started:0);
  $('runtime').textContent=Math.floor(ms/1000)+'s';
}
function renderGame(){
  const board=levelAt(game.level),path=shortestPath(board);
  const position=path[Math.min(game.position,path.length-1)]||[0,0];
  const grid=$('play-grid');grid.replaceChildren();
  for(let r=0;r<board.length;r++)for(let c=0;c<board[r].length;c++){
    const tile=board[r][c];
    const className='cell'+(tile==='#'?' wall':'')+(tile==='G'?' goal':'')+(position[0]===r&&position[1]===c?' agent':'');
    const node=cell('div','',className);
    node.title=position[0]===r&&position[1]===c?'Posição do agente':tile==='#'?'Obstáculo':tile==='G'?'Objetivo':'Caminho livre';
    grid.append(node);
  }
  grid.setAttribute('aria-label','Nível '+(game.level+1)+', agente na linha '+(position[0]+1)+' coluna '+(position[1]+1)+', '+path.length+' casas no caminho mais curto');
  $('levels').textContent=String(game.levels);
  $('moves').textContent=String(game.moves);
  $('toggle-agent').textContent=game.running?'Ⅱ Pausar simulação':'▶ Iniciar simulação';
  $('brain-status').textContent=game.running?'A planear movimentos':'A aguardar';
  $('agent-chip').textContent=game.running?'● ATIVO · NESTE BROWSER':'● PAUSADO · SIMULADOR';
  updateRuntime();
}
function step(){
  const board=levelAt(game.level),path=shortestPath(board);
  if(path.length<2){pause();log('Nível sem saída. Simulação interrompida.');return;}
  if(game.position<path.length-1){
    game.position++;game.moves++;
    const p=path[game.position];
    log('Nível '+(game.level+1)+': movimento para ('+(p[0]+1)+', '+(p[1]+1)+') após análise BFS.');
    if(game.position===path.length-1)log('Objetivo alcançado! A validar o nível.');
  }else{
    game.levels++;game.level++;game.position=0;
    log('Nível confirmado. A observar e planear o próximo mapa.');
  }
  renderGame();
}
function pause(){
  if(game.timer!==null)clearInterval(game.timer);
  game.timer=null;
  if(game.running)game.elapsed+=Date.now()-game.started;
  game.running=false;renderGame();
}
function start(){
  if(game.running)return;
  game.running=true;game.started=Date.now();
  game.timer=setInterval(()=>{if(document.hidden){pause();log('Pausado: esta demonstração não funciona em segundo plano.');return;}step();},900);
  log('Agente de teste iniciado. Nenhuma ação externa é executada.');
  renderGame();
}
function reset(){
  pause();game.level=0;game.position=0;game.levels=0;game.moves=0;game.elapsed=0;feed=[];
  log('Simulador reposto para o primeiro nível.');renderGame();
}
$('toggle-agent').addEventListener('click',()=>game.running?pause():start());
$('step-agent').addEventListener('click',()=>{if(game.running)pause();step()});
$('reset-agent').addEventListener('click',reset);
$('start-main').addEventListener('click',()=>{document.getElementById('agent').scrollIntoView({behavior:'smooth'});start()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.running){pause();log('Pausado automaticamente ao sair desta página.')}});
window.addEventListener('pagehide',pause);
renderFinances();log('Pronto para testes locais. Android Cloud ainda não contratado.');renderGame();
