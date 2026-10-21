/* ═══════════════════════════════════════════════════════════════════
   reaction_fracduel.js — 秒反應・分數大對決
   兩個分數卡左右並排，點比較大的那一張。關卡制，答錯或逾時就結束，成績＝連續答對幾題。
   作答時不顯示小數、不顯示長條圖；答完才揭曉小數（4 位）與並排長條圖。
   ───────────────────────────────────────────────────────────────────
   · 兩個值的相對差距 gap ＝ |a − b| ÷ 較大者：第 1 題 GAP_START（25%）線性降到 GAP_END（1%）。
     出題用「差距落在目標的 0.75～1.3 倍才收」的重抽法（最多 TRIES 次，不夠就放寬、再不行改用 rand 題型、最後用保底）。
   · V1.25 起有四種「題型」（kind），由候選產生器決定兩個分數怎麼配對，差距再用上面的條件篩選：
       rand     隨機兩個分數（第 1 題起）；
       samenum  分子相同、分母不同（13/7 對 13/8：分母越大分數越小），第 3 題起；
       plus1    分子分母各差 1（13/25 對 14/26、25/13 對 26/14：往 1 靠近的方向要想一想），第 5 題起；
       mult     分母是倍數關係、分子也差不多是倍數但被故意增減一點（41/63 對 2/3、7/23 對 36/115），第 9 題起。
     之後每題在「已解鎖的題型」裡平均抽。
   · 數字大小：第 1～10 題分母 DEN（12→20）以內；第 BIG_FROM（11）題起每題有 BIG_P（40%）機率是三位數的分數（到 999）、
     其餘兩位數（到 99）；第 DEC_FROM（21）題起每題有 DEC_P（40%）機率其中一個分數改成帶小數點的寫法
     （分子分母同乘 0.5，值不變，例如 7/14 寫成 3.5/7；小數只有一位）。
   · 分母 2 起；第 4 題起兩張卡的分母一定不同（只比分子太容易）；兩個分數都是最簡分數（帶小數的除外）。
   · 大的那張左右隨機，同一邊不連續超過 3 次。
   · 限時 TIME_S 7.5→3.75 秒（V1.24 的 1.5 倍，線性）。所有數字加大，三位數、帶小數的依字數自動縮小字級才放得進卡片。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fracduel';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var GAP_START = 0.25, GAP_END = 0.01;       /* 兩個分數的相對差距：第 1 題 → 到頂 */
    var TIME_S = [7.5, 3.75];                   /* 每題限時（秒） */
    var DEN = [12, 20];                         /* 第 1～10 題的分母上限：第 1 題 → 到頂 */
    var VAL_MIN = 0.1, VAL_MAX = 1.5;           /* rand 題型的分數值範圍 */
    var VAL_CAP = 3;                            /* 其他題型的分數值上限（13/7 這種大於 1 的分數也會出現） */
    var KIND_FROM = { rand: 1, samenum: 3, plus1: 5, mult: 9 };   /* 各題型從第幾題起出現 */
    var BIG_FROM = 11, BIG_P = 0.4, CAP2 = 99, CAP3 = 999;        /* 三位數：第幾題起、機率；兩位數與三位數的上限 */
    var DEC_FROM = 21, DEC_P = 0.4;             /* 帶小數點：第幾題起、機率 */
    var MAX_LEVEL = 90, TRIES = 30000, SAME_SIDE = 3;
    var KINDS = ['rand', 'samenum', 'plus1', 'mult'];
    var KIND_HINT = {
        rand: '',
        samenum: '分子一樣的時候，分母越大，分數越小',
        plus1: '分子分母各差 1：分子比分母小的，加 1 之後會變大；分子比分母大的，加 1 之後會變小（都往 1 靠近）',
        mult: '分母是倍數：把分母通分，再比分子'
    };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gapAt(level) { return kit.ramp(level, GAP_START, GAP_END, RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function denMax(level) { return Math.round(kit.ramp(level, DEN[0], DEN[1], RAMP_LEVELS)); }
    function val(f) { return f.n / f.d; }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    function reduced(f) { return gcd(f.n, f.d) === 1; }
    /* 這一題已解鎖的題型 */
    function kindsAt(level) { return KINDS.filter(function (k) { return level >= KIND_FROM[k]; }); }
    /* 這一題的數字上限：第 1～10 題 ＝ denMax；第 BIG_FROM 題起 ＝ 兩位數（CAP2）或（機率 BIG_P）三位數（CAP3） */
    function capFor(level, rand) {
        if (level < BIG_FROM) return denMax(level);
        return rand() < BIG_P ? CAP3 : CAP2;
    }
    function pickFrac(dmax, rand) {
        var d = kit.randInt(2, dmax, rand), n = kit.randInt(Math.max(1, Math.ceil(VAL_MIN * d)), Math.floor(VAL_MAX * d), rand);
        return { n: n, d: d };
    }
    /* 各題型的「候選配對」產生器：回傳 [a, b]（還沒篩選差距、最簡、分母不同） */
    var CAND = {
        rand: function (cap, rand) { return [pickFrac(cap, rand), pickFrac(cap, rand)]; },
        samenum: function (cap, rand) {
            var d1 = kit.randInt(2, cap, rand), d2 = kit.randInt(2, cap, rand);
            var n = kit.randInt(2, Math.max(2, Math.floor(VAL_CAP * Math.min(d1, d2))), rand);
            return [{ n: n, d: d1 }, { n: n, d: d2 }];
        },
        plus1: function (cap, rand) {
            var d = kit.randInt(3, Math.max(3, cap - 1), rand), n = kit.randInt(2, Math.max(2, Math.min(Math.floor(VAL_CAP * d), cap - 1)), rand);
            var s = rand() < 0.5 ? 1 : -1;
            return [{ n: n, d: d }, { n: n + s, d: d + s }];
        },
        mult: function (cap, rand) {
            var k = kit.randInt(2, 9, rand), q = kit.randInt(2, Math.max(2, Math.floor(cap / k)), rand);
            var y = kit.randInt(1, Math.max(1, Math.floor(VAL_CAP * q)), rand), e = kit.pick([-2, -1, 1, 2], rand);
            return [{ n: y, d: q }, { n: y * k + e, d: q * k }];
        }
    };
    /* 在 kind 題型裡找一組差距落在目標範圍的配對；找不到回傳 null */
    function search(kind, g, cap, level, rand, bigLeft) {
        var f = 1;
        for (var round = 0; round < 3; round++) {
            for (var t = 0; t < TRIES / 3; t++) {
                var p = CAND[kind](cap, rand), a = p[0], b = p[1];
                if (a.n < 1 || b.n < 1 || a.d < 2 || b.d < 2) continue;
                if (a.n * b.d === b.n * a.d) continue;                       /* 值相等 */
                if (!reduced(a) || !reduced(b)) continue;                    /* 都用最簡分數 */
                if (level >= 4 && a.d === b.d) continue;
                var va = val(a), vb = val(b), top = kind === 'rand' ? VAL_MAX : VAL_CAP;
                if (Math.max(va, vb) > top || Math.min(va, vb) < VAL_MIN) continue;
                var gap = Math.abs(va - vb) / Math.max(va, vb);
                if (gap >= g * 0.75 * f && gap <= g * 1.3 / f) {
                    var big = va > vb ? a : b, small = va > vb ? b : a;
                    if (bigLeft == null) bigLeft = rand() < 0.5;
                    return { left: bigLeft ? big : small, right: bigLeft ? small : big, bigLeft: bigLeft, gap: gap, kind: kind };
                }
            }
            f *= 0.6;                                                         /* 放寬接受範圍再試 */
        }
        return null;
    }
    /* 帶小數點：把其中一個分數的分子分母同乘 0.5（分子分母都至少 3、至少有一個是奇數才會出現小數），值不變 */
    function decimalize(q, rand) {
        var order = rand() < 0.5 ? ['left', 'right'] : ['right', 'left'];
        for (var i = 0; i < 2; i++) {
            var f = q[order[i]], other = q[order[1 - i]];
            /* 改寫之後兩張卡的分母不能變成一樣（第 4 題起的規則） */
            if (f.n >= 3 && f.d >= 3 && (f.n % 2 !== 0 || f.d % 2 !== 0) && f.d / 2 !== other.d) { q[order[i]] = { n: f.n / 2, d: f.d / 2 }; q.decimal = true; return q; }
        }
        return q;
    }
    /* 出題：回傳 { left, right, bigLeft, gap, kind, decimal }；bigLeft 指定大的在左邊（不給就隨機）；kind 指定題型（不給就依題號抽） */
    function makeQuestion(level, rand, bigLeft, kind) {
        rand = rand || Math.random;
        var g = gapAt(level), cap = capFor(level, rand);
        if (!kind) kind = kit.pick(kindsAt(level), rand);
        var q = search(kind, g, cap, level, rand, bigLeft) || (kind !== 'rand' && search('rand', g, cap, level, rand, bigLeft));
        if (!q) {
            var fb = bigLeft === false ? { left: { n: 3, d: 7 }, right: { n: 5, d: 11 } } : { left: { n: 5, d: 11 }, right: { n: 3, d: 7 } };
            q = { left: fb.left, right: fb.right, bigLeft: bigLeft !== false, gap: Math.abs(val(fb.left) - val(fb.right)) / Math.max(val(fb.left), val(fb.right)), kind: 'rand' };
        }
        q.decimal = false;
        if (level >= DEC_FROM && rand() < DEC_P) decimalize(q, rand);
        return q;
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
    /* 數字的寫法：整數直接寫，帶小數的寫一位 */
    function fmtNum(x) { return Math.round(x) === x ? String(x) : x.toFixed(1); }
    function fmtFrac(f) { return fmtNum(f.n) + '/' + fmtNum(f.d); }
    /* 卡片上數字的字級等級（依最長的那個數字的字數）：字越多越小，才放得進卡片 */
    function sizeClass(f) {
        var len = Math.max(fmtNum(f.n).length, fmtNum(f.d).length);
        return len <= 2 ? 'fd-frac--s2' : (len === 3 ? 'fd-frac--s3' : (len === 4 ? 'fd-frac--s4' : (len === 5 ? 'fd-frac--s5' : 'fd-frac--s6')));
    }
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
        return h('div', { 'class': 'fd-frac ' + sizeClass(f) }, [
            h('div', { 'class': 'fd-n', text: fmtNum(f.n) }),
            h('div', { 'class': 'fd-bar' }),
            h('div', { 'class': 'fd-d', text: fmtNum(f.d) })
        ]);
    }

    function setup(api, hist) {
        var stage = api.stage, level = api.level;
        var bl = nextBigLeft(hist, api.rand);
        var q = makeQuestion(level, api.rand, bl);
        hist.push(q.bigLeft);
        api.info = q;
        console.log('[分數大對決] 第 ' + level + ' 題（' + q.kind + (q.decimal ? '，帶小數' : '') + '）：' + fmtFrac(q.left) + ' 對 ' + fmtFrac(q.right) + '，較大在' + (q.bigLeft ? '左' : '右') + '，差距 ' + (q.gap * 100).toFixed(2) + '%（目標 ' + (gapAt(level) * 100).toFixed(2) + '%），限時 ' + timeMs(level) + ' ms');
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
            info.textContent = fmtFrac(q.left) + ' ＝ ' + val(q.left).toFixed(4) + '　' + fmtFrac(q.right) + ' ＝ ' + val(q.right).toFixed(4) + (KIND_HINT[q.kind] ? '\n' + KIND_HINT[q.kind] : '');
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
                api.fail({ delay: 2600, lines: [
                    (pickLeft == null ? '時間到！' : '選錯了：') + fmtFrac(q.left) + ' 對 ' + fmtFrac(q.right),
                    fmtFrac(q.left) + ' ＝ ' + val(q.left).toFixed(4) + '，' + fmtFrac(q.right) + ' ＝ ' + val(q.right).toFixed(4),
                    '兩個分數只差 ' + (q.gap * 100).toFixed(4) + '%',
                    KIND_HINT[q.kind]
                ].filter(function (x) { return x; }) });
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
        rule: '兩個分數卡，**點比較大的那一張**。作答時不會顯示小數，**要靠數感判斷**。小心：**分子一樣、分子分母各差 1、分母是倍數但分子故意差一點**這些陷阱題。後面還會有三位數、帶小數點的分數。答錯或來不及就結束，看你能連續答對幾題。越後面，兩個分數差得越少、時間越短。',
        mount: mount,
        score: SCORE,
        test: { kindsAt: kindsAt, fmtNum: fmtNum, fmtFrac: fmtFrac, sizeClass: sizeClass, KIND_FROM: KIND_FROM, KINDS: KINDS, BIG_FROM: BIG_FROM, BIG_P: BIG_P, CAP2: CAP2, CAP3: CAP3, DEC_FROM: DEC_FROM, DEC_P: DEC_P, VAL_CAP: VAL_CAP, DEN: DEN, gapAt: gapAt, timeMs: timeMs, denMax: denMax, val: val, makeQuestion: makeQuestion, nextBigLeft: nextBigLeft, rating: rating, RAMP_LEVELS: RAMP_LEVELS, GAP_START: GAP_START, GAP_END: GAP_END, VAL_MIN: VAL_MIN, VAL_MAX: VAL_MAX, MAX_LEVEL: MAX_LEVEL, SAME_SIDE: SAME_SIDE }
    };
    Reaction.register(G);
})();
