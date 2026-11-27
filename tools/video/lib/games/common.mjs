// 幾款遊戲的自動玩家共用的小工具

// 關掉遊戲「第一次玩」的操作提示。有些提示會直接指著正確答案（球在哪杯、乘法表抓錯），錄影一定要關掉。
//   做法：讓 kit.once('xxx.hint') 一律回答「不是第一次」，保險起見也用 CSS 藏起來。要在遊戲畫面建立之前呼叫。
export async function disableHints(b) {
  await b.evalJs(`(function () {
    var once = Reaction.kit.once;
    Reaction.kit.once = function (key) { return /\\.hint$/.test(key) ? false : once.apply(this, arguments); };
    var s = document.createElement('style'); s.textContent = '.rx-hint,.rx-hint__label{display:none!important}'; document.head.appendChild(s);
  })()`);
}

// 接管「進場」：球在哪杯、找回小雞這類遊戲沒有跳關功能。它們進場時會呼叫 kit.enter(id, round)，
// 我們把 round（開始第幾關的函式）存起來，之後要跳到哪一關就呼叫它
export async function captureRound(b) {
  await b.evalJs('Reaction.kit.enter = function (id, round) { window.__round = round; round(1); return 1; }; 1');
}

// 固定亂數 → 呼叫存起來的 round(關卡) → 讓時間走 settleMs 毫秒（讓畫面排好，但停在動作開始之前）
export async function startRound(b, level, seed, settleMs) {
  await b.evalJs(`__vt.reseed(${seed}); window.__round(${level}); for (var i = 0; i < ${Math.floor(settleMs / 25)}; i++) __vt.advance(25); 1`);
}

// 「看」的階段：手指先藏起來，一邊錄一邊等遊戲進到可以作答。stateExpr 回傳遊戲目前的狀態文字；
//   movingState 是「東西開始移動」的狀態（記成 move 時間點，合成時可以讓移動前的部分播慢一點），readyState 是可以作答
export async function watchGame(take, stateExpr, movingState, readyState) {
  take.hidden = true;
  for (;;) {
    const s = await take.b.evalJs(stateExpr);
    if (s === movingState && take.marks.move === undefined) take.mark('move');
    if (s === readyState) break;
    await take.frame();
  }
  take.mark('ready');
  take.hidden = false;                             // 手指從盤面下方滑進來
}

// 畫面上符合 selector 的元素：中心點座標＋文字
export function elementsAt(b, selector) {
  return b.evalJs(`[].map.call(document.querySelectorAll(${JSON.stringify(selector)}), function (e) { var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: e.textContent, i: Number(e.getAttribute('data-i')) }; })`);
}

export async function rectOf(b, selector) {
  return b.evalJs(`(function () { var r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
}

export function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 「依序快點、越來越慢、最後只徘徊」的節奏（數字方陣、乘法表抓錯共用）
//   o.count：最多點幾個；o.target(i)：第 i 個要點的位置；o.stops(i, n)：點第 i 個之前，思考時要停留的 n 個位置；
//   o.verify(i)：點完確認遊戲有接受；o.finalSpots()：最後徘徊時可以去的位置（不能包含還沒點的答案）
//   o.spread：能點的個數有限（例如乘法表只有 9 格被改）時設 true：間隔按比例放大或縮小，
//             讓第 count 個剛好在開始徘徊前點到，不會前幾秒就點完、後面一直發呆
export async function tapInOrder(take, seg, o) {
  const tapUntil = seg.seconds - seg.thinkSec;     // 這之後完全不點
  const gapAt = p => (Array.isArray(seg.tapGapSec) ? seg.tapGapSec[0] + (seg.tapGapSec[1] - seg.tapGapSec[0]) * Math.min(1, p * p) : seg.tapGapSec);
  let plan = null;
  if (o.spread) {
    const shape = Array.from({ length: o.count }, (_, i) => Math.max(0.05, gapAt(o.count > 1 ? i / (o.count - 1) : 1)));
    const k = (tapUntil - 0.4) / shape.reduce((a, g) => a + g, 0);
    plan = shape.map(g => g * k);
  }
  let done = 0;
  while (done < o.count) {
    const gap = plan ? plan[done] : gapAt(take.t / tapUntil);   // 兩次點擊的間隔：一開始幾乎不變，越到後面慢得越明顯
    const travel = Math.min(0.28, Math.max(0.15, gap * 0.5));
    if (take.t + (plan ? travel + 0.1 : Math.max(travel + 0.1, gap * 0.85)) > tapUntil) break;
    const idle = gap - travel - 0.1;               // 扣掉移動和點一下的時間，剩下的拿來「想」
    if (idle > 0.35) {
      const stops = await o.stops(done, Math.max(1, Math.round(idle / 0.45)));
      const until = take.t + idle;
      for (let k = 0; k < stops.length; k++) {
        const left = (until - take.t) / (stops.length - k);
        if (left <= 0) break;
        await take.moveTo(stops[k].x + 6, stops[k].y + 16, left * 0.6);
        await take.jiggle(left * 0.4);
      }
    } else if (idle > 0) await take.wait(idle);
    const to = await o.target(done);
    await take.moveTo(to.x, to.y, travel);
    await take.tap();
    await o.verify(done);
    done++;
  }
  take.note = '依序點對 ' + done + ' 個，第 ' + tapUntil.toFixed(0) + ' 秒起只徘徊';
  take.mark('think');
  await take.wander(await o.finalSpots(), Infinity);   // 一直徘徊到錄滿為止
}
