/* ═══════════════════════════════════════════════════════════════════
   reaction_timeafter.js — 秒反應・幾點幾分後（企劃 129）
   生活裡的時間算術：「現在是 10:45，過了 135 分鐘是幾點？」下面兩個時間（13:00 與 13:20），點出正確的那一個。
   錯的那個是常見的算錯方式（把 135 分鐘當成 1 小時 35 分、忘了加零頭、差一個小時…）。
   後面的關卡還會「倒推」：「比賽 9:30 開始，路上要 47 分鐘，最晚幾點出門？」。
   關卡制：答錯或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 時間一律用「從 0:00 起算的分鐘數」計算（0～1439），顯示成 HH:MM（24 小時制，兩位數）。
   · 難度線性（RAMP_LEVELS 題走到頂）：分鐘數範圍 25～80 → 90～330；前 BEFORE_FROM−1 題只有「往後加」，
     之後「倒推」的機率 20% → 50%；分鐘數一開始是 5 的倍數，從第 STEP1_FROM 題起任意分鐘；限時 10 → 6 秒。
   · 錯誤答案的種類：把三位數分鐘讀成「時：分」（135 → 1:35）、只加整點小時忘了零頭、差 1 小時、差 5／10 分鐘。
   · 答錯／逾時：算法拆開給你看（10:45 先加 2 小時 ＝ 12:45，再加 15 分鐘 ＝ 13:00）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'timeafter';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var ANS_S = [10, 6];                        /* 作答限時（秒）：第 1 題 → 到頂 */
    var D_MIN = [25, 90], D_MAX = [80, 330];    /* 要加（減）的分鐘數範圍：第 1 題 → 到頂 */
    var STEP1_FROM = 10;                        /* 第幾題起分鐘數不再限定是 5 的倍數 */
    var BEFORE_FROM = 8;                        /* 第幾題起出現「倒推」題 */
    var BEFORE_P = [0.2, 0.5];                  /* 「倒推」的機率：BEFORE_FROM 題 → 到頂 */
    var MAX_LEVEL = 60;
    var SAME_MAX = 4;                           /* 正確答案放左邊（或右邊）最多連續幾次 */
    var DAY = 1440;
    /* 題目說法（{t} 是時間、{d} 是分鐘數）。短一點，手機上最多三行 */
    var TPL_AFTER = [
        '現在是 {t}，過了 {d} 分鐘是幾點？',
        '電影 {t} 開演，演 {d} 分鐘，幾點散場？',
        '{t} 開始煮湯，要煮 {d} 分鐘，幾點煮好？',
        '{t} 出發，車程 {d} 分鐘，幾點到？'
    ];
    var TPL_BEFORE = [
        '比賽 {t} 開始，路上要 {d} 分鐘，最晚幾點出門？',
        '{t} 要到醫院，車程 {d} 分鐘，最晚幾點出發？',
        '{t} 要吃飯，煮飯要 {d} 分鐘，最晚幾點開始煮？'
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    function fmtTime(m) {
        var hh = Math.floor(m / 60), mm = m % 60;
        return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }
    function beforeP(level) { return level < BEFORE_FROM ? 0 : kit.ramp(level, BEFORE_P[0], BEFORE_P[1], RAMP_LEVELS); }
    /* 把「過了多久」拆成小時＋零頭，產生揭曉文字 */
    function explain(kind, start, delta, ans) {
        var H = Math.floor(delta / 60), R = delta % 60, sgn = kind === 'after' ? 1 : -1, verb = kind === 'after' ? '加' : '減';
        var parts = [], cur = start;
        if (H > 0) { cur += sgn * H * 60; parts.push('先' + verb + ' ' + H + ' 小時 ＝ ' + fmtTime(cur)); }
        if (R > 0) { cur += sgn * R; parts.push((H > 0 ? '再' : '') + verb + ' ' + R + ' 分鐘 ＝ ' + fmtTime(cur)); }
        return fmtTime(start) + ' ' + parts.join('，');
    }
    /* 錯誤答案候選：[{ m 分鐘數, kind 種類, w 權重 }]，全部在 0～1439、而且不等於正確答案 */
    function decoyCandidates(kind, start, delta, ans, level) {
        var sgn = kind === 'after' ? 1 : -1, hard = kit.ramp(level, 0, 1, RAMP_LEVELS), c = [];
        function add(m, k, w) { if (m >= 0 && m < DAY && m !== ans) c.push({ m: m, kind: k, w: w }); }
        /* 三位數分鐘讀成「時：分」：135 → 1 小時 35 分 ＝ 95 分鐘 */
        if (delta >= 100 && delta % 100 < 60) add(start + sgn * (Math.floor(delta / 100) * 60 + delta % 100), 'misread', 3);
        /* 只加（減）整點小時、忘了零頭 */
        if (delta % 60 !== 0 && delta >= 60) add(start + sgn * Math.floor(delta / 60) * 60, 'noRemainder', 2);
        /* 差 1 小時（進位算錯） */
        add(ans + 60, 'hour', 2); add(ans - 60, 'hour', 2);
        /* 差 10 分鐘、5 分鐘 */
        add(ans + 10, 'ten', 1 + hard); add(ans - 10, 'ten', 1 + hard);
        add(ans + 5, 'five', 0.5 + hard); add(ans - 5, 'five', 0.5 + hard);
        return c;
    }
    /* 出一題：{ kind, start, delta, ans, decoy, decoyKind, text, explain } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var step = level >= STEP1_FROM ? 1 : 5;
        for (var tr = 0; tr < 500; tr++) {
            var kind = rand() < beforeP(level) ? 'before' : 'after';
            var dLo = Math.round(kit.ramp(level, D_MIN[0], D_MIN[1], RAMP_LEVELS)), dHi = Math.round(kit.ramp(level, D_MAX[0], D_MAX[1], RAMP_LEVELS));
            dLo = Math.ceil(dLo / step) * step; dHi = Math.floor(dHi / step) * step;     /* 前期範圍的頭尾也要是 5 的倍數 */
            var delta = Math.round(kit.randInt(dLo, dHi, rand) / step) * step;
            var start = kit.randInt(6 * 60, 20 * 60, rand);              /* 起始時間 06:00～20:00 */
            if (step === 5) start = Math.round(start / 5) * 5;
            var ans = kind === 'after' ? start + delta : start - delta;
            if (ans < 0 || ans >= DAY) continue;
            var c = decoyCandidates(kind, start, delta, ans, level);
            if (!c.length) continue;
            var total = c.reduce(function (a, x) { return a + x.w; }, 0), x = rand() * total, pick = c[c.length - 1];
            for (var i = 0; i < c.length; i++) { x -= c[i].w; if (x <= 0) { pick = c[i]; break; } }
            var tpl = kit.pick(kind === 'after' ? TPL_AFTER : TPL_BEFORE, rand);
            return {
                kind: kind, start: start, delta: delta, ans: ans, decoy: pick.m, decoyKind: pick.kind,
                text: tpl.replace('{t}', fmtTime(start)).replace('{d}', String(delta)), explain: explain(kind, start, delta, ans)
            };
        }
        return { kind: 'after', start: 645, delta: 135, ans: 780, decoy: 740, decoyKind: 'misread', text: '現在是 10:45，過了 135 分鐘是幾點？', explain: explain('after', 645, 135, 780) };
    }
    function nextLeft(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    function rating(n) {
        if (n >= 40) return '時間管理大師！';
        if (n >= 25) return '算時間很快！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '六十進位要小心，再來一次！';
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

    function setup(api, hist) {
        var stage = api.stage, level = api.level;
        var q = makeQuestion(level, api.rand);
        var truthLeft = nextLeft(hist, api.rand);
        hist.push(truthLeft);
        api.info = q;
        console.log('[幾點幾分後] 第 ' + level + ' 題：' + q.text + ' 正確 ' + fmtTime(q.ans) + '，錯誤 ' + fmtTime(q.decoy) + '（' + q.decoyKind + '），限時 ' + ansMs(level) + ' ms');

        var qEl = h('div', { 'class': 'qz-mid taf-q', text: q.text });
        var reveal = h('div', { 'class': 'qz-note taf-reveal' });
        stage.appendChild(qEl); stage.appendChild(reveal);
        var vals = truthLeft ? [q.ans, q.decoy] : [q.decoy, q.ans];
        var grid = kit.btnGrid(stage, vals.map(function (m) {
            return { text: fmtTime(m), kind: 'sky', cls: 'taf-btn', onTap: function () { judge(m); } };
        }), { h: 120 });
        var bRight = grid.btns[truthLeft ? 0 : 1];
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('timeafter.hint')) kit.hintOn(stage, bRight, { mode: 'tap', delay: 500, text: '請點擊時間' });

        function judge(m) {
            if (api.over) return;
            var ok = m === q.ans;
            qEl.classList.add(ok ? 'qz-ok' : 'qz-bad');
            reveal.textContent = q.explain;
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2400, lines: [
                (m == null ? '時間到！' : '你選了 ' + fmtTime(m)) + '，正確是 ' + fmtTime(q.ans),
                q.explain
            ] });
        }
        api.solve = function () { judge(q.ans); };
        api.wrong = function () { judge(q.decoy); };
    }

    var G = {
        id: ID,
        name: '幾點幾分後',
        rule: '生活裡的時間算術，例如「現在是 10:45，過了 135 分鐘是幾點？」\n下面有兩個時間，**點出正確的那一個**；錯的那個是常見的算錯方式。後面還會**「倒推」出門時間**。答錯或來不及就結束，看你能連續答對幾題。',
        mount: mount,
        score: SCORE,
        test: {
            ansMs: ansMs, fmtTime: fmtTime, beforeP: beforeP, explain: explain, decoyCandidates: decoyCandidates, makeQuestion: makeQuestion, nextLeft: nextLeft, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ANS_S: ANS_S, D_MIN: D_MIN, D_MAX: D_MAX, STEP1_FROM: STEP1_FROM, BEFORE_FROM: BEFORE_FROM, BEFORE_P: BEFORE_P, MAX_LEVEL: MAX_LEVEL, SAME_MAX: SAME_MAX
        }
    };
    Reaction.register(G);
})();
