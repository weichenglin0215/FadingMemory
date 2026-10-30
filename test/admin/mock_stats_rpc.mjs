// 假的 Supabase REST（PostgREST）伺服器：只實作「後台資料分析」（admin/stats.html）需要的三個統計函式，用來測試它。
//   不連網路、不會碰到真的資料庫。資料是程式產生的、固定不變（同一個 seed）：
//     · 40 位玩家、14 款遊戲（含一款分類表裡沒有的 zz_test），最近 45 天的遊玩紀錄（有些日子故意沒人玩）；
//     · 五星評價、世界排行榜（每款前 N 名）；暱稱裡有一個會害人的 <img onerror=…>，用來確認網頁把它當一般文字。
//   計算規則跟 supabase/MF_leaderboard.sql 的 MF_stats_games／MF_stats_daily／MF_stats_players 一樣
//   （日期是台灣日期、含頭尾；沒給＝最近 30 天；起迄顛倒會對調；最長 400 天；players 可以只算期間內達成的名次）。
//   opts.mode：'ok'（預設）｜'nofunc'（資料庫還沒執行新版 SQL：找不到函式 → 404／PGRST202）｜'denied'（金鑰不被接受 → 401）｜'slow'（回應慢 400 毫秒）
//   回傳 { port, url, requests, close() }；requests 記著收到的每一個 POST（函式名稱與參數、標頭），測試用來檢查網頁送了什麼
import http from 'node:http';

const taipeiDay = (ms) => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const addDays = (s, n) => new Date(parse(s) + n * 86400000).toISOString().slice(0, 10);
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

// 遊戲：id、名稱、better、有沒有分類表（網頁自己抄的 GAMES）
export const MOCK_GAMES = [
  ['speed', '零秒出手', 'min'], ['drop', '神準落下', 'max'], ['spot', '大家來找碴', 'max'], ['cups', '球在哪杯', 'max'], ['coins', '零錢分類', 'max'],
  ['lights', '點燈記憶', 'max'], ['pour', '倒到八分滿', 'min'], ['beans', '挑豆子', 'max'], ['teacher', '老師說', 'max'], ['bounce', '球會跑去哪', 'max'],
  ['samelen', '畫一樣長', 'min'], ['flags', '舉旗子', 'max'], ['minus7', '一路減七', 'max'], ['zz_test', '（測試用，可刪）', 'max']
];

export function buildData(todayStr) {
  const r = rng(20261030);
  const players = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, nick: i === 5 ? '<img src=x onerror="window.__xss=1">壞暱稱' : i === 9 ? null : '玩家' + (i + 1) }));
  const plays = [];        // { day, game, pid, n }
  for (let d = 0; d < 45; d++) {
    const day = addDays(todayStr, -d);
    if (d === 3 || d === 4 || d === 17) continue;                         // 這幾天沒人玩（圖要補 0）
    const active = 3 + Math.floor(r() * 25) + (d < 10 ? 6 : 0);
    for (let k = 0; k < active; k++) {
      const pid = 1 + Math.floor(r() * 40), g = MOCK_GAMES[Math.floor(Math.pow(r(), 1.6) * (MOCK_GAMES.length - 1))][0];    // 前面的遊戲比較熱門；zz_test 沒人玩
      plays.push({ day, game: g, pid, n: 1 + Math.floor(r() * 5) });
    }
  }
  const ratings = [];       // { day, game, stars }
  for (let i = 0; i < 120; i++) ratings.push({ day: addDays(todayStr, -Math.floor(r() * 45)), game: MOCK_GAMES[Math.floor(r() * 8)][0], stars: 1 + Math.floor(r() * 5) });
  // 世界排行榜：前 8 款各 12 名（玩家 1～40 隨機抽），名次依成績；achieved 是幾天前
  const scores = [];
  MOCK_GAMES.slice(0, 8).forEach(([id, , better], gi) => {
    const pool = Array.from({ length: 40 }, (_, i) => i + 1).sort(() => r() - 0.5).slice(0, 12 + (gi % 3) * 3);
    pool.forEach((pid) => scores.push({ game: id, pid, score: better === 'min' ? +(r() * 5 + 0.1).toFixed(4) : 5 + Math.floor(r() * 90), ago: Math.floor(r() * 60) }));
  });
  scores.forEach((s) => { s.better = MOCK_GAMES.find((g) => g[0] === s.game)[2]; });
  return { players, plays, ratings, scores };
}

export function startMock(opts) {
  const o = Object.assign({ goodKey: 'GOOD', mode: 'ok', today: taipeiDay(Date.now()) }, opts || {});
  const data = buildData(o.today);
  const requests = [];

  function range(pf, pt) {
    let to = pt || o.today, from = pf || addDays(to, -29);
    if (parse(from) > parse(to)) [from, to] = [to, from];
    if (parse(to) - parse(from) > 400 * 86400000) from = addDays(to, -400);
    return [from, to];
  }
  const inR = (day, [a, b]) => day >= a && day <= b;
  const nickOf = (pid) => data.players[pid - 1].nick;

  function games(pf, pt) {
    const R = range(pf, pt);
    return {
      from: R[0], to: R[1],
      games: MOCK_GAMES.map(([id, title, better]) => {
        const ps = data.plays.filter((p) => p.game === id && inR(p.day, R)), rs = data.ratings.filter((x) => x.game === id && inR(x.day, R));
        const top = data.scores.filter((s) => s.game === id).sort((a, b) => (better === 'min' ? a.score - b.score : b.score - a.score) || a.pid - b.pid)[0];
        return {
          game_id: id, title, better, plays: ps.reduce((s, p) => s + p.n, 0), players: new Set(ps.map((p) => p.pid)).size,
          stars_avg: rs.length ? Math.round(rs.reduce((s, x) => s + x.stars, 0) / rs.length * 100) / 100 : null, stars_cnt: rs.length,
          best_score: top ? top.score : null, best_nick: top ? nickOf(top.pid) : null
        };
      })
    };
  }
  function daily(pf, pt) {
    const R = range(pf, pt), by = {};
    data.plays.filter((p) => inR(p.day, R)).forEach((p) => { (by[p.day] = by[p.day] || { plays: 0, set: new Set() }); by[p.day].plays += p.n; by[p.day].set.add(p.pid); });
    const all = data.plays.filter((p) => inR(p.day, R));
    return {
      from: R[0], to: R[1], plays: all.reduce((s, p) => s + p.n, 0), players: new Set(all.map((p) => p.pid)).size,
      days: Object.keys(by).sort().map((d) => ({ day: d, plays: by[d].plays, players: by[d].set.size }))
    };
  }
  function playersFn(pf, pt) {
    const rank = {};           // game → [scores 依名次]
    MOCK_GAMES.forEach(([id, , better]) => { rank[id] = data.scores.filter((s) => s.game === id).sort((a, b) => (better === 'min' ? a.score - b.score : b.score - a.score) || a.pid - b.pid); });
    const per = {};
    Object.keys(rank).forEach((g) => rank[g].forEach((s, i) => {
      const day = addDays(o.today, -s.ago);
      if (pf && day < pf) return; if (pt && day > pt) return;
      (per[s.pid] = per[s.pid] || { ranks: {} }).ranks[g] = i + 1;
    }));
    return Object.keys(per).map((pid) => {
      const ranks = per[pid].ranks, vals = Object.values(ranks);
      return { nick: nickOf(+pid) || '', cnt: vals.length, best: Math.min(...vals), ranks, _pid: +pid };
    }).sort((a, b) => b.cnt - a.cnt || a.best - b.best || (a.nick < b.nick ? -1 : a.nick > b.nick ? 1 : 0) || a._pid - b._pid).map(({ _pid, ...x }) => x);
  }

  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, accept, prefer', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const m = /^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)$/.exec(new URL(req.url, 'http://mock').pathname);
      let args = {}; try { args = body ? JSON.parse(body) : {}; } catch (e) { /* 空的 */ }
      requests.push({ method: req.method, fn: m && m[1], args, headers: req.headers });
      const send = (code, obj) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(obj)); };
      const go = () => {
        if (!m || req.method !== 'POST') return send(404, { code: 'PGRST202', message: 'not found' });
        const key = req.headers.apikey;
        if (o.mode === 'denied' || key !== o.goodKey) return send(401, { message: 'Invalid API key' });
        if (o.mode === 'nofunc') return send(404, { code: 'PGRST202', message: 'Could not find the function public.' + m[1] + ' in the schema cache' });
        if (m[1] === 'MF_stats_games') return send(200, games(args.p_from, args.p_to));
        if (m[1] === 'MF_stats_daily') return send(200, daily(args.p_from, args.p_to));
        if (m[1] === 'MF_stats_players') return send(200, playersFn(args.p_from, args.p_to));
        return send(404, { code: 'PGRST202', message: 'unknown function' });
      };
      if (o.mode === 'slow') setTimeout(go, 400); else go();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ port, url: 'http://127.0.0.1:' + port, requests, data, today: o.today, expected: { games, daily, players: playersFn, range }, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
