// 原創篇：人機對戰款的實測（先手勝負、必勝步數、「直覺走法」會不會輸）
// 執行：node exp_duels.cjs
'use strict';

// 固定種子的亂數（重跑結果一樣）
let SEED = 20261101;
function rnd() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function perms(arr) { if (arr.length <= 1) return [arr.slice()]; const out = []; arr.forEach((x, i) => { const rest = arr.slice(0, i).concat(arr.slice(i + 1)); perms(rest).forEach(p => out.push([x].concat(p))); }); return out; }
function pct(a, b) { return (100 * a / b).toFixed(1) + '%'; }

// ───────── 586 號碼牌插隊：挑一個人往前插，只能插到「號碼比他大」的人前面（連續幾個都要比他大）；不能動的人輸 ─────────
function queueJump() {
    console.log('\n=== 號碼牌插隊（queuejump）===');
    for (let n = 3; n <= 7; n++) {
        const memo = new Map();
        const moves = p => { const r = []; for (let i = 1; i < p.length; i++) for (let k = 1; i - k >= 0 && p[i - k] > p[i]; k++) { const q = p.slice(); const x = q.splice(i, 1)[0]; q.splice(i - k, 0, x); r.push(q); } return r; };
        const win = p => { const key = p.join(','); if (memo.has(key)) return memo.get(key); let w = false; for (const q of moves(p)) if (!win(q)) { w = true; break; } memo.set(key, w); return w; };
        const inv = p => { let c = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) c++; return c; };
        let P = 0, tot = 0, parityAgree = 0, firstMoveOnly = 0;
        const all = perms([...Array(n)].map((_, i) => i + 1));
        for (const p of all) {
            tot++; const w = win(p); if (!w) P++;
            if (w === (inv(p) % 2 === 1)) parityAgree++;
            // 先手贏的局面裡，只有一種必勝走法的比例（＝走錯就輸，題目才有張力）
            if (w) { const good = moves(p).filter(q => !win(q)).length; if (good === 1) firstMoveOnly++; }
        }
        console.log(`n=${n}：${tot} 種排列，後手勝(P) ${P}（${pct(P, tot)}）｜「逆序數奇數＝先手勝」猜對 ${pct(parityAgree, tot)}｜先手勝的局面中只有唯一必勝步 ${pct(firstMoveOnly, tot - P)}`);
    }
}

// ───────── 588 撈金魚：選一池撈 1～3 隻，隔壁兩池各嚇跑 1 隻（有的話）；撈到最後的人贏 ─────────
function goldfish() {
    console.log('\n=== 撈金魚（goldfish）===');
    const memo = new Map();
    const win = a => {
        const key = a.join(','); if (memo.has(key)) return memo.get(key);
        let w = false;
        for (let i = 0; i < a.length && !w; i++) for (let t = 1; t <= Math.min(3, a[i]) && !w; t++) {
            const b = a.slice(); b[i] -= t; if (i > 0 && b[i - 1] > 0) b[i - 1]--; if (i < b.length - 1 && b[i + 1] > 0) b[i + 1]--;
            if (b.every(x => x === 0)) w = true; else if (!win(b)) w = true;
        }
        memo.set(key, w); return w;
    };
    for (const pools of [2, 3, 4]) {
        let P = 0, tot = 0, nimAgree = 0;
        const max = pools === 4 ? 5 : 7;
        const rec = (a) => {
            if (a.length === pools) { if (a.every(x => x === 0)) return; tot++; const w = win(a); if (!w) P++; const nim = a.reduce((s, x) => s ^ (x % 4), 0); if ((nim !== 0) === w) nimAgree++; return; }
            for (let x = 0; x <= max; x++) rec(a.concat([x]));
        };
        rec([]);
        console.log(`${pools} 池（每池 0～${max}）：${tot} 局面，後手勝(P) ${P}（${pct(P, tot)}）｜套用一般取火柴公式（各池 mod 4 的 XOR）猜對 ${pct(nimAgree, tot)}`);
    }
}

// ───────── 591 搶順子：輪流拿數字牌，先湊到「連續 K 張」的人贏 ─────────
function runs() {
    console.log('\n=== 搶順子（runs）===');
    for (const [N, K] of [[9, 3], [10, 3], [12, 4], [13, 4]]) {
        const has = m => { let run = 0; for (let i = 0; i < N; i++) { if (m >> i & 1) { run++; if (run >= K) return true; } else run = 0; } return false; };
        const memo = new Map();
        // 回傳 [結果(1贏/0和/-1輸), 步數]：贏取最短、輸取最長
        const val = (me, op) => {
            const key = me * (1 << N) + op; if (memo.has(key)) return memo.get(key);
            let best = null;
            for (let x = 0; x < N; x++) {
                const bit = 1 << x; if ((me | op) & bit) continue;
                const nm = me | bit; let r;
                if (has(nm)) r = [1, 1]; else { const s = val(op, nm); r = [-s[0], s[1] + 1]; }
                if (!best || r[0] > best[0] || (r[0] === best[0] && (r[0] === 1 ? r[1] < best[1] : r[1] > best[1]))) best = r;
            }
            if (!best) best = [0, 0];
            memo.set(key, best); return best;
        };
        const root = val(0, 0);
        // 隨機中盤（雙方各已拿 2～3 張、尚未有人連成）裡，輪到的人「必勝」的比例與必勝步數
        let wins = 0, tot = 0; const depth = {};
        for (let t = 0; t < 4000; t++) {
            let me = 0, op = 0, ok = true; const k = ri(2, 3);
            for (let j = 0; j < 2 * k; j++) { let x; do x = ri(0, N - 1); while ((me | op) >> x & 1); if (j % 2 === 0) me |= 1 << x; else op |= 1 << x; }
            if (has(me) || has(op)) { ok = false; }
            if (!ok) continue; tot++;
            const v = val(me, op); if (v[0] === 1) { wins++; depth[v[1]] = (depth[v[1]] || 0) + 1; }
        }
        console.log(`1～${N} 搶連續 ${K} 張：開局先手 ${root[0] === 1 ? '必勝（最快 ' + root[1] + ' 手）' : root[0] === 0 ? '和局' : '必敗'}｜隨機中盤 ${tot} 局，輪到的人必勝 ${pct(wins, tot)}，必勝手數分布（自己的手數×2−1）${JSON.stringify(depth)}`);
    }
}

// ───────── 587 按鍵搶三十：下一鍵必須是上一鍵上下左右相鄰；剛好湊到目標的人贏，沒鍵可按的人輸 ─────────
function keypad() {
    console.log('\n=== 按鍵搶三十（keypad30）===');
    const pos = { 7: [0, 0], 8: [0, 1], 9: [0, 2], 4: [1, 0], 5: [1, 1], 6: [1, 2], 1: [2, 0], 2: [2, 1], 3: [2, 2] };
    const adj = {}; for (const a in pos) { adj[a] = []; for (const b in pos) { const d = Math.abs(pos[a][0] - pos[b][0]) + Math.abs(pos[a][1] - pos[b][1]); if (d === 1) adj[a].push(+b); } }
    for (const T of [20, 25, 30, 31, 35, 40]) {
        const memo = new Map();
        const win = (tot, last) => { const key = tot * 10 + last; if (memo.has(key)) return memo.get(key); let w = false; for (const k of adj[last]) { if (tot + k > T) continue; if (tot + k === T || !win(tot + k, k)) { w = true; break; } } memo.set(key, w); return w; };
        const firstWins = []; for (let k = 1; k <= 9; k++) if (k === T || !win(k, k)) firstWins.push(k);
        // 中盤：隨機 (總和, 上一鍵) 裡輪到的人必勝的比例
        let w = 0, t = 0; for (let tot = 1; tot < T; tot++) for (let k = 1; k <= 9; k++) { t++; if (win(tot, k)) w++; }
        console.log(`目標 ${T}：先手第一鍵可必勝的鍵 [${firstWins.join(',')}]｜所有中盤局面輪到者必勝 ${pct(w, t)}`);
    }
}

// ───────── 584 夜市走一走（2D 共用推車）：一起往右或往下走，踩到的攤位分數歸走的人 ─────────
function redpath() {
    console.log('\n=== 夜市走一走（redpath，共用一台推車）===');
    for (const [R, C] of [[3, 4], [4, 4], [4, 5], [5, 5]]) {
        let trials = 3000, optWin = 0, greedyFail = 0, greedyWorse = 0;
        for (let t = 0; t < trials; t++) {
            const v = [...Array(R)].map(() => [...Array(C)].map(() => ri(-3, 9)));
            const memo = {};
            const best = (r, c) => { const k = r * C + c; if (k in memo) return memo[k]; if (r === R - 1 && c === C - 1) return memo[k] = 0; let b = -1e9; if (r + 1 < R) b = Math.max(b, v[r + 1][c] - best(r + 1, c)); if (c + 1 < C) b = Math.max(b, v[r][c + 1] - best(r, c + 1)); return memo[k] = b; };
            const opt = best(0, 0); if (opt > 0) optWin++;
            // 玩家用「挑眼前比較大的那格」，電腦最佳
            let r = 0, c = 0, diff = 0, me = true;
            while (!(r === R - 1 && c === C - 1)) {
                let nr = r, nc = c;
                if (me) { const d = r + 1 < R ? v[r + 1][c] : -1e9, ri2 = c + 1 < C ? v[r][c + 1] : -1e9; if (d >= ri2) nr++; else nc++; }
                else { const cand = []; if (r + 1 < R) cand.push([r + 1, c]); if (c + 1 < C) cand.push([r, c + 1]); let bb = null, bv = -1e9; for (const [a, b] of cand) { const s = v[a][b] - best(a, b); if (s > bv) { bv = s; bb = [a, b]; } } nr = bb[0]; nc = bb[1]; }
                diff += (me ? 1 : -1) * v[nr][nc]; r = nr; c = nc; me = !me;
            }
            if (opt > 0 && diff <= 0) greedyFail++;
            if (diff < opt) greedyWorse++;
        }
        console.log(`${R}×${C}：先手（玩家）有必勝 ${pct(optWin, trials)}｜「挑眼前大的」在本可贏的局裡輸或和 ${pct(greedyFail, optWin)}｜比最佳差 ${pct(greedyWorse, trials)}`);
    }
}

// ───────── 583 拔河選人：挑一個人，他還沒被挑走的好朋友會跟著過來；力氣總和大的贏 ─────────
function tugdraft() {
    console.log('\n=== 拔河選人（tugdraft）===');
    for (const n of [8, 10]) {
        let trials = 1500, optWin = 0, greedyFail = 0;
        for (let t = 0; t < trials; t++) {
            const s = [...Array(n)].map(() => ri(1, 9));
            const fr = [...Array(n)].map(() => 0);
            let edges = 0; while (edges < Math.floor(n * 0.6)) { const a = ri(0, n - 1), b = ri(0, n - 1); if (a === b || (fr[a] >> b & 1)) continue; fr[a] |= 1 << b; fr[b] |= 1 << a; edges++; }
            const take = (mask, i) => { let got = 1 << i; got |= fr[i] & mask; return got & mask; };
            const gain = g => { let x = 0; for (let i = 0; i < n; i++) if (g >> i & 1) x += s[i]; return x; };
            const memo = new Map();
            const best = mask => { if (mask === 0) return 0; if (memo.has(mask)) return memo.get(mask); let b = -1e9; for (let i = 0; i < n; i++) if (mask >> i & 1) { const g = take(mask, i); b = Math.max(b, gain(g) - best(mask & ~g)); } memo.set(mask, b); return b; };
            const full = (1 << n) - 1; const opt = best(full); if (opt > 0) optWin++;
            let mask = full, diff = 0, me = true;
            while (mask) {
                let pick = -1, pv = -1e9;
                if (me) { for (let i = 0; i < n; i++) if (mask >> i & 1) { const gv = gain(take(mask, i)); if (gv > pv) { pv = gv; pick = i; } } }
                else { for (let i = 0; i < n; i++) if (mask >> i & 1) { const g = take(mask, i); const v = gain(g) - best(mask & ~g); if (v > pv) { pv = v; pick = i; } } }
                const g = take(mask, pick); diff += (me ? 1 : -1) * gain(g); mask &= ~g; me = !me;
            }
            if (opt > 0 && diff <= 0) greedyFail++;
        }
        console.log(`${n} 人：先手有必勝 ${pct(optWin, trials)}｜「挑眼前最多力氣」在本可贏的局裡輸或和 ${pct(greedyFail, optWin)}`);
    }
}

// ───────── 590 搶便當：每個便當有「你的分數」與「電腦的分數」；成績＝你拿到的你的分數−電腦拿到的電腦分數 ─────────
function bentodraft() {
    console.log('\n=== 搶便當（bentodraft）===');
    let trials = 3000, sumRuleOpt = 0, greedyOpt = 0, greedyFail = 0, optWin = 0;
    const n = 8;
    for (let t = 0; t < trials; t++) {
        const a = [...Array(n)].map(() => ri(1, 9)), b = [...Array(n)].map(() => ri(1, 9));
        const memo = new Map();
        const best = (mask, me) => { if (!mask) return 0; const key = mask * 2 + (me ? 1 : 0); if (memo.has(key)) return memo.get(key); let r = me ? -1e9 : 1e9; for (let i = 0; i < n; i++) if (mask >> i & 1) { const v = (me ? a[i] : -b[i]) + best(mask & ~(1 << i), !me); r = me ? Math.max(r, v) : Math.min(r, v); } memo.set(key, r); return r; };
        const full = (1 << n) - 1; const opt = best(full, true); if (opt > 0) optWin++;
        const play = rule => { let mask = full, me = true, sc = 0; while (mask) { let pick = -1, pv = -1e9; for (let i = 0; i < n; i++) if (mask >> i & 1) { const v = me ? rule(i) : (a[i] + b[i]); if (v > pv) { pv = v; pick = i; } } sc += me ? a[pick] : -b[pick]; mask &= ~(1 << pick); me = !me; } return sc; };
        const sumRule = play(i => a[i] + b[i]); if (sumRule === opt) sumRuleOpt++;
        const greedy = play(i => a[i]); if (greedy === opt) greedyOpt++; if (opt > 0 && greedy <= 0) greedyFail++;
    }
    console.log(`8 個便當：先手有必勝 ${pct(optWin, trials)}｜「挑兩人分數加總最大」＝最佳 ${pct(sumRuleOpt, trials)}｜「挑自己分數最大」＝最佳 ${pct(greedyOpt, trials)}，本可贏卻輸或和 ${pct(greedyFail, optWin)}`);
}

// ───────── 589 你分我選：分的人從剩下的菜挑兩盤配成一對，選的人拿走其中一盤，分的人得另一盤；每輪換角色 ─────────
function splitchoose() {
    console.log('\n=== 你分我選（splitchoose）===');
    for (const n of [6, 8, 10]) {
        let trials = 1500, topTwoOpt = 0, optPos = 0;
        for (let t = 0; t < trials; t++) {
            const v = [...Array(n)].map(() => ri(1, 30));
            const memo = new Map();
            // 回傳：「這一輪的分的人」最後總分−對手總分
            const best = mask => { if (!mask) return 0; if (memo.has(mask)) return memo.get(mask); let r = -1e9; const idx = []; for (let i = 0; i < n; i++) if (mask >> i & 1) idx.push(i); for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) { const i = idx[x], j = idx[y]; const rest = mask & ~(1 << i) & ~(1 << j); const nxt = best(rest); /* 下一輪由現在的選的人來分 */ const chooser = Math.max(v[i] - v[j] - nxt, v[j] - v[i] - nxt); /* 選的人的淨利 */ r = Math.max(r, -chooser); } memo.set(mask, r); return r; };
            const full = (1 << n) - 1; const opt = best(full); if (opt > 0) optPos++;
            // 「每次把最大的兩盤配一對」的結果
            const s = v.slice().sort((x, y) => y - x); let d = 0, sign = 1; for (let k = 0; k < n; k += 2) { d += sign * (s[k + 1] - s[k]); sign = -sign; }
            if (d === opt) topTwoOpt++;
        }
        console.log(`${n} 盤：先分的人能贏 ${pct(optPos, trials)}｜「最大兩盤配一對」就是最佳 ${pct(topTwoOpt, trials)}`);
    }
}

// ───────── 592 夜市搶客：一條街 11 戶（每戶人數 1～5），兩人輪流擺攤，客人去最近的攤位（一樣近就平分） ─────────
function hotelling() {
    console.log('\n=== 夜市搶客（hotelling）===');
    for (const per of [2, 3]) {
        let trials = per === 2 ? 600 : 80, p1Win = 0, tie = 0, firstCenter = 0;
        const L = 11;
        for (let t = 0; t < trials; t++) {
            const w = [...Array(L)].map(() => ri(1, 5));
            const score = (A, B) => { let d = 0; for (let h = 0; h < L; h++) { let da = 1e9, db = 1e9; for (const x of A) da = Math.min(da, Math.abs(x - h)); for (const x of B) db = Math.min(db, Math.abs(x - h)); if (da < db) d += w[h]; else if (db < da) d -= w[h]; } return d; };
            const go = (A, B, turn) => {
                if (A.length === per && B.length === per) return [score(A, B), -1];
                let best = turn === 0 ? -1e9 : 1e9, bp = -1;
                for (let x = 0; x < L; x++) { if (A.includes(x) || B.includes(x)) continue; const r = turn === 0 ? go(A.concat([x]), B, 1)[0] : go(A, B.concat([x]), 0)[0]; if (turn === 0 ? r > best : r < best) { best = r; bp = x; } }
                return [best, bp];
            };
            const [r, first] = go([], [], 0);
            if (r > 0) p1Win++; else if (r === 0) tie++;
            if (first >= 4 && first <= 6) firstCenter++;
        }
        console.log(`每人 ${per} 攤：先擺的人贏 ${pct(p1Win, trials)}、平手 ${pct(tie, trials)}｜最佳第一攤落在正中間三戶 ${pct(firstCenter, trials)}`);
    }
}

// ───────── 593 紅包搶搶看：每包外面寫「左右兩包加起來多少」，輪流從兩端拿 ─────────
function hiddenpick() {
    console.log('\n=== 紅包搶搶看（hiddenpick）：「鄰居和」能不能反推每一包 ===');
    const rank = (M) => { const A = M.map(r => r.slice()); let rk = 0; const n = A.length, m = A[0].length; for (let c = 0; c < m && rk < n; c++) { let p = -1; for (let r = rk; r < n; r++) if (Math.abs(A[r][c]) > 1e-9) { p = r; break; } if (p < 0) continue; [A[rk], A[p]] = [A[p], A[rk]]; for (let r = 0; r < n; r++) if (r !== rk) { const f = A[r][c] / A[rk][c]; for (let k = 0; k < m; k++) A[r][k] -= f * A[rk][k]; } rk++; } return rk; };
    const out = [];
    for (let n = 3; n <= 12; n++) { const M = [...Array(n)].map((_, i) => [...Array(n)].map((_, j) => (Math.abs(i - j) === 1 ? 1 : 0))); out.push(`${n} 包：${rank(M) === n ? '可以' : '差 ' + (n - rank(M)) + ' 個條件'}`); }
    console.log('一排（只看左右鄰居）：' + out.join('、'));
}

// ───────── 拔河選人（改版：挑一個人，他的「仇人」會跑去對面）——看「眼前淨得最多」會不會輸 ─────────
function tugdraftEnemies() {
    console.log('\n=== 拔河選人改版（挑到的人的仇人跑去對面）===');
    for (const n of [8, 10]) {
        let trials = 1500, optWin = 0, greedyFail = 0;
        for (let t = 0; t < trials; t++) {
            const s = [...Array(n)].map(() => ri(1, 9)); const en = [...Array(n)].map(() => 0);
            let edges = 0; while (edges < Math.floor(n * 0.6)) { const a = ri(0, n - 1), b = ri(0, n - 1); if (a === b || (en[a] >> b & 1)) continue; en[a] |= 1 << b; en[b] |= 1 << a; edges++; }
            const gain = g => { let x = 0; for (let i = 0; i < n; i++) if (g >> i & 1) x += s[i]; return x; };
            const memo = new Map();
            const best = mask => { if (mask === 0) return 0; if (memo.has(mask)) return memo.get(mask); let b = -1e9; for (let i = 0; i < n; i++) if (mask >> i & 1) { const e = en[i] & mask & ~(1 << i); b = Math.max(b, s[i] - gain(e) - best(mask & ~(1 << i) & ~e)); } memo.set(mask, b); return b; };
            const full = (1 << n) - 1; const opt = best(full); if (opt > 0) optWin++;
            let mask = full, diff = 0, me = true;
            while (mask) { let pick = -1, pv = -1e9; for (let i = 0; i < n; i++) if (mask >> i & 1) { const e = en[i] & mask & ~(1 << i); const v = me ? s[i] - gain(e) : s[i] - gain(e) - best(mask & ~(1 << i) & ~e); if (v > pv) { pv = v; pick = i; } } const e = en[pick] & mask & ~(1 << pick); diff += (me ? 1 : -1) * (s[pick] - gain(e)); mask &= ~(1 << pick) & ~e; me = !me; }
            if (opt > 0 && diff <= 0) greedyFail++;
        }
        console.log(`${n} 人：先手有必勝 ${pct(optWin, trials)}｜「眼前淨得最多」在本可贏的局裡輸或和 ${pct(greedyFail, optWin)}`);
    }
}

// ───────── 電梯搶一樓（刪掉的構想）：每次往下「目前樓層的任一個數字」層，先到 0 的人贏 ─────────
function elevatorDigits() {
    console.log('\n=== 電梯搶一樓（刪掉的構想）===');
    const win = [false]; for (let n = 1; n <= 200; n++) { const ds = [...new Set(String(n).split('').map(Number).filter(d => d > 0))]; win[n] = ds.some(d => !win[n - d]); }
    const P = []; for (let n = 1; n <= 200; n++) if (!win[n]) P.push(n);
    console.log('輪到的人必輸的樓層：' + P.join(' ') + '（＝10 的倍數，一招就破）');
}

queueJump(); goldfish(); runs(); keypad(); redpath(); tugdraft(); tugdraftEnemies(); bentodraft(); splitchoose(); hotelling(); hiddenpick(); elevatorDigits();
