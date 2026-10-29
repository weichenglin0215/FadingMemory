/* ═══════════════════════════════════════════════════════════════════
   reaction_mahjong3.js — 秒反應・缺哪一張（企劃 231；V1.36.0 改成「聽牌」玩法：答案不只一張，要全部找出來）
   麻將桌上一排同花色的數字牌（1～9，例如 2 3 4 5 6）。下面有九顆牌鍵（答案卡）：
   **補哪些牌，就能把整排剛好分成一組一組的「三張連號」（例如 3 4 5）或「三張一樣」（例如 5 5 5）？**能補成功的牌可能有好幾張
   （例如 2 3 4 5 6，補 1、4、7 都行：1 2 3＋4 5 6、2 3 4＋4 5 6、2 3 4＋5 6 7），**把全部都點起來，再按「我選好了」**；漏一張、多一張都算錯。
   有的題目整排還要多留「一對」（兩張一樣的牌，就是麻將的「將」）：例如 1 1 2 3 4 5 6 7 8 9 9 9 9 … 這種才是真正的「聽牌」。
   畫面上方一直寫著規則（不會打麻將也看得懂）。
   ───────────────────────────────────────────────────────────────────
   · 這種題目，對人類來說難在哪（V1.36.0 的出題設計依據）：
       ① 「找全部」比「找一個」難非常多：要把九種牌逐一試過，而且每一張都要想「剩下的牌能不能分完」；找到一兩張就想收工，是最常見的錯誤（漏張）。
       ② 好找的答案是「補在旁邊」的牌（手上有 4 5，補 3 或 6）；藏起來的答案要換一種分法才看得到——
          例如 2 3 4 5 6：多數人只想到 2 3 4 ＋ 5 6（補 4、7）或 2 3 ＋ 4 5 6（補 1、4），看漏另一種；連續的牌越長、重複的牌越多，可以拆的方法越多，越容易漏。
       ③ 有「一對」的真聽牌：湊成一組一組之外，還要剛好留一對，答案常常有 4、5 張以上（13 張的清一色最多可以聽到 9 張），而且常有「補了只能湊一部分」的誘餌牌。
       ④ 麻將一種牌只有 4 張：手上已經有 4 張的牌，補不了第 5 張（「死牌」），明明湊得起來也不能算——很多人會忘記數張數。
     所以出題時：答案張數、手牌張數、有沒有一對、誘餌牌數、死牌陷阱都隨關卡增加；候選題裡再挑「可以拆的分法最多」的那一題。
   · 難度（都是線性）：手上的牌 5 → 14 張（TILES；沒有一對時補一張之後要是 3 的倍數，所以是 5、8、11、14 張；有一對時是 4、7、10、13 張，取最接近線性的那一個）、
     答案張數 1 → 6（ANSWERS；沒有一對的題目最多只有 3 張）、「只補局部」的誘餌牌至少 0 → 3 個（DECOYS）、第 PAIR_FROM 關起有一對的題目越來越多（PAIR_P）、
     限時 12 → 24 秒（TIME_S：牌多了要看得久，又要按「我選好了」，所以時間跟著變長；難度來自題目本身，不是靠趕時間）。
   · 出題（makeLevel）：先隨機湊一副完整的牌（若干組連號／三張一樣，有的再加一對；同一個數字最多 4 張，牌愈集中愈容易有多張答案），拿走一張當題目，
     再用程式窮舉 1～9 九種補法（winners），**答案張數要剛好等於這一關的目標**才出（目標湊不出來時才一張一張放寬）；
     而且要有至少 DECOYS 個誘餌（nearMisses：補了它之後，能湊出「比整排少一組」、而且那張牌自己有參加的分組，但湊不齊整排）。
   · 判定：補的牌 x 能不能把「手牌＋x」完全分成三張一組（有一對的題目：還要剛好留一對）（canGroup：每次拿最小的牌，只有「三張一樣」、「兩張一樣當對」或「連號」三種拿法，遞迴窮舉）；
     手上已經有 4 張的牌不能再補（MAX_SAME）。你選的牌必須剛好等於全部答案。
   · 揭曉：每個答案卡上色（選對＝綠、漏掉＝橘虛線、選錯＝紅）；上方列出每一張答案怎麼湊成組；選錯的牌會畫出「湊不起來的牌」（標紅），停格 2.8 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'mahjong3';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TILES = [5, 14];                        /* 手上的牌數：第 1 關 → 到頂（沒有一對時實際是 5、8、11、14；有一對時是 4、7、10、13） */
    var TIME_S = [12, 24];                      /* 每題限時（秒）：第 1 關 → 到頂（要找全部答案、還要按「我選好了」，牌多了要看得久，所以越後面越長） */
    var ANSWERS = [1, 6];                       /* 答案（補了能湊成功的牌）有幾張：第 1 關 → 到頂（沒有一對的題目最多 3 張） */
    var DECOYS = [0, 3];                        /* 「只補局部」的誘餌牌至少幾個：第 1 關 → 到頂 */
    var PAIR_FROM = 4;                          /* 第幾關起才有「要多一對」的題目（前面幾關只有最單純的「全部分成三張一組」） */
    var PAIR_P = [0.3, 0.85];                   /* 有一對的題目的機率：第 PAIR_FROM 關 → 到頂 */
    var DEAD_FROM = 6;                          /* 第幾關起才會有「死牌陷阱」（手上已有 4 張、補第 5 張就湊得起來的牌；要補它是不行的） */
    var DEAD_P = [0.2, 0.55];                   /* 出現死牌陷阱的題目機率：第 DEAD_FROM 關 → 到頂 */
    var SHOW_COUNT_UNTIL = 3;                   /* 前幾關會告訴你「答案共幾張」，之後不說（要自己判斷找齊了沒） */
    var MAX_SAME = 4;                           /* 同一個數字最多幾張（真的麻將一種牌只有 4 張） */
    var CANDS = 6, TRIES = 6000;                /* 出題：收集幾個候選題再挑最難的；最多隨機湊幾副牌 */
    var MAX_LEVEL = 90;
    var NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關有沒有「一對」：第 PAIR_FROM 關起，機率從 PAIR_P[0] 線性升到 PAIR_P[1] */
    function pairProb(level) { return level < PAIR_FROM ? 0 : kit.ramp(level, PAIR_P[0], PAIR_P[1], RAMP_LEVELS); }
    /* 這一關手上幾張牌：線性算出 5～14，再取最接近的合法張數（沒有一對：3 的倍數減 1＝5、8、11、14；有一對：3 的倍數加 1＝4、7、10、13） */
    function tilesFor(level, pair) {
        var t = kit.ramp(level, TILES[0], TILES[1], RAMP_LEVELS);
        if (pair) { var k2 = Math.round((t - 1) / 3); return Math.max(4, Math.min(13, k2 * 3 + 1)); }
        var k = Math.round((t - 2) / 3);
        return Math.max(5, Math.min(14, k * 3 + 2));
    }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function decoysFor(level) { return Math.round(kit.ramp(level, DECOYS[0], DECOYS[1], RAMP_LEVELS)); }
    function deadProb(level) { return level < DEAD_FROM ? 0 : kit.ramp(level, DEAD_P[0], DEAD_P[1], RAMP_LEVELS); }
    /* 這一關的答案要幾張：線性 ANSWERS[0] → ANSWERS[1]；沒有一對的題目最多 3 張 */
    function answersFor(level, pair) { return Math.min(pair ? ANSWERS[1] : 3, Math.max(1, Math.round(kit.ramp(level, ANSWERS[0], ANSWERS[1], RAMP_LEVELS)))); }
    /* 牌（1～9 的陣列）→ 每個數字幾張（counts[1]～counts[9]，counts[0] 不用） */
    function countsOf(tiles) { var c = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; tiles.forEach(function (t) { c[t]++; }); return c; }
    /* 能不能完全分成「三張連號」或「三張一樣」的組？needPair 為真時還要剛好留一對。
       做法：每次拿最小的牌，只有三種拿法——「三張一樣」、「它和另一張一樣當對」（只能用一次）、「它和 +1、+2 連號」；遞迴窮舉。 */
    function canGroup(c, needPair) {
        var i = 1;
        while (i <= 9 && c[i] === 0) i++;
        if (i > 9) return !needPair;
        if (c[i] >= 3) { c[i] -= 3; var a = canGroup(c, needPair); c[i] += 3; if (a) return true; }
        if (needPair && c[i] >= 2) { c[i] -= 2; var p = canGroup(c, false); c[i] += 2; if (p) return true; }
        if (i <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; var b = canGroup(c, needPair); c[i]++; c[i + 1]++; c[i + 2]++; if (b) return true; }
        return false;
    }
    /* 完整分組：回傳 { groups: 每組是 [a,b,c]（已排序）, pair: 那一對的數字（沒有一對＝0）}，分不完回傳 null */
    function groupsOf(c, needPair) {
        var i = 1;
        while (i <= 9 && c[i] === 0) i++;
        if (i > 9) return needPair ? null : { groups: [], pair: 0 };
        var r;
        if (c[i] >= 3) { c[i] -= 3; r = groupsOf(c, needPair); c[i] += 3; if (r) return { groups: [[i, i, i]].concat(r.groups), pair: r.pair }; }
        if (needPair && c[i] >= 2) { c[i] -= 2; r = groupsOf(c, false); c[i] += 2; if (r) return { groups: r.groups, pair: i }; }
        if (i <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; r = groupsOf(c, needPair); c[i]++; c[i + 1]++; c[i + 2]++; if (r) return { groups: [[i, i + 1, i + 2]].concat(r.groups), pair: r.pair }; }
        return null;
    }
    /* 有幾種不同的分法（能拆成一組一組的方法數，同樣的一堆組只算一種）：同一副牌，可以拆的方法越多，越容易只看到其中一種而漏掉別的答案。
       做法：最小的那個數字 i 有 c[i] 張，它們一定是「p 個對（0 或 1）、t 組三張一樣、s 組以 i 開頭的連號」湊出來的：c[i] = 2p + 3t + s，逐一試過每一種 (p, t, s)，再往下一個數字走。 */
    function countWays(c, needPair) {
        var i = 1;
        while (i <= 9 && c[i] === 0) i++;
        if (i > 9) return needPair ? 0 : 1;
        var n = 0, ci = c[i], c1 = c[i + 1], c2 = c[i + 2];
        for (var p = 0; p <= (needPair ? 1 : 0); p++) for (var t = 0; 2 * p + 3 * t <= ci; t++) {
            var sq = ci - 2 * p - 3 * t;
            if (sq > 0 && (i > 7 || c1 < sq || c2 < sq)) continue;
            c[i] = 0; if (sq) { c[i + 1] = c1 - sq; c[i + 2] = c2 - sq; }
            n += countWays(c, needPair && !p);
            c[i] = ci; if (sq) { c[i + 1] = c1; c[i + 2] = c2; }
        }
        return n;
    }
    /* 最多能分出幾組三張（剩下的牌可以丟掉，不看那一對）：回傳 { n（組數）, groups, left（沒分進任何一組的牌，已排序） }；
       must（選填）：這張牌一定要參加某一組（誘餌檢查用：補的那張牌自己有參加） */
    function bestGroups(tiles, must) {
        var c = countsOf(tiles), best = { n: -1, groups: [], left: [] };
        function dfs(i, groups, left) {
            while (i <= 9 && c[i] === 0) i++;
            if (i > 9) { if ((must == null || groups.some(function (g) { return g.indexOf(must) >= 0; })) && groups.length > best.n) best = { n: groups.length, groups: groups.slice(), left: left.slice() }; return; }
            if (c[i] >= 3) { c[i] -= 3; groups.push([i, i, i]); dfs(i, groups, left); groups.pop(); c[i] += 3; }
            if (i <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; groups.push([i, i + 1, i + 2]); dfs(i, groups, left); groups.pop(); c[i]++; c[i + 1]++; c[i + 2]++; }
            c[i]--; left.push(i); dfs(i, groups, left); left.pop(); c[i]++;                      /* 這張牌不分進任何組（丟掉） */
        }
        dfs(1, [], []);
        return best;
    }
    /* 補哪些牌（1～9）能把整排完全分好：hand 是手牌（數字陣列）；手上已經有 MAX_SAME 張的牌不能再補（死牌） */
    function winners(hand, needPair) {
        var out = [], base = countsOf(hand);
        for (var x = 1; x <= 9; x++) { if (base[x] >= MAX_SAME) continue; var c = base.slice(); c[x]++; if (canGroup(c, needPair)) out.push(x); }
        return out;
    }
    /* 「死牌陷阱」：手上已經有 MAX_SAME 張、如果可以補第 5 張就湊得起來的牌（規則上不能補，很多人會忘記數張數） */
    function deadTraps(hand, needPair) {
        var out = [], base = countsOf(hand);
        for (var x = 1; x <= 9; x++) { if (base[x] < MAX_SAME) continue; var c = base.slice(); c[x]++; if (canGroup(c, needPair)) out.push(x); }
        return out;
    }
    /* 誘餌牌：補了它之後，能分出「比整排少一組」的分組、而且它自己有參加，但湊不齊整排（它不是答案，也不是死牌） */
    function nearMisses(hand, needPair, win) {
        var full = needPair ? (hand.length - 1) / 3 : (hand.length + 1) / 3, out = [], base = countsOf(hand);
        win = win || winners(hand, needPair);
        for (var y = 1; y <= 9; y++) {
            if (win.indexOf(y) >= 0 || base[y] >= MAX_SAME) continue;
            var r = bestGroups(hand.concat([y]), y);
            if (r.n >= full - 1) out.push(y);
        }
        return out;
    }
    /* 隨機湊一副完整的牌（counts）：g 組（連號機率 pSeq，其餘是三張一樣）、needPair 時再加一對；組的起點限制在 window 個數字內，牌才會集中、容易有多張答案；
       cap 是同一個數字最多幾張（預設 MAX_SAME；做「死牌陷阱」時傳 MAX_SAME + 1，湊出一副有 5 張同樣的牌，再拿走其中一張，手上就只剩 4 張、那第 5 張補不了）；湊不出來回傳 null */
    function randomComplete(g, needPair, pSeq, window, rand, cap) {
        cap = cap || MAX_SAME;
        for (var tr = 0; tr < 30; tr++) {
            var c = countsOf([]), ok = true, lo = kit.randInt(1, 9 - window + 1, rand), hi = lo + window - 1;
            for (var k = 0; k < g && ok; k++) {
                if (rand() < pSeq) {
                    var s = kit.randInt(lo, Math.min(hi, 7), rand);
                    if (s > 7 || c[s] >= cap || c[s + 1] >= cap || c[s + 2] >= cap) ok = false; else { c[s]++; c[s + 1]++; c[s + 2]++; }
                } else {
                    var v = kit.randInt(lo, hi, rand);
                    if (c[v] + 3 > cap) ok = false; else c[v] += 3;
                }
            }
            if (!ok) continue;
            if (needPair) { var pv = kit.randInt(lo, hi, rand); if (c[pv] + 2 > cap) continue; c[pv] += 2; }
            return c;
        }
        return null;
    }
    /* 出一關：{ hand（排序後的手牌）, winners（全部答案，由小到大）, near（誘餌牌）, dead（死牌陷阱）, pair（要不要多一對）, ways（這些答案總共有幾種分法）, tiles, target（這一關的答案張數目標）, level }
       forcePair（選填，測試用）：true／false 強制有沒有一對 */
    function makeLevel(level, rand, forcePair) {
        rand = rand || Math.random;
        var pair = forcePair == null ? rand() < pairProb(level) : !!forcePair;
        var m = tilesFor(level, pair), g = pair ? (m - 1) / 3 : (m + 1) / 3, need = decoysFor(level), target = answersFor(level, pair), best = null, got = 0;
        var wantDead = rand() < deadProb(level);                                        /* 這一題要不要做「死牌陷阱」（做不出來時，後半段的嘗試會改成不要） */
        for (var tr = 0; tr < TRIES && got < CANDS; tr++) {
            var tgt = Math.max(1, target - Math.floor(tr * 4 / TRIES));                /* 目標湊不出來時，一張一張放寬（最多放寬 3 張） */
            var dead5 = wantDead && tr < TRIES / 2;
            var c = randomComplete(g, pair, 0.5 + 0.4 * rand(), kit.randInt(5, 9, rand), rand, dead5 ? MAX_SAME + 1 : MAX_SAME);
            if (!c) continue;
            var all = []; for (var i = 1; i <= 9; i++) for (var j = 0; j < c[i]; j++) all.push(i);
            var x;
            if (dead5) {                                                               /* 死牌陷阱：一定要有某個數字湊到 5 張，拿走的就是那個數字的一張 */
                var fives = []; for (var f = 1; f <= 9; f++) if (c[f] > MAX_SAME) fives.push(f);
                if (!fives.length) continue;
                x = kit.pick(fives, rand);
            } else {
                if (c.some(function (n) { return n > MAX_SAME; })) continue;
                x = kit.pick(all, rand);
            }
            var hand = all.slice(); hand.splice(hand.indexOf(x), 1);
            var win = winners(hand, pair);
            if (best ? win.length !== best.winners.length : win.length !== tgt) continue;       /* 已經有候選題之後，只收答案張數一樣的 */
            var near = nearMisses(hand, pair, win);
            if (near.length < need) continue;                                          /* 誘餌夠多 */
            var dead = deadTraps(hand, pair), ways = 0, hc = countsOf(hand);
            if (dead5 && dead.indexOf(x) < 0) continue;                                 /* 要的就是「補第 5 張才湊得起來」的陷阱 */
            win.forEach(function (w) { var cc = hc.slice(); cc[w]++; ways += countWays(cc, pair); });
            got++;
            var score = ways + 3 * near.length + 4 * dead.length;
            if (!best || score > best.score) best = { hand: hand, winners: win, near: near, dead: dead, pair: pair, ways: ways, tiles: m, target: tgt, level: level, score: score };
        }
        if (best) return best;
        /* 保底（極少用到）：1 1 1 2 3，補 1（111＋123）或補 4（111＋234）都行 */
        var fb = [1, 1, 1, 2, 3];
        return { hand: fb, winners: winners(fb, false), near: nearMisses(fb, false), dead: deadTraps(fb, false), pair: false, ways: 2, tiles: 5, target: 2, level: level, score: 0 };
    }
    function rating(n) {
        if (n >= 25) return '麻將神手！';
        if (n >= 15) return '牌感很好！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先把能湊的組挑出來，再看缺哪幾張，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'mj3-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一排牌（含分組括號）：tiles＝數字陣列（排序後）、groups＝每組的「牌的位置」陣列、leftIdx＝要標紅的位置、added＝剛補的那張的位置 */
    function strip(parent, tiles, groupIdx, leftIdx, added, cls) {
        var row = h('div', { 'class': 'mj3-strip ' + (cls || '') }), cells = [];
        var inGroup = {};
        groupIdx.forEach(function (g, gi) { g.forEach(function (p) { inGroup[p] = gi; }); });
        tiles.forEach(function (t, i) {
            var el = h('div', { 'class': 'mj3-tile' + (i === added ? ' mj3-tile--added' : '') + (leftIdx.indexOf(i) >= 0 ? ' mj3-tile--left' : '') + (inGroup[i] != null ? ' mj3-tile--g' + (inGroup[i] % 3) : '') }, [
                h('div', { 'class': 'mj3-num', text: NUMERALS[t - 1] }), h('div', { 'class': 'mj3-pip', text: String(t) })
            ]);
            row.appendChild(el); cells.push(el);
        });
        parent.appendChild(row);
        return row;
    }
    /* 把「手牌＋補的一張」排序之後，找出每個分組、補的那張各在第幾個位置（同樣的牌，補的那張排在同數字的最後面） */
    function layout(hand, x, groups) {
        var tiles = hand.concat([x]).sort(function (a, b) { return a - b; });
        var addedIdx = tiles.lastIndexOf(x), used = {}, gIdx = [];
        (groups || []).forEach(function (g) {
            var idxs = [];
            g.forEach(function (v) { for (var p = 0; p < tiles.length; p++) if (tiles[p] === v && !used[p]) { used[p] = true; idxs.push(p); break; } });
            gIdx.push(idxs);
        });
        return { tiles: tiles, addedIdx: addedIdx, groupIdx: gIdx, usedIdx: used };
    }
    function numeralsOf(list) { return list.map(function (t) { return NUMERALS[t - 1]; }).join('、'); }
    function groupText(g) { return g.map(function (t) { return NUMERALS[t - 1]; }).join(''); }
    /* 補了 x 之後怎麼湊成組的文字：「一二三　四五六」（有一對時最後加「　對 七七」） */
    function decompText(hand, x, pair) {
        var c = countsOf(hand); c[x]++;
        var r = groupsOf(c, pair);
        if (!r) return '';
        return r.groups.map(groupText).join('　') + (pair ? '　對 ' + NUMERALS[r.pair - 1] + NUMERALS[r.pair - 1] : '');
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), W = q.winners, isWin = {}, sel = {};
        W.forEach(function (w) { isWin[w] = true; });
        api.info = q;
        console.log('[缺哪一張] 第 ' + level + ' 關：手牌 ' + q.hand.join(' ') + '（' + q.hand.length + ' 張' + (q.pair ? '，要一對' : '') + '），答案 ' + W.join('、') + '（' + W.length + ' 張）；誘餌 ' + (q.near.join('、') || '（無）') + '；死牌陷阱 ' + (q.dead.join('、') || '（無）') + '；限時 ' + timeMs(level) + ' ms');

        var rule = h('div', { 'class': 'qz-note mj3-rule', text: q.pair ? '補哪些牌，整排能分成一組一組的三張（連號或三張一樣），剛好再留一對？' : '補哪些牌，整排能剛好分成「三張連號」或「三張一樣」的組？' });
        stage.appendChild(rule);
        var table = h('div', { 'class': 'mj3-table' });
        stage.appendChild(table);
        strip(table, q.hand, [], [], -1, 'mj3-strip--hand');
        var note = h('div', { 'class': 'qz-note mj3-note', text: '' });
        stage.appendChild(note);
        var go = h('button', { 'class': 'mj3-go', type: 'button', text: '我選好了' });
        go.disabled = true;
        stage.appendChild(go);
        var keys = h('div', { 'class': 'mj3-keys' }), keyEls = [];
        for (var v = 1; v <= 9; v++) (function (v) {
            var b = h('button', { 'class': 'mj3-key', type: 'button' }, [h('span', { 'class': 'mj3-key-num', text: NUMERALS[v - 1] }), h('span', { 'class': 'mj3-key-pip', text: String(v) })]);
            kit.onTap(b, function () { toggle(v); });
            keys.appendChild(b); keyEls.push(b);
        })(v);
        stage.appendChild(keys);
        kit.onTap(go, function () { judge(); });
        function chosen() { var out = []; for (var t = 1; t <= 9; t++) if (sel[t]) out.push(t); return out; }
        function refresh() {
            var n = chosen().length;
            go.disabled = n === 0;
            go.textContent = n ? '我選好了（選了 ' + n + ' 張）' : '我選好了';
            note.textContent = level <= SHOW_COUNT_UNTIL ? '答案共 ' + W.length + ' 張' : '答案可能不只一張，要全部找出來';
        }
        refresh();
        function toggle(v) {
            if (api.over) return;
            sel[v] = !sel[v];
            keyEls[v - 1].classList.toggle('mj3-key--sel', !!sel[v]);
            Sfx.play('tick');
            refresh();
        }
        api.timer(timeMs(level), function () { judge(); });
        if (level === 1 && kit.once('mahjong3.hint')) kit.hintOn(stage, keyEls[W[0] - 1], { mode: 'tap', delay: 700, text: '點補上去能湊成組的牌，再按「我選好了」' });

        /* 揭曉：全部選對（剛好等於全部答案）才過關；時間到就拿目前選的來算 */
        function judge() {
            if (api.over) return;
            var picks = chosen(), missed = W.filter(function (w) { return !sel[w]; }), extra = picks.filter(function (p) { return !isWin[p]; });
            var ok = !missed.length && !extra.length;
            keyEls.forEach(function (b, i) {
                var t = i + 1;
                b.disabled = true; b.classList.remove('mj3-key--sel');
                if (isWin[t] && sel[t]) b.classList.add('mj3-key--ok');
                else if (isWin[t]) b.classList.add('mj3-key--miss');
                else if (sel[t]) b.classList.add('mj3-key--bad');
            });
            go.style.display = 'none';
            table.innerHTML = '';
            var lines = [];
            if (!ok) {
                /* 選錯的牌：畫出補上去之後「湊不起來的牌」（標紅）；已經有 4 張的牌要說明不能補第 5 張 */
                if (extra.length) {
                    var x = extra[0], base = countsOf(q.hand);
                    if (base[x] >= MAX_SAME) {
                        table.appendChild(h('div', { 'class': 'mj3-cap', text: '你選了「' + NUMERALS[x - 1] + '」：手上已經有 ' + MAX_SAME + ' 張，不能再補第 ' + (MAX_SAME + 1) + ' 張' }));
                        strip(table, q.hand, [], [], -1, 'mj3-strip--wrong');
                    } else {
                        var wrong = bestGroups(q.hand.concat([x]), x), Lw = layout(q.hand, x, wrong.groups), leftIdx = [];
                        for (var p = 0; p < Lw.tiles.length; p++) if (!Lw.usedIdx[p]) leftIdx.push(p);
                        table.appendChild(h('div', { 'class': 'mj3-cap', text: '你選了「' + NUMERALS[x - 1] + '」：這幾張（紅色）湊不起來' }));
                        strip(table, Lw.tiles, Lw.groupIdx, leftIdx, Lw.addedIdx, 'mj3-strip--wrong');
                    }
                } else strip(table, q.hand, [], [], -1, 'mj3-strip--hand');
            } else strip(table, q.hand, [], [], -1, 'mj3-strip--hand');
            /* 每一張答案怎麼湊成組 */
            W.forEach(function (w) {
                table.appendChild(h('div', { 'class': 'mj3-cap mj3-cap--ok' + (sel[w] ? '' : ' mj3-cap--miss'), text: (sel[w] ? '' : '漏了　') + '補「' + NUMERALS[w - 1] + '」：' + decompText(q.hand, w, q.pair) }));
            });
            note.textContent = '';
            if (ok) {
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1800 });
                return;
            }
            lines.push((picks.length ? '你選了 ' + picks.length + ' 張' : '時間到，你還沒選') + (missed.length ? '，漏了「' + numeralsOf(missed) + '」' : '') + (extra.length ? '，多選了「' + numeralsOf(extra) + '」' : ''));
            lines.push('正確答案共 ' + W.length + ' 張：' + numeralsOf(W));
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3200, lines: lines });
        }
        /* 驗證用：api.solve 把全部答案點起來再按「我選好了」；api.wrong 只選一張不是答案的牌（九張全是答案就什麼都不選） */
        api.solve = function () { sel = {}; W.forEach(function (w) { sel[w] = true; }); judge(); };
        api.wrong = function () { sel = {}; for (var t = 1; t <= 9; t++) if (!isWin[t]) { sel[t] = true; break; } judge(); };
    }

    var G = {
        id: ID,
        name: '缺哪一張',
        rule: '麻將桌上有一排同花色的數字牌（一～九）。**補哪些牌，就能把整排剛好分成「三張連號」或「三張一樣」的組？**例如 2 3 4 是連號、5 5 5 是三張一樣。**能補成功的牌可能不只一張，要全部點起來**，再按「我選好了」。有的題目整排還要多留**一對（兩張一樣）**。一種牌最多 4 張，手上已經有 4 張就不能再補。漏一張、多一張都算錯，來不及也結束，看你能過幾關。越後面，牌越多、答案越多、越多牌「補了只能湊一部分」來騙你！',
        mount: mount,
        score: SCORE,
        test: {
            pairProb: pairProb, tilesFor: tilesFor, timeMs: timeMs, decoysFor: decoysFor, answersFor: answersFor, countsOf: countsOf, canGroup: canGroup, groupsOf: groupsOf, countWays: countWays, bestGroups: bestGroups,
            winners: winners, deadTraps: deadTraps, deadProb: deadProb, nearMisses: nearMisses, randomComplete: randomComplete, makeLevel: makeLevel, layout: layout, decompText: decompText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TILES: TILES, TIME_S: TIME_S, ANSWERS: ANSWERS, DECOYS: DECOYS, PAIR_FROM: PAIR_FROM, PAIR_P: PAIR_P, DEAD_FROM: DEAD_FROM, DEAD_P: DEAD_P, SHOW_COUNT_UNTIL: SHOW_COUNT_UNTIL, MAX_SAME: MAX_SAME, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
