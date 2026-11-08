/* 彙總 exp_verify.cjs 的輸出。執行：node exp_verify_sum.cjs sweep|paired <一堆輸出檔> */
'use strict';
const fs = require('fs');
const MODE = process.argv[2], files = process.argv.slice(3);
const rows = [];
for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (line.trim().startsWith('{')) { try { rows.push(JSON.parse(line)); } catch (e) { /* 被中斷的半行 */ } }
}
const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const gm = a => Math.pow(10, a.reduce((s, x) => s + Math.log10(x + 1), 0) / a.length);
if (MODE === 'sweep') {
    const groups = {};
    rows.forEach(r => { const key = `N${r.N} k${r.k}`; (groups[key] = groups[key] || {}); (groups[key][r.rho] = groups[key][r.rho] || []).push(r); });
    Object.keys(groups).sort().forEach(key => {
        console.log(`\n${key}`);
        Object.keys(groups[key]).map(Number).sort((a, b) => a - b).forEach(rho => {
            const g = groups[key][rho], ok = g.filter(x => x.ok);
            if (!ok.length) { console.log(`  破格率 ${(rho * 100).toFixed(0).padStart(2)}%: 樣本 ${g.length}，全部無解或找不到`); return; }
            const hist = {}; ok.forEach(x => { hist['d' + x.d] = (hist['d' + x.d] || 0) + 1; });
            console.log(`  破格率 ${(rho * 100).toFixed(0).padStart(2)}%: 樣本 ${String(g.length).padStart(3)} 找不到解 ${String(g.length - ok.length).padStart(2)} 預填 ${(100 * ok.reduce((a, x) => a + x.clues / x.N, 0) / ok.length).toFixed(0).padStart(2)}% 規則直推 ${(ok.reduce((a, x) => a + x.l0, 0) / ok.length).toFixed(1).padStart(4)} 節點中位 ${String(med(ok.map(x => x.nodes))).padStart(6)} 幾何平均 ${gm(ok.map(x => x.nodes)).toFixed(0).padStart(6)} 深度 ${JSON.stringify(hist)}`);
        });
    });
} else {
    const groups = {};
    rows.forEach(r => { (groups[r.c] = groups[r.c] || []).push(r); });
    Object.keys(groups).forEach(c => {
        const g = groups[c];
        console.log(`\n${c}（${g.length} 個盤面，同盤面配對；比值相對於「隨機極小」）`);
        ['random', 'spread', 'cluster', 'hideRare', 'showRare'].forEach(s => {
            const ratios = g.map(x => Math.log2((x[s].nodes + 1) / (x.random.nodes + 1)));
            const wins = g.filter(x => x[s].nodes > x.random.nodes).length, loses = g.filter(x => x[s].nodes < x.random.nodes).length;
            console.log(`  ${s.padEnd(9)} 預填 ${(g.reduce((a, x) => a + x[s].clues, 0) / g.length).toFixed(1).padStart(5)} 規則直推 ${(g.reduce((a, x) => a + x[s].l0, 0) / g.length).toFixed(1).padStart(5)} 節點幾何平均 ${gm(g.map(x => x[s].nodes)).toFixed(0).padStart(6)} 配對中位比值 ×${Math.pow(2, med(ratios)).toFixed(2)} 較難/較易 ${wins}/${loses}`);
        });
        [1, 3, 5].forEach(a => {
            const ratios = g.map(x => Math.log2((x['plus' + a] + 1) / (x.base + 1)));
            console.log(`  多給${a}格預填 節點幾何平均 ${gm(g.map(x => x['plus' + a])).toFixed(0).padStart(6)} 配對中位比值 ×${Math.pow(2, med(ratios)).toFixed(3)}（基準 ${gm(g.map(x => x.base)).toFixed(0)}）`);
        });
    });
}
