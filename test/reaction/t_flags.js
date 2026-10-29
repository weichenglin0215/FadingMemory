// 舉旗子（flags，企劃 358 依使用者修改）的純函式檢查：口令的產生（否定句只在合理的狀態出現）、套用口令後該有的狀態、判定規則、難度隨答對句數線性增加
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_flags.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261130), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（輸入是已經答對幾句）──
ok(T.intervalFor(0) === T.INTERVAL[0] && T.intervalFor(T.RAMP_CMDS) === T.INTERVAL[1] && T.intervalFor(999) === T.INTERVAL[1], '口令間隔 ' + T.INTERVAL);
ok(T.graceFor(0) === Math.round(T.INTERVAL[0] * T.GRACE) && T.graceFor(T.RAMP_CMDS) === Math.round(T.INTERVAL[1] * T.GRACE), '寬限時間 = 間隔 × ' + T.GRACE);
ok(near(T.negPFor(0), T.NEG_P[0]) && near(T.negPFor(T.RAMP_CMDS), T.NEG_P[1]), '否定句機率 ' + T.NEG_P);
ok(T.bothPFor(T.BOTH_FROM - 1) === 0 && near(T.bothPFor(T.BOTH_FROM), T.BOTH_P[0], 1e-9) && near(T.bothPFor(T.RAMP_CMDS), T.BOTH_P[1]), '兩面旗一起：第 ' + T.BOTH_FROM + ' 句起、到頂 ' + T.BOTH_P[1]);
for (let n = 1; n <= 80; n++) ok(T.intervalFor(n) <= T.intervalFor(n - 1) && T.graceFor(n) <= T.graceFor(n - 1) && T.negPFor(n) >= T.negPFor(n - 1) && T.bothPFor(n) >= T.bothPFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 1; n <= T.RAMP_CMDS; n++) d.push(T.intervalFor(n - 1) - T.intervalFor(n)); ok(Math.max(...d) - Math.min(...d) <= 1, '間隔線性縮短：每句 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }
ok(T.graceFor(T.RAMP_CMDS) >= 500, '最快的時候寬限時間還有 ' + T.graceFor(T.RAMP_CMDS) + ' 毫秒（人反應得過來）');

// ── 套用口令 ──
ok(JSON.stringify(T.applyCommand({ L: false, R: true }, { kind: 'raise', flags: ['L'], to: true })) === '{"L":true,"R":true}', '紅旗舉起來：紅旗該舉著、白旗不變');
ok(JSON.stringify(T.applyCommand({ L: true, R: true }, { kind: 'lower', flags: ['R'], to: false })) === '{"L":true,"R":false}', '白旗放下');
ok(JSON.stringify(T.applyCommand({ L: true, R: false }, { kind: 'keep', flags: ['L'], to: null })) === '{"L":true,"R":false}', '不要類口令：該有的狀態不變');
ok(JSON.stringify(T.applyCommand({ L: false, R: false }, { kind: 'raise', flags: ['L', 'R'], to: true })) === '{"L":true,"R":true}' && JSON.stringify(T.applyCommand({ L: true, R: true }, { kind: 'lower', flags: ['L', 'R'], to: false })) === '{"L":false,"R":false}', '兩面一起');
{ const r = { L: false, R: false }; T.applyCommand(r, { kind: 'raise', flags: ['L'], to: true }); ok(r.L === false, 'applyCommand 不會改到傳進去的物件'); }
ok(T.consistent({ L: true, R: false }, { L: true, R: false }) && !T.consistent({ L: true, R: false }, { L: true, R: true }), 'consistent');
ok(T.wrongFlags({ L: true, R: false }, { L: false, R: true }).join() === 'L,R' && T.wrongFlags({ L: true, R: false }, { L: true, R: true }).join() === 'R' && T.wrongFlags({ L: false, R: false }, { L: false, R: false }).length === 0, 'wrongFlags');
ok(T.describeState({ L: true, R: false }) === '紅旗舉著、白旗放下', 'describeState');

// ── 產生口令：長期模擬 ──
let req = { L: false, R: false }, prev = null, total = 0, st = { raise: 0, lower: 0, keep: 0, both: 0, negUp: 0, negDown: 0, same: 0, single: 0 }, text = new Set();
for (let i = 0; i < 60000; i++) {
  const count = i % 60, cmd = T.nextCommand(req, prev, count, rnd); total++; text.add(cmd.text);
  ok(['raise', 'lower', 'keep'].includes(cmd.kind) && cmd.flags.length >= 1 && cmd.flags.every(f => f === 'L' || f === 'R'), '口令的種類與旗子');
  ok((cmd.kind === 'keep') === (cmd.to === null) && (cmd.kind === 'raise' ? cmd.to === true : cmd.kind === 'lower' ? cmd.to === false : true), 'to 與種類對得上');
  ok(/^(紅旗|白旗)(舉起來|放下|不要舉|不舉|不要放下)$/.test(cmd.text) || /^兩面旗一起(舉起來|放下)$/.test(cmd.text), '口令文字格式：' + cmd.text);
  if (cmd.flags.length === 2) { st.both++; ok(count >= T.BOTH_FROM, '兩面旗一起只在第 ' + T.BOTH_FROM + ' 句之後：' + count); }
  if (cmd.kind === 'keep') { const f = cmd.flags[0]; st.keep++; if (/不要放下/.test(cmd.text)) { st.negDown++; ok(req[f] === true, '「不要放下」只在旗子現在舉著的時候出'); } else { st.negUp++; ok(req[f] === false && /不要舉|不舉/.test(cmd.text), '「不要舉／不舉」只在旗子現在放下的時候出'); } ok(cmd.text.startsWith(T.NAMES[f]), '否定句點名的旗子'); }
  if (cmd.kind === 'raise') st.raise++; if (cmd.kind === 'lower') st.lower++;
  if (prev && prev.flags.length === 1 && cmd.flags.length === 1) { st.single++; if (prev.flags[0] === cmd.flags[0]) st.same++; }
  const newReq = T.applyCommand(req, cmd); if (cmd.kind === 'keep') ok(newReq.L === req.L && newReq.R === req.R, '否定句不改變該有的狀態');
  req = newReq; prev = cmd;
}
console.log('口令分布 ' + JSON.stringify(st) + '；不同的口令文字 ' + text.size + ' 種');
ok(text.size >= 10, '口令文字有變化（紅白×舉放不要…）：' + text.size);
ok(st.raise > 8000 && st.lower > 8000 && st.keep > 6000 && st.both > 1500, '各類口令都有出現');
ok(st.negUp > 1500 && st.negDown > 1500, '兩種否定句都有出現（不要舉／不要放下）');
{ const rate = st.same / st.single; ok(rate > 0.55 && rate < 0.85, '連續同一面旗子的比例偏高：' + (100 * rate).toFixed(0) + '%（SAME_P ' + T.SAME_P + ' ＋ 隨機）'); }
// 否定句比例隨答對句數增加
{ function negRate(n) { let rq = { L: false, R: false }, pv = null, k = 0, N = 20000; for (let i = 0; i < N; i++) { const c = T.nextCommand(rq, pv, n, rnd); if (c.kind === 'keep') k++; rq = T.applyCommand(rq, c); pv = c; } return k / N; }
  const a = negRate(0), b = negRate(40); ok(b > a + 0.1, '否定句越後面越多（到頂還要扣掉「兩面一起」佔的 30%）：' + (100 * a).toFixed(0) + '% → ' + (100 * b).toFixed(0) + '%'); }

// ── 判定規則的模擬：完美玩家永遠不會錯；少動一下／亂動就錯 ──
function simulate(policy) {   // policy(cmd, actual, req) 回傳「寬限時間內玩家把旗子調成什麼」；回傳第幾句錯了（沒錯回傳 −1）
  let rq = { L: false, R: false }, actual = { L: false, R: false }, pv = null;
  for (let i = 0; i < 300; i++) {
    const cmd = T.nextCommand(rq, pv, i, rnd), start = { L: actual.L, R: actual.R }; rq = T.applyCommand(rq, cmd);
    const after = policy(cmd, start, rq);
    if (cmd.kind === 'keep' && cmd.flags.some(f => after[f] !== start[f])) return i;           // 「不要」類：被點名的旗子動了
    if (!T.consistent(after, rq)) return i;                                                    // 寬限結束：不一致
    actual = after; pv = cmd;
  }
  return -1;
}
ok(simulate((cmd, start, rq) => ({ L: rq.L, R: rq.R })) === -1, '完美玩家（旗子永遠照該有的狀態）300 句都不會錯');
ok(simulate((cmd, start, rq) => ({ L: start.L, R: start.R })) >= 0 && simulate((cmd, start, rq) => ({ L: start.L, R: start.R })) < 12, '完全不動的玩家很快就錯（遇到要舉／放的口令）');
ok(simulate((cmd, start, rq) => cmd.kind === 'keep' ? { L: !start.L, R: !start.R } : { L: rq.L, R: rq.R }) >= 0, '否定句的時候亂動就錯');
{ let firstWrong = []; for (let t = 0; t < 200; t++) firstWrong.push(simulate((cmd, start, rq) => cmd.kind === 'keep' ? { L: rq.L, R: rq.R } : { L: !rq.L, R: rq.R })); ok(firstWrong.every(x => x >= 0 && x <= 10), '紅旗永遠反著做的玩家一定很快錯'); }

// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_flags.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3600/.test(src) && /flg-cmp__flag--bad/.test(src) && /scoreOf/.test(src), '失敗：口令與你的旗子並排、不一樣的標紅、停格 2 秒以上；成績用 scoreOf');
  ok(/\.flg-cloth--L \{[^}]*var\(--flg-red\)/.test(css) && /\.flg-cmp__flag--bad \{[^}]*var\(--c-bad/.test(css), '紅旗、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_flags.js'") > 0 && /左半邊/.test(G.rule), 'boot.js 有載入、玩法說明提到左半邊');
  ok(/pointerdown/.test(src) && /pointerup/.test(src) && /pointercancel/.test(src) && /p\.x < W \/ 2/.test(src), '按壓：左右半邊、支援兩指一起（pointerdown／pointerup／pointercancel）');
  ok(/max: 300/.test(src), '成績上限 300'); }
ok(T.rating(3) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(40) && T.rating(40) !== T.rating(60), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
