/**
 * NEXO Game Agent v0.1 — accounting and puzzle logic.
 * No ads, BestPlay connection, payment automation or external API access.
 * Public preview uses ONLY fictitious entries.
 */
export const SCHEMA = 'nexo.game.ledger.v1';
const kinds = new Set(['payout', 'expense', 'coins']);
const isInt = n => Number.isSafeInteger(n) && n >= 0;

export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || !kinds.has(entry.kind)) throw new TypeError('Invalid ledger kind');
  if (typeof entry.id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(entry.id)) throw new TypeError('Invalid entry id');
  if (typeof entry.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(entry.at) || !Number.isFinite(Date.parse(entry.at))) throw new TypeError('Invalid timestamp');
  if (entry.kind === 'coins') {
    if (!isInt(entry.coins) || entry.coins > 1_000_000_000_000) throw new TypeError('Invalid coins');
  } else {
    if (!isInt(entry.cents) || entry.cents > 1_000_000_000) throw new TypeError('Invalid EUR cents');
    if (entry.kind === 'payout' && !['pending', 'confirmed'].includes(entry.status)) throw new TypeError('Invalid payout status');
  }
  return entry;
}

export function summarize(entries, goalCents = 10000) {
  if (!Array.isArray(entries) || entries.length > 10000) throw new TypeError('Invalid ledger');
  if (!isInt(goalCents) || goalCents > 1_000_000_000) throw new TypeError('Invalid target');
  const total = {revenueCents:0, pendingCents:0, expenseCents:0, netCents:0, coins:0, goalCents, goalPercent:0, entries:entries.length};
  for (const raw of entries) {
    const e = validateEntry(raw);
    if (e.kind === 'coins') total.coins += e.coins;
    if (e.kind === 'expense') total.expenseCents += e.cents;
    if (e.kind === 'payout' && e.status === 'confirmed') total.revenueCents += e.cents;
    if (e.kind === 'payout' && e.status === 'pending') total.pendingCents += e.cents;
  }
  total.netCents = total.revenueCents - total.expenseCents;
  total.goalPercent = goalCents ? Math.min(100, Math.round(100 * total.revenueCents / goalCents)) : 0;
  return total;
}

export function dailyRevenue(entries, days = 7, now = new Date()) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 31) throw new RangeError('Invalid day count');
  const today = new Date(now);
  if (!Number.isFinite(today.valueOf())) throw new TypeError('Invalid date');
  const byDay = new Map();
  const dateKey = d => d.toISOString().slice(0,10);
  const base = new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - offset);
    byDay.set(dateKey(d), 0);
  }
  for (const e of entries) {
    validateEntry(e);
    const day = e.at.slice(0,10);
    if (byDay.has(day) && e.kind === 'payout' && e.status === 'confirmed') byDay.set(day,byDay.get(day)+e.cents);
  }
  return [...byDay].map(([day,cents])=>({day,cents}));
}

export const LEVELS = Object.freeze([
  ['S..#..','. #.#..'.replace(' ',''),'...#..','.#....','...#.#','.....G'],
  ['S.....','.###..','...#..','.#....','...##.','.....G'],
  ['S.#...','..#.#.','..#...','....#.','.##...','.....G']
]);
export function levelAt(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('Invalid level');
  return LEVELS[index % LEVELS.length].map(row=>row.split(''));
}

/** BFS always returns the shortest available route, including start and goal. */
export function shortestPath(board) {
  if (!Array.isArray(board) || !board.length || board.length > 30) throw new TypeError('Invalid board');
  const height=board.length, width=board[0]?.length;
  if (!width || width > 30 || board.some(row=>!Array.isArray(row)||row.length!==width)) throw new TypeError('Invalid board geometry');
  let start=null, goal=null;
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
    if(board[r][c]==='S')start=[r,c];
    if(board[r][c]==='G')goal=[r,c];
  }
  if(!start||!goal)return [];
  const key=([r,c])=>r+','+c, seen=new Set([key(start)]);
  const queue=[[start]], moves=[[1,0],[0,1],[-1,0],[0,-1]];
  for(let cursor=0;cursor<queue.length;cursor++){
    const path=queue[cursor],pos=path[path.length-1];
    if(pos[0]===goal[0] && pos[1]===goal[1])return path;
    for(const [dr,dc] of moves){
      const r=pos[0]+dr,c=pos[1]+dc,k=r+','+c;
      if(r<0||c<0||r>=height||c>=width||board[r][c]==='#'||seen.has(k))continue;
      seen.add(k);queue.push([...path,[r,c]]);
    }
  }
  return [];
}
