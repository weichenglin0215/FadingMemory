/* ═══════════════════════════════════════════════════════════════════
   reaction_flipten.js — 秒反應・翻牌湊十（深思篇 509「翻牌湊十」）
   樣式：css/games/reaction_flipten.css（class 一律以「flipten-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：數字牌蓋著排成方陣（數字 1～9）。每次翻兩張：**加起來是 10 就消掉；不是就蓋回去。**全部消完就過關。
     **翻牌的次數有上限**（畫面上有「剩 N 次」）。每翻錯一次，兩張牌的數字會露出 SHOW_MS（預設 1.5 秒）再蓋回——
     這是給你看的時間，不是作答的時限；沒有計時，想多久都可以，但要記住它們在哪裡。
   · 頓悟：記位置＋心算互補數（1-9、2-8、3-7、4-6、5-5）。翻到 1 之後，要去找 9 在哪；翻過的牌要記得。
   · 關卡：8 張（第 1～5 關）→ 16 張（第 6～15 關）→ 24 張（第 16 關起，6 列 × 4 欄）。
   · 翻牌上限 ＝ 「完美記憶策略」在這個牌面要翻的次數 ＋ 寬限（第 1 → 30 關：SLACK 12 → 4）。
     完美記憶策略（perfectFlips）：永遠記得每張翻過的牌；只要記得的牌裡有一組湊成十，就翻它們；
     否則翻一張沒翻過的牌（由左上往右下），記得它的互補牌就去翻，不然再翻一張沒翻過的牌。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'flipten';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [{ cards: 8, to: 5 }, { cards: 16, to: 15 }, { cards: 24, to: 9999 }];     /* 牌的張數與這個階段的最後一關 */
    var COLS = 4;                               /* 每一列幾張 */
    var SLACK = [12, 4];                        /* 寬限：比完美記憶策略多出幾次：第 1 關 → 第 RAMP_LEVELS 關 */
    var RAMP_LEVELS = 30;
    var SHOW_MS = 1500;                         /* 翻錯時，兩張牌露出多久才蓋回（毫秒；不是作答時限） */
    var MATCH_MS = 650;                         /* 翻對時，兩張牌停多久才消掉 */
    var PASS_DELAY_MS = 1300;
    var FAIL_HOLD_MS = 6000;
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function cardsFor(level) {
        level = Math.max(1, level);
        for (var i = 0; i < STAGES.length; i++) if (level <= STAGES[i].to || i === STAGES.length - 1) return STAGES[i].cards;
    }
    function slackFor(level) { return Math.round(kit.ramp(level, SLACK[0], SLACK[1], RAMP_LEVELS)); }
    /* 發牌：n 張，一半是「一組一組湊成十」的牌（每組隨機是 1-9、2-8、3-7、4-6、5-5 其中一種），洗牌 */
    function deal(n, rand) {
        rand = rand || Math.random;
        var deck = [];
        for (var i = 0; i < n / 2; i++) { var a = kit.randInt(1, 5, rand); deck.push(a, 10 - a); }
        return kit.shuffle(deck, rand);
    }
    /* 完美記憶策略要翻幾次（一次＝翻兩張）。deck[i]＝第 i 格的數字 */
    function perfectFlips(deck) {
        var n = deck.length, gone = new Array(n).fill(false), known = new Array(n).fill(false), flips = 0, left = n;
        function knownPair() {
            for (var i = 0; i < n; i++) if (known[i] && !gone[i]) for (var j = i + 1; j < n; j++) if (known[j] && !gone[j] && deck[i] + deck[j] === 10) return [i, j];
            return null;
        }
        function firstUnknown(skip) { for (var i = 0; i < n; i++) if (!known[i] && !gone[i] && i !== skip) return i; return -1; }
        var guard = 0;
        while (left > 0 && guard++ < 1000) {
            var kp = knownPair();
            if (kp) { flips++; gone[kp[0]] = gone[kp[1]] = true; left -= 2; continue; }
            var u = firstUnknown(-1);
            if (u < 0) break;
            known[u] = true;
            /* 它的互補牌已經知道在哪裡？ */
            var mate = -1;
            for (var j = 0; j < n; j++) if (known[j] && !gone[j] && j !== u && deck[j] + deck[u] === 10) { mate = j; break; }
            if (mate >= 0) { flips++; gone[u] = gone[mate] = true; left -= 2; continue; }
            var u2 = firstUnknown(u);
            if (u2 < 0) break;
            known[u2] = true; flips++;
            if (deck[u] + deck[u2] === 10) { gone[u] = gone[u2] = true; left -= 2; }
        }
        return flips;
    }
    function limitFor(level, deck) { return perfectFlips(deck) + slackFor(level); }
    function makePuzzle(level, rand) {
        var n = cardsFor(level), deck = deal(n, rand), perfect = perfectFlips(deck);
        return { n: n, deck: deck, perfect: perfect, limit: perfect + slackFor(level), level: level };
    }
    function rating(n) {
        if (n >= 25) return '記憶力驚人！';
        if (n >= 12) return '記得很牢！';
        if (n >= 5) return '越來越有感覺了！';
        return '翻到的牌要記住位置，想想它的「互補數」在哪！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), n = pz.n, deck = pz.deck;
        api.info = pz;
        console.log('[翻牌湊十] 第 ' + level + ' 關：' + n + ' 張；完美記憶策略 ' + pz.perfect + ' 次，上限 ' + pz.limit + ' 次');
        var rows = n / COLS, W = stage.clientWidth || 472, H = stage.clientHeight || 700;
        var cw = Math.floor(W * 0.96 / COLS) - 8, ch = Math.min(Math.floor(cw * 0.95), Math.floor((H - 200) / rows) - 8);
        var up = [], gone = new Array(n).fill(false), pairsLeft = n / 2, used = 0, busy = false, over = false, first = -1;

        var wrap = h('div', { 'class': 'flipten-wrap' });
        var info = h('div', { 'class': 'flipten-info' });
        var board = h('div', { 'class': 'flipten-board' });
        board.style.setProperty('--flipten-cols', COLS);
        board.style.setProperty('--flipten-w', cw + 'px');
        board.style.setProperty('--flipten-h', ch + 'px');
        var tip = h('div', { 'class': 'flipten-tip', text: '翻兩張：加起來是 10 就消掉' });
        var cards = [];
        for (var i = 0; i < n; i++) {
            var c = h('div', { 'class': 'flipten-card', text: '' });
            (function (idx) { kit.onTap(c, function () { flip(idx); }); })(i);
            board.appendChild(c); cards.push(c);
        }
        wrap.appendChild(info); wrap.appendChild(board); wrap.appendChild(tip);
        stage.appendChild(wrap);

        function paint() {
            info.textContent = '還能翻 ' + Math.max(0, pz.limit - used) + ' 次　已消 ' + (n / 2 - pairsLeft) + '/' + n / 2;
            for (var i = 0; i < n; i++) {
                var show = up.indexOf(i) >= 0 || (over && !gone[i]);
                cards[i].className = 'flipten-card' + (gone[i] ? ' flipten-card--gone' : show ? ' flipten-card--up' : '') + (over && !gone[i] ? ' flipten-card--reveal' : '');
                cards[i].textContent = show && !gone[i] ? String(deck[i]) : '';
            }
        }
        function flip(i) {
            if (busy || over || gone[i] || up.indexOf(i) >= 0) return;
            up.push(i);
            if (up.length === 1) { first = i; paint(); return; }
            used++; busy = true; paint();
            var a = up[0], b = up[1];
            if (deck[a] + deck[b] === 10) {
                tip.textContent = deck[a] + ' + ' + deck[b] + ' = 10！';
                Sfx.play('ok');
                api.after(MATCH_MS, function () {
                    gone[a] = gone[b] = true; up = []; pairsLeft--; busy = false; first = -1; paint();
                    if (pairsLeft === 0) {
                        over = true; paint(); tip.textContent = '全部消完！用了 ' + used + ' 次（完美記憶策略 ' + pz.perfect + ' 次）';
                        kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS });
                    } else if (used >= pz.limit) failNow();
                    else tip.textContent = '翻兩張：加起來是 10 就消掉';
                });
            } else {
                tip.textContent = deck[a] + ' + ' + deck[b] + ' = ' + (deck[a] + deck[b]) + '，不是 10，記住位置！';
                api.after(SHOW_MS, function () {
                    up = []; busy = false; first = -1; paint();
                    if (used >= pz.limit) failNow(); else tip.textContent = '翻兩張：加起來是 10 就消掉';
                });
            }
        }
        function failNow() {
            over = true; busy = true; paint();
            var text = '次數用完了（上限 ' + pz.limit + '）。完美記憶只要 ' + pz.perfect + ' 次，剩下的牌翻開給你看。';
            tip.textContent = text;
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: [text] });
        }
        api.solve = function () {                  /* 驗證用：依完美記憶策略一組一組翻（直接找互補的兩格） */
            if (over) return;
            var idx = [];
            for (var i = 0; i < n; i++) if (!gone[i]) idx.push(i);
            for (var x = 0; x < idx.length; x++) for (var y = x + 1; y < idx.length; y++) {
                if (deck[idx[x]] + deck[idx[y]] === 10) { var a = idx[x], b = idx[y]; busy = false; flip(a); flip(b); return; }
            }
        };
        api.wrong = function () {                  /* 驗證用：故意翻兩張不湊十的牌，直到次數用完 */
            if (over) return;
            for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (!gone[i] && !gone[j] && deck[i] + deck[j] !== 10) { busy = false; flip(i); flip(j); return; }
        };
        api.state = function () { return { used: used, gone: gone.slice(), over: over, busy: busy }; };
        paint();
    }

    var G = {
        id: ID,
        name: '翻牌湊十',
        rule: '數字牌蓋著排成方陣（數字是 1～9）。**每次翻兩張：加起來是 10 就消掉；不是就蓋回去**。全部消完就過關。**翻牌的次數有上限**，畫面上會寫「還能翻幾次」。翻錯的時候，兩張牌的數字會停 1.5 秒再蓋回——那是給你看的時間，沒有計時，想多久都可以，但要記住它們在哪裡。提示：10 的搭檔是 1-9、2-8、3-7、4-6、5-5；翻到一張牌，就想想它的搭檔在不在你翻過的牌裡。',
        mount: mount,
        score: SCORE,
        test: {
            STAGES: STAGES, COLS: COLS, SLACK: SLACK, RAMP_LEVELS: RAMP_LEVELS, SHOW_MS: SHOW_MS, cardsFor: cardsFor, slackFor: slackFor, deal: deal,
            perfectFlips: perfectFlips, limitFor: limitFor, makePuzzle: makePuzzle, rating: rating, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
