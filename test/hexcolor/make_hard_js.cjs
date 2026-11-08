/* 把選定的搜尋結果寫成 js/hexcolor_hard.js（網頁載入的資料檔）
   執行：node test/hexcolor/make_hard_js.cjs <A盤面.json> <B盤面.json>
   接著一定要跑：node test/hexcolor/hard_check.cjs */
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lab.cjs');
const { Core, makeEngine } = L;
function load(file) {
    const b = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cells = b.cells.slice().sort((x, y) => x[1] - y[1] || x[0] - y[0]);
    /* 搜尋結果的 givens 順序跟 cells 一致（都已排序過），保險起見確認有序 */
    const same = cells.every((c, i) => c[0] === b.cells[i][0] && c[1] === b.cells[i][1]);
    if (!same) throw new Error('cells 未排序：' + file);
    const k = b.counts.length, G = Core.buildGraph(cells), E = makeEngine(G, k);
    const u = E.count(Int8Array.from(b.givens), b.counts, 2, 2e8);
    if (u.found !== 1 || u.aborted) throw new Error('不是唯一解：' + file);
    return { cells, counts: b.counts, givens: b.givens, solution: Array.from(u.first) };
}
function note(tag, b, extra) {
    const clues = b.givens.filter(x => x >= 0).length;
    return `極難${tag}：${b.cells.length} 格・${b.counts.length} 色・預填 ${clues} 格・唯一解（已用三種方法驗證）${extra || ''}`;
}
const A = load(process.argv[2]), B = load(process.argv[3]);
A.note = note('A', A); B.note = note('B', B);
const row = o => JSON.stringify(o);
const text = `/* ═══════════════════════════════════════════════════════════════════
   hexcolor_hard.js — 六角著色的極難盤面（資料檔，由 test/hexcolor/make_hard_js.cjs 產生，不要手改）
   ───────────────────────────────────────────────────────────────────
   cells   ：每一格的軸座標 [q, r]（依序就是第 0 格、第 1 格…）
   counts  ：每種顏色要用掉幾格（含預填）
   givens  ：每一格預填的顏色編號；-1 代表空格
   solution：唯一解（只給「解答」按鈕用）
   note    ：狀態列顯示的說明
   換題之後一定要跑 node test/hexcolor/hard_check.cjs，用三種獨立方法重新確認唯一解。
   難度研究的過程與結論見 note/六角著色難度研究.md。
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';
    global.HexColorHard = {
        A: ${row(A)},
        B: ${row(B)}
    };
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(__dirname, '../../js/hexcolor_hard.js'), text);
console.log('已寫入 js/hexcolor_hard.js');
console.log(A.note); console.log(B.note);
