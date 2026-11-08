/* 用滑桿「重新產生」得到的盤面在難度尺上是多少？（解釋為什麼玩起來覺得上限不高）
   這些盤面通常有很多解，所以量「找到任一解要幾個回溯節點」，並數解的個數。
   執行：node test/hexcolor/exp_slider_boards.cjs */
'use strict';
const L = require('./lab.cjs');
const { Core, makeEngine } = L;
const rng = Core.makeRng(8080);
const cases = [
    ['預設：4 色 各 6、預填 4、緊密 2', [6, 6, 6, 6], 4, 2],
    ['4 色 各 15、預填 12、緊密 3', [15, 15, 15, 15], 12, 3],
    ['4 色 不平均 28,28,28,6、預填 10、緊密 3', [28, 28, 28, 6], 10, 3],
    ['4 色 各 22、預填 0、緊密 3', [23, 23, 22, 22], 0, 3],
    ['5 色 平均 60 格、預填 12、緊密 3', [12, 12, 12, 12, 12], 12, 3],
];
for (const [label, counts, prefill, compact] of cases) {
    const rows = [];
    for (let t = 0; t < 40; t++) {
        const r = Core.generate({ counts, prefill, compact }, { rng, maxMs: 1500 });
        if (!r.ok) continue;
        const G = Core.buildGraph(r.cells), E = makeEngine(G, counts.length);
        const nodes = [];
        for (let q = 0; q < 5; q++) nodes.push(E.count(r.givens, counts, 1, 100000, rng).nodes);
        nodes.sort((a, b) => a - b);
        rows.push({ sol: r.solCount, capped: r.solCountCapped, n1: nodes[2], prop: r.propSolvable });
    }
    const med = f => { const a = rows.map(f).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    console.log(`${label}：樣本 ${rows.length}，解數中位 ${med(x => x.sol)}${rows.filter(x => x.capped).length ? `（${rows.filter(x => x.capped).length} 盤達 200 上限）` : ''}，找到任一解的節點中位 ${med(x => x.n1)}，唯一解 ${rows.filter(x => x.sol === 1).length} 盤`);
}
