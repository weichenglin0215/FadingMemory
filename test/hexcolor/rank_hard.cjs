/* 把搜尋結果重新用「嚴格標準」評一次，並排名。
   執行：node test/hexcolor/rank_hard.cjs <搜尋結果資料夾> [每個最多評幾秒]
   嚴格標準（搜尋時為了快，用的是便宜的估計；這裡全部用較高上限重算）：
     · 唯一解：回溯法＋剛體列表兩種都要說 1
     · 假設量尺：最多 3 層、給足時間
     · 回溯節點：15 次隨機順序的中位數，上限放大
     · 高手層：最多 4 層 */
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lab.cjs');
const R = require('./rigid.cjs');
const { Core, makeEngine, rate, nodesStats, clueCount } = L;
const dir = process.argv[2], MS = Number(process.argv[3] || 60) * 1000;
const rng = Core.makeRng(90210);
const rows = [];
for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    if (process.env.ONLY && f !== process.env.ONLY) continue;   /* 平行執行時，一個行程只評一個檔 */
    let b;
    try { b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    if (!b.cells) continue;
    const k = b.counts.length;
    const G = Core.buildGraph(b.cells), E = makeEngine(G, k);
    const g = Int8Array.from(b.givens);
    const u = E.count(g, b.counts, 2, 5e7);
    const row = { f, n: G.n, k, counts: b.counts, clues: clueCount(g), uniq: u.found === 1 && !u.aborted };
    if (k === 3) {
        const M = R.buildModel(G);
        const a = R.arithSearch(M, b.counts, g, { nodeLimit: 5e7 });
        row.uniq2 = a.solutions === 1 && !a.aborted;
        row.arith = a.nodes; row.blocks = M.blocks.length;
        const br = R.blobRate(M, b.counts, g, { maxDepth: 4, ms: MS });
        row.blob = br.solved ? br.depth : (br.timedOut ? '逾時' : '>4'); row.blobUses = br.uses; row.blobLog = br.startLog && br.startLog.toFixed(1);
    }
    const ns = nodesStats(E, g, b.counts, rng, Number(process.env.BT_RUNS || 15), Number(process.env.BT_CAP || 2000000));
    row.bt = ns.median; row.btMin = ns.min;
    const r = rate(E, g, b.counts, { maxDepth: 3, ms: MS });
    row.depth = r.solved ? r.depth : (r.timedOut ? '逾時' : '>3'); row.uses = r.uses; row.l0 = r.l0; row.end = r.assignedEnd;
    rows.push(row);
    console.log(JSON.stringify(row));
}
rows.sort((a, b) => b.bt - a.bt);
console.log('\n=== 依回溯節點排序 ===');
rows.forEach(r => console.log(`${r.f.padEnd(18)} N=${r.n} k=${r.k} 預填=${r.clues} 數量=${r.counts} 唯一=${r.uniq}${r.uniq2 === undefined ? '' : '/' + r.uniq2} 回溯=${r.bt}(最少${r.btMin}) 規則直推=${r.l0} 假設深度=${r.depth} uses=${JSON.stringify(r.uses)} 已定=${r.end}${r.arith === undefined ? '' : ` 湊數=${r.arith} 剛體=${r.blocks} 高手層=${r.blob} uses=${JSON.stringify(r.blobUses)} 組合10^${r.blobLog}`}`));
