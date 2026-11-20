import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA, validateEntry, summarize, dailyRevenue, shortestPath, levelAt, LEVELS} from './core.mjs';
const at='2026-11-20T14:00:00.000Z';
const payment=(id,cents,status='confirmed')=>({id,at,kind:'payout',status,cents});
const expense=(id,cents)=>({id,at,kind:'expense',cents});
const coins=(id,n)=>({id,at,kind:'coins',coins:n});

test('schema is versioned',()=>assert.equal(SCHEMA,'nexo.game.ledger.v1'));
test('only confirmed payouts count as revenue',()=>{
  const s=summarize([payment('a',700),payment('b',400,'pending'),expense('c',125),coins('d',1_000_000)]);
  assert.equal(s.revenueCents,700);
  assert.equal(s.pendingCents,400);
  assert.equal(s.expenseCents,125);
  assert.equal(s.netCents,575);
  assert.equal(s.coins,1_000_000);
  assert.equal(s.goalPercent,7);
});
test('no conversion of coins into euros',()=>{
  const s=summarize([coins('only_coins',2_000_000)]);
  assert.equal(s.revenueCents,0);
  assert.equal(s.netCents,0);
});
test('expenses can produce negative net',()=>assert.equal(summarize([expense('bill',2000)]).netCents,-2000));
test('invalid amounts and status are rejected',()=>{
  assert.throws(()=>validateEntry(payment('bad',-1)));
  assert.throws(()=>validateEntry(payment('bad',3.14)));
  assert.throws(()=>validateEntry(payment('bad',10,'claimed')));
  assert.throws(()=>validateEntry({id:'ok',kind:'coins',at,coins:-100}));
});
test('future/old ledger entries are not counted in last 7 days',()=>{
  const rows=dailyRevenue([{...payment('today',500)},{...payment('old',700),at:'2026-11-01T00:00:00Z'},payment('pending',200,'pending')],7,new Date('2026-11-20T18:00:00Z'));
  assert.equal(rows.length,7);
  assert.equal(rows.at(-1).day,'2026-11-20');
  assert.equal(rows.reduce((sum,r)=>sum+r.cents,0),500);
});
test('each simulated level has a valid walkable shortest path',()=>{
  for(let i=0;i<LEVELS.length;i++){
    const board=levelAt(i),p=shortestPath(board);
    assert.ok(p.length>2);
    for(let j=1;j<p.length;j++){
      assert.equal(Math.abs(p[j][0]-p[j-1][0])+Math.abs(p[j][1]-p[j-1][1]),1);
      assert.notEqual(board[p[j][0]][p[j][1]],'#');
    }
  }
});
test('blocked board has no route',()=>assert.deepEqual(shortestPath([['S','#','G']]),[]));
test('invalid boards and day counts rejected',()=>{
  assert.throws(()=>shortestPath([]));
  assert.throws(()=>dailyRevenue([],35));
});
