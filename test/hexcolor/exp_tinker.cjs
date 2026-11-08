/* 對候選盤面發動「微調攻擊」。
   執行：node test/hexcolor/exp_tinker.cjs <盤面json> [翻塊預算] [交換預算] [重複次數]
   對照組：也可以丟一般盤面進來比較（例如隨機零預填、極端型）。 */
'use strict';
const L = require('./lab.cjs');
const R = require('./rigid.cjs');
const T = require('./tinker.cjs');
const { Core, makeEngine } = L;
const file = process.argv[2], FLIP = Number(process.argv[3] || 200000), SWAP = Number(process.argv[4] || 200000), REPS = Number(process.argv[5] || 6);
const b = JSON.parse(require('fs').readFileSync(file, 'utf8'));
const k = b.counts.length;
const G = Core.buildGraph(b.cells), g = Int8Array.from(b.givens);
const rng = Core.makeRng(1234567);
const out = { file: require('path').basename(file), n: G.n, k, counts: b.counts, clues: g.filter(x => x >= 0).length };
if (k === 3) {
    const M = R.buildModel(G);
    const sol = R.arithSearch(M, b.counts, g, { cap: 2, nodeLimit: 5e7 });
    out.blocks = M.blocks.length;
    out.greedy = T.greedyGuess(M, b.counts, g, sol.first);
    /* 所有合法著色的差距分布：最接近答案的假解有多接近 */
    const sp = R.enumerate(M, 2e7, g);
    if (sp) {
        const near = {};
        for (const [key, v] of sp.map) {
            const a = Math.floor(key / 10000), bb = Math.floor(key / 100) % 100, c = key % 100;
            const d = Math.abs(a - b.counts[0]) + Math.abs(bb - b.counts[1]) + Math.abs(c - b.counts[2]);
            if (d <= 4) near[d] = (near[d] || 0) + v;
        }
        out.total = sp.total; out.nearByError = near;
        let mx = 0, mn = 1e9;
        for (const key of sp.map.keys()) { for (const x of [Math.floor(key / 10000), Math.floor(key / 100) % 100, key % 100]) { if (x > mx) mx = x; if (x < mn) mn = x; } }
        out.range = [mn, mx];
    }
    const flips = [];
    for (let r = 0; r < REPS; r++) {
        const f = T.flipPlayer(M, b.counts, g, rng, FLIP, 60, 0.05);
        flips.push({ solved: f.solved, moves: f.moves, restarts: f.restarts, stuck: f.stuckHist });
    }
    out.flip = { solved: flips.filter(x => x.solved).length + '/' + REPS, moves: flips.map(x => x.moves), restarts: flips.map(x => x.restarts), stuck: flips[0].stuck };
}
const swaps = [];
for (let r = 0; r < REPS; r++) swaps.push(T.swapPlayer(G, k, b.counts, g, rng, SWAP, 0.03));
out.swap = { solved: swaps.filter(x => x.solved).length + '/' + REPS, moves: swaps.map(x => x.moves), best: swaps.map(x => x.best) };
console.log(JSON.stringify(out));
