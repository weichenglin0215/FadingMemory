/* ═══════════════════════════════════════════════════════════════════
   reaction_triple100.js — 秒反應・三張成百（V1.25 新增，108 → 109 款）
   15 張數字牌（5 欄 × 3 列），每次選三張，加起來剛好 100 就消除，全部消完為止。計時，選錯一組（不是 100）罰 3 秒；
   總時間（含罰秒）超過 LIMIT_S（180 秒）、或是「卡住」（剩下的牌再也湊不出 100）就算失敗（不計成績、不送排行榜）。
   介面不顯示「已選合計」（不替你記帳）。成績＝用時（含罰秒，越短越好）。
   ───────────────────────────────────────────────────────────────────
   · 牌組由產生器（generateDeck）做出來，特色是「整副牌只有唯一一種完整分法，卻藏著很多陷阱組合」：
       - 5 組正解：每 3 張湊成 100，5 組剛好用完 15 張；而且整副牌「完整分成 5 組」的方法只有一種（用 findPartitions 窮舉驗證）；
       - 陷阱組合：加起來也是 100，但不屬於那唯一的分法。只要玩家先消掉任何一組陷阱，剩下的牌就不可能全部配完
         （因為完整分法只有一種，而陷阱不在其中）。難度「expert」要求至少 MIN_TRAPS（9）組陷阱，
         全部三張組合（正解＋陷阱）一般有 14 組左右，玩家隨手挑一組，掉進陷阱的機率超過六成。
       - 玩家可能要到第三、四組才發現卡住，這是故意的：「中途犯錯、最後失敗」。
   · 判定：選滿三張就判定。和是 100 → 消除（不管是正解還是陷阱，遊戲不會提醒）；不是 100 → 罰 3 秒、取消選取。
     每次消除後檢查剩下的牌還有沒有任何一組三張湊得出 100（hasMove）：沒有 → 卡住，失敗，並把唯一的正解秀給玩家看。
   · 每次進頁面的第一局用玩家提供的範例牌組（EXAMPLE_DECK：6 16 18 21 22 26 27 31 32 42 47 51 52 53 56，5 組正解、9 組陷阱），
     之後每局用產生器隨機出新牌。
   · 計時從按「開始」才算。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'triple100';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 秒', label: '用時', min: 0, max: 180 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var TARGET = 100;                           /* 每組三張要湊成的數字 */
    var GROUPS = 5;                             /* 組數（卡片數 ＝ 組數 × 3 ＝ 15 張） */
    var COLS = 5, ROWS = 3;                     /* 版面：5 欄 × 3 列 */
    var MIN_VALUE = 5, MAX_VALUE = 60;          /* 單張卡的範圍（避免一張就快 100 的牌） */
    var MIN_TRAPS = 9;                          /* 陷阱組合至少幾組（產生器的「expert」難度） */
    var MAX_TRIES = 500000;                     /* 產生牌組最多嘗試幾次 */
    var PENALTY_MS = 3000;                      /* 選錯一組罰幾毫秒 */
    var LIMIT_S = 180;                          /* 時間限制（秒，含罰秒）：超過就失敗 */
    var EXAMPLE_DECK = [6, 16, 18, 21, 22, 26, 27, 31, 32, 42, 47, 51, 52, 53, 56];   /* 範例牌組（第一局用） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 找出所有加總 ＝ target 的三張組合（回傳牌的索引，i < j < k） */
    function findTriples(cards, target) {
        target = target == null ? TARGET : target;
        var out = [], n = cards.length;
        for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) for (var k = j + 1; k < n; k++) if (cards[i] + cards[j] + cards[k] === target) out.push([i, j, k]);
        return out;
    }
    /* 完整分法：把全部的牌分成若干組（每組是 triples 裡的一組），回傳找到的分法（最多 limit 種就停，用來判斷唯一解）。
       永遠處理「最小的未使用牌」，避免同一種分法被重複計算 */
    function findPartitions(n, triples, limit) {
        limit = limit == null ? 2 : limit;
        var byCard = [], i;
        for (i = 0; i < n; i++) byCard.push([]);
        triples.forEach(function (t) { t.forEach(function (c) { byCard[c].push(t); }); });
        var used = [], cur = [], results = [];
        for (i = 0; i < n; i++) used.push(false);
        (function search() {
            if (results.length >= limit) return;
            var first = used.indexOf(false);
            if (first === -1) { results.push(cur.slice()); return; }
            byCard[first].forEach(function (t) {
                if (results.length >= limit || t.some(function (c) { return used[c]; })) return;
                t.forEach(function (c) { used[c] = true; });
                cur.push(t);
                search();
                cur.pop();
                t.forEach(function (c) { used[c] = false; });
            });
        })();
        return results;
    }
    /* 剩下的牌（數字陣列）還有沒有「任何一組」三張湊得出 100：沒有就是卡住了 */
    function hasMove(remaining) { return findTriples(remaining, TARGET).length > 0; }
    /* 剩下的牌還能不能「全部」配完（玩家每消一組之後用它檢查：false ＝ 已經走錯，之後一定失敗） */
    function canStillSolve(remaining) {
        if (remaining.length % 3 !== 0) return false;
        if (!remaining.length) return true;
        return findPartitions(remaining.length, findTriples(remaining, TARGET), 1).length === 1;
    }
    /* 一副牌的分析：{ solution: 唯一正解（每組是三個數字，小到大）, traps: 陷阱組合（每組三個數字）, partitions: 完整分法有幾種（最多數到 2）, triples: 全部三張組合數 } */
    function analyze(cards) {
        var triples = findTriples(cards, TARGET), parts = findPartitions(cards.length, triples, 2);
        var solKey = {};
        if (parts.length === 1) parts[0].forEach(function (t) { solKey[t.join(',')] = true; });
        var toVals = function (t) { return t.map(function (i) { return cards[i]; }).sort(function (a, b) { return a - b; }); };
        return {
            partitions: parts.length, triples: triples.length,
            solution: parts.length === 1 ? parts[0].map(toVals) : [],
            traps: triples.filter(function (t) { return !solKey[t.join(',')]; }).map(toVals)
        };
    }
    /* 候選牌組：每組先抽兩張，第三張補成 TARGET（要在範圍內） */
    function randomCandidate(rand) {
        var cards = [];
        for (var g = 0; g < GROUPS; g++) {
            for (var attempt = 0; attempt < 50; attempt++) {
                var a = kit.randInt(MIN_VALUE, MAX_VALUE, rand), b = kit.randInt(MIN_VALUE, MAX_VALUE, rand), c = TARGET - a - b;
                if (c >= MIN_VALUE && c <= MAX_VALUE) { cards.push(a, b, c); break; }
            }
        }
        return cards;
    }
    /* 產生牌組（參考使用者提供的產生器）：15 張都不同、只有唯一一種完整分法、陷阱組合 ≥ minTraps。
       回傳 { cards（已洗牌）, solution, traps, tries }；minTraps 預設 MIN_TRAPS（expert） */
    function generateDeck(rand, minTraps, maxTries) {
        rand = rand || Math.random;
        minTraps = minTraps == null ? MIN_TRAPS : minTraps;
        maxTries = maxTries || MAX_TRIES;
        var n = GROUPS * 3;
        for (var tries = 1; tries <= maxTries; tries++) {
            var cards = randomCandidate(rand);
            if (cards.length !== n || new Set(cards).size !== n) continue;          /* 不允許重複數字 */
            var triples = findTriples(cards, TARGET), traps = triples.length - GROUPS;
            if (traps < minTraps) continue;                                         /* 先用便宜的條件篩掉 */
            var parts = findPartitions(n, triples, 2);
            if (parts.length !== 1) continue;                                       /* 必須恰好唯一解 */
            var an = analyze(cards);
            return { cards: kit.shuffle(cards.slice(), rand), solution: an.solution, traps: an.traps, tries: tries };
        }
        return null;
    }
    /* 範例牌組也做成同樣的格式（洗牌後） */
    function exampleDeck(rand) {
        var an = analyze(EXAMPLE_DECK);
        return { cards: kit.shuffle(EXAMPLE_DECK.slice(), rand), solution: an.solution, traps: an.traps, tries: 0 };
    }
    function rating(sec) {
        if (sec < 20) return '心算快手！';
        if (sec < 40) return '高手！';
        if (sec < 80) return '不錯喔！';
        return '再來一次，會更快！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '每次選三張，加起來剛好 100 就消除（限時 ' + LIMIT_S + ' 秒）',
            numText: function (v) { return v.toFixed(4) + ' 秒'; },
            rating: rating,
            sfx: function (v) { return v < 30 ? 'perfect' : (v < 70 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    var firstGame = true;                       /* 每次進頁面的第一局用範例牌組 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var deck = firstGame ? exampleDeck() : (generateDeck() || exampleDeck());
        firstGame = false;
        var cards = deck.cards, state = [], sel = [], remaining = cards.length, errors = 0, started = false, over = false, firstBad = null, hint = null;
        console.log('[三張成百] 牌面 ' + cards.join(',') + '；唯一正解 ' + deck.solution.map(function (t) { return t.join('+'); }).join('、') + '；陷阱 ' + deck.traps.length + ' 組');

        var clockWrap = h('div', { 'class': 't3-clock' });
        stage.appendChild(clockWrap);
        var clock = kit.clock(clockWrap, my);
        var grid = h('div', { 'class': 't3-grid' });
        var els = cards.map(function (n, i) {
            var el = h('div', { 'class': 't3-card', text: String(n) });
            state.push('on');
            kit.onTap(el, function () { tap(i); });
            grid.appendChild(el);
            return el;
        });
        stage.appendChild(grid);
        var info = h('div', { 'class': 't3-info', text: '失誤 0 次（每次 + 3 秒）' });
        stage.appendChild(info);

        function begin() {
            if (started) return;
            started = true; clock.start();
            /* 時間限制：每一幀檢查（罰秒也算在內），超過就失敗 */
            my.loop(function () { if (over) return false; if (clock.ms() >= LIMIT_S * 1000) fail('time'); });
            /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「唯一正解第一組」的第一張牌上 */
            if (kit.once('triple100.hint')) {
                var first = deck.solution[0], idx = cards.indexOf(first[0]);
                if (idx >= 0) hint = kit.hintOn(stage, els[idx], { mode: 'tap', delay: 300, text: '請點三張加起來是 100 的牌' });
            }
        }
        var cover = kit.startCover(stage, { text: '15 張牌，每次點三張，加起來剛好 100 就會消除。\n有些三張湊起來是 100 卻是陷阱！點錯一組加 3 秒，限時 ' + LIMIT_S + ' 秒，全部消完就結束。', onStart: begin });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }
        function remainingValues() { var out = []; for (var i = 0; i < cards.length; i++) if (state[i] === 'on') out.push(cards[i]); return out; }

        function tap(i) {
            if (!started || over || state[i] !== 'on') return;
            hideHint();
            var at = sel.indexOf(i);
            if (at >= 0) { sel.splice(at, 1); els[i].classList.remove('t3-card--sel'); Sfx.play('click'); return; }
            sel.push(i); els[i].classList.add('t3-card--sel'); Sfx.play('click');
            if (sel.length < 3) return;
            /* 選滿三張：判定 */
            var picked = sel.slice(); sel = [];
            var sum = picked.reduce(function (s, k) { return s + cards[k]; }, 0);
            if (sum === TARGET) {
                picked.forEach(function (k) { state[k] = 'gone'; els[k].classList.remove('t3-card--sel'); els[k].classList.add('t3-card--gone'); });
                remaining -= 3; Sfx.play('ok');
                if (remaining === 0) { finish(); return; }
                /* 剩下的牌湊不出任何一組 100 → 卡住（遊戲不會提早提醒玩家「已經走錯」，要等到真的沒路可走） */
                if (!hasMove(remainingValues())) my.after(500, function () { fail('stuck'); });
            } else {
                errors++;
                if (!firstBad) firstBad = picked.map(function (k) { return cards[k]; }).sort(function (a, b) { return a - b; }).join(' ＋ ') + ' ＝ ' + sum;
                picked.forEach(function (k) { els[k].classList.remove('t3-card--sel'); els[k].classList.add('t3-card--bad'); });
                my.after(420, function () { picked.forEach(function (k) { els[k].classList.remove('t3-card--bad'); }); });
                clock.penalty(PENALTY_MS); Sfx.play('bad');
                info.textContent = '失誤 ' + errors + ' 次（每次 + 3 秒）';
            }
        }
        /* 失敗（卡住或超時）：不計成績、不送排行榜；結算說明原因，並把唯一的正解寫出來 */
        function fail(why) {
            if (over) return;
            over = true; clock.stop(); Sfx.play('bad');
            hideHint();
            info.textContent = why === 'stuck' ? '卡住了！剩下的牌湊不出 100' : '時間到！超過 ' + LIMIT_S + ' 秒';
            my.after(900, function () {
                kit.result(api.root, {
                    num: why === 'stuck' ? '卡住了' : '時間到', label: why === 'stuck' ? '剩下的牌再也湊不出 100' : '超過 ' + LIMIT_S + ' 秒，挑戰失敗',
                    lines: [
                        '唯一的分法：' + deck.solution.map(function (t) { return t.join('＋'); }).join('、'),
                        '有些組合加起來也是 100，卻不在這個分法裡（陷阱），選了就會卡住'
                    ],
                    sfx: 'fail', onAgain: function () { api.restart(); }
                });
            });
        }
        function finish() {
            if (over) return;
            var ms = clock.stop(), sec = ms / 1000;
            if (ms >= LIMIT_S * 1000) { fail('time'); return; }
            over = true;
            my.after(700, function () {
                api.finish(sec, { lines: [
                    '失誤 ' + errors + ' 次，罰時 ' + (errors * PENALTY_MS / 1000).toFixed(4) + ' 秒',
                    firstBad ? '最容易誤判的組合：' + firstBad : '一組都沒選錯！',
                    '你避開了 ' + deck.traps.length + ' 組陷阱，找到唯一的分法'
                ] });
            });
        }

        function groups() { return deck.solution.map(function (t) { return t.map(function (v) { return cards.indexOf(v); }); }); }
        G.debug = {
            state: function () { return { cards: cards, remaining: remaining, errors: errors, started: started, over: over, solution: deck.solution, traps: deck.traps }; },
            start: function () { cover.remove(); begin(); },
            /* 照唯一正解一組一組選 */
            solve: function () { cover.remove(); begin(); groups().forEach(function (g) { g.forEach(tap); }); },
            /* 先選一組陷阱（和是 100 但不在正解裡），再照剩下的選到卡住 */
            wrong: function () {
                cover.remove(); begin();
                var trap = deck.traps[0];
                if (!trap) return;
                trap.forEach(function (v) { tap(cards.indexOf(v)); });
                var rest = remainingValues();
                findTriples(rest, TARGET).forEach(function (t) {
                    var vals = t.map(function (k) { return rest[k]; });
                    if (over || vals.some(function (v) { return state[cards.indexOf(v)] !== 'on'; })) return;
                    vals.forEach(function (v) { tap(cards.indexOf(v)); });
                });
            },
            /* 故意選一組加起來不是 100 的 */
            wrongSum: function () { cover.remove(); begin(); var k = 0; for (var i = 0; i < cards.length && k < 3; i++) if (state[i] === 'on' && cards[i] > 40) { tap(i); k++; } }
        };
    }

    var G = {
        id: ID,
        name: '三張成百',
        rule: '15 張數字牌，**每次選三張，加起來剛好是 100 就會消除**，全部消完為止。畫面不會幫你加總，要自己算！小心：**有些三張湊起來也是 100，卻是陷阱**，消掉之後剩下的牌就再也湊不齊了，整副牌只有一種完整的分法。選錯一組加 3 秒，**卡住或超過 180 秒就失敗**，用時越短越好。',
        mount: mount,
        score: SCORE,
        test: {
            findTriples: findTriples, findPartitions: findPartitions, hasMove: hasMove, canStillSolve: canStillSolve, analyze: analyze, generateDeck: generateDeck, exampleDeck: exampleDeck, randomCandidate: randomCandidate, rating: rating,
            TARGET: TARGET, GROUPS: GROUPS, COLS: COLS, ROWS: ROWS, MIN_VALUE: MIN_VALUE, MAX_VALUE: MAX_VALUE, MIN_TRAPS: MIN_TRAPS, PENALTY_MS: PENALTY_MS, LIMIT_S: LIMIT_S, EXAMPLE_DECK: EXAMPLE_DECK
        }
    };
    Reaction.register(G);
})();
