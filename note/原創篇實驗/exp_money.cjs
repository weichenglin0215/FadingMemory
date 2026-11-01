// 原創篇：最划算類的實測（「直覺做法」跟最佳差多少、多常有巧思可用）
// 執行：node exp_money.cjs
'use strict';
let SEED = 31337; function rnd() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pct(a, b) { return (100 * a / b).toFixed(1) + '%'; }

// ───────── 559 湊零錢：錢包裡有硬幣與鈔票，付錢給店員後（店員用最少張數找零），怎麼付才讓錢包裡的「硬幣」最少 ─────────
function paycoins() {
    console.log('\n=== 湊零錢（paycoins）===');
    const D = [1, 5, 10, 50, 100, 500, 1000]; const isCoin = d => d < 100;
    const change = amt => { const c = Array(D.length).fill(0); for (let i = D.length - 1; i >= 0; i--) { c[i] = Math.floor(amt / D[i]); amt -= c[i] * D[i]; } return c; };
    let tot = 0, naiveOpt = 0, exactOpt = 0, extraCoins = 0, gainSum = 0;
    for (let t = 0; t < 3000; t++) {
        const purse = [ri(0, 4), ri(0, 2), ri(0, 4), ri(0, 1), ri(0, 3), ri(0, 1), ri(1, 2)];
        const total = purse.reduce((s, c, i) => s + c * D[i], 0);
        const price = ri(11, Math.min(999, total - 1));
        let best = null, bestPay = null;
        const coinsAfter = (pay) => { const paid = pay.reduce((s, c, i) => s + c * D[i], 0); if (paid < price) return null; const ch = change(paid - price); const after = purse.map((c, i) => c - pay[i] + ch[i]); return after.reduce((s, c, i) => s + (isCoin(D[i]) ? c : 0), 0) * 1000 + after.reduce((s, c) => s + c, 0); };
        const rec = (i, pay) => { if (i === D.length) { const v = coinsAfter(pay); if (v !== null && (best === null || v < best)) { best = v; bestPay = pay.slice(); } return; } for (let k = 0; k <= purse[i]; k++) { pay.push(k); rec(i + 1, pay); pay.pop(); } };
        rec(0, []);
        // 直覺做法：用「剛好蓋過價錢的最小一張鈔票」付（沒有就兩張），零錢不動
        let naive = null; for (const k of [4, 5, 6]) if (purse[k] > 0 && D[k] >= price) { const pay = Array(D.length).fill(0); pay[k] = 1; naive = coinsAfter(pay); break; }
        if (naive === null) { const pay = Array(D.length).fill(0); let rest = price; for (let k = 6; k >= 4 && rest > 0; k--) { const n = Math.min(purse[k], Math.ceil(rest / D[k])); pay[k] = n; rest -= n * D[k]; } naive = coinsAfter(pay); }
        tot++; if (naive !== null && naive === best) naiveOpt++;
        const paid = bestPay.reduce((s, c, i) => s + c * D[i], 0);
        if (paid === price) exactOpt++;
        if (bestPay.some((c, i) => isCoin(D[i]) && c > 0) && paid > price) extraCoins++;
        if (naive !== null) gainSum += Math.floor(naive / 1000) - Math.floor(best / 1000);
    }
    console.log(`${tot} 題：直覺付法（大鈔付、零錢不動）剛好最佳 ${pct(naiveOpt, tot)}｜最佳付法是「付剛好」${pct(exactOpt, tot)}｜最佳付法要「多給零錢讓找回整數」${pct(extraCoins, tot)}｜平均少 ${(gainSum / tot).toFixed(1)} 枚硬幣`);
}

// ───────── 556 分開結帳：「買三件、最便宜的一件免費」，分成幾次結帳能省多少 ─────────
function splitpay() {
    console.log('\n=== 分開結帳（splitpay）===');
    for (const n of [6, 9]) {
        let tot = 0, saveSum = 0, singleSum = 0;
        for (let t = 0; t < 2000; t++) {
            const p = [...Array(n)].map(() => 10 * ri(5, 50));
            const s = p.slice().sort((a, b) => a - b);
            const single = s.slice(0, Math.floor(n / 3)).reduce((a, b) => a + b, 0); // 一次結帳：最便宜的 n/3 件免費
            const d = p.slice().sort((a, b) => b - a); let best = 0; for (let k = 2; k < n; k += 3) best += d[k]; // 由貴到便宜三件一組
            tot++; saveSum += best - single; singleSum += single;
        }
        console.log(`${n} 件：一次結帳平均免費 ${(singleSum / tot).toFixed(0)} 元｜分開結帳最多再省 ${(saveSum / tot).toFixed(0)} 元`);
    }
}

// ───────── 565 誰該付誰：大家輪流先墊錢，最後最少要轉帳幾次 ─────────
function settleup() {
    console.log('\n=== 誰該付誰（settleup）：最少轉帳次數＝人數 −「最多能拆成幾群各自打平」===');
    for (const n of [4, 5, 6, 7]) {
        const dist = {}; let tot = 0, lessThanNm1 = 0;
        for (let t = 0; t < 2000; t++) {
            // 每人淨額（應收為正、應付為負），總和 0；刻意讓一部分題目可以拆群
            const bal = [...Array(n)].map(() => 10 * ri(-30, 30)); const s = bal.reduce((a, b) => a + b, 0); bal[n - 1] -= s;
            if (bal.some(v => v === 0)) { t--; continue; }
            // 最多幾群各自總和為 0：子集合動態規劃
            const sum = Array(1 << n).fill(0); for (let m = 1; m < (1 << n); m++) { const low = m & -m; const i = 31 - Math.clz32(low); sum[m] = sum[m ^ low] + bal[i]; }
            const dp = Array(1 << n).fill(-1); dp[0] = 0;
            for (let m = 1; m < (1 << n); m++) { if (sum[m] !== 0) continue; for (let sub = m; sub; sub = (sub - 1) & m) if (sum[sub] === 0 && dp[m ^ sub] >= 0) dp[m] = Math.max(dp[m], dp[m ^ sub] + 1); }
            const groups = dp[(1 << n) - 1]; const k = n - groups;
            dist[k] = (dist[k] || 0) + 1; tot++; if (k < n - 1) lessThanNm1++;
        }
        console.log(`${n} 人：最少轉帳次數分布 ${JSON.stringify(dist)}｜比「每人跟一個人結算」（${n - 1} 次）更少的題目 ${pct(lessThanNm1, tot)}（隨機出題時；出題器可刻意造出可拆群的題）`);
    }
}

// ───────── 562 洗衣排順序：一台洗衣機、一台烘衣機，幾籃衣服怎麼排最早全部烘完 ─────────
function laundry() {
    console.log('\n=== 洗衣排順序（laundry）：照「洗得快的先、烘得快的後」的規則 vs 直覺排法 ===');
    const perms = arr => { if (arr.length <= 1) return [arr.slice()]; const out = []; arr.forEach((x, i) => { perms(arr.slice(0, i).concat(arr.slice(i + 1))).forEach(p => out.push([x].concat(p))); }); return out; };
    for (const n of [3, 4, 5]) {
        let tot = 0, johnsonOpt = 0, shortFirstOpt = 0, uniqOpt = 0;
        const ps = perms([...Array(n)].map((_, i) => i));
        for (let t = 0; t < 1500; t++) {
            const w = [...Array(n)].map(() => 10 * ri(2, 8)), d = [...Array(n)].map(() => 10 * ri(2, 8));
            const span = p => { let a = 0, b = 0; for (const i of p) { a += w[i]; b = Math.max(b, a) + d[i]; } return b; };
            let best = 1e9, cnt = 0; for (const p of ps) { const s = span(p); if (s < best) { best = s; cnt = 1; } else if (s === best) cnt++; }
            const A = [...Array(n)].keys(); const idx = [...A];
            const first = idx.filter(i => w[i] <= d[i]).sort((a, b) => w[a] - w[b]), last = idx.filter(i => w[i] > d[i]).sort((a, b) => d[b] - d[a]);
            const j = first.concat(last);
            const sf = idx.slice().sort((a, b) => (w[a] + d[a]) - (w[b] + d[b]));
            tot++; if (span(j) === best) johnsonOpt++; if (span(sf) === best) shortFirstOpt++; if (cnt === 1) uniqOpt++;
        }
        console.log(`${n} 籃：規則排法＝最佳 ${pct(johnsonOpt, tot)}｜直覺「總時間短的先」＝最佳 ${pct(shortFirstOpt, tot)}｜最佳排法只有一種 ${pct(uniqOpt, tot)}`);
    }
}

paycoins(); splitpay(); settleup(); laundry();
