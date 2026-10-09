/* ═══════════════════════════════════════════════════════════════════
   reaction_timestable.js — 秒反應・乘法表抓錯
   9×9 乘法表有 3 格的答案被偷偷改過，找出來。計時，點錯一格罰 3 秒（同一格不重複罰）。
   成績＝找齊 3 格的用時（含罰秒，越短越好）。
   ───────────────────────────────────────────────────────────────────
   · 被改的格子：不在第 1 列、第 1 行，也不在對角線（對角線沒有對稱格可以交叉檢查）；
     3 格分在三個不同的列、三個不同的行；每一格的對稱格（b×a）保持正確，也不會被選成被改的格子。
   · 改法（每格隨機一種）：個位 ±1（42→43）、十位 ±1（42→52）、取鄰格的答案（6×7 寫成 6×8＝48）、
     兩位數對調（63→36）；改後一定不等於正解、是正數。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'timestable';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 秒', label: '用時', min: 0, max: 600 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var N = 9;                                  /* 乘法表大小（N×N） */
    var FOUND = 3;                              /* 被改的格子數 */
    var PENALTY_MS = 3000;                      /* 點錯一格罰幾毫秒 */
    var CELL = 46;                              /* 每格大小（px） */
    var TYPES = ['ones', 'tens', 'neighbor', 'swap'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 把正解 truth 改成「看起來合理但錯誤」的數字；a、b 是這格的乘數 */
    function tamper(a, b, type, rand) {
        rand = rand || Math.random;
        var truth = a * b, v = truth;
        if (type === 'ones') v = truth + (rand() < 0.5 ? 1 : -1);
        else if (type === 'tens') v = truth + (rand() < 0.5 ? 10 : -10);
        else if (type === 'neighbor') {
            var opts = [];
            if (b > 1) opts.push(a * (b - 1)); if (b < N) opts.push(a * (b + 1));
            if (a > 1) opts.push((a - 1) * b); if (a < N) opts.push((a + 1) * b);
            v = kit.pick(opts, rand);
        } else {
            var t = Math.floor(truth / 10), o = truth % 10;
            v = truth >= 10 && t !== o ? o * 10 + t : truth + 1;
        }
        if (v === truth || v < 1) v = truth + 1;
        return v;
    }
    /* 出題：回傳 { tampered: [{a, b, shown, truth, type}…] }，a 是列、b 是行（都是 2～N） */
    function makeTable(rand) {
        rand = rand || Math.random;
        for (var tries = 0; tries < 500; tries++) {
            var rows = kit.shuffle([2, 3, 4, 5, 6, 7, 8, 9], rand).slice(0, FOUND);
            var cols = kit.shuffle([2, 3, 4, 5, 6, 7, 8, 9], rand).slice(0, FOUND), okSet = true, list = [];
            for (var i = 0; i < FOUND; i++) { if (rows[i] === cols[i]) { okSet = false; break; } list.push({ a: rows[i], b: cols[i] }); }
            if (!okSet) continue;
            /* 任何一格的對稱格也不能是被改的格子 */
            for (var x = 0; x < FOUND && okSet; x++) for (var y = 0; y < FOUND; y++) if (x !== y && list[x].a === list[y].b && list[x].b === list[y].a) okSet = false;
            if (!okSet) continue;
            return {
                tampered: list.map(function (c) {
                    var type = kit.pick(TYPES, rand), shown = tamper(c.a, c.b, type, rand);
                    return { a: c.a, b: c.b, shown: shown, truth: c.a * c.b, type: type };
                })
            };
        }
        return { tampered: [{ a: 6, b: 7, shown: 48, truth: 42, type: 'neighbor' }, { a: 8, b: 3, shown: 25, truth: 24, type: 'ones' }, { a: 9, b: 4, shown: 63, truth: 36, type: 'swap' }] };
    }
    var TYPE_NAME = { ones: '個位數差 1', tens: '十位數差 1', neighbor: '寫成了隔壁格的答案', swap: '十位和個位對調' };
    function rating(sec) {
        if (sec < 10) return '九九神童！';
        if (sec < 18) return '高手！';
        if (sec < 30) return '不錯喔！';
        return '再來一次，會更快！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '乘法表有 3 格答案被改過，把它們找出來',
            numText: function (v) { return v.toFixed(4) + ' 秒'; },
            rating: rating,
            sfx: function (v) { return v < 15 ? 'perfect' : (v < 30 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var tb = makeTable(), found = 0, errors = 0, started = false, hint = null, wrongSet = {};
        var bad = {}; tb.tampered.forEach(function (c) { bad[c.a + ',' + c.b] = c; });
        console.log('[乘法表抓錯] 被改的格子：' + tb.tampered.map(function (c) { return c.a + '×' + c.b + '＝' + c.shown + '（正解 ' + c.truth + '，' + TYPE_NAME[c.type] + '）'; }).join('；'));

        var clockWrap = h('div', { 'class': 'tt-clock' });
        stage.appendChild(clockWrap);
        var clock = kit.clock(clockWrap, my);
        var table = h('div', { 'class': 'tt-table' });
        table.style.gridTemplateColumns = 'repeat(' + (N + 1) + ', ' + CELL + 'px)';
        var els = {};
        for (var r = 0; r <= N; r++) for (var c = 0; c <= N; c++) (function (r, c) {
            var head = r === 0 || c === 0, txt = r === 0 && c === 0 ? '×' : (r === 0 ? String(c) : (c === 0 ? String(r) : String(bad[r + ',' + c] ? bad[r + ',' + c].shown : r * c)));
            var el = h('div', { 'class': 'tt-cell' + (head ? ' tt-cell--head' : ''), text: txt });
            if (!head) { els[r + ',' + c] = el; kit.onTap(el, function () { tap(r, c); }); }
            table.appendChild(el);
        })(r, c);
        stage.appendChild(table);
        var info = h('div', { 'class': 'tt-info', text: '還有 ' + FOUND + ' 格　點錯 0 次（每次 + 3 秒）' });
        stage.appendChild(info);

        function begin() {
            if (started) return;
            started = true; clock.start();
            hint = kit.fingerHint(stage, { mode: 'tap', x: 236 + 30, y: 56 + 5 * CELL, delay: 300 });
        }
        var cover = kit.startCover(stage, { text: '9×9 乘法表裡有 3 格答案被偷偷改了。\n找出來！點錯一格加 3 秒。', onStart: begin });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        function tap(r, c) {
            if (!started || found >= FOUND) return;
            hideHint();
            var key = r + ',' + c, el = els[key], cell = bad[key];
            if (cell) {
                if (el.classList.contains('tt-cell--found')) return;
                el.classList.add('tt-cell--found'); el.textContent = cell.shown + '→' + cell.truth;
                found++; Sfx.play('ok');
                info.textContent = '還有 ' + (FOUND - found) + ' 格　點錯 ' + errors + ' 次（每次 + 3 秒）';
                if (found === FOUND) finish();
            } else {
                if (wrongSet[key]) return;
                wrongSet[key] = true; errors++;
                el.classList.add('tt-cell--bad'); clock.penalty(PENALTY_MS); Sfx.play('bad');
                my.after(500, function () { el.classList.remove('tt-cell--bad'); });
                info.textContent = '還有 ' + (FOUND - found) + ' 格　點錯 ' + errors + ' 次（每次 + 3 秒）';
            }
        }
        function finish() {
            var sec = clock.stop() / 1000;
            my.after(900, function () {
                api.finish(sec, { lines: tb.tampered.map(function (c) { return c.a + '×' + c.b + ' 被改成 ' + c.shown + '，應該是 ' + c.truth + '（' + TYPE_NAME[c.type] + '）'; }).concat(['點錯 ' + errors + ' 次，罰時 ' + (errors * PENALTY_MS / 1000).toFixed(4) + ' 秒']) });
            });
        }

        G.debug = {
            state: function () { return { tampered: tb.tampered, found: found, errors: errors, started: started }; },
            start: function () { cover.remove(); begin(); },
            solve: function () { cover.remove(); begin(); tb.tampered.forEach(function (c) { tap(c.a, c.b); }); },
            wrong: function () { cover.remove(); begin(); tap(1 + (tb.tampered[0].a % 9 || 1), 1); tb.tampered.forEach(function (c) { tap(c.a, c.b); }); }
        };
    }

    var G = {
        id: ID,
        name: '乘法表抓錯',
        rule: '9×9 乘法表裡有 3 格的答案被偷偷改過，找出它們。背過九九乘法表的人很有利，也可以利用對稱（3×7 和 7×3 一樣）來檢查。點錯一格加 3 秒，找齊 3 格就結束，用時越短越好。',
        mount: mount,
        score: SCORE,
        test: { tamper: tamper, makeTable: makeTable, rating: rating, N: N, FOUND: FOUND, PENALTY_MS: PENALTY_MS, TYPES: TYPES }
    };
    Reaction.register(G);
})();
