// 「球在哪杯」的自動玩家：看杯子換位置 → 作答（solve）或只在杯子之間猶豫（ponder）
import { disableHints, captureRound, startRound, watchGame, rectOf, shuffled } from './common.mjs';

const STATE = 'Reaction.current.debug.state()';
const PICKING = `${STATE}.state === 'pick'`;
// 圓環上每個杯位在畫面上的位置（杯身中央），順序就是遊戲裡的位置編號
const SPOTS = `(function () {
  var d = Reaction.current.debug, L = d.layout(), r = document.querySelector('.cups-field').getBoundingClientRect();
  return L.P.map(function (p) { return { x: r.left + p.x * r.width / L.FW, y: r.top + (p.y - L.layout.CH / 2) * r.height / L.FH }; });
})()`;

// 看完換位置，回傳杯位與狀態
async function watch(take) {
  await watchGame(take, `${STATE}.state`, 'swap', 'pick');
  return { spots: await take.b.evalJs(SPOTS), s: await take.b.evalJs(STATE) };
}

export default {
  ready: '!!Reaction.current.debug',
  openEnded: ['solve', 'ponder'],
  snapshotAtEnd: false,
  fontText: '記住球在哪個杯子盯緊點一下答對了猜錯球在這裡第關最佳！？…，',
  async beforeStart(b) { await disableHints(b); await captureRound(b); },
  async start(b, seg, seed) { await startRound(b, seg.level, seed, 400); },   // 遊戲開局 0.5 秒後掀杯子，停在掀之前
  boardRect: b => rectOf(b, '.cups-field'),
  async snapshot(b) { const s = await b.evalJs(STATE); return [s.n, s.swaps, s.ballSlot, s.finalBall].join(','); },

  async solve(take, seg) {
    const { spots, s } = await watch(take);
    const others = shuffled(spots.filter((p, i) => i !== s.finalBall), take.rng);
    const think = seg.thinkBeforeSec ?? 0.6;
    if (think > 0) await take.wander(others.slice(0, 2).concat(spots[s.finalBall]), think);   // 先猶豫一下
    await take.moveTo(spots[s.finalBall].x, spots[s.finalBall].y, 0.28);
    await take.tap();
    const hint = await take.b.evalJs(`document.querySelector('.hint').textContent`);
    if (!hint.includes('答對')) throw new Error('自動玩家沒有答對（遊戲可能改版了）：' + hint);
    await take.wait(Math.min(seg.holdSec ?? 0.8, 0.8));   // 再久遊戲就跳到下一關
    take.mark('end');
    take.note = s.n + ' 個杯子、換 ' + s.swaps + ' 次，第 ' + take.marks.ready.toFixed(1) + ' 秒開始作答並答對';
  },

  async ponder(take, seg) {
    const { spots, s } = await watch(take);
    await take.wander(spots, seg.thinkSec + 0.2);  // 在每個杯子之間猶豫，從頭到尾不點
    if (!(await take.b.evalJs(PICKING))) throw new Error('猶豫的時候遊戲狀態變了（不應該發生）');
    take.mark('end');
    take.note = s.n + ' 個杯子、換 ' + s.swaps + ' 次，第 ' + take.marks.ready.toFixed(1) + ' 秒起只猶豫不作答';
  }
};
