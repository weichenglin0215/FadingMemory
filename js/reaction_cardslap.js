/* ═══════════════════════════════════════════════════════════════════
   reaction_cardslap.js — 秒反應・心臟病（企劃 353）
   小時候玩的撲克牌遊戲。牌一張一張翻出來，同時要在心裡數「A、2、3、4…K、A、2…」（**數到第幾個，畫面只在前 3 張顯示，之後就不顯示，要自己數**）。
   **翻出來的牌剛好等於你心裡數到的那個數字，就拍下去**（點畫面）。拍錯、或該拍沒拍，就結束。成績＝拍對幾次（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · 這是「持續進行」的遊戲：用 kit.run 的 scoreOf（S.score ＝拍對的次數）；難度隨「拍對了幾次（hits）」增加。
   · 數數：第 k 張牌（k 從 1 起）要數到 countFor(k)：順著數是 A、2、…、K、A…（1～13 循環）；拍對 REVERSE_AT 次之後改成「倒著數」K、Q、J、10…A、K…
     （改的時候畫面會告訴你，而且下一張牌重新從 K 開始，前 3 張再顯示一次數到哪）。
   · 發牌（nextCard）：這張牌的點數是「剛好等於現在該數的數字」（要拍）的機率是 MATCH_P；而且連續不會超過 MAX_GAP 張都不用拍。
     不用拍的牌，有 CONFUSE_P 的機率故意挑一張「跟上一張長得像」的點數（6 和 9、3 和 8、2 和 7、10 和 J…），讓你手滑。
   · 難度（隨 hits 線性，到 RAMP_HITS 次為止）：翻牌的間隔 1400 → 650 毫秒（INTERVAL）。
   · 判定：這張牌翻出來之後、下一張翻出來之前，要拍的牌沒拍 → 結束；不用拍的牌拍了 → 結束。
   · 結束時把那一張牌和「你應該數到的數字」並排。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'cardslap';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 次', label: '拍對幾次', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_HITS = 40;                         /* 拍對幾次之後難度到頂 */
    var INTERVAL = [1400, 650];                 /* 翻牌的間隔（毫秒）：0 次 → 到頂 */
    var MATCH_P = 0.28, MAX_GAP = 6;            /* 每張牌是「要拍的」的機率；連續最多幾張不用拍 */
    var CONFUSE_P = [0.1, 0.5];                 /* 不用拍的牌，挑「跟上一張長得像」的機率：0 次 → 到頂 */
    var REVERSE_AT = 15;                        /* 拍對幾次之後改成倒著數 */
    var SHOW_COUNT = 3;                         /* 每次開始數（或改倒著數）的前幾張，畫面會顯示數到哪 */
    var LEAD_MS = 1200;                         /* 開始後多久翻第一張 */
    var SOLVE_CAP = 5;                          /* 驗證用：api.solve 最多幫你拍到幾次（再多就故意漏拍，遊戲才會結束） */
    var MAX_LEVEL = 60;
    var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    var SUITS = ['spade', 'heart', 'diamond', 'club'];
    var LOOK = { 6: [9], 9: [6], 3: [8], 8: [3, 5], 5: [8, 6], 2: [7], 7: [2], 10: [11], 11: [10, 12], 12: [11, 13], 13: [12], 1: [4] };       /* 長得像的點數（11＝J、12＝Q、13＝K、1＝A） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(hits) { return Math.min(1, Math.max(0, hits / RAMP_HITS)); }
    function intervalFor(hits) { return Math.round(INTERVAL[0] + (INTERVAL[1] - INTERVAL[0]) * prog(hits)); }
    function confuseP(hits) { return CONFUSE_P[0] + (CONFUSE_P[1] - CONFUSE_P[0]) * prog(hits); }
    function dirFor(hits) { return hits >= REVERSE_AT ? -1 : 1; }                       /* 1＝順著數、−1＝倒著數 */
    function rankName(r) { return RANKS[r - 1]; }
    /* 這個數數的階段裡，第 k 張（k 從 1 起）要數到幾（1～13）：順著數 1、2、…、13、1…；倒著數 13、12、…、1、13… */
    function countFor(k, dir) { return dir > 0 ? ((k - 1) % 13) + 1 : 13 - ((k - 1) % 13); }
    /* 發下一張牌。st = { k（這個階段的第幾張）, dir, gap（連續幾張不用拍）, prev（上一張的點數）}；回傳 { rank, suit, count, isMatch } */
    function nextCard(st, hits, rand) {
        rand = rand || Math.random;
        var count = countFor(st.k, st.dir), match = st.gap >= MAX_GAP || rand() < MATCH_P, rank;
        if (match) rank = count;
        else {
            var cands = LOOK[st.prev] ? LOOK[st.prev].filter(function (x) { return x !== count; }) : [];
            if (cands.length && rand() < confuseP(hits)) rank = kit.pick(cands, rand);
            else { do { rank = kit.randInt(1, 13, rand); } while (rank === count); }
        }
        return { rank: rank, suit: kit.pick(SUITS, rand), count: count, isMatch: rank === count };
    }
    function rating(n) {
        if (n >= 50) return '心臟病高手！';
        if (n >= 30) return '反應和記性都超強！';
        if (n >= 15) return '不錯喔！';
        if (n >= 6) return '再接再厲！';
        return '在心裡一直數，別停下來！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'csl-stage', resume: false,
            head: function () { return '心臟病'; },
            info: function (S) { return '拍對 ' + S.score + ' 次'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 次'; },
            rating: rating,
            lines: function (S) { return ['一共拍對 ' + S.score + ' 次']; },
            setup: setup
        });
    }

    /* 花色（SVG path，viewBox 0 0 24 24） */
    var SUIT_PATH = {
        heart: 'M12 21 C4 14 2 9 2 6.5 C2 3.5 4.5 2 7 2 C9 2 11 3.2 12 5 C13 3.2 15 2 17 2 C19.5 2 22 3.5 22 6.5 C22 9 20 14 12 21 Z',
        diamond: 'M12 1.5 L21 12 L12 22.5 L3 12 Z',
        spade: 'M12 1.5 C12 1.5 3 9 3 14 C3 17 5.5 18.5 8 18 C9.5 17.8 10.7 17 11 16 C10.8 19 10 21 8 22.5 L16 22.5 C14 21 13.2 19 13 16 C13.3 17 14.5 17.8 16 18 C18.5 18.5 21 17 21 14 C21 9 12 1.5 12 1.5 Z',
        club: 'M12 2 C9.5 2 8 3.8 8 5.8 C8 7 8.6 8 9.5 8.8 C8.8 8.6 8.2 8.5 7.5 8.5 C5 8.5 3 10.3 3 12.8 C3 15.3 5 17 7.3 17 C9 17 10.4 16.3 11.2 15.2 C11 18.5 10 21 8 22.5 L16 22.5 C14 21 13 18.5 12.8 15.2 C13.6 16.3 15 17 16.7 17 C19 17 21 15.3 21 12.8 C21 10.3 19 8.5 16.5 8.5 C15.8 8.5 15.2 8.6 14.5 8.8 C15.4 8 16 7 16 5.8 C16 3.8 14.5 2 12 2 Z'
    };
    function suitSvg(suit, size) {
        var s = kit.svg('svg', { 'class': 'csl-suit csl-suit--' + suit, viewBox: '0 0 24 24', width: size, height: size });
        kit.svg('path', { d: SUIT_PATH[suit] }, s);
        return s;
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var hits = 0, st = { k: 1, dir: 1, gap: 0, prev: 0 }, cur = null, slapped = false, over = false, shownSince = 0, since = 0, flips = 0;
        api.info = { get hits() { return hits; }, get card() { return cur; }, get flips() { return flips; } };
        S.score = 0; api.setInfo('拍對 0 次');
        console.log('[心臟病] 開始：翻牌間隔 ' + intervalFor(0) + ' 毫秒');

        var field = h('div', { 'class': 'csl-field' });
        stage.appendChild(field);
        field.appendChild(h('div', { 'class': 'qz-note csl-tip', text: '牌＝你數到的數字就拍（點畫面）' }));
        var countBox = h('div', { 'class': 'csl-count', text: '' }); field.appendChild(countBox);
        var table = h('div', { 'class': 'csl-table' }); field.appendChild(table);
        var cardEl = h('div', { 'class': 'csl-card csl-card--back' }); table.appendChild(cardEl);
        var info = h('div', { 'class': 'qz-note csl-info', text: '準備好，牌要翻了！' }); field.appendChild(info);
        if (kit.once('cardslap.hint')) kit.hintOn(stage, null, { mode: 'tap', x: 236, y: 330, delay: 2600, text: '牌＝數到的數字就點' });

        /* 翻下一張：檢查上一張有沒有漏拍；發新牌；排下一次翻牌 */
        function flip() {
            if (over || api.over) return;
            if (cur && cur.isMatch && !slapped) { finish('missed'); return; }
            if (hits === REVERSE_AT && st.dir > 0) { st = { k: 1, dir: -1, gap: st.gap, prev: st.prev }; since = 0; info.textContent = '改成倒著數！K、Q、J、10…'; }
            cur = nextCard(st, hits, api.rand); slapped = false; flips++;
            st.gap = cur.isMatch ? 0 : st.gap + 1; st.prev = cur.rank; since++;
            showCard(cur);
            countBox.textContent = since <= SHOW_COUNT ? '數到：' + rankName(cur.count) : '';                        /* 只有前幾張顯示數到哪，之後要自己數 */
            st.k++;
            shownSince = performance.now();
            api.after(intervalFor(hits), flip);
        }
        function showCard(c) {
            var el = h('div', { 'class': 'csl-card csl-card--' + (c.suit === 'heart' || c.suit === 'diamond' ? 'red' : 'black') });
            el.appendChild(h('div', { 'class': 'csl-card__r', text: rankName(c.rank) }));
            var big = h('div', { 'class': 'csl-card__big' }); big.appendChild(suitSvg(c.suit, 96)); el.appendChild(big);
            el.appendChild(h('div', { 'class': 'csl-card__r csl-card__r--b', text: rankName(c.rank) }));
            table.replaceChild(el, cardEl); cardEl = el; el.classList.add('csl-card--flip'); Sfx.play('flip');
        }
        api.after(LEAD_MS, flip);
        /* 拍：點畫面任何地方。這張是要拍的 → 加一分；不是 → 結束 */
        kit.onTap(field, function () {
            if (over || api.over || !cur) return;
            if (slapped) return;
            if (cur.isMatch) { slapped = true; hits++; S.score = hits; api.setInfo('拍對 ' + hits + ' 次'); cardEl.classList.add('csl-card--ok'); Sfx.play('pop'); info.textContent = ''; }
            else finish('wrong');
        });
        function finish(kind) {
            if (over) return;
            over = true; cardEl.classList.add(kind === 'wrong' ? 'csl-card--bad' : 'csl-card--miss');
            var msg = kind === 'wrong' ? '這張是「' + rankName(cur.rank) + '」，你該數到「' + rankName(cur.count) + '」，不用拍！' : '這張「' + rankName(cur.rank) + '」剛好是你該數到的，卻沒拍！';
            info.textContent = msg; countBox.textContent = '你該數到：' + rankName(cur.count);
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3200, lines: [msg, '一共拍對 ' + hits + ' 次'] });
        }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝該拍的牌就拍（最多 SOLVE_CAP 次，之後故意漏拍讓遊戲結束）、wrong＝不用拍的牌就拍 */
        api.solve = function () { if (over || !cur || slapped || !cur.isMatch || hits >= SOLVE_CAP) return; field.dispatchEvent(new Event('pointerdown')); };
        api.wrong = function () { if (over || !cur || slapped || cur.isMatch) return; field.dispatchEvent(new Event('pointerdown')); };
    }

    var G = {
        id: ID,
        name: '心臟病',
        rule: '小時候玩的撲克牌遊戲。牌一張一張翻出來，你要在心裡一直數「A、2、3…K、A、2…」——**畫面只在前 3 張告訴你數到哪，之後要自己數**。**翻出來的牌剛好等於你心裡數到的數字，就拍下去**（點畫面任何地方）。**拍錯，或該拍沒拍，就結束**。成績是拍對幾次。小心：翻牌會越來越快，還會故意挑長得像的牌（6 後面接 9），拍對 15 次之後**要倒著數**（K、Q、J…）！',
        mount: mount,
        score: SCORE,
        test: {
            intervalFor: intervalFor, confuseP: confuseP, dirFor: dirFor, rankName: rankName, countFor: countFor, nextCard: nextCard, rating: rating,
            RAMP_HITS: RAMP_HITS, INTERVAL: INTERVAL, MATCH_P: MATCH_P, MAX_GAP: MAX_GAP, CONFUSE_P: CONFUSE_P, REVERSE_AT: REVERSE_AT, SHOW_COUNT: SHOW_COUNT, LEAD_MS: LEAD_MS, SOLVE_CAP: SOLVE_CAP, RANKS: RANKS, SUITS: SUITS, LOOK: LOOK, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
