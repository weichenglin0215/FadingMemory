// 原創篇：問一次得一條（提問／探測）類的實測：最少要問幾次、答案唯一的比例
// 執行：node exp_probe.cjs
'use strict';
let SEED = 4242; function rnd() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pct(a, b) { return (100 * a / b).toFixed(1) + '%'; }

// ───────── 547 里長點人數：一排 n 戶，里長只給「每相鄰 3 戶的人數和」；每戶 1～5 人；最少要敲幾戶的門 ─────────
function knock() {
    console.log('\n=== 里長點人數（knock）===');
    for (const n of [6, 7, 8, 9, 10]) {
        const dist = {}; let trials = 1500;
        for (let t = 0; t < trials; t++) {
            const x = [...Array(n)].map(() => ri(1, 5));
            const S = []; for (let i = 0; i + 2 < n; i++) S.push(x[i] + x[i + 1] + x[i + 2]);
            // 所有符合的排法：前兩戶決定其餘
            const cand = [];
            for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) { const y = [a, b]; let ok = true; for (let i = 2; i < n && ok; i++) { const v = S[i - 2] - y[i - 2] - y[i - 1]; if (v < 1 || v > 5) ok = false; y.push(v); } if (ok) cand.push(y); }
            // 最壞情況下最少敲幾戶（敲門＝問一戶的人數，可依答案決定下一戶）
            const memo = new Map();
            const f = (set) => { if (set.length <= 1) return 0; const key = set.map(y => y.join('')).sort().join('|'); if (memo.has(key)) return memo.get(key); let best = 99; for (let i = 0; i < n; i++) { const groups = new Map(); for (const y of set) { const k = y[i]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(y); } if (groups.size === 1) continue; let worst = 0; for (const g of groups.values()) worst = Math.max(worst, f(g)); best = Math.min(best, 1 + worst); } memo.set(key, best); return best; };
            const k = f(cand); dist[k] = (dist[k] || 0) + 1;
        }
        console.log(`${n} 戶：最壞要敲幾戶 ${JSON.stringify(dist)}（0＝光看和就推得出來）`);
    }
}

// ───────── 551 抓假鈔：一疊鈔票裡恰好 2 張假鈔；驗鈔機一次驗一小疊，只說「有假」或「沒假」；最壞要驗幾次 ─────────
function fakebill() {
    console.log('\n=== 抓假鈔（fakebill）：2 張假鈔，最壞情況最少驗幾次 ===');
    for (const n of [4, 5, 6, 7, 8]) {
        const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push((1 << i) | (1 << j));
        const P = pairs.length; const memo = new Map();
        const f = (state) => { // state：候選配對的位元集合
            let cnt = 0, s = state; while (s) { s &= s - 1; cnt++; } if (cnt <= 1) return 0;
            if (memo.has(state)) return memo.get(state);
            const lower = Math.ceil(Math.log2(cnt)); let best = 99;
            for (let q = 1; q < (1 << n) - 1 && best > lower; q++) {
                let pos = 0, neg = 0; for (let k = 0; k < P; k++) if (state >> k & 1) { if (pairs[k] & q) pos |= 1 << k; else neg |= 1 << k; }
                if (!pos || !neg) continue;
                const w = 1 + Math.max(f(pos), f(neg)); if (w < best) best = w;
            }
            memo.set(state, best); return best;
        };
        const full = P >= 31 ? null : (2 ** P - 1);
        const r = f(full);
        console.log(`${n} 張（${P} 種可能）：最少 ${r} 次｜資訊下限 ${Math.ceil(Math.log2(P))} 次｜只有 1 張假鈔時 ${Math.ceil(Math.log2(n))} 次`);
    }
}

// ───────── 619 抄錯一碼：幾個人抄同一個電話號碼，每個人都恰好抄錯一碼；能不能找回正確號碼 ─────────
function typo1() {
    console.log('\n=== 抄錯一碼（typo1）===');
    for (const L of [4, 6, 8]) for (const k of [2, 3, 4]) {
        let tot = 0, uniq = 0, none = 0;
        for (let t = 0; t < 2000; t++) {
            const truth = [...Array(L)].map(() => ri(0, 9));
            const copies = []; for (let c = 0; c < k; c++) { const y = truth.slice(); const p = ri(0, L - 1); let d; do d = ri(0, 9); while (d === truth[p]); y[p] = d; copies.push(y); }
            // 候選：和第一份差恰好一碼，再檢查其他份
            const cands = new Set();
            for (let p = 0; p < L; p++) for (let d = 0; d <= 9; d++) { if (d === copies[0][p]) continue; const z = copies[0].slice(); z[p] = d; if (copies.every(y => y.reduce((s, v, i) => s + (v !== z[i] ? 1 : 0), 0) === 1)) cands.add(z.join('')); }
            tot++; if (cands.size === 1) uniq++; if (cands.size === 0) none++;
        }
        console.log(`號碼 ${L} 碼、${k} 個人抄：唯一 ${pct(uniq, tot)}`);
    }
}

// ───────── 554 西瓜冠亞軍：只用一台「比兩顆」的天平，找出最重與第二重，最少要秤幾次 ─────────
function melon() {
    console.log('\n=== 西瓜冠亞軍（melon）：理論次數 n＋⌈log2 n⌉−2 與「先排出冠軍、再從剩下的找亞軍」的比較 ===');
    const rows = [];
    for (const n of [4, 5, 6, 8, 10, 12, 16]) rows.push(`${n} 顆：最少 ${n + Math.ceil(Math.log2(n)) - 2} 次（笨方法 ${2 * n - 3} 次）`);
    console.log(rows.join('｜'));
}

// ───────── 555 調收音機：電台在 1～N 格的某一格，只能問「這格比剛剛那格清楚嗎」——最少轉幾次一定找到 ─────────
function radio() {
    console.log('\n=== 調收音機（radio）：只比「清楚／模糊」的單峰搜尋，k 次最多能處理幾格 ===');
    // 規則：收音機記得「目前最清楚的那一格」；每轉到新的一格，只告訴你「比最清楚的那格更清楚／更模糊」。
    // 電台訊號是單峰（越靠近越清楚）。最後要「停在電台那一格上」才算找到。用動態規劃（對手挑最壞情況）直接算。
    // f(L, b)：電台在長度 L 的區間裡，目前停在區間內的第 b 格（b=−1 表示還沒轉過）
    const M = new Map();
    const f = (L, b) => {
        if (L === 1) return b === 0 ? 0 : 1;
        const key = L * 1000 + (b + 1); if (M.has(key)) return M.get(key);
        let best = 1e9;
        for (let x = 0; x < L; x++) {
            if (x === b) continue; let worst;
            if (b < 0) worst = f(L, x);
            else if (x < b) worst = Math.max(f(b, x), f(L - x - 1, b - x - 1));
            else worst = Math.max(f(L - b - 1, x - b - 1), f(x, b));
            best = Math.min(best, 1 + worst);
        }
        M.set(key, best); return best;
    };
    const out = []; let k = 1;
    for (let N = 1; N <= 150; N++) { const v = f(N, -1); if (v > k) { out.push(`${k} 次→${N - 1} 格`); k = v; } }
    console.log(out.join('、') + '（費波那契數列：每多一次，能處理的格數約 ×1.618）');
}

knock(); fakebill(); typo1(); melon(); radio();
