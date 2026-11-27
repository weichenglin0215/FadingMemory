// 「拖曳湊十」的自動玩家：看盤面 → 想一串 → 用手指照著拖。
// 規則（跟 js/reaction_sumten.js 一樣）：照拖的順序累加，剛好 10 就從下一格重新加；超過 10 或最後不到 10 就整串失敗。

const TEN = 10;
const BUSY_SEC = 0.6;                             // 收走之後的消失＋掉落動畫，這段時間遊戲不能拖

/* ═══ 純計算 ═══ */
export function neighbors(i, cols, rows) {
  const r = Math.floor(i / cols), c = i % cols, out = [];
  if (r > 0) out.push(i - cols);
  if (r < rows - 1) out.push(i + cols);
  if (c > 0) out.push(i - 1);
  if (c < cols - 1) out.push(i + 1);
  return out;
}
// 回傳 { ok, run（最後一段目前加到多少）, segs（完成幾段）, over（有沒有超過 10） }
export function judge(vals, path) {
  let run = 0, segs = 0;
  for (const k of path) {
    run += vals[k];
    if (run === TEN) { segs++; run = 0; } else if (run > TEN) return { ok: false, run, segs, over: true };
  }
  return { ok: path.length > 1 && run === 0, run, segs, over: false };
}
function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const randInt = (a, b, rng) => a + Math.floor(rng() * (b - a + 1));

// 找盤面上「成立」而且格數在 [min, max] 的串（每個起點只搜一部分，收集到夠多就停）
export function findPaths(vals, cols, rows, min, max, rng) {
  const found = [];
  for (const start of shuffled(vals.map((v, i) => i), rng)) {
    let budget = 3000, here = 0;
    const path = [start], mark = new Set(path);
    (function go(run) {
      if (budget-- <= 0 || here >= 4) return;
      if (run === 0 && path.length >= min) { found.push(path.slice()); here++; }
      if (path.length >= max) return;
      for (const k of shuffled(neighbors(path[path.length - 1], cols, rows), rng)) {
        if (mark.has(k) || run + vals[k] > TEN) continue;
        mark.add(k); path.push(k);
        go((run + vals[k]) % TEN);
        path.pop(); mark.delete(k);
      }
    })(vals[start] % TEN);
    if (found.length >= 120) break;
  }
  return found;
}
// 挑一串：先抽一個想要的格數，再從最接近的裡面隨機挑
export function choosePath(vals, cols, rows, range, rng) {
  const want = randInt(range[0], range[1], rng);
  let list = findPaths(vals, cols, rows, range[0], range[1], rng);
  for (let lo = range[0] - 4; !list.length && lo > -2; lo -= 4) list = findPaths(vals, cols, rows, Math.max(2, lo), range[1], rng);   // 找不到：一步步放寬下限，挑最接近的
  if (!list.length) return null;
  const gap = p => Math.abs(p.length - want), best = Math.min(...list.map(gap));
  const top = list.filter(p => gap(p) === best);
  return top[Math.floor(rng() * top.length)];
}

// 「錯得很像樣」的延伸：把 path 延長到 len 格，結果不成立；最好前面已經湊成過一次 10、最後只差一點
export function wrongExtension(vals, cols, rows, path, len, avoid, rng) {
  let best = null, bestScore = -1;
  for (let tries = 0; tries < 80; tries++) {
    const p = path.slice();
    while (p.length < len) {
      const opts = neighbors(p[p.length - 1], cols, rows).filter(k => !p.includes(k) && !(p.length === path.length && k === avoid));
      if (!opts.length) break;
      p.push(opts[Math.floor(rng() * opts.length)]);
    }
    if (p.length <= path.length) continue;
    const j = judge(vals, p);
    if (j.ok) continue;                           // 不小心成立的不要
    let run = 0, tens = 0;
    for (const k of p) { run += vals[k]; if (run === TEN) { tens++; run = 0; } else if (run > TEN) run = run % TEN; }
    const score = (p.length === len ? 4 : 0) + (tens > 0 ? 2 : 0) + (j.segs > 0 ? 2 : 0) + rng();
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

/* ═══ 跟遊戲頁面打交道 ═══ */
const STATE = `(function () {
  var a = Reaction.current.debug.api(), c = document.querySelector('.numgrid-board'), r = c.getBoundingClientRect();
  return { vals: a.game.vals.slice(), cols: a.info.gr.w, rows: a.info.gr.h, score: a.game.score, sel: a.game.sel.slice(), over: !!a.over, level: a.level,
    left: r.left, top: r.top, width: r.width, height: r.height, cell: parseFloat(c.style.width) / a.info.gr.w };
})()`;
const read = take => take.b.evalJs(STATE);
const xy = (s, k) => ({ x: s.left + (k % s.cols + 0.5) * s.cell, y: s.top + (Math.floor(k / s.cols) + 0.5) * s.cell });
// [開頭, 結尾] → 依目前進度算出數值；單一數字就照用
const ramped = (v, p) => Array.isArray(v) ? v[0] + (v[1] - v[0]) * Math.min(1, Math.max(0, p)) : v;

// 確認自動玩家對規則的理解跟遊戲一致（遊戲規則改了的話，這裡會直接報錯，而不是錄出失敗的畫面）
async function assertGameAgrees(take, path, expectOk) {
  const ok = await take.b.evalJs(`(function () { var a = Reaction.current.debug.api(); return Reaction.current.test.judge(a.info.gr, a.game.vals, ${JSON.stringify(path)}).ok; })()`);
  if (ok !== expectOk) throw new Error('自動玩家跟遊戲的判定不一樣（遊戲規則可能改了）：' + JSON.stringify(path));
}

export default {
  async prepare(b, opts) {
    await b.evalJs(`Reaction.current.test.getOpts().loupe = ${!!opts.loupe}; 1`);
    if (opts.showHint) await b.evalJs('Reaction.kit.once = function () { return true; }; 1');
    else await b.evalJs(`(function () { var s = document.createElement('style'); s.textContent = '.rx-hint,.rx-hint__label{display:none!important}'; document.head.appendChild(s); })()`);
  },
  async boardRect(b) { const s = await b.evalJs(STATE); return { left: s.left, top: s.top, width: s.width, height: s.height }; },
  // 開局盤面（檢查「重錄是不是同一題」用）
  async snapshot(b) { const s = await b.evalJs(STATE); return s.cols + 'x' + s.rows + ':' + s.vals.join(''); },

  // 正常玩：一串接一串
  async play(take, seg) {
    const span = seg.seconds * (seg.speed || 1);   // [開頭, 結尾] 的漸變以這一段實際用到的原始長度為準
    let s = await read(take), path = choosePath(s.vals, s.cols, s.rows, seg.pickCells, take.rng), travel = 0.3;
    while (true) {
      if (s.over || !path) { await take.wait(0.1); s = await read(take); path = s.over ? null : choosePath(s.vals, s.cols, s.rows, seg.pickCells, take.rng); continue; }
      const start = xy(s, path[0]);
      await take.moveTo(start.x, start.y, travel);
      await take.wait(ramped(seg.pauseSec ?? 0.3, take.t / span));
      await assertGameAgrees(take, path, true);
      await take.press();
      const per = ramped(seg.dragSecPerCell, take.t / span);
      await take.drag(path.slice(1).map(k => xy(s, k)), per);
      await take.wait(Math.min(0.1, per));
      const before = s.score, end = xy(s, path[path.length - 1]), cells = path.length;
      await take.release();
      s = await read(take);
      if (s.score <= before && !s.over) throw new Error('自動玩家這一串沒有成功（第 ' + take.t.toFixed(1) + ' 秒）');
      const gain = s.score - before;
      take.gains.push({ t: take.t, gain, cells, x: end.x, y: end.y });
      take.moves.push({ t: take.t, cells, gain });
      path = s.over ? null : choosePath(s.vals, s.cols, s.rows, seg.pickCells, take.rng);
      travel = BUSY_SEC;                          // 一邊看方格往下掉，一邊把手指移到下一串的起點
    }
  },

  // 故意拖錯：往前拖一串（不成立）→ 猶豫 → 退幾格 → 換方向再試
  async wrongDrag(take, seg) {
    const s = await read(take);
    // 起點挑盤面中間偏上，觀眾看得清楚、手指圖示也不會跑出畫面
    const col = randInt(1, Math.max(1, s.cols - 3), take.rng), row = randInt(1, Math.max(1, Math.floor(s.rows / 2)), take.rng);
    let path = [row * s.cols + col], removed = -1;
    const start = xy(s, path[0]);
    await take.moveTo(start.x, start.y, 0.3);
    await take.wait(ramped(seg.pauseSec ?? 0.3, 0));
    await take.press();
    const releaseAt = seg.releaseAtEnd ? seg.seconds * (seg.speed || 1) - 0.8 : Infinity;
    while (take.t < releaseAt) {
      const len = Math.max(path.length + 1, randInt(seg.pathCells[0], seg.pathCells[1], take.rng));
      const next = wrongExtension(s.vals, s.cols, s.rows, path, len, removed, take.rng);
      if (next) {
        const added = next.slice(path.length);
        path = next;
        await take.drag(added.map(k => xy(s, k)), ramped(seg.dragSecPerCell, 0));
        await assertGameAgrees(take, path, false);
        take.moves.push({ t: take.t, cells: path.length, wrong: true });
        await take.wait(0.3);                     // 「咦？好像不對」
      }
      if (take.t >= releaseAt) break;
      const back = Math.min(path.length - 1, next ? randInt(seg.backCells[0], seg.backCells[1], take.rng) : 1);
      if (back > 0) {
        const trail = [];
        for (let i = 0; i < back; i++) { removed = path.pop(); trail.push(xy(s, path[path.length - 1])); }
        await take.drag(trail, ramped(seg.dragSecPerCell, 0));
        await take.wait(0.15);
      }
    }
    // 放開之前確定這一串是「不成立」的（只剩 1 格也算不成立）
    if (judge(s.vals, path).ok) { const extra = wrongExtension(s.vals, s.cols, s.rows, path, path.length + 1, -1, take.rng); if (extra) await take.drag([xy(s, extra[extra.length - 1])], 0.2); }
    await take.release();
  }
};
