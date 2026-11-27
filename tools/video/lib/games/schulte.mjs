// 「數字方陣」的自動玩家：照 1、2、3… 依序點，越點越慢（手指邊找邊猶豫），最後只徘徊不點
import { disableHints, elementsAt, rectOf, shuffled, tapInOrder } from './common.mjs';

const next = b => b.evalJs('Reaction.current.debug.state().next');

export default {
  ready: '!!(Reaction.current.debug && Reaction.current.debug.board)',
  fontText: '下一個：秒最佳',
  // 這款沒有關卡：一進場就出好題目了，所以要在按「開始挑戰」之前固定亂數
  async beforeStart(b, o) { await disableHints(b); await b.evalJs(`__vt.reseed(${o.seed})`); },
  async start(b) { await b.evalJs('for (var i = 0; i < 24; i++) __vt.advance(25); 1'); },
  boardRect: b => rectOf(b, '.schulte-grid'),
  snapshot: b => b.evalJs('Reaction.current.debug.board.join(",")'),

  async tapOrder(take, seg) {
    const cells = await elementsAt(take.b, '.schulte-cell');
    const byNumber = new Map(cells.map(c => [Number(c.text), c]));
    const others = number => cells.filter(c => Number(c.text) !== number);
    await tapInOrder(take, seg, {
      count: Math.min(seg.maxTaps ?? cells.length - 1, cells.length - 1),   // 至少留一個不點（全部點完會跳結算）
      spread: seg.maxTaps !== undefined,
      target: i => byNumber.get(i + 1),
      // 思考：在別的格子之間看來看去（不停在正確答案上）
      stops: (i, n) => shuffled(others(i + 1), take.rng).slice(0, n),
      async verify(i) {
        const got = await next(take.b);
        if (got !== i + 2) throw new Error('自動玩家點 ' + (i + 1) + ' 沒有成功（遊戲可能改版了）');
      },
      finalSpots: async () => others(await next(take.b))
    });
  }
};
