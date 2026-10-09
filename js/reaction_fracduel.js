/* ═══════════════════════════════════════════════════════════════════
   reaction_fracduel.js — 秒反應・分數大對決
   兩個分數卡左右並排，點比較大的那一張。關卡制，答錯或逾時就結束，成績＝連續答對幾題。
   作答時不顯示小數、不顯示長條圖；答完才揭曉小數（4 位）與並排長條圖。
   ───────────────────────────────────────────────────────────────────
   · 兩個值的相對差距 gap ＝ |a − b| ÷ 較大者：第 1 題 GAP_START（30%）線性降到 GAP_END（2%）。
     出題用「差距落在目標的 0.75～1.3 倍才收」的重抽法（最多 TRIES 次，不夠就放寬一次、再不行用保底）。
   · 分母 2～DEN_MAX（隨題號放寬）；第 4 題起兩張卡的分母一定不同（只比分子太容易）。
   · 大的那張左右隨機，同一邊不連續超過 3 次。
   · 限時 TIME_S 5.0→2.5 秒（線性）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fracduel';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 40;                       /* 幾題之後難度到頂 */
    var GAP_START = 0.30, GAP_END = 0.02;       /* 兩個分數的相對差距：第 1 題 → 到頂 */
    var TIME_S = [5.0, 2.5];                    /* 每題限時（秒） */
    var DEN = [12, 20];                         /* 分母上限：第 1 題 → 到頂 */
    var VAL_MIN = 0.1, VAL_MAX = 1.5;           /* 分數的值範圍 */
    var MAX_LEVEL = 60, TRIES = 30000, SAME_SIDE = 3;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gapAt(level) { return kit.ramp(level, GAP_START, GAP_END, RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function denMax(level) { return Math.round(kit.ramp(level, DEN[0], DEN[1], RAMP_LEVELS)); }
    function val(f) { return f.n / f.d; }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    function pickFrac(dmax, rand) {
        var d = kit.randInt(2, dmax, rand), n = kit.randInt(Math.max(1, Math.ceil(VAL_MIN * d)), Math.floor(VAL_MAX * d), rand);
        return { n: n, d: d };
    }
    /* 出題：回傳 { left, right, bigLeft, gap }；bigLeft 指定大的在左邊（不給就隨機） */
    function makeQuestion(level, rand, bigLeft) {
        rand = rand || Math.random;
        var g = gapAt(level), dm = denMax(level), f = 1;
        for (var round = 0; round < 3; round++) {
            for (var t = 0; t < TRIES / 3; t++) {
                var a = pickFrac(dm, rand), b = pickFrac(dm, rand);
                if (a.n * b.d === b.n * a.d) continue;                 /* 值相等 */
                if (gcd(a.n, a.d) !== 1 || gcd(b.n, b.d) !== 1) continue;   /* 都用最簡分數 */
                if (level >= 4 && a.d === b.d) continue;
                var va = val(a), vb = val(b), gap = Math.abs(va - vb) / Math.max(va, vb);
                if (gap >= g * 0.75 * f && gap <= g * 1.3 / f) {
                    var big = va > vb ? a : b, small = va > vb ? b : a;
                    if (bigLeft == null) bigLeft = rand() < 0.5;
                    return { left: bigLeft ? big : small, right: bigLeft ? small : big, bigLeft: bigLeft, gap: gap };
                }
            }
            f *= 0.6;                                                   /* 放寬接受範圍再試 */
        }
        var fb = bigLeft === false ? { left: { n: 3, d: 7 }, right: { n: 5, d: 11 } } : { left: { n: 5, d: 11 }, right: { n: 3, d: 7 } };
        return { left: fb.left, right: fb.right, bigLeft: bigLeft !== false, gap: Math.abs(val(fb.left) - val(fb.right)) / Math.max(val(fb.left), val(fb.right)) };
    }
    /* 大的在哪一邊：同一邊不連續太多次 */
    function nextBigLeft(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_SIDE) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_SIDE; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    function fmtFrac(f) { return f.n + '/' + f.d; }
    function rating(n) {
        if (n >= 40) return '分數大師！';
        if (n >= 25) return '高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '多看幾次，數感會變好！';
    }

    function mount(root, ctx) {
        var hist = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            head: function (lv) { return '第 ' + lv + ' 題'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.cleared + ' 題']; },
            setup: function (api) { if (api.level === 1) hist.length = 0; setup(api, hist); }
        });
    }

    function card(f) {
        return h('div', { 'class': 'fd-frac' }, [
            h('div', { 'class': 'fd-n', text: String(f.n) }),
            h('div', { 'class': 'fd-bar' }),
            h('div', { 'class': 'fd-d', text: String(f.d) })
        ]);
    }

    function setup(api, hist) {
        var stage = api.stage, level = api.level;
        var bl = nextBigLeft(hist, api.rand);
        var q = makeQuestion(level, api.rand, bl);
        hist.push(q.bigLeft);
        api.info = q;
        console.log('[分數大對決] 第 ' + level + ' 題：' + fmtFrac(q.left) + ' 對 ' + fmtFrac(q.right) + '，較大在' + (q.bigLeft ? '左' : '右') + '，差距 ' + (q.gap * 100).toFixed(2) + '%（目標 ' + (gapAt(level) * 100).toFixed(2) + '%），限時 ' + timeMs(level) + ' ms');
        var cl = h('div', { 'class': 'fd-card' }, [card(q.left)]);
        var cr = h('div', { 'class': 'fd-card' }, [card(q.right)]);
        var row = h('div', { 'class': 'fd-row' }, [cl, cr]);
        var info = h('div', { 'class': 'fd-info' });
        stage.appendChild(row); stage.appendChild(info);
        api.timer(timeMs(level), function () { judge(null); });

        function reveal() {
            [[cl, q.left], [cr, q.right]].forEach(function (p) {
                var v = val(p[1]);
                p[0].appendChild(h('div', { 'class': 'fd-val', text: v.toFixed(4) }));
                p[0].appendChild(h('div', { 'class': 'fd-bargraph' }, [h('div', { 'class': 'fd-bargraph__fill', style: { width: Math.round(v / VAL_MAX * 1000) / 10 + '%' } })]));
            });
            info.textContent = fmtFrac(q.left) + ' ＝ ' + val(q.left).toFixed(4) + '　' + fmtFrac(q.right) + ' ＝ ' + val(q.right).toFixed(4);
        }
        function judge(pickLeft) {
            if (api.over) return;
            var bigEl = q.bigLeft ? cl : cr;
            reveal();
            bigEl.classList.add('fd-card--big');
            if (pickLeft === q.bigLeft) {
                (pickLeft ? cl : cr).classList.add('fd-card--ok');
                api.pass({ delay: 900 });
            } else {
                if (pickLeft != null) (pickLeft ? cl : cr).classList.add('fd-card--bad');
                api.fail({ delay: 2000, lines: [
                    (pickLeft == null ? '時間到！' : '選錯了：') + fmtFrac(q.left) + ' 對 ' + fmtFrac(q.right),
                    fmtFrac(q.left) + ' ＝ ' + val(q.left).toFixed(4) + '，' + fmtFrac(q.right) + ' ＝ ' + val(q.right).toFixed(4),
                    '兩個分數只差 ' + (q.gap * 100).toFixed(4) + '%'
                ] });
            }
        }
        kit.onTap(cl, function () { judge(true); });
        kit.onTap(cr, function () { judge(false); });
        api.solve = function () { judge(q.bigLeft); };
        api.wrong = function () { judge(!q.bigLeft); };
    }

    var G = {
        id: ID,
        name: '分數大對決',
        rule: '兩個分數卡，點比較大的那一張。作答時不會顯示小數，要靠數感判斷。答錯或來不及就結束，看你能連續答對幾題。越後面，兩個分數差得越少、時間越短。',
        mount: mount,
        score: SCORE,
        test: { gapAt: gapAt, timeMs: timeMs, denMax: denMax, val: val, makeQuestion: makeQuestion, nextBigLeft: nextBigLeft, rating: rating, RAMP_LEVELS: RAMP_LEVELS, GAP_START: GAP_START, GAP_END: GAP_END, VAL_MIN: VAL_MIN, VAL_MAX: VAL_MAX, MAX_LEVEL: MAX_LEVEL, SAME_SIDE: SAME_SIDE }
    };
    Reaction.register(G);
})();
