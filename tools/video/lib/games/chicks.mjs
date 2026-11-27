// 「找回小雞」的自動玩家：記住有星星的小雞 → 看牠們亂跑 → 找出來（solve）或只在幾隻之間猶豫（ponder）
import { disableHints, captureRound, startRound, watchGame, elementsAt, rectOf, shuffled } from './common.mjs';

const PICKING = `Reaction.current.debug.state().state === 'pick'`;
// 只拿需要的資料（整關資料含每隻小雞的移動路線，太大，不要整包拿）
const info = b => b.evalJs(`(function () { var s = Reaction.current.debug.state(); return { total: s.S.chicks.length, targets: s.S.targets.slice(), found: s.found.length, state: s.state }; })()`);

async function watch(take) {
  await watchGame(take, 'Reaction.current.debug.state().state', 'move', 'pick');
  const chicks = await elementsAt(take.b, '.chicks-chick');    // 小雞都停下來了，量牠們的位置
  return { chicks, s: await info(take.b) };
}
// 「看起來像在懷疑」的人選：答案和差不多數量的其他小雞混在一起
function suspects(s, chicks, rng) {
  const decoys = shuffled(chicks.filter(c => !s.targets.includes(c.i)), rng).slice(0, Math.max(3, s.targets.length + 1));
  return { decoys, all: shuffled(chicks.filter(c => s.targets.includes(c.i)).concat(decoys), rng) };
}

export default {
  ready: '!!Reaction.current.debug',
  openEnded: ['solve', 'ponder'],
  snapshotAtEnd: true,                             // 小雞在開局一瞬間之後才排出來，錄完再記開局資料
  fontText: '第關找出隻記住頭上有星的小雞亂跑中盯緊點出剛才個點錯就失敗全部回來了沒還到最佳！？…，（）',
  async beforeStart(b) { await disableHints(b); await captureRound(b); },
  async start(b, seg, seed) { await startRound(b, seg.level, seed, 275); },   // 開局 0.3 秒後小雞出現（帶音效），停在出現之前
  boardRect: b => rectOf(b, '.chicks-field'),
  async snapshot(b) { const s = await info(b); return s.total + ',' + s.targets.join('.'); },

  async solve(take, seg) {
    const { chicks, s } = await watch(take);
    const think = seg.thinkBeforeSec ?? 0.4;
    if (think > 0) await take.wander(suspects(s, chicks, take.rng).all.slice(0, 3), think);
    let todo = chicks.filter(c => s.targets.includes(c.i));
    const count = todo.length;
    while (todo.length) {                          // 每次點離手指最近的那一隻
      todo.sort((a, b) => Math.hypot(a.x - take.x, a.y - take.y) - Math.hypot(b.x - take.x, b.y - take.y));
      const c = todo.shift();
      await take.moveTo(c.x, c.y, 0.24);
      await take.tap();
      if (todo.length) await take.wait(seg.tapGapSec ?? 0.15);
    }
    const banner = await take.b.evalJs(`document.querySelector('.chicks-banner').textContent`);
    if (!banner.includes('全部找回來')) throw new Error('自動玩家沒有全部找到（遊戲可能改版了）：' + banner);
    await take.wait(Math.min(seg.holdSec ?? 1.0, 1.2));    // 再久遊戲就跳到下一關
    take.mark('end');
    take.note = s.total + ' 隻裡找 ' + count + ' 隻，第 ' + take.marks.ready.toFixed(1) + ' 秒開始點並全部找到';
  },

  async ponder(take, seg) {
    const { chicks, s } = await watch(take);
    await take.wander(suspects(s, chicks, take.rng).all, seg.thinkSec + 0.2);
    const after = await info(take.b);
    if (after.state !== 'pick' || after.found !== 0) throw new Error('猶豫的時候點到小雞了（不應該發生）');
    take.mark('end');
    take.note = s.total + ' 隻裡要找 ' + s.targets.length + ' 隻，第 ' + take.marks.ready.toFixed(1) + ' 秒起只猶豫不作答';
  }
};
