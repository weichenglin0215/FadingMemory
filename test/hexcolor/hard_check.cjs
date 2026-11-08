/* 驗證 js/hexcolor_hard.js 裡的極難盤面（換題之後一定要重跑）
   執行：node test/hexcolor/hard_check.cjs [--fast]（--fast 略過費時的難度指標）
   用「彼此獨立」的方法確認解只有一個，任何一種不一致都算失敗：
     方法一：回溯搜尋（lab.cjs：規則推理＋分支）
     方法二：剛體列表（rigid.cjs：完全不同的模型，只適用 3 色）
     方法三：逐格動態規劃（dp_count.cjs：不做推理，直接算出精確解數）
   另外檢查：格數 ≤ 90、形狀連通、儲存的解合法、預填跟解一致；並印出各項難度指標。 */
'use strict';
const L = require('./lab.cjs');
const R = require('./rigid.cjs');
const T = require('./tinker.cjs');
const { dpCount } = require('./dp_count.cjs');
const { Core, makeEngine, rate, nodesStats } = L;
require('../../js/hexcolor_hard.js');
const FAST = process.argv.includes('--fast');

let failures = 0;
function check(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ 失敗：') + msg); if (!cond) failures++; }

function verify(name, B) {
    const cells = B.cells, k = B.counts.length;
    const G = Core.buildGraph(cells), n = G.n;
    const given = Int8Array.from(B.givens), sol = Int8Array.from(B.solution);
    console.log(`\n═══ 極難${name}：${n} 格、${k} 色、數量 ${B.counts}、預填 ${given.filter(x => x >= 0).length} 格 ═══`);
    check(n <= 90, '格數 ≤ 90');
    check(new Set(cells.map(c => c[0] + ',' + c[1])).size === n, '格子不重複');
    const seen = new Set([0]), st = [0];
    while (st.length) { const x = st.pop(); G.nbrs[x].forEach(y => { if (!seen.has(y)) { seen.add(y); st.push(y); } }); }
    check(seen.size === n, '形狀連通');
    check(B.counts.reduce((a, b) => a + b, 0) === n, '各色數量總和＝格數');
    let bad = 0;
    for (let i = 0; i < n; i++) for (const j of G.nbrs[i]) if (sol[i] === sol[j]) bad++;
    check(bad === 0, '儲存的解：相鄰都不同色');
    const t = new Array(k).fill(0);
    sol.forEach(c => t[c]++);
    check(t.join() === B.counts.join(), '儲存的解：各色數量正確');
    let mismatch = 0;
    for (let i = 0; i < n; i++) if (given[i] >= 0 && given[i] !== sol[i]) mismatch++;
    check(mismatch === 0, '預填與解一致');

    console.log('【唯一解】');
    const E = makeEngine(G, k);
    const u1 = E.count(given, B.counts, 3, 2e8);
    check(!u1.aborted && u1.found === 1, `方法一 回溯搜尋：解數=${u1.found}（節點 ${u1.nodes}${u1.aborted ? '，未窮舉' : ''}）`);
    if (u1.first) check(u1.first.join() === sol.join(), '方法一找到的解＝儲存的解');
    let M = null;
    if (k === 3) {
        M = R.buildModel(G);
        const u2 = R.arithSearch(M, B.counts, given, { nodeLimit: 2e8 });
        check(!u2.aborted && u2.solutions === 1, `方法二 剛體列表：解數=${u2.solutions}（節點 ${u2.nodes}）`);
        if (u2.first) check(R.colorsFromChoice(M, u2.first).join() === sol.join(), '方法二找到的解＝儲存的解');
    }
    const t0 = Date.now();
    const dp = dpCount(G, k, B.counts, given, false);
    check(dp.total === 1, `方法三 逐格動態規劃：精確解數=${dp.total}（狀態高峰 ${dp.peak}，${Date.now() - t0}ms）`);
    if (FAST) return;

    console.log('【難度指標】');
    const rng = Core.makeRng(4242);
    const r = rate(E, given, B.counts, { maxDepth: 4, ms: 240000 });
    console.log(`  規則直推填了 ${r.l0} 格；假設量尺：解完=${r.solved} 最深=${r.depth} 各層次數 [L0,D1,D2,D3,D4]=${JSON.stringify(r.uses)}${r.timedOut ? '（時間到還沒解完：至少這麼難）' : ''}${r.stuck ? '（4 層內推不動）' : ''}；已確定 ${r.assignedEnd}/${n} 格`);
    /* 量尺的每一步都應該是「正確的推理」：解完時要跟答案一模一樣，否則代表量尺本身有錯 */
    if (r.solved) check(r.col.join() === sol.join(), '假設量尺推出來的結果＝答案（量尺沒有誤刪）');
    else {
        let wrong = 0;
        for (let i = 0; i < n; i++) if (r.col[i] >= 0 && r.col[i] !== sol[i]) wrong++;
        check(wrong === 0, `假設量尺已確定的格子都跟答案相同（已確定 ${r.assignedEnd} 格）`);
    }
    const ns = nodesStats(E, given, B.counts, rng, 9, 3000000);
    console.log(`  回溯節點（隨機順序）：中位 ${ns.median}，最少 ${ns.min}，最多 ${ns.max}；固定順序 ${u1.nodes}（對照：數獨世界難題 隨機中位 51~147、固定 72~234）`);
    if (k === 3) {
        const br = R.blobRate(M, B.counts, given, { maxDepth: 4, ms: 120000 });
        console.log(`  高手層（已看穿剛體）：剛體 ${M.blocks.length} 塊；解完=${br.solved} 最深=${br.depth} 各層次數=${JSON.stringify(br.uses)}${br.timedOut ? '（逾時）' : ''}；一開始的組合數約 10^${br.startLog.toFixed(1)}`);
        if (br.solved) check(R.colorsFromChoice(M, br.choice).join() === sol.join(), '高手層推出來的結果＝答案');
        const sp = R.enumerate(M, 5e7, given);
        if (sp) {
            const byErr = {};
            let mx = 0, mn = 1e9;
            for (const [key, v] of sp.map) {
                const a = Math.floor(key / 10000), b = Math.floor(key / 100) % 100, c = key % 100;
                const d = Math.abs(a - B.counts[0]) + Math.abs(b - B.counts[1]) + Math.abs(c - B.counts[2]);
                if (d <= 4) byErr[d] = (byErr[d] || 0) + v;
                for (const x of [a, b, c]) { if (x > mx) mx = x; if (x < mn) mn = x; }
            }
            console.log(`  3 色合法著色總數 ${sp.total}；每色可達範圍 ${mn}~${mx}；依各色差距的著色數 ${JSON.stringify(byErr)}（0 就是答案，2 是只差一格的假解）`);
        }
        const fl = [];
        for (let i = 0; i < 6; i++) { const f = T.flipPlayer(M, B.counts, given, rng, 80000, 60, 0.05); fl.push(f.solved ? f.moves : '>80000'); }
        console.log(`  微調攻擊一（看穿剛體後翻塊）：翻塊次數 ${fl.join(', ')}`);
        const sol0 = R.arithSearch(M, B.counts, given, { cap: 1, nodeLimit: 2e8 }).first;
        console.log(`  直覺第一手（最大子格配最缺的顏色）：${JSON.stringify(T.greedyGuess(M, B.counts, given, sol0))}`);
    }
    const sw = [];
    for (let i = 0; i < 6; i++) { const s = T.swapPlayer(G, k, B.counts, given, rng, 60000, 0.03); sw.push(s.solved ? s.moves : '>60000(最少剩' + s.best + '處衝突)'); }
    console.log(`  微調攻擊二（不懂秘訣、交換兩格）：${sw.join(', ')}`);
}

Object.keys(globalThis.HexColorHard).forEach(name => verify(name, globalThis.HexColorHard[name]));
console.log(failures === 0 ? '\n全部通過' : `\n共 ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
