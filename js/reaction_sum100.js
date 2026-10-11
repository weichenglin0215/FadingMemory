/* ═══════════════════════════════════════════════════════════════════
   reaction_sum100.js — 秒反應・湊百消除
   16 張數字牌（4×4），點兩張加起來剛好 100 就消除，全部消完為止。計時，點錯一組罰 3 秒。
   介面不顯示「已選合計」（不替你記帳）。成績＝用時（含罰秒，越短越好）。
   ───────────────────────────────────────────────────────────────────
   · 8 對互補數 (a, 100−a)，a 取 A_MIN～A_MAX（11～49），8 個 a 互不相同、也不含 50，
     所以 16 個數字都不同，每個數字的互補數只有一張 → 配對唯一。
   · 陷阱：至少 NEAR_MIN 組「差一點」（不是一對，但加起來是 90 或 110，例如 47＋63）；
     進位算錯的人會被誘導。出題用重抽法，抽不夠就取最多的那一組。
   · 計時從按「開始」才算；點同一張兩次是取消選取。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'sum100';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 秒', label: '用時', min: 0, max: 600 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var PAIRS = 8, A_MIN = 11, A_MAX = 49;      /* 8 對、較小的數在 11～49 */
    var NEAR_MIN = 6;                           /* 至少幾組「差一點」（和是 90 或 110） */
    var PENALTY_MS = 3000;                      /* 每點錯一組罰幾毫秒 */
    var TRIES = 4000;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 有幾組「差一點」：不是互補、但和是 90 或 110 */
    function nearMiss(cards) {
        var n = 0;
        for (var i = 0; i < cards.length; i++) for (var j = i + 1; j < cards.length; j++) {
            var s = cards[i] + cards[j];
            if (s !== 100 && (s === 90 || s === 110)) n++;
        }
        return n;
    }
    /* 出牌：回傳 { cards: [16 個數字（已洗牌）], near } */
    function makeBoard(rand) {
        rand = rand || Math.random;
        var best = null;
        for (var t = 0; t < TRIES; t++) {
            var pool = []; for (var a = A_MIN; a <= A_MAX; a++) pool.push(a);
            var picks = kit.shuffle(pool, rand).slice(0, PAIRS), cards = [];
            picks.forEach(function (a) { cards.push(a, 100 - a); });
            var near = nearMiss(cards);
            if (!best || near > best.near) best = { cards: cards, near: near };
            if (near >= NEAR_MIN) break;
        }
        return { cards: kit.shuffle(best.cards, rand), near: best.near };
    }
    function rating(sec) {
        if (sec < 12) return '心算快手！';
        if (sec < 20) return '高手！';
        if (sec < 35) return '不錯喔！';
        return '再來一次，會更快！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '點兩張加起來剛好 100 的牌，全部消完',
            numText: function (v) { return v.toFixed(4) + ' 秒'; },
            rating: rating,
            sfx: function (v) { return v < 20 ? 'perfect' : (v < 40 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var bd = makeBoard(), cards = bd.cards, state = [], sel = -1, remaining = cards.length, errors = 0, started = false, firstBad = null, hint = null;
        console.log('[湊百消除] 牌面 ' + cards.join(',') + '；差一點的組合 ' + bd.near + ' 組');

        var clockWrap = h('div', { 'class': 'sm-clock' });
        stage.appendChild(clockWrap);
        var clock = kit.clock(clockWrap, my);
        var grid = h('div', { 'class': 'sm-grid' });
        var els = cards.map(function (n, i) {
            var el = h('div', { 'class': 'sm-card', text: String(n) });
            state.push('on');
            kit.onTap(el, function () { tap(i); });
            grid.appendChild(el);
            return el;
        });
        stage.appendChild(grid);
        var info = h('div', { 'class': 'sm-info', text: '失誤 0 次（每次 + 3 秒）' });
        stage.appendChild(info);

        function begin() {
            if (started) return;
            started = true; clock.start();
            /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「第一組加起來是 100 的牌」的第一張上 */
            if (kit.once('sum100.hint')) {
                var pa = -1;
                for (var i0 = 0; i0 < cards.length && pa < 0; i0++) for (var j0 = i0 + 1; j0 < cards.length; j0++) if (cards[i0] + cards[j0] === 100) { pa = i0; break; }
                if (pa >= 0) hint = kit.hintOn(stage, els[pa], { mode: 'tap', delay: 300, text: '請點擊兩張加起來是 100 的牌' });
            }
        }
        var cover = kit.startCover(stage, { text: '16 張牌，點兩張加起來剛好 100 就會消除。\n點錯一組加 3 秒，全部消完就結束。', onStart: begin });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        function tap(i) {
            if (!started || state[i] !== 'on') return;
            hideHint();
            if (sel === i) { els[i].classList.remove('sm-card--sel'); sel = -1; Sfx.play('click'); return; }
            if (sel < 0) { sel = i; els[i].classList.add('sm-card--sel'); Sfx.play('click'); return; }
            var j = sel; sel = -1;
            if (cards[i] + cards[j] === 100) {
                [i, j].forEach(function (k) { state[k] = 'gone'; els[k].classList.remove('sm-card--sel'); els[k].classList.add('sm-card--gone'); });
                remaining -= 2; Sfx.play('ok');
                if (remaining === 0) finish();
            } else {
                errors++;
                if (!firstBad) firstBad = cards[j] + ' ＋ ' + cards[i] + ' ＝ ' + (cards[j] + cards[i]);
                [i, j].forEach(function (k) { els[k].classList.remove('sm-card--sel'); els[k].classList.add('sm-card--bad'); });
                my.after(420, function () { [i, j].forEach(function (k) { els[k].classList.remove('sm-card--bad'); }); });
                clock.penalty(PENALTY_MS); Sfx.play('bad');
                info.textContent = '失誤 ' + errors + ' 次（每次 + 3 秒）';
            }
        }
        function finish() {
            var ms = clock.stop(), sec = ms / 1000;
            my.after(700, function () {
                api.finish(sec, { lines: [
                    '失誤 ' + errors + ' 次，罰時 ' + (errors * PENALTY_MS / 1000).toFixed(4) + ' 秒',
                    firstBad ? '最容易誤判的組合：' + firstBad : '一組都沒配錯！',
                    '個位數加起來湊 10、十位數加起來湊 9，是最快的算法'
                ] });
            });
        }

        function pairs() {
            var out = [];
            for (var i = 0; i < cards.length; i++) for (var j = i + 1; j < cards.length; j++) if (cards[i] + cards[j] === 100) out.push([i, j]);
            return out;
        }
        G.debug = {
            state: function () { return { cards: cards, remaining: remaining, errors: errors, started: started }; },
            start: function () { cover.remove(); begin(); },
            solve: function () { cover.remove(); begin(); pairs().forEach(function (p) { tap(p[0]); tap(p[1]); }); },
            wrong: function () {
                cover.remove(); begin();
                var done = false;
                for (var i = 0; i < cards.length && !done; i++) for (var j = i + 1; j < cards.length && !done; j++) if (cards[i] + cards[j] !== 100) { tap(i); tap(j); done = true; }
                pairs().forEach(function (p) { tap(p[0]); tap(p[1]); });
            }
        };
    }

    var G = {
        id: ID,
        name: '湊百消除',
        rule: '16 張數字牌，**每次點兩張，加起來剛好是 100 就會消除**，全部消完為止。畫面不會幫你加總，要自己算！小心「差一點」的組合（例如 47 和 63 是 110）。**點錯一組加 3 秒**，用時越短越好。',
        mount: mount,
        score: SCORE,
        test: { nearMiss: nearMiss, makeBoard: makeBoard, rating: rating, PAIRS: PAIRS, A_MIN: A_MIN, A_MAX: A_MAX, NEAR_MIN: NEAR_MIN, PENALTY_MS: PENALTY_MS }
    };
    Reaction.register(G);
})();
