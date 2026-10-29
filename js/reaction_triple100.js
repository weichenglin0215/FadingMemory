/* ═══════════════════════════════════════════════════════════════════
   reaction_triple100.js — 秒反應・三張成百（V1.26 新增；V1.27 改成關卡制）
   一堆數字牌（橫向每排 3 張，往下一排一排增加），每次選三張，加起來剛好 100 就消除，全部消完就過關。
   選錯一組（不是 100）扣 3 秒；時間到、或是「卡住」（剩下的牌再也湊不出 100）就結束。成績＝通過幾關（越多越好）。
   介面不顯示「已選合計」（不替你記帳）。
   ───────────────────────────────────────────────────────────────────
   · V1.27（玩家意見：原本一開始就 15 張、限時 180 秒，太難了）：
       - 關卡制：第 1 關只有 6 張牌，每隔三關多 3 張牌（1～3 關 6 張、4～6 關 9 張、7～9 關 12 張、10～12 關 15 張…），
         最多 MAX_GROUPS（10）組＝30 張；
       - 版面：橫向一排放 3 張，往下可以一直增加（超出畫面就上下捲動）；
       - 限時：第 1 關 180 秒，每多一關多 20 秒（LIMIT_BASE_S ＋ (關 − 1) × LIMIT_STEP_S）；選錯一組從剩餘時間扣 3 秒。
   · 牌組由產生器（generateDeck）做出來，特色是「整副牌只有唯一一種完整分法，卻藏著很多陷阱組合」：
       - 每 3 張湊成 100 的正解有 g 組（g ＝ 牌數 ÷ 3），整副牌「完整分成 g 組」的方法只有一種（用 findPartitions 窮舉驗證）；
       - 陷阱組合：加起來也是 100，但不屬於那唯一的分法。只要玩家先消掉任何一組陷阱，剩下的牌就不可能全部配完。
         每一關有「至少幾組陷阱」的要求（TRAPS 表，同一個張數的三關依序變多）；6 張牌（2 組）數學上不可能有陷阱
         （任何一組 100 的剩下 3 張一定也是 100）。
       - 玩家可能要到最後才發現卡住，這是故意的：「中途犯錯、最後失敗」。
   · 判定：選滿三張就判定。和是 100 → 消除（不管是正解還是陷阱，遊戲不會提醒）；不是 100 → 扣 3 秒、取消選取。
     每次消除後檢查剩下的牌還有沒有任何一組三張湊得出 100（hasMove）：沒有 → 卡住，結束，並把唯一的正解秀給玩家看。
   · 玩家提供的範例牌組（EXAMPLE_DECK：6 16 18 21 22 26 27 31 32 42 47 51 52 53 56，5 組正解、9 組陷阱）：
     每次進頁面第一次遇到「15 張牌、陷阱要求 9 組」的那一關（第 12 關）時使用，之後都用產生器隨機出新牌。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'triple100';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '通過關數', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var TARGET = 100;                           /* 每組三張要湊成的數字 */
    var GROUPS = 5;                             /* 預設組數（generateDeck 沒指定時用；5 組＝15 張，範例牌組的張數） */
    var COLS = 3;                               /* 版面：橫向每排幾張（往下一排一排增加） */
    var MIN_VALUE = 5, MAX_VALUE = 60;          /* 預設單張卡的範圍（避免一張就快 100 的牌） */
    var MIN_TRAPS = 9;                          /* 預設陷阱組合至少幾組（5 組的第 3 關＝範例牌組的難度） */
    var MAX_TRIES = 500000;                     /* 產生牌組最多嘗試幾次 */
    var PENALTY_MS = 3000;                      /* 選錯一組扣幾毫秒的剩餘時間 */
    var LEVEL_STEP = 3;                         /* 每隔幾關多一組（3 張牌） */
    var START_GROUPS = 2, MAX_GROUPS = 10;      /* 第 1 關 2 組＝6 張牌；最多 10 組＝30 張 */
    var MAX_LEVEL = 90;
    var LIMIT_LAST_LEVEL = 30;                  /* 限時每關多 LIMIT_STEP_S 秒，加到第 30 關為止（31 關起組數、陷阱都已經到頂，限時也不再增加，不然第 90 關會有 30 多分鐘） */
    var LIMIT_BASE_S = 180, LIMIT_STEP_S = 20;  /* 第 1 關限時 180 秒，每多一關多 20 秒 */
    /* 各組數的「陷阱至少幾組」：同一個張數的三關依序變多（2 組的牌在數學上不會有陷阱） */
    var TRAPS = { 2: [0, 0, 0], 3: [1, 1, 2], 4: [2, 3, 4], 5: [5, 7, 9], 6: [8, 10, 12], 7: [11, 13, 15], 8: [14, 17, 20], 9: [18, 21, 24], 10: [24, 27, 30] };
    /* 各組數的單張範圍：牌越多，要容納更多不同的數字，範圍越大 */
    function rangeFor(groups) { return groups <= 6 ? [5, 60] : (groups <= 8 ? [3, 80] : [2, 90]); }
    var EXAMPLE_DECK = [6, 16, 18, 21, 22, 26, 27, 31, 32, 42, 47, 51, 52, 53, 56];   /* 範例牌組 */
    var EXAMPLE_LEVEL = 12;                     /* 第一次玩到這一關時用範例牌組（15 張、陷阱 9 組） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關的規格：{ groups, cards, minTraps, lo, hi, limitS } */
    function levelSpec(level) {
        var groups = Math.min(MAX_GROUPS, START_GROUPS + Math.floor((level - 1) / LEVEL_STEP));
        var within = Math.min(2, (level - 1) % LEVEL_STEP);
        if (START_GROUPS + Math.floor((level - 1) / LEVEL_STEP) > MAX_GROUPS) within = 2;          /* 滿 30 張之後，陷阱要求維持最高 */
        var r = rangeFor(groups);
        return { groups: groups, cards: groups * 3, minTraps: TRAPS[groups][within], lo: r[0], hi: r[1], limitS: LIMIT_BASE_S + LIMIT_STEP_S * (Math.min(level, LIMIT_LAST_LEVEL) - 1) };
    }
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
    function randomCandidate(rand, groups, lo, hi) {
        groups = groups || GROUPS; lo = lo == null ? MIN_VALUE : lo; hi = hi == null ? MAX_VALUE : hi;
        var cards = [];
        for (var g = 0; g < groups; g++) {
            for (var attempt = 0; attempt < 50; attempt++) {
                var a = kit.randInt(lo, hi, rand), b = kit.randInt(lo, hi, rand), c = TARGET - a - b;
                if (c >= lo && c <= hi) { cards.push(a, b, c); break; }
            }
        }
        return cards;
    }
    /* 產生牌組（參考使用者提供的產生器）：groups × 3 張都不同、只有唯一一種完整分法、陷阱組合 ≥ minTraps。
       回傳 { cards（已洗牌）, solution, traps, tries }；minTraps 預設 MIN_TRAPS；spec（選填）{ groups, lo, hi } 預設 5 組、5～60 */
    function generateDeck(rand, minTraps, maxTries, spec) {
        rand = rand || Math.random;
        minTraps = minTraps == null ? MIN_TRAPS : minTraps;
        maxTries = maxTries || MAX_TRIES;
        spec = spec || {};
        var groups = spec.groups || GROUPS, lo = spec.lo == null ? MIN_VALUE : spec.lo, hi = spec.hi == null ? MAX_VALUE : spec.hi;
        var n = groups * 3;
        for (var tries = 1; tries <= maxTries; tries++) {
            var cards = randomCandidate(rand, groups, lo, hi);
            if (cards.length !== n || new Set(cards).size !== n) continue;          /* 不允許重複數字 */
            var triples = findTriples(cards, TARGET), traps = triples.length - groups;
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
    /* 這一關的牌組：照規格產生；萬一找不到（機率極低）就把陷阱要求降一級再找 */
    function deckForLevel(level, rand) {
        var sp = levelSpec(level);
        for (var need = sp.minTraps; need >= 0; need -= 3) {
            var d = generateDeck(rand, Math.max(0, need), 200000, { groups: sp.groups, lo: sp.lo, hi: sp.hi });
            if (d) return d;
        }
        return null;
    }
    function limitMs(level) { return levelSpec(level).limitS * 1000; }
    /* 剩餘時間的顯示：3:05 */
    function fmtLeft(ms) {
        var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }
    function rating(n) {
        if (n >= 21) return '三張成百大師！';
        if (n >= 13) return '心算高手！';
        if (n >= 7) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '先熟悉一下，再來一次！';
    }

    function mount(root, ctx) {
        /* V1.27 起三張成百改成關卡制（成績＝通過幾關、越大越好；V1.26 是用時、越小越好），舊版的最佳紀錄不能比：第一次進來清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.v127');
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 7,
            head: function (lv) { return '第 ' + lv + ' 關（' + levelSpec(lv).cards + ' 張）'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    var exampleUsed = false;                    /* 範例牌組每次進頁面只用一次 */
    function setup(api) {
        var stage = api.stage, my = api.my, level = api.level, spec = levelSpec(level);
        var deck;
        if (level === EXAMPLE_LEVEL && !exampleUsed) { exampleUsed = true; deck = exampleDeck(api.rand); }
        else deck = deckForLevel(level, api.rand) || exampleDeck(api.rand);
        var cards = deck.cards, state = [], sel = [], remaining = cards.length, errors = 0, hint = null, tm = null;
        console.log('[三張成百] 第 ' + level + ' 關：' + cards.length + ' 張，牌面 ' + cards.join(',') + '；唯一正解 ' + deck.solution.map(function (t) { return t.join('+'); }).join('、') + '；陷阱 ' + deck.traps.length + ' 組；限時 ' + spec.limitS + ' 秒');

        var wrap = h('div', { 'class': 't3-wrap' });
        var grid = h('div', { 'class': 't3-grid' });
        var els = cards.map(function (n, i) {
            var el = h('div', { 'class': 't3-card', text: String(n) });
            state.push('on');
            /* 用 click 不用 pointerdown：牌太多要上下捲動時，手指滑過牌不會誤選 */
            el.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); tap(i); });
            grid.appendChild(el);
            return el;
        });
        wrap.appendChild(grid); stage.appendChild(wrap);
        var info = h('div', { 'class': 't3-info' });
        stage.appendChild(info);
        function infoText() {
            var more = wrap.scrollHeight > wrap.clientHeight + 4 && wrap.scrollTop + wrap.clientHeight < wrap.scrollHeight - 4;
            info.textContent = '失誤 ' + errors + ' 次（每次 − ' + PENALTY_MS / 1000 + ' 秒）' + (more ? '　↓ 往下還有牌' : '');
        }
        infoText();
        wrap.addEventListener('scroll', infoText);

        /* 時間：整關一條時間條＋標題列右邊顯示剩餘時間；選錯一組直接從剩餘時間扣掉 */
        tm = api.timer(spec.limitS * 1000, function () { fail('time'); });
        var lastShown = -1;
        my.loop(function () {
            if (api.over) return false;
            var s = Math.ceil(tm.left() / 1000);
            if (s !== lastShown) { lastShown = s; api.setInfo('剩 ' + fmtLeft(tm.left())); }
        });
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「唯一正解第一組」的第一張牌上 */
        if (level === 1 && kit.once('triple100.hint')) {
            var first = deck.solution[0], idx = cards.indexOf(first[0]);
            if (idx >= 0) hint = kit.hintOn(stage, els[idx], { mode: 'tap', delay: 300, text: '請點三張加起來是 100 的牌' });
        }
        function hideHint() { if (hint) { hint.remove(); hint = null; } }
        function remainingValues() { var out = []; for (var i = 0; i < cards.length; i++) if (state[i] === 'on') out.push(cards[i]); return out; }
        function solutionLine() { return '唯一的分法：' + deck.solution.map(function (t) { return t.join('＋'); }).join('、'); }

        function tap(i) {
            if (api.over || state[i] !== 'on') return;
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
                if (remaining === 0) { api.pass({ delay: 800 }); return; }
                /* 剩下的牌湊不出任何一組 100 → 卡住（遊戲不會提早提醒玩家「已經走錯」，要等到真的沒路可走） */
                if (!hasMove(remainingValues())) api.after(500, function () { fail('stuck'); });
            } else {
                errors++;
                picked.forEach(function (k) { els[k].classList.remove('t3-card--sel'); els[k].classList.add('t3-card--bad'); });
                api.after(420, function () { picked.forEach(function (k) { els[k].classList.remove('t3-card--bad'); }); });
                Sfx.play('bad'); infoText();
                tm.cut(PENALTY_MS);
            }
        }
        /* 失敗（卡住或超時）：結算說明原因，並把這一關唯一的正解寫出來 */
        function fail(why) {
            if (api.over) return;
            hideHint();
            info.textContent = why === 'stuck' ? '卡住了！剩下的牌湊不出 100' : '時間到！';
            api.fail({
                delay: 1200,
                lines: [
                    why === 'stuck' ? '第 ' + level + ' 關卡住了：剩下的牌再也湊不出 100' : '第 ' + level + ' 關時間到（限時 ' + fmtLeft(spec.limitS * 1000) + '）',
                    solutionLine(),
                    '有些組合加起來也是 100，卻不在這個分法裡（陷阱），選了就會卡住'
                ]
            });
        }

        function groupsIdx() { return deck.solution.map(function (t) { return t.map(function (v) { return cards.indexOf(v); }); }); }
        api.solve = function () { groupsIdx().forEach(function (g) { g.forEach(tap); }); };
        /* 先選一組陷阱（和是 100 但不在正解裡），再照剩下的選到卡住；6 張牌沒有陷阱，就故意選一組不是 100 的 */
        api.wrong = function () {
            var trap = deck.traps[0];
            if (!trap) { var k = 0; for (var i = 0; i < cards.length && k < 3; i++) if (state[i] === 'on' && cards[i] > 20) { tap(i); k++; } return; }
            trap.forEach(function (v) { tap(cards.indexOf(v)); });
            var rest = remainingValues();
            findTriples(rest, TARGET).forEach(function (t) {
                var vals = t.map(function (k) { return rest[k]; });
                if (api.over || vals.some(function (v) { return state[cards.indexOf(v)] !== 'on'; })) return;
                vals.forEach(function (v) { tap(cards.indexOf(v)); });
            });
        };
        api.timeout = function () { fail('time'); };
        api.info = { cards: cards, solution: deck.solution, traps: deck.traps, spec: spec, state: function () { return { remaining: remaining, errors: errors }; } };
    }

    var G = {
        id: ID,
        name: '三張成百',
        rule: '數字牌橫向每排 3 張，**每次選三張，加起來剛好是 100 就會消除**，全部消完就過關。第 1 關只有 6 張牌，之後**每三關多 3 張牌**，限時從 180 秒起、每關多 20 秒。畫面不會幫你加總，要自己算！小心：**有些三張湊起來也是 100，卻是陷阱**，消掉之後剩下的牌就再也湊不齊了，整副牌只有一種完整的分法。選錯一組扣 3 秒，**卡住或時間到就結束**，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            findTriples: findTriples, findPartitions: findPartitions, hasMove: hasMove, canStillSolve: canStillSolve, analyze: analyze, generateDeck: generateDeck, exampleDeck: exampleDeck, randomCandidate: randomCandidate, rating: rating,
            levelSpec: levelSpec, deckForLevel: deckForLevel, limitMs: limitMs, fmtLeft: fmtLeft, rangeFor: rangeFor,
            TARGET: TARGET, GROUPS: GROUPS, COLS: COLS, MIN_VALUE: MIN_VALUE, MAX_VALUE: MAX_VALUE, MIN_TRAPS: MIN_TRAPS, PENALTY_MS: PENALTY_MS, MAX_LEVEL: MAX_LEVEL,
            LEVEL_STEP: LEVEL_STEP, START_GROUPS: START_GROUPS, MAX_GROUPS: MAX_GROUPS, LIMIT_BASE_S: LIMIT_BASE_S, LIMIT_STEP_S: LIMIT_STEP_S, TRAPS: TRAPS, EXAMPLE_DECK: EXAMPLE_DECK, EXAMPLE_LEVEL: EXAMPLE_LEVEL
        }
    };
    Reaction.register(G);
})();
