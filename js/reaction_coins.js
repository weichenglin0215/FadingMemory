/* ═══════════════════════════════════════════════════════════════════
   reaction_coins.js — 秒反應・零錢分類
   題目是一個數字（例如 271），桌上散著一堆硬幣，點選硬幣讓「已選的總和」剛好等於題目。
   ───────────────────────────────────────────────────────────────────
   【好不好玩，全看硬幣怎麼規劃】這一份是規劃邏輯（程式照這個做）：

   1. 先決定題目 N（隨關卡從 2 位數長到 3 位數，最大 499），再把 N 拆成「答案」c_d＝每種幣值拿幾枚
      （由大到小各拿一個隨機數量，剩下的由 1 元補齊，所以一定有解）。
   2. 再決定「桌上有幾枚」a_d ≥ c_d（多給的是陷阱），陷阱有這幾種（機率隨關卡線性增加）：
        · 大面額太多（over50）：桌上 50 元的總額超過 N（例如 271 桌上有 6 個 50，最多只能拿 5 個），
          答案裡的 50 元通常拿到上限，所以「50 元一直拿」會超出金額；
        · 湊零頭（carry）：百位數用掉 50 之後，零頭還要靠 20、10、5、1 湊，必須細算；
        · 大量同額（bulk）：桌上有很多枚 1 元（最多 19 枚），要數出剛好拿幾枚；
        · 整堆不能拿（decoy）：答案裡一枚都不用的幣值，桌上卻有（第 5 關起）；
        · 直覺做法失敗（greedyFail）：「由大到小盡量拿」湊不出剛好的金額（第 GREEDY_FROM 關起）。
   3. 答案不要求唯一：只要選的硬幣加起來剛好等於 N 就過關（多解也行）。為了讓每一題都可以解，出題時一定
      是從答案 c 反推桌上的硬幣，所以至少有一組解；測試會統計平均有幾組解，供參考。
   4. 關卡一路往上調（全部線性）：
        · 第 1–2 關幣值 {10, 5, 1}，第 3–4 關加入 50，第 5 關起再加入 20；
        · N 的範圍、每種幣值的「答案枚數」上限、「多給的枚數」上限、桌上硬幣總數上下限隨關卡線性增加
          （總數最多 COINS_END 枚，擺得下是 t_coins.js 驗證過的上限）；
        · 每一題的時間從 TIME_START 線性縮短到 TIME_END。
   5. 失敗之後可以從「失敗關卡 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'coins';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 coins 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度升到頂的關卡 */
    var LEVEL_RAMP = 15;           /* 難度升到頂的關卡 */
    /* 每題限時從 45 秒線性縮短到 30 秒 */
    var TIME_START = 45, TIME_END = 30;     /* 每題限時（秒） */
    /* 題目金額範圍、桌上硬幣數、「多給」的枚數，都隨關卡線性增加 */
    var N_LO_START = 12, N_LO_END = 150;    /* 題目金額的下限／上限範圍（隨關卡變大） */
    var N_HI_START = 45, N_HI_END = 499;
    var COINS_START = 9, COINS_END = 32;    /* 桌上硬幣總數上限（t_coins.js 驗證擺得下） */
    var MIN_START = 6, MIN_END = 20;        /* 桌上硬幣總數下限（避免後面的關卡硬幣還是很少） */
    var SURP_START = 1, SURP_END = 5;       /* 每種幣值「多給」枚數上限 */
    var GREEDY_FROM = 5;           /* 第幾關起，部分題目要求直覺（由大到小）做法失敗 */
    var NEXT_MS = 1000;            /* 答對後多久進下一題 */
    /* 硬幣直徑（邏輯 px）：面額越大硬幣越大 */
    var SIZE = { 50: 74, 20: 68, 10: 62, 5: 56, 1: 48 };       /* 硬幣直徑（邏輯 px） */

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關有哪些面額：第 1–2 關 {10,5,1}、第 3–4 關加 50、第 5 關起再加 20 */
    function denomsFor(level) { return level <= 2 ? [10, 5, 1] : (level <= 4 ? [50, 10, 5, 1] : [50, 20, 10, 5, 1]); }
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    /* 答案裡每種面額最多拿幾枚 */
    /* 答案裡每種幣值最多拿幾枚 */
    function cntMax(level, d) {
        var r = function (a, b) { return Math.round(kit.ramp(level, a, b, LEVEL_RAMP)); };
        if (d === 50) return r(1, 9);
        if (d === 20) return r(1, 5);
        if (d === 10) return r(2, 9);
        if (d === 5) return r(2, 7);
        return r(3, 19);
    }
    /* 「多給」的枚數上限（桌上比答案多放的硬幣就是陷阱） */
    function surpMax(level) { return Math.round(kit.ramp(level, SURP_START, SURP_END, LEVEL_RAMP)); }
    /* 桌上硬幣總數的上限／下限 */
    function coinCap(level) { return Math.round(kit.ramp(level, COINS_START, COINS_END, LEVEL_RAMP)); }
    function coinMin(level) { return Math.round(kit.ramp(level, MIN_START, MIN_END, LEVEL_RAMP)); }
    /* 題目金額範圍 */
    function nRange(level) { return [Math.round(kit.ramp(level, N_LO_START, N_LO_END, LEVEL_RAMP)), Math.round(kit.ramp(level, N_HI_START, N_HI_END, LEVEL_RAMP))]; }
    function bulkLow(level) { return Math.round(kit.ramp(level, 5, 13, LEVEL_RAMP)); }

    /* 遞迴計算湊成 N 的方法有幾種：從大面額開始，每種面額試各種數量，剩下的交給小面額；用上下界剪枝（拿太多會超過、拿太少補不滿的都不用試） */
    /* 湊成 N 的方法有幾種（den 由大到小，a 是各幣值桌上枚數）；數到 limit 就停 */
    function countSolutions(den, a, N, limit) {
        var cnt = 0, lim = limit || 2;
        /* (function rec(i, rem) {...})(0, N)：遞迴函式的寫法——函式自己呼叫自己，i 是目前處理第幾種面額，rem 是還剩多少金額要湊 */
        (function rec(i, rem) {
            if (cnt >= lim) return;
            if (i === den.length) { if (rem === 0) cnt++; return; }
            var d = den[i], cap = 0;
            for (var j = i + 1; j < den.length; j++) cap += a[j] * den[j];       /* 剩下的小硬幣全加起來最多能補多少 */
            var hi = Math.min(a[i], Math.floor(rem / d));                          /* 最多拿幾枚：不能超過 */
            var lo = Math.max(0, Math.ceil((rem - cap) / d));                      /* 最少拿幾枚：不然補不滿 */
            for (var x = hi; x >= lo; x--) rec(i + 1, rem - x * d);
        })(0, N);
        return cnt;
    }
    /* 「由大到小盡量拿」的直覺做法（貪心演算法 greedy）：成功回傳各面額枚數，失敗（湊不出剛好）回傳 null */
    /* 「由大到小盡量拿」的直覺做法：成功回傳各幣值枚數，失敗回傳 null */
    function greedy(den, a, N) {
        var rem = N, out = [];
        for (var i = 0; i < den.length; i++) {
            var t = Math.min(a[i], Math.floor(rem / den[i]));
            out.push(t);
            rem -= t * den[i];
        }
        return rem === 0 ? out : null;
    }

    /* 找出湊成 N 的一組解，找不到回傳 null */
    /* 找出湊成 N 的一組解（各幣值枚數），找不到回傳 null */
    function findSolution(den, a, N) {
        var out = null;
        (function rec(i, rem, acc) {
            if (out) return;
            if (i === den.length) { if (rem === 0) out = acc.slice(); return; }
            var d = den[i], cap = 0;
            for (var j = i + 1; j < den.length; j++) cap += a[j] * den[j];
            var hi = Math.min(a[i], Math.floor(rem / d)), lo = Math.max(0, Math.ceil((rem - cap) / d));
            for (var x = hi; x >= lo; x--) { acc.push(x); rec(i + 1, rem - x * d, acc); acc.pop(); if (out) return; }
        })(0, N, []);
        return out;
    }
    /* 出「直覺做法會失敗」的題目：先隨機擺硬幣，再驗證「有解，但由大到小盡量拿湊不出來」；要靠搜尋才能解 */
    /* 「由大到小盡量拿」會失敗的題目：先隨機擺桌上的硬幣和題目，再驗證「有解、但直覺做法湊不出來」。
       這種題目要靠真的搜尋（大面額少拿一點、換成 20 或 10 湊），不能用邏輯一路拿到底。 */
    function planGreedyFail(level, den, rand) {
        var cap = coinCap(level), capMin = Math.max(5, coinMin(level)), nr = nRange(level), minUsed = level <= 2 ? 2 : 3;
        for (var tries = 0; tries < 4000; tries++) {
            var a = den.map(function (d) { return rand() < 0.15 ? 0 : kit.randInt(1, Math.max(1, Math.min(cntMax(level, d) + surpMax(level), 12)), rand); });
            var total = a.reduce(function (s0, x) { return s0 + x; }, 0);
            if (total > cap || total < capMin) continue;
            var N = kit.randInt(nr[0], nr[1], rand), max = 0;
            a.forEach(function (x, i) { max += x * den[i]; });
            if (N > max - 10) continue;
            var c = findSolution(den, a, N);
            if (!c || c.filter(function (x) { return x > 0; }).length < minUsed) continue;
            if (greedy(den, a, N) !== null) continue;
            return { c: c, a: a, N: N, total: total, tries: tries };
        }
        return null;
    }

    /* 把 N 拆成答案 c（各面額拿幾枚）：由大到小各拿一個隨機數量，剩下的由 1 元補齊，所以一定有解 */
    /* 把 N 拆成答案 c（den 由大到小）；拆不出（1 元太多）回傳 null。
       maxOut：50 元盡量拿到上限（over50 陷阱用）；underuse：大面額故意少拿 1～2 枚，讓「由大到小盡量拿」走偏（greedyFail 用）*/
    function decompose(den, N, level, maxOut, underuse, rand) {
        var rem = N, c = [];
        for (var i = 0; i < den.length; i++) {
            var d = den[i], hi = Math.min(cntMax(level, d), Math.floor(rem / d)), u;
            if (d === 1) { if (rem > cntMax(level, 1)) return null; u = rem; }
            else if (d === 50 && maxOut) u = Math.max(0, hi - (rand() < 0.3 ? 1 : 0));
            else if (underuse && d >= 10 && hi >= 1) u = Math.max(0, hi - kit.randInt(1, 2, rand));
            else if (d !== 50 && rand() < 0.2) u = 0;                                  /* 偶爾整種不拿（桌上卻可能有 → decoy）*/
            else u = rand() < 0.65 ? kit.randInt(Math.floor(hi / 2), hi, rand) : kit.randInt(0, hi, rand);
            c.push(u); rem -= u * d;
        }
        return rem === 0 ? c : null;
    }

    /* 規劃一題：決定題目 N、答案 c、桌上硬幣 a（含各種陷阱），並確保合理 */
    /* 規劃一題：回傳 { den, c, a, N, traps:{over50,bulk,decoy,greedyFails,carry}, coins, tries } */
    function plan(level, rand) {
        rand = rand || Math.random;
        var den = denomsFor(level), has50 = den.indexOf(50) >= 0;
        var cap = coinCap(level), capMin = coinMin(level), sMax = surpMax(level), nr = nRange(level);
        var minUsed = level <= 2 ? 2 : 3;        /* 答案裡至少用到幾種幣值 */
        /* 各種陷阱的機率隨關卡線性增加 */
        var pOver = has50 ? kit.ramp(level, 0.35, 0.9, LEVEL_RAMP) : 0, pBulk = kit.ramp(level, 0.15, 0.85, LEVEL_RAMP);
        var pDecoy = level >= 5 ? kit.ramp(level, 0.4, 0.8, LEVEL_RAMP) : 0, pGF = level >= GREEDY_FROM ? kit.ramp(level, 0.2, 0.6, LEVEL_RAMP) : 0;
        /* 這一題要不要這些陷阱：每題只抽一次；找不到就放寬條件（先放棄直覺失敗，再放棄全部） */
        /* 這一題要不要這些陷阱：每題只抽一次（不是每次嘗試都抽，否則「沒要求」的嘗試比較容易成功，陷阱就變少）；
           第一輪照要求，找不到就放寬（先放棄直覺失敗，再放棄全部）*/
        var wOver = rand() < pOver, wBulk = rand() < pBulk, wGF = rand() < pGF;
        if (wGF) { wOver = false; wBulk = false; }      /* 「直覺做法失敗」要大面額少拿、小面額不多給，跟「50 拿到上限」「1 元一大堆」互相衝突，所以三者不同時要求 */
        if (wGF) {
            var g0 = planGreedyFail(level, den, rand);
            if (g0) {
                var tr0 = { over50: has50 && g0.a[0] * 50 > g0.N, bulk: g0.a[g0.a.length - 1] >= bulkLow(level), decoy: g0.c.some(function (x, i) { return x === 0 && g0.a[i] > 0; }), greedyFails: true, carry: has50 && g0.c[0] >= 1 && g0.c.slice(1).filter(function (x) { return x > 0; }).length >= 2 };
                return { den: den, c: g0.c, a: g0.a, N: g0.N, traps: tr0, coins: g0.total, tries: g0.tries, pass: 0 };
            }
        }
        /* 最多放寬三輪，每輪最多嘗試 6000 次 */
        for (var pass = 0; pass < 3; pass++) {
            var wantOver = pass < 2 ? wOver : false, wantBulk = pass < 2 ? wBulk : false, wantGF = false;
            for (var tries = 0; tries < 6000; tries++) {
                var N = kit.randInt(nr[0], nr[1], rand);
                var c = decompose(den, N, level, wantOver, wantGF, rand);
                if (!c) continue;
                if (c.filter(function (x) { return x > 0; }).length < minUsed) continue;
                if (wantOver && !(has50 && c[0] >= 1)) continue;
                var a = c.map(function (x, i) {
                    var d = den[i];
                    /* greedyFail：小面額不多給，讓大面額拿多了就補不回來 */
                    if (x > 0) return x + ((rand() < 0.35 || (wantGF && d <= 5 && rand() < 0.3)) ? 0 : kit.randInt(1, sMax, rand));
                    return (rand() < pDecoy) ? kit.randInt(1, 3, rand) : 0;
                });
                if (wantOver) a[0] = Math.max(a[0], Math.floor(N / 50) + 1);               /* 桌上的 50 元總額超過 N */
                if (wantBulk) { var lo = Math.max(c[c.length - 1] + 1, bulkLow(level)); a[a.length - 1] = Math.max(a[a.length - 1], Math.min(19, lo + kit.randInt(0, 4, rand))); }
                var total = a.reduce(function (s, x) { return s + x; }, 0);
                if (total > cap || total < Math.max(5, capMin)) continue;
                var gf = greedy(den, a, N) === null;
                if (wantGF && !gf) continue;
                var over50 = has50 && a[0] * 50 > N, bulk = a[a.length - 1] >= bulkLow(level);
                var decoy = c.some(function (x, i) { return x === 0 && a[i] > 0; });
                /* 湊零頭：答案裡 50 用了、而且零頭（N 除掉 50 的整倍數之後）還要用到 3 種以上的小面額 */
                var carry = has50 && c[0] >= 1 && c.slice(1).filter(function (x) { return x > 0; }).length >= 2;
                return { den: den, c: c, a: a, N: N, traps: { over50: over50, bulk: bulk, decoy: decoy, greedyFails: gf, carry: carry }, coins: total, tries: tries, pass: pass };
            }
        }
        /* 保底：137＝50×2＋10×2＋5×3＋1×2 */
        /* 保底：137＝50×2＋10×2＋5×3＋1×2 */
        var f = { den: [50, 10, 5, 1], c: [2, 2, 3, 2], a: [3, 2, 4, 6], N: 137, coins: 15, tries: -1, pass: 3 };
        f.traps = { over50: true, bulk: false, decoy: false, greedyFails: greedy(f.den, f.a, f.N) === null, carry: true };
        return f;
    }

    /* 把硬幣丟在桌上：隨機位置、互不重疊（大的先放）；放不下就整個重排（最多 24 次），真的不行回傳 null */
    /* 把硬幣丟在桌上：隨機位置、互不重疊（大的先放）。放不下就整個重排（最多 24 次），真的不行回傳 null */
    function scatter(list, W, Hh, rand) {
        rand = rand || Math.random;
        var sorted = list.slice().sort(function (p, q) { return q - p; });
        for (var attempt = 0; attempt < 24; attempt++) {
            var out = [], failed = false;
            for (var k = 0; k < sorted.length && !failed; k++) {
                var d = sorted[k], r = SIZE[d] / 2, placed = null;
                for (var t = 0; t < 500 && !placed; t++) {
                    var x = r + 4 + rand() * (W - 2 * r - 8), y = r + 4 + rand() * (Hh - 2 * r - 8);
                    var ok = true;
                    for (var i = 0; i < out.length; i++) {
                        var dx = out[i].x - x, dy = out[i].y - y, rr = r + SIZE[out[i].d] / 2 + 4;
                        if (dx * dx + dy * dy < rr * rr) { ok = false; break; }
                    }
                    if (ok) placed = { d: d, x: x, y: y };
                }
                if (placed) out.push(placed); else failed = true;
            }
            if (!failed) return kit.shuffle(out, rand);
        }
        return null;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* start：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局（失敗後可從失敗關卡前 5 關繼續） */
        function round(start) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            /* level 目前關卡；cleared 已過幾關；newRec 有沒有破紀錄 */
            var level = start || 1, cleared = level - 1, newRec = false;

            /* 建立畫面元素：題目、已選總額、桌面、時間條、「全部放回」按鈕 */
            var target = h('div', { 'class': 'cn-target' });
            var sumLine = h('div', { 'class': 'cn-sum' });
            var table = h('div', { 'class': 'cn-table' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var clearBtn = h('button', { 'class': 'btn btn--line btn--sm', text: '全部放回' });
            root.appendChild(target);
            root.appendChild(sumLine);
            root.appendChild(table);
            root.appendChild(bar);
            root.appendChild(clearBtn);

            /* q 這一題；coins 桌上的硬幣；sum 目前已選的總額；state 目前階段；timer／loop 倒數 */
            var q = null, coins = [], sum = 0, state = 'idle', timer = null, loop = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }

            /* 更新「已選 / 還差」文字，超過就變橘色 */
            function paintSum() {
                if (!q) return;
                var diff = q.N - sum;
                sumLine.className = 'cn-sum' + (diff < 0 ? ' cn-sum--over' : '');
                sumLine.textContent = '已選 ' + sum + (diff < 0 ? '　超過了 ' + (-diff) : '　還差 ' + diff);
            }

            /* 點一枚硬幣：切換選取，總額剛好等於題目就過關 */
            function toggle(co) {
                if (state !== 'play') return;
                co.on = !co.on;
                co.el.classList.toggle('cn-coin--on', co.on);
                sum += co.on ? co.d : -co.d;
                Sfx.play('click');
                paintSum();
                if (sum === q.N) solved();
            }

            /* 全部放回 */
            clearBtn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                if (state !== 'play') return;
                coins.forEach(function (co) { co.on = false; co.el.classList.remove('cn-coin--on'); });
                sum = 0;
                paintSum();
            });

            /* 出一題 */
            function ask() {
                if (my.dead) return;
                meta();
                var pos = null;
                /* 這題的硬幣擺得下才用；擺不下就重新出題 */
                for (var att = 0; att < 40 && !pos; att++) {          /* 這題的硬幣擺得下才用；擺不下就重新出題 */
                    q = plan(level);
                    var list0 = [];
                    q.den.forEach(function (d, i) { for (var k = 0; k < q.a[i]; k++) list0.push(d); });
                    pos = scatter(list0, table.clientWidth, table.clientHeight);
                }
                if (!pos) throw new Error('coins: cannot place the coins');
                /* 主控台印出這題的規劃（各面額桌上與答案枚數、至少一組解、陷阱種類），方便驗證 */
                /* 主控台：列出這一題的規劃，驗證「唯一解」與各幣值的類型 */
                try {
                    console.info('[零錢分類] 第 ' + level + ' 關 題目 ' + q.N + '：' + q.den.map(function (d, i) {
                        return d + ' 元 桌上 ' + q.a[i] + ' 枚（答案拿 ' + q.c[i] + '）';
                    }).join('、') + '；共 ' + q.coins + ' 枚；至少一組解（約 ' + countSolutions(q.den, q.a, q.N, 200) + ' 組）；陷阱：' +
                        ['over50', 'carry', 'bulk', 'decoy', 'greedyFails'].filter(function (k) { return q.traps[k]; }).join('、'));
                } catch (e) { }
                target.textContent = '湊出 ' + q.N;
                table.innerHTML = '';
                coins = []; sum = 0; state = 'play';
                /* 把每枚硬幣畫成一顆按鈕，放在隨機位置上 */
                pos.forEach(function (p) {
                    var el = h('button', { 'class': 'cn-coin cn-coin--' + p.d, text: String(p.d) });
                    el.style.width = el.style.height = SIZE[p.d] + 'px';
                    el.style.left = (p.x - SIZE[p.d] / 2) + 'px';
                    el.style.top = (p.y - SIZE[p.d] / 2) + 'px';
                    var co = { d: p.d, el: el, on: false };
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); toggle(co); });
                    table.appendChild(el);
                    coins.push(co);
                });
                paintSum();
                /* 操作提示（只在第一次進遊戲時）：點硬幣 → 手指縮放 */
                if (Reaction.kit.once('coins.hint')) Reaction.kit.hintOn(root, coins[0].el, { mode: 'tap' });
                /* 倒數時間條 */
                var limit = timeFor(level) * 1000, t0 = performance.now();
                loop = my.loop(function (now) {
                    if (state !== 'play') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                });
                timer = my.after(limit, timeUp);
            }

            /* 過關：剛好湊成題目 */
            function solved() {
                state = 'won';
                my.cancel(timer); loop.stop();
                fill.style.width = '0%';
                cleared = level;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                coins.forEach(function (co) { if (co.on) co.el.classList.add('cn-coin--ok'); });
                sumLine.className = 'cn-sum cn-sum--ok';
                sumLine.textContent = '剛好 ' + q.N + '！';
                Sfx.play('win');
                level++;
                my.after(NEXT_MS, ask);
            }

            /* 時間到：把一組答案的硬幣用黃框標出來，結算 */
            function timeUp() {
                if (state !== 'play') return;
                state = 'over';
                fill.style.width = '0%';
                /* 答案的硬幣用黃框標出來（每種幣值取前 c 枚） */
                var left = q.c.slice();
                coins.forEach(function (co) {
                    var i = q.den.indexOf(co.d);
                    if (left[i] > 0) { left[i]--; co.el.classList.add('cn-coin--answer'); }
                });
                sumLine.className = 'cn-sum cn-sum--over';
                sumLine.textContent = '時間到了';
                var failLevel = level, back = kit.resumeFrom(failLevel);
                my.after(1800, function () {
                    var ans = q.den.map(function (d, i) { return q.c[i] > 0 ? d + ' 元 ×' + q.c[i] : null; }).filter(Boolean).join('、');
                    kit.result(root, {
                        score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: cleared + ' 關', label: '時間到了',
                        lines: ['第 ' + failLevel + ' 關要湊 ' + q.N, '其中一組答案：' + ans],
                        isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail',
                        onAgain: function () { round(1); },
                        resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* G.debug：測試用後門，solve() 會依答案點硬幣 */
            G.debug = {
                state: function () { return { level: level, state: state, sum: sum, q: q, cleared: cleared }; },
                /* 依答案點硬幣 */
                solve: function () {
                    if (state !== 'play') return state;
                    var left = q.c.slice();
                    coins.forEach(function (co) {
                        var i = q.den.indexOf(co.d);
                        if (left[i] > 0 && !co.on) { left[i]--; toggle(co); }
                    });
                    return state;
                },
                timeUp: timeUp
            };
            /* 開場等 300 毫秒再出第一題 */
            my.after(300, ask);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '零錢分類',
        rule: '上面是題目數字，桌上散著各種硬幣。點選硬幣，讓「已選」的總和剛好等於題目，湊法可能不只一種。小心：50 元拿太多會超過，零頭要用小硬幣細算，有的硬幣一枚都不該拿！每題有時間限制，看你能過幾關。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { findSolution: findSolution, planGreedyFail: planGreedyFail, coinMin: coinMin, plan: plan, countSolutions: countSolutions, greedy: greedy, decompose: decompose, denomsFor: denomsFor, coinCap: coinCap, timeFor: timeFor, nRange: nRange, bulkLow: bulkLow, cntMax: cntMax, scatter: scatter, SIZE: SIZE, LEVEL_RAMP: LEVEL_RAMP, COINS_END: COINS_END }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
