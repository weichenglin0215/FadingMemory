/* ═══════════════════════════════════════════════════════════════════
   reaction_primetrap.js — 秒反應・質數陷阱
   畫面中央出現一個數字，下方左邊按鈕「合數（非質數）」、右邊按鈕「質數」。
   關卡制，答錯或逾時就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 範圍隨題號擴大：第 1～8 題 11～60、第 9～20 題 11～150、第 21 題起 101～300（排除 0 與 1）。
   · 質數與合數各約一半；同一類最多連續 SAME_MAX 次。
   · 陷阱合數：最小質因數 ≥ 7 的合數（49、77、91、119、143…），不能被 2、3、5 整除，看起來像質數。
     陷阱合數佔合數題目的比例 TRAP_START → TRAP_END（線性）；偶數與 5 的倍數只在前期出現。
   · 限時 TIME_S 4.0→1.5 秒（線性）。答錯顯示因數分解（91 ＝ 7 × 13）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'primetrap';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var TIME_S = [4.0, 1.5];                    /* 每題限時（秒） */
    var TRAP_START = 0.2, TRAP_END = 0.8;       /* 陷阱合數佔合數題的比例 */
    var MAX_LEVEL = 60, SAME_MAX = 4;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function isPrime(n) {
        if (n < 2) return false;
        for (var i = 2; i * i <= n; i++) if (n % i === 0) return false;
        return true;
    }
    function spf(n) { for (var i = 2; i * i <= n; i++) if (n % i === 0) return i; return n; }
    function factorText(n) {
        var f = [], m = n;
        for (var p = 2; p * p <= m; p++) while (m % p === 0) { f.push(p); m = m / p; }
        if (m > 1) f.push(m);
        return n + ' ＝ ' + f.join(' × ');
    }
    function rangeFor(level) { return level <= 8 ? [11, 60] : (level <= 20 ? [11, 150] : [101, 300]); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function trapFrac(level) { return kit.ramp(level, TRAP_START, TRAP_END, RAMP_LEVELS); }
    /* 範圍內的數字池：質數、陷阱合數（最小質因數 ≥ 7）、一般合數 */
    var poolCache = {};
    function poolsFor(level) {
        var r = rangeFor(level), key = r[0] + '-' + r[1];
        if (poolCache[key]) return poolCache[key];
        var p = { primes: [], traps: [], plain: [] };
        for (var n = r[0]; n <= r[1]; n++) {
            if (isPrime(n)) p.primes.push(n);
            else if (spf(n) >= 7) p.traps.push(n);
            else p.plain.push(n);
        }
        return (poolCache[key] = p);
    }
    /* 這一題要不要質數：一半一半，連續太多次就換邊 */
    function nextPrime(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    /* 出題：回傳 { n, prime, trap }；prev 是上一題的數字（不連續出現同一個） */
    function makeQuestion(level, rand, wantPrime, prev) {
        rand = rand || Math.random;
        var pools = poolsFor(level);
        if (wantPrime == null) wantPrime = rand() < 0.5;
        var branchTrap = !wantPrime && pools.traps.length > 0 && (pools.plain.length === 0 || rand() < trapFrac(level));
        for (var t = 0; t < 50; t++) {
            var n, trap = false;
            if (wantPrime) n = kit.pick(pools.primes, rand);
            else if (branchTrap) { n = kit.pick(pools.traps, rand); trap = true; }
            else {
                /* 一般合數：前期偶數、5 的倍數多；越後面這類「太容易」的數字越少（被抽到時有一定機率重抽） */
                n = kit.pick(pools.plain, rand);
                var easy = n % 2 === 0 || n % 5 === 0;
                if (easy && rand() < kit.ramp(level, 0, 0.7, RAMP_LEVELS)) continue;
            }
            if (n === prev) continue;
            return { n: n, prime: isPrime(n), trap: trap };
        }
        return { n: wantPrime ? 53 : 91, prime: wantPrime, trap: !wantPrime };
    }
    function rating(n) {
        if (n >= 40) return '質數雷達！';
        if (n >= 25) return '高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '多看幾次，陷阱就記住了！';
    }

    function mount(root, ctx) {
        var hist = [], prev = null;
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            head: function (lv) { return '第 ' + lv + ' 題'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.cleared + ' 題']; },
            setup: function (api) { if (api.level === 1) { hist.length = 0; prev = null; } setup(api, hist, function (n) { prev = n; }, prev); }
        });
    }

    function setup(api, hist, setPrev, prev) {
        var stage = api.stage, level = api.level;
        var q = makeQuestion(level, api.rand, nextPrime(hist, api.rand), prev);
        hist.push(q.prime); setPrev(q.n);
        api.info = q;
        console.log('[質數陷阱] 第 ' + level + ' 題：' + q.n + '（' + (q.prime ? '質數' : (q.trap ? '陷阱合數 ' : '合數 ') + factorText(q.n)) + '），限時 ' + timeMs(level) + ' ms');
        var num = h('div', { 'class': 'pt-num', text: String(q.n) });
        var note = h('div', { 'class': 'pt-note' });
        stage.appendChild(num); stage.appendChild(note);
        var bComp = h('button', { 'class': 'btn btn--primary', text: '合數（非質數）' });
        var bPrime = h('button', { 'class': 'btn btn--go', text: '質數' });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bComp, bPrime]));
        api.timer(timeMs(level), function () { judge(null); });

        function judge(sayPrime) {
            if (api.over) return;
            var text = q.prime ? q.n + ' 是質數' : factorText(q.n);
            note.textContent = text;
            if (sayPrime === q.prime) {
                num.classList.add('pt-num--ok');
                api.pass({ delay: 600 });
            } else {
                num.classList.add('pt-num--bad');
                api.fail({ delay: 1700, lines: [
                    (sayPrime == null ? '時間到！' : '答錯了：') + q.n + (q.prime ? ' 是質數' : ' 不是質數'),
                    text,
                    q.trap ? '它不能被 2、3、5 整除，看起來像質數，其實是合數' : ''
                ].filter(function (x) { return x; }) });
            }
        }
        kit.onTap(bPrime, function () { judge(true); });
        kit.onTap(bComp, function () { judge(false); });
        api.solve = function () { judge(q.prime); };
        api.wrong = function () { judge(!q.prime); };
    }

    var G = {
        id: ID,
        name: '質數陷阱',
        rule: '畫面中央有一個數字，**判斷它是「質數」還是「合數」**。小心：**91、77、119 這些數字長得像質數，其實是合數**！答錯或來不及就結束，看你能連續答對幾題。越後面，數字越大、時間越短。',
        mount: mount,
        score: SCORE,
        test: { isPrime: isPrime, spf: spf, factorText: factorText, rangeFor: rangeFor, timeMs: timeMs, trapFrac: trapFrac, poolsFor: poolsFor, nextPrime: nextPrime, makeQuestion: makeQuestion, rating: rating, RAMP_LEVELS: RAMP_LEVELS, TRAP_START: TRAP_START, TRAP_END: TRAP_END, MAX_LEVEL: MAX_LEVEL, SAME_MAX: SAME_MAX }
    };
    Reaction.register(G);
})();
