/* ═══════════════════════════════════════════════════════════════════
   flipsum_core.js — 「翻牌湊 100」系列的共用引擎（V1.57.0 新增）：翻牌湊百（翻兩張加起來 100）、翻三湊百（翻三張加起來 100）共用
   ───────────────────────────────────────────────────────────────────
   這個檔案「不是遊戲」：只放兩款遊戲共用的出題與畫面程式，掛在 Reaction.flipSum 底下；
   難度參數、玩法說明、遊戲登記都在各自的遊戲檔（js/reaction_flipcent.js、js/reaction_flip3cent.js）。
   ───────────────────────────────────────────────────────────────────
   【出題】
   · 兩張一組（翻牌湊百）：牌是 1～99，每一組是 a ＋ (100 − a)。**只算「尾數」的投機取巧**：兩張加起來是 100，尾數一定是「1＋9、2＋8、3＋7、4＋6、5＋5、0＋0」；
     玩家只看尾數就能猜出誰跟誰一組。所以牌多的時候故意讓好幾組的尾數相同（例如 43＋57、63＋37、23＋77 都是「3 跟 7」），
     只看尾數會湊到 63＋57＝120 這種錯的。每一個「尾數組」最多有 10 組（尾數 5、0 的只有 5 組）。
     同一個尾數組的牌，彼此十位數要真的加起來才分得出來（尾數 3＋7 時，十位數要加起來是 9）。
     group（每個尾數組放幾組牌）隨關卡增加：1 ＝ 每組牌的尾數都不一樣（只看尾數就猜得到），越大越多組共用同一種尾數。
   · 三張一組（翻三湊百）：三個數字加起來是 100，**除了預定的那幾組，整副牌裡找不到任何別組三張加起來是 100**（makeTripleDeck 保證）——
     不然玩家翻到「碰巧湊成 100 的別組」把牌消掉，剩下的牌可能再也湊不出 100（卡死）。三張的尾數加起來要是 10 的倍數，只看尾數會猜錯一大堆。
   · 完美記憶策略（perfectTries）：模擬一個「永遠記得每張翻過的牌、但不偷看沒翻過的牌」的玩家要翻幾次；翻牌上限 ＝ 這個次數 ＋ 寬限。
   【畫面】mount(root, ctx, cfg)：牌蓋著排成方陣，每次翻 k 張（2 或 3）；加起來 100 就消掉，不是就讓玩家看 showMs 毫秒再蓋回去；
     翻牌次數有上限；全部消完過關，次數用完失敗（把剩下的牌翻開給你看）。
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';

    var Reaction = global.Reaction = global.Reaction || {};
    var kit = Reaction.kit, h = global.UI && global.UI.h;
    var FS = Reaction.flipSum = {};
    FS.TARGET = 100;                                    /* 目標：翻開的牌加起來要等於多少 */

    /* ─── 兩張一組：尾數組 ─── */
    /* 每個「尾數組」以較小的尾數 u 編號：u＝1～4（尾數 u 與 10−u）每組最多 10 對；u＝5（5 與 5）最多 5 對；u＝0（0 與 0）最多 5 對（含 50＋50） */
    FS.CAP = { 0: 5, 1: 10, 2: 10, 3: 10, 4: 10, 5: 5 };
    /* 尾數組 u 裡所有「加起來是 100」的牌對 [a, 100 − a]（a 是尾數 u 的那一張；尾數 0、5 的每一對只列一次） */
    FS.classPairs = function (u) {
        var out = [], t, a;
        if (u === 0) { for (t = 1; t <= 5; t++) out.push([10 * t, 100 - 10 * t]); }              /* 10＋90、20＋80、30＋70、40＋60、50＋50 */
        else if (u === 5) { for (t = 0; t <= 4; t++) out.push([10 * t + 5, 95 - 10 * t]); }      /* 5＋95、15＋85、25＋75、35＋65、45＋55 */
        else for (t = 0; t <= 9; t++) { a = 10 * t + u; out.push([a, 100 - a]); }               /* 例：u＝3 → 3＋97、13＋87、…、93＋7 */
        return out;
    };
    /* 這張牌所屬的尾數組 u：尾數 d → min(d, 10 − d)（尾數 0 是 0） */
    FS.classOf = function (v) { var d = v % 10; return d === 0 ? 0 : Math.min(d, 10 - d); };
    /* 兩張一組的一副牌：P 組牌，group＝每個尾數組放幾組牌（至少 1）。回傳 { pairs, deck（a, b, a, b… 還沒洗牌）, classes（用到哪幾個尾數組）, group } */
    FS.makePairDeck = function (P, group, rand) {
        rand = rand || Math.random;
        group = Math.max(1, Math.round(group || 1));
        var K = Math.min(6, Math.max(Math.ceil(P / group), Math.ceil(P / 10), 1)), elig, need;
        for (; ; K++) {                                                 /* 用到 K 個尾數組、每組平均 need 對；容量不夠的尾數組不能選，不夠 K 個就多用一個尾數組 */
            need = Math.ceil(P / K);
            elig = [0, 1, 2, 3, 4, 5].filter(function (u) { return FS.CAP[u] >= need; });
            if (elig.length >= K || K >= 6) break;
        }
        var classes = kit.shuffle(elig, rand).slice(0, K), pairs = [];
        classes.forEach(function (u, i) {
            var cnt = Math.floor(P / K) + (i < P % K ? 1 : 0);
            kit.shuffle(FS.classPairs(u), rand).slice(0, cnt).forEach(function (p) { pairs.push(p); });
        });
        var deck = []; pairs.forEach(function (p) { deck.push(p[0], p[1]); });
        return { pairs: pairs, deck: deck, classes: classes, group: group };
    };
    /* 「只看尾數」會被騙的程度：每張牌有幾張別的牌「尾數加起來是 10 的倍數」（真正的搭檔只有 1 張）；回傳全副牌的平均。越大＝只看尾數越容易湊錯 */
    FS.tailMates = function (deck) {
        var sum = 0;
        for (var i = 0; i < deck.length; i++) for (var j = 0; j < deck.length; j++) if (i !== j && (deck[i] % 10 + deck[j] % 10) % 10 === 0) sum++;
        return deck.length ? sum / deck.length : 0;
    };

    /* ─── 三張一組 ─── */
    /* 一副牌裡所有「k 張加起來是 100」的組合（牌的位置編號，由小到大）；k＝2 或 3 */
    FS.validGroups = function (deck, k) {
        var out = [], n = deck.length, i, j, l;
        for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
            if (k === 2) { if (deck[i] + deck[j] === FS.TARGET) out.push([i, j]); continue; }
            for (l = j + 1; l < n; l++) if (deck[i] + deck[j] + deck[l] === FS.TARGET) out.push([i, j, l]);
        }
        return out;
    };
    /* 三張一組的一副牌：T 組，每組三個 1～99 的數字加起來是 100，全部數字不重複，而且除了這 T 組之外「找不到別組三張加起來是 100」。
       做法：一組一組加；每加一組就檢查「新的三張」跟整副牌裡的其他牌會不會多出別組的 100，會就重抽；整副牌卡住就整個重來。
       T ≤ 6（18 張）幾乎一次就成功；再大成功率快速下降（24 張只有約 1/200），所以遊戲檔的階段最多到 18 張。
       重來 maxRestarts 次都不行就放棄「別組不能湊成 100」這個條件（deck.clean ＝ false），至少數字加起來還是對的。回傳 { triples, deck（還沒洗牌）, clean } */
    FS.makeTripleDeck = function (T, rand, maxRestarts) {
        rand = rand || Math.random;
        maxRestarts = maxRestarts == null ? 400 : maxRestarts;
        function ri(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
        function build(strict) {
            var used = new Set(), triples = [];
            for (var k = 0; k < T; k++) {
                var placed = false;
                for (var t = 0; t < 600 && !placed; t++) {
                    var a = ri(1, 98), b = ri(1, 98), c = FS.TARGET - a - b;
                    if (c < 1 || c > 99 || a === b || a === c || b === c || used.has(a) || used.has(b) || used.has(c)) continue;
                    if (strict) {
                        var all = new Set(used); all.add(a); all.add(b); all.add(c);
                        var key = [a, b, c].sort(function (p, q) { return p - q; }).join(), conflict = false;
                        [a, b, c].forEach(function (v) {
                            if (conflict) return;
                            all.forEach(function (x) {
                                if (conflict || x === v) return;
                                var y = FS.TARGET - v - x;
                                if (y === v || y === x || !all.has(y)) return;
                                if ([v, x, y].sort(function (p, q) { return p - q; }).join() !== key) conflict = true;
                            });
                        });
                        if (conflict) continue;
                    }
                    used.add(a); used.add(b); used.add(c); triples.push([a, b, c]); placed = true;
                }
                if (!placed) return null;
            }
            return triples;
        }
        var tr = null, clean = true, tries;
        for (tries = 0; tries <= maxRestarts && !tr; tries++) tr = build(true);
        if (!tr) { clean = false; while (!tr) tr = build(false); }
        var deck = []; tr.forEach(function (t3) { deck.push(t3[0], t3[1], t3[2]); });
        return { triples: tr, deck: deck, clean: clean, restarts: tries - 1 };
    };

    /* ─── 牌的位置：鄰居、「湊成 100 又相鄰」的拆開（兩張一組才用；V1.47 翻牌湊十的做法） ─── */
    /* 第 i 張牌的鄰居：同一列左右各一張、同一欄上下各一張（牌由左到右、由上到下排成每列 cols 張；最後一列可能不滿） */
    FS.neighborsOf = function (i, n, cols) {
        var out = [], c = i % cols;
        if (c > 0) out.push(i - 1);
        if (c < cols - 1 && i + 1 < n) out.push(i + 1);
        if (i - cols >= 0) out.push(i - cols);
        if (i + cols < n) out.push(i + cols);
        return out;
    };
    /* 所有「加起來是 100、又左右或上下相鄰」的兩張牌：[[位置小的, 位置大的], …] */
    FS.adjacentPairs = function (deck, cols) {
        var out = [];
        for (var i = 0; i < deck.length; i++) FS.neighborsOf(i, deck.length, cols).forEach(function (j) { if (j > i && deck[i] + deck[j] === FS.TARGET) out.push([i, j]); });
        return out;
    };
    /* 把「湊成 100 又相鄰」的牌拆開一些：每發現一組，擲一次骰子，keepP 的機會保留（凍結）它們相鄰，其餘的跟別處的牌對調（對調後那兩個位置都不能再有「湊成 100 的鄰居」）。
       拆不開就放著不管。deck 不會被改（回傳新陣列）。 */
    FS.spread = function (deck, cols, rand, keepP) {
        rand = rand || Math.random;
        var d = deck.slice(), n = d.length, kept = {}, frozen = {}, guard = 0;
        function mates(k) { var c = 0; FS.neighborsOf(k, n, cols).forEach(function (j) { if (d[k] + d[j] === FS.TARGET) c++; }); return c; }
        while (guard++ < 500) {
            var todo = FS.adjacentPairs(d, cols).filter(function (p) { return !kept[p[0] + ',' + p[1]]; });
            if (!todo.length) break;
            var p = todo[0], i = p[0], j = p[1];
            if (rand() < keepP) { kept[i + ',' + j] = true; frozen[i] = frozen[j] = true; continue; }
            var done = false;
            [i, j].forEach(function (a) {
                if (done || frozen[a]) return;
                kit.shuffle(d.map(function (_, q) { return q; }), rand).forEach(function (q) {
                    if (done || q === i || q === j || frozen[q]) return;
                    var t = d[a]; d[a] = d[q]; d[q] = t;
                    if (mates(a) === 0 && mates(q) === 0) done = true; else { t = d[a]; d[a] = d[q]; d[q] = t; }
                });
            });
            if (!done) { kept[i + ',' + j] = true; frozen[i] = frozen[j] = true; }
        }
        return d;
    };

    /* ─── 完美記憶策略要翻幾次（一次＝翻 k 張）：k＝2 或 3 ───
       模擬一個「永遠記得每張翻過的牌、但不偷看沒翻過的牌」的玩家：
       · 記得的牌裡（還沒消掉）已經有一組湊成 100，就翻它們（一次）；
       · k＝2：翻一張沒翻過的牌；它的搭檔（100 減它）已經知道在哪裡就去翻，不然再翻一張沒翻過的；
       · k＝3：記得的牌裡有兩張就翻它們再加一張沒翻過的（總和還不到 100 的那一對，才有機會湊）；記得的不到兩張就翻三張沒翻過的（只記得一張就是它加兩張沒翻過的）。 */
    FS.perfectTries = function (deck, k) {
        var n = deck.length, gone = new Array(n).fill(false), known = new Array(n).fill(false), tries = 0, left = n, guard = 0, T = FS.TARGET;
        function knownIdx() { var o = []; for (var i = 0; i < n; i++) if (known[i] && !gone[i]) o.push(i); return o; }
        function knownGroup() {
            var ks = knownIdx(), a, b, c;
            for (a = 0; a < ks.length; a++) for (b = a + 1; b < ks.length; b++) {
                if (k === 2) { if (deck[ks[a]] + deck[ks[b]] === T) return [ks[a], ks[b]]; continue; }
                for (c = b + 1; c < ks.length; c++) if (deck[ks[a]] + deck[ks[b]] + deck[ks[c]] === T) return [ks[a], ks[b], ks[c]];
            }
            return null;
        }
        function firstUnknown(skip) { for (var i = 0; i < n; i++) if (!known[i] && !gone[i] && skip.indexOf(i) < 0) return i; return -1; }
        function take(g) { g.forEach(function (i) { gone[i] = true; }); left -= g.length; }
        while (left > 0 && guard++ < 5000) {
            var kg = knownGroup();
            if (kg) { tries++; take(kg); continue; }
            var u, picks, ks2 = knownIdx();
            if (k === 2) {
                u = firstUnknown([]); if (u < 0) break;
                known[u] = true;
                var mate = -1;
                for (var j = 0; j < ks2.length; j++) if (deck[ks2[j]] + deck[u] === T) { mate = ks2[j]; break; }
                if (mate >= 0) { tries++; take([u, mate]); continue; }
                var u2 = firstUnknown([u]); if (u2 < 0) break;
                known[u2] = true; tries++;
                if (deck[u] + deck[u2] === T) take([u, u2]);
                continue;
            }
            /* k＝3：先挑出已知的牌（最多兩張；挑總和還沒超過 99 的一對），再補沒翻過的牌補滿三張 */
            picks = [];
            for (var a = 0; a < ks2.length && picks.length < 2; a++) for (var b = a + 1; b < ks2.length && picks.length < 2; b++) if (deck[ks2[a]] + deck[ks2[b]] <= T - 1) picks = [ks2[a], ks2[b]];
            if (!picks.length && ks2.length === 1) picks = [ks2[0]];
            while (picks.length < 3) {
                u = firstUnknown(picks); if (u < 0) break;
                known[u] = true; picks.push(u);
            }
            tries++;
            if (picks.length === 3 && deck[picks[0]] + deck[picks[1]] + deck[picks[2]] === T) take(picks);
            else if (picks.length < 3) break;
        }
        return tries;
    };

    /* 牌（答案格子）的大小：每列 cols 張，寬 cw 由舞台寬度 W 平分；高 ch ＝ 寬 × cardH（各遊戲檔的參數 CARD_H，預設 0.95），但所有列（共 ceil(n ÷ cols) 列）都要放得進畫面高度 H（上下的說明文字約占 200 px）。回傳 { cw, ch, rows } */
    FS.cardSize = function (W, H, n, cols, cardH) {
        var rows = Math.ceil(n / cols), cw = Math.floor(W * 0.96 / cols) - 8;
        return { cw: cw, ch: Math.min(Math.floor(cw * (cardH == null ? 0.95 : cardH)), Math.floor((H - 200) / rows) - 8), rows: rows };
    };
    /* ═══ 畫面 ═══
       cfg：{ id, G, prefix（class 前綴，例如 'flipcent'）, k（每次翻幾張：2 或 3）, maxLevel, cols,
              cardH（牌的高度是牌寬的幾倍，沒給就 0.95）, makePuzzle(level, rand) → { n, deck, perfect, limit }, showMs（翻錯時露出多久）, matchMs, passDelayMs, failHoldMs,
              timeMs(level)（這一關的時間限制，毫秒；V1.57.0 玩家意見：沒給就不限時）, 
              unit（「組」）, goalText（例：「加起來是 100」）, rating(n) } */
    FS.mount = function (root, ctx, cfg) {
        kit.run(root, ctx, {
            id: cfg.id, G: cfg.G, maxLevel: cfg.maxLevel, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: cfg.rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: function (api) { FS.setup(api, cfg); }
        });
    };
    FS.setup = function (api, cfg) {
        var stage = api.stage, level = api.level, k = cfg.k, P = cfg.prefix, T = FS.TARGET, COLS = cfg.cols;
        var pz = cfg.makePuzzle(level, api.rand), n = pz.n, deck = pz.deck, groupsTotal = n / k;
        api.info = pz;                                  /* 題目資料掛在 api.info，測試與 debug 用 */
        try { console.log('[' + cfg.name + '] 第 ' + level + ' 關：' + n + ' 張；完美記憶策略 ' + pz.perfect + ' 次，上限 ' + pz.limit + ' 次'); } catch (e) { }
        var W = stage.clientWidth || 472, H = stage.clientHeight || 700, sz = FS.cardSize(W, H, n, COLS, cfg.cardH), cw = sz.cw, ch = sz.ch;     /* 牌的大小：高 ＝ 寬 × cfg.cardH（遊戲檔的 CARD_H），放不下就縮 */
        var up = [], gone = new Array(n).fill(false), groupsLeft = groupsTotal, used = 0, busy = false, over = false;
        var wrap = h('div', { 'class': P + '-wrap' }), info = h('div', { 'class': P + '-info' }), board = h('div', { 'class': P + '-board' });
        board.style.setProperty('--' + P + '-cols', COLS);
        board.style.setProperty('--' + P + '-w', cw + 'px');
        board.style.setProperty('--' + P + '-h', ch + 'px');
        board.style.setProperty('--' + P + '-fs', Math.floor(Math.min(cw, ch) * 0.52) + 'px');       /* 牌上兩位數字的字級（寬度要放得進一張牌） */
        var tip = h('div', { 'class': P + '-tip', text: cfg.tipIdle });
        var cards = [];
        var timeMs = cfg.timeMs ? cfg.timeMs(level) : 0;                  /* 這一關的時間限制（毫秒）；0＝不限時 */
        for (var i = 0; i < n; i++) {
            var c = h('div', { 'class': P + '-card', text: '' });
            (function (idx) { kit.onTap(c, function () { flip(idx); }); })(i);
            board.appendChild(c); cards.push(c);
        }
        wrap.appendChild(info); wrap.appendChild(board); wrap.appendChild(tip);
        stage.appendChild(wrap);

        function paint() {
            info.textContent = '還能翻 ' + Math.max(0, pz.limit - used) + ' 次　已消 ' + (groupsTotal - groupsLeft) + '/' + groupsTotal;
            for (var i = 0; i < n; i++) {
                var show = up.indexOf(i) >= 0 || (over && !gone[i]);
                cards[i].className = P + '-card' + (gone[i] ? ' ' + P + '-card--gone' : show ? ' ' + P + '-card--up' : '') + (over && !gone[i] ? ' ' + P + '-card--reveal' : '');
                cards[i].textContent = show && !gone[i] ? String(deck[i]) : '';
            }
        }
        function sumText(idxs) { var vals = idxs.map(function (i) { return deck[i]; }), s = vals.reduce(function (a, b) { return a + b; }, 0); return vals.join(' + ') + ' = ' + s; }
        /* 翻一張牌：翻滿 k 張時次數 +1 並判斷總和——是 100 就停 matchMs 毫秒後消掉；不是就讓玩家看 showMs 毫秒再蓋回去 */
        function flip(i) {
            if (busy || over || gone[i] || up.indexOf(i) >= 0) return;
            up.push(i);
            if (up.length < k) { paint(); return; }
            used++; busy = true; paint();
            var grp = up.slice(), sum = grp.reduce(function (s, x) { return s + deck[x]; }, 0);
            if (sum === T) {
                tip.textContent = sumText(grp) + '！';
                Sfx.play('ok');
                api.after(cfg.matchMs, function () {
                    if (over) return;                          /* 時間到、已經結束了 */
                    grp.forEach(function (x) { gone[x] = true; });
                    up = []; groupsLeft--; busy = false; paint();
                    if (groupsLeft === 0) {
                        over = true; paint(); tip.textContent = '全部消完！用了 ' + used + ' 次（完美記憶策略 ' + pz.perfect + ' 次）';
                        kit.flash(stage, true, api.my); api.pass({ delay: cfg.passDelayMs });
                    } else if (used >= pz.limit) failNow();
                    else tip.textContent = cfg.tipIdle;
                });
            } else {
                tip.textContent = sumText(grp) + '，不是 ' + T + '，記住位置！';
                api.after(cfg.showMs, function () {
                    if (over) return;                          /* 時間到、已經結束了 */
                    up = []; busy = false; paint();
                    if (used >= pz.limit) failNow(); else tip.textContent = cfg.tipIdle;
                });
            }
        }
        function failNow(timeUp) {                      /* timeUp 為真：是時間到（不是次數用完） */
            if (over && !timeUp) return;
            over = true; busy = true; paint();
            var text = timeUp ? '時間到了！完美記憶只要 ' + pz.perfect + ' 次，剩下的牌翻開給你看。' : '次數用完了（上限 ' + pz.limit + '）。完美記憶只要 ' + pz.perfect + ' 次，剩下的牌翻開給你看。';
            tip.textContent = text;
            kit.flash(stage, false, api.my);
            api.fail({ delay: cfg.failHoldMs, lines: [text] });
        }
        /* 驗證用：api.solve 翻一組湊成 100 的牌（在還沒消掉的牌裡找）；api.wrong 故意翻不湊 100 的牌 */
        function remaining() { var r = []; for (var i = 0; i < n; i++) if (!gone[i]) r.push(i); return r; }
        api.solve = function () {
            if (over) return;
            var rest = remaining(), vals = rest.map(function (i) { return deck[i]; }), g = FS.validGroups(vals, k)[0];
            if (!g) return;
            busy = false; g.forEach(function (x) { flip(rest[x]); });
        };
        api.wrong = function () {
            if (over) return;
            var rest = remaining(), pick = null, i, j, l;
            for (i = 0; i < rest.length && !pick; i++) for (j = i + 1; j < rest.length && !pick; j++) {
                if (k === 2) { if (deck[rest[i]] + deck[rest[j]] !== T) pick = [rest[i], rest[j]]; continue; }
                for (l = j + 1; l < rest.length && !pick; l++) if (deck[rest[i]] + deck[rest[j]] + deck[rest[l]] !== T) pick = [rest[i], rest[j], rest[l]];
            }
            if (pick) { busy = false; pick.forEach(function (x) { flip(x); }); }
        };
        api.state = function () { return { used: used, gone: gone.slice(), over: over, busy: busy, up: up.slice(), timeMs: timeMs }; };
        paint();
        if (timeMs > 0) api.timer(timeMs, function () { if (!over) failNow(true); });      /* 時間限制（V1.57.0）：時間條跑完還沒消完就失敗 */
    };
})(window);
