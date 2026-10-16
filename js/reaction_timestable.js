/* ═══════════════════════════════════════════════════════════════════
   reaction_timestable.js — 秒反應・乘法表抓錯
   9×9 乘法表有 FOUND（9）格的答案被偷偷改過，找出來。計時，點錯一格罰 3 秒（同一格不重複罰）。
   成績＝找齊 FOUND 格的用時（含罰秒，越短越好）。
   ───────────────────────────────────────────────────────────────────
   · V1.32（玩家意見）：過關標準從找出 3 個錯誤改成 FOUND＝9 個。第一次進遊戲時，系統會用手指提示自動引導玩家找出第一個錯誤，
     玩家只要再找 8 個太不公平，所以第一次進遊戲改成多改 HINT_EXTRA（1）格＝共 10 格：系統引導 1 格、玩家自己找 9 格（跟之後每次一樣多）。
     用時變長很多，舊的最佳紀錄清掉（migrateBest）。
   · 被改的格子：不在第 1 列、第 1 行，也不在對角線（對角線沒有對稱格可以交叉檢查）；
     每一格的對稱格（b×a）保持正確，也不會被選成被改的格子（所以任何一格都可以用對稱格交叉檢查）；
     乘法表只有 8 列（2～9）可以改，9～10 格放不進「每列每行各一格」，所以同一列、同一行最多 LINE_MAX（2）格，盡量平均分散在整張表。
   · V1.28（玩家意見）揭曉動畫：找齊 3 格之後，3 個被改的答案一起改成「紅底白字」閃爍 BLINK_MS（1.5 秒），
     閃完維持紅底白字 HOLD_MS（1.5 秒），讓玩家看清楚，才跳出結算彈窗。
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
    var FOUND = 9;                              /* 要找出的被改格子數（過關標準；V1.32 起從 3 格改成 9 格） */
    var HINT_EXTRA = 1;                         /* 第一次進遊戲時，系統會引導玩家找出第一格；為了公平，這時多改幾格（玩家自己還是要找 FOUND 格） */
    var LINE_MAX = 2;                           /* 同一列、同一行最多幾格被改（乘法表只有 8 列可以改，格數多就放不進每列每行各一格） */
    var PENALTY_MS = 3000;                      /* 點錯一格罰幾毫秒 */
    var BLINK_MS = 1500;                        /* 找齊之後，錯誤答案紅底白字閃爍多久 */
    var HOLD_MS = 1500;                         /* 閃完之後，維持紅底白字多久才出現結算 */
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
    /* 出題：回傳 { tampered: [{a, b, shown, truth, type}…] }，a 是列、b 是行（都是 2～N）；count＝要改幾格（預設 FOUND）。
       從「兩個乘數不同的組合（a、b 對調算同一組）」裡挑 count 組，每組隨機挑被改的是 a×b 還是 b×a（另一格保持正確）；
       同一列、同一行最多 LINE_MAX 格（隨機試了很多次還不行才逐步放寬） */
    function makeTable(rand, count) {
        rand = rand || Math.random;
        var pairs = [], x, y;
        for (x = 2; x <= N; x++) for (y = x + 1; y <= N; y++) pairs.push([x, y]);
        count = Math.max(1, Math.min(count == null ? FOUND : count, pairs.length));
        var list = null;
        for (var tries = 0; tries < 1500 && !list; tries++) {
            var lineMax = LINE_MAX + Math.floor(tries / 500), pick = kit.shuffle(pairs, rand).slice(0, count), rowN = {}, colN = {}, cand = [], good = true;
            for (var i = 0; i < pick.length && good; i++) {
                var flip = rand() < 0.5, ca = flip ? pick[i][1] : pick[i][0], cb = flip ? pick[i][0] : pick[i][1];
                rowN[ca] = (rowN[ca] || 0) + 1; colN[cb] = (colN[cb] || 0) + 1;
                if (rowN[ca] > lineMax || colN[cb] > lineMax) good = false;
                cand.push({ a: ca, b: cb });
            }
            if (good) list = cand;
        }
        if (!list) list = pairs.slice(0, count).map(function (p) { return { a: p[1], b: p[0] }; });      /* 保底（用不到）：固定挑前幾組 */
        return {
            tampered: list.map(function (c) {
                var type = kit.pick(TYPES, rand), shown = tamper(c.a, c.b, type, rand);
                return { a: c.a, b: c.b, shown: shown, truth: c.a * c.b, type: type };
            })
        };
    }
    var TYPE_NAME = { ones: '個位數差 1', tens: '十位數差 1', neighbor: '寫成了隔壁格的答案', swap: '十位和個位對調' };
    function rating(sec) {
        if (sec < 30) return '九九神童！';
        if (sec < 55) return '高手！';
        if (sec < 90) return '不錯喔！';
        return '再來一次，會更快！';
    }

    function mount(root, ctx) {
        /* V1.32：要找的格子從 3 格變成 9 格，用時跟舊版不能比（舊的最佳紀錄一定比較短）：第一次進來清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.v132');
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '乘法表的答案被偷偷改過，把它們全部找出來',
            numText: function (v) { return v.toFixed(4) + ' 秒'; },
            rating: rating,
            sfx: function (v) { return v < 45 ? 'perfect' : (v < 90 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var first = kit.once('timestable.hint'), total = FOUND + (first ? HINT_EXTRA : 0);      /* 第一次進遊戲：系統會引導找出第一格，所以多改 HINT_EXTRA 格，玩家自己還是找 FOUND 格 */
        var tb = makeTable(null, total), found = 0, errors = 0, started = false, hint = null, wrongSet = {};
        var bad = {}; tb.tampered.forEach(function (c) { bad[c.a + ',' + c.b] = c; });
        console.log('[乘法表抓錯] ' + (first ? '第一次進遊戲（系統引導 1 格、玩家找 ' + FOUND + ' 格）' : '') + '被改的 ' + total + ' 格：' + tb.tampered.map(function (c) { return c.a + '×' + c.b + '＝' + c.shown + '（正解 ' + c.truth + '，' + TYPE_NAME[c.type] + '）'; }).join('；'));

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
        var info = h('div', { 'class': 'tt-info', text: '還有 ' + total + ' 格　點錯 0 次（每次 + 3 秒）' });
        stage.appendChild(info);

        function begin() {
            if (started) return;
            started = true; clock.start();
            /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「被偷改的格子」上（第一次的正確答案之一） */
            if (first) hint = kit.hintOn(stage, els[tb.tampered[0].a + ',' + tb.tampered[0].b], { mode: 'tap', delay: 300, text: '請點擊答案算錯的格子' });
        }
        var cover = kit.startCover(stage, { text: first ? ('9×9 乘法表裡有 ' + total + ' 格答案被偷偷改了。\n系統先指出第 1 格，其他 ' + FOUND + ' 格要自己找！點錯一格加 3 秒。') : ('9×9 乘法表裡有 ' + total + ' 格答案被偷偷改了。\n找出來！點錯一格加 3 秒。'), onStart: begin });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        function tap(r, c) {
            if (!started || found >= total) return;
            hideHint();
            var key = r + ',' + c, el = els[key], cell = bad[key];
            if (cell) {
                if (el.classList.contains('tt-cell--found')) return;
                el.classList.add('tt-cell--found'); el.textContent = cell.shown + '→' + cell.truth;
                found++; Sfx.play('ok');
                info.textContent = '還有 ' + (total - found) + ' 格　點錯 ' + errors + ' 次（每次 + 3 秒）';
                if (found === total) finish();
            } else {
                if (wrongSet[key]) return;
                wrongSet[key] = true; errors++;
                el.classList.add('tt-cell--bad'); clock.penalty(PENALTY_MS); Sfx.play('bad');
                my.after(500, function () { el.classList.remove('tt-cell--bad'); });
                info.textContent = '還有 ' + (total - found) + ' 格　點錯 ' + errors + ' 次（每次 + 3 秒）';
            }
        }
        function finish() {
            var sec = clock.stop() / 1000;
            /* 揭曉：被改的答案一起變成紅底白字閃爍 BLINK_MS，再維持 HOLD_MS，才結算 */
            tb.tampered.forEach(function (c) {
                var el = els[c.a + ',' + c.b];
                el.classList.remove('tt-cell--found'); el.classList.add('tt-cell--wrong', 'tt-cell--blink');
            });
            Sfx.play('bad');
            my.after(BLINK_MS, function () { tb.tampered.forEach(function (c) { els[c.a + ',' + c.b].classList.remove('tt-cell--blink'); }); });
            my.after(BLINK_MS + HOLD_MS, function () {
                /* 被改的格子很多（9～10 格），結算只列前 3 格當例子（全部都已經用紅底白字標在表上了） */
                var ex = tb.tampered.slice(0, 3).map(function (c) { return c.a + '×' + c.b + ' 被改成 ' + c.shown + '，應該是 ' + c.truth + '（' + TYPE_NAME[c.type] + '）'; });
                if (tb.tampered.length > 3) ex.push('…一共 ' + tb.tampered.length + ' 格被改過，都標成紅底白字了');
                api.finish(sec, { lines: ex.concat(['點錯 ' + errors + ' 次，罰時 ' + (errors * PENALTY_MS / 1000).toFixed(4) + ' 秒']) });
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
        rule: '9×9 乘法表裡**有 9 格的答案被偷偷改過，找出它們**。背過九九乘法表的人很有利，也可以利用對稱（3×7 和 7×3 一樣）來檢查。**點錯一格加 3 秒**，找齊 9 格就結束，用時越短越好。第一次玩時會多改 1 格（共 10 格），系統先指出第 1 格，你只要再找 9 格。',
        mount: mount,
        score: SCORE,
        test: { BLINK_MS: BLINK_MS, HOLD_MS: HOLD_MS, tamper: tamper, makeTable: makeTable, rating: rating, N: N, FOUND: FOUND, HINT_EXTRA: HINT_EXTRA, LINE_MAX: LINE_MAX, PENALTY_MS: PENALTY_MS, TYPES: TYPES }
    };
    Reaction.register(G);
})();
