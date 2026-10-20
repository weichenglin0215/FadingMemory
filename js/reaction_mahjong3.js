/* ═══════════════════════════════════════════════════════════════════
   reaction_mahjong3.js — 秒反應・缺哪一張（企劃 231）
   麻將桌上一排同花色的數字牌（1～9，例如 2 3 3 4 5 5 6 7）。下面有九顆牌鍵 1～9：
   **補哪一張，就能把整排剛好分成「三張連號」（例如 3 4 5）或「三張一樣」（例如 5 5 5）的組？**點下去，牌自動分組亮綠＝過關。
   畫面上方一直寫著規則（不會打麻將也看得懂）。
   ───────────────────────────────────────────────────────────────────
   · 難度（都是線性）：手上的牌 5 → 14 張（TILES；補一張之後要是 3 的倍數，所以只能是 5、8、11、14 張，取最接近線性的那一個）、
     限時 10 → 5 秒（TIME_S）、「只補局部」的誘餌牌（補了它能湊出一部分，卻湊不齊整排）至少 0 → 3 個（DECOYS）。
   · 出題（makeLevel）：先隨機決定整排要分成幾組、每組是「連號」還是「三張一樣」（同一個數字全部加起來最多 4 張，跟真的麻將一樣），
     從中拿走一張當答案，剩下的就是題目；再用程式窮舉 1～9 九種補法（winners），**只有答案這一張能補成整排**才出（答案唯一）；
     而且要有至少 DECOYS 個誘餌（nearMisses：補了它之後，能湊出「比整排少一組」、而且那張牌自己有參加的分組，但湊不齊整排）。
   · 判定：補的牌 x 能不能把「手牌＋x」完全分成三張一組（canGroup：每次拿最小的牌，只有「三張一樣」或「連號」兩種拿法，遞迴窮舉）。
   · 揭曉：答對＝整排分好的組用綠色括起來；答錯／時間到＝上排是你補的那張：湊不起來的牌標紅、下排是正確的分組（綠色括起來），停格 2.8 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'mahjong3';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var TILES = [5, 14];                        /* 手上的牌數：第 1 關 → 到頂（實際只會是 5、8、11、14：補一張之後要是 3 的倍數） */
    var TIME_S = [10, 5];                       /* 每題限時（秒）：第 1 關 → 到頂 */
    var DECOYS = [0, 3];                        /* 「只補局部」的誘餌牌至少幾個：第 1 關 → 到頂 */
    var MAX_SAME = 4;                           /* 同一個數字最多幾張（真的麻將一種牌只有 4 張） */
    var MAX_LEVEL = 60;
    var NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關手上幾張牌：線性算出 5～14，再取最接近的「3 的倍數減 1」（5、8、11、14） */
    function tilesFor(level) {
        var t = kit.ramp(level, TILES[0], TILES[1], RAMP_LEVELS), k = Math.round((t - 2) / 3);
        return Math.max(5, Math.min(14, k * 3 + 2));
    }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function decoysFor(level) { return Math.round(kit.ramp(level, DECOYS[0], DECOYS[1], RAMP_LEVELS)); }
    /* 牌（1～9 的陣列）→ 每個數字幾張（counts[1]～counts[9]，counts[0] 不用） */
    function countsOf(tiles) { var c = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; tiles.forEach(function (t) { c[t]++; }); return c; }
    /* 能不能完全分成「三張連號」或「三張一樣」的組？（每次拿最小的牌：只有「三張一樣」或「它和 +1、+2 連號」兩種拿法） */
    function canGroup(c) {
        var i = 1;
        while (i <= 9 && c[i] === 0) i++;
        if (i > 9) return true;
        if (c[i] >= 3) { c[i] -= 3; var a = canGroup(c); c[i] += 3; if (a) return true; }
        if (i <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; var b = canGroup(c); c[i]++; c[i + 1]++; c[i + 2]++; if (b) return true; }
        return false;
    }
    /* 完整分組：回傳分組的陣列（每組是 [a,b,c]，已排序），分不完回傳 null */
    function groupsOf(c) {
        var i = 1;
        while (i <= 9 && c[i] === 0) i++;
        if (i > 9) return [];
        var r;
        if (c[i] >= 3) { c[i] -= 3; r = groupsOf(c); c[i] += 3; if (r) return [[i, i, i]].concat(r); }
        if (i <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; r = groupsOf(c); c[i]++; c[i + 1]++; c[i + 2]++; if (r) return [[i, i + 1, i + 2]].concat(r); }
        return null;
    }
    /* 最多能分出幾組（剩下的牌可以丟掉）：回傳 { n（組數）, groups, left（沒分進任何一組的牌，已排序） }；
       must（選填）：這張牌一定要參加某一組（誘餌檢查用：補的那張牌自己有參加） */
    function bestGroups(tiles, must) {
        var c = countsOf(tiles), best = { n: -1, groups: [], left: [] };
        function dfs(i, groups, left) {
            while (i <= 9 && c[i] === 0) i++;
            if (i > 9) { if (groups.length > best.n) best = { n: groups.length, groups: groups.slice(), left: left.slice() }; return; }
            if (c[i] >= 3) { c[i] -= 3; groups.push([i, i, i]); dfs(i, groups, left); groups.pop(); c[i] += 3; }
            if (i <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; groups.push([i, i + 1, i + 2]); dfs(i, groups, left); groups.pop(); c[i]++; c[i + 1]++; c[i + 2]++; }
            c[i]--; left.push(i); dfs(i, groups, left); left.pop(); c[i]++;                      /* 這張牌不分進任何組（丟掉） */
        }
        if (must == null) { dfs(1, [], []); return best; }
        /* 要求 must 這張牌有參加：窮舉時只接受「必須有一組含 must」的結果（分組含 must，或 must 沒被丟掉＝不在 left 裡，但剩餘牌 left 內如含 must 的重複張就算沒參加那一張，簡化成「至少有一組包含 must」） */
        var bestMust = { n: -1, groups: [], left: [] };
        (function dfs2(i, groups, left) {
            while (i <= 9 && c[i] === 0) i++;
            if (i > 9) { if (groups.some(function (g) { return g.indexOf(must) >= 0; }) && groups.length > bestMust.n) bestMust = { n: groups.length, groups: groups.slice(), left: left.slice() }; return; }
            if (c[i] >= 3) { c[i] -= 3; groups.push([i, i, i]); dfs2(i, groups, left); groups.pop(); c[i] += 3; }
            if (i <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; groups.push([i, i + 1, i + 2]); dfs2(i, groups, left); groups.pop(); c[i]++; c[i + 1]++; c[i + 2]++; }
            c[i]--; left.push(i); dfs2(i, groups, left); left.pop(); c[i]++;
        })(1, [], []);
        return bestMust;
    }
    /* 補哪些牌（1～9）能把整排完全分好：hand 是手牌（數字陣列） */
    function winners(hand) {
        var out = [];
        for (var x = 1; x <= 9; x++) { var c = countsOf(hand); c[x]++; if (canGroup(c)) out.push(x); }
        return out;
    }
    /* 誘餌牌：補了它之後，能分出「比整排少一組」的分組、而且它自己有參加，但湊不齊整排（它不是答案） */
    function nearMisses(hand) {
        var full = (hand.length + 1) / 3, out = [], win = winners(hand);
        for (var y = 1; y <= 9; y++) {
            if (win.indexOf(y) >= 0) continue;
            var r = bestGroups(hand.concat([y]), y);
            if (r.n >= full - 1) out.push(y);
        }
        return out;
    }
    /* 出一關：{ hand（排序後的手牌）, answer（唯一能補的牌）, groups（補了之後的完整分組）, near（誘餌牌）, tiles, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var m = tilesFor(level), g = (m + 1) / 3, need = decoysFor(level);
        for (var tr = 0; tr < 4000; tr++) {
            var c = countsOf([]), groups = [], ok = true, k;
            for (k = 0; k < g && ok; k++) {
                var made = false;
                for (var t = 0; t < 12 && !made; t++) {
                    if (rand() < 0.45) { var n3 = kit.randInt(1, 9, rand); if (c[n3] + 3 <= MAX_SAME) { c[n3] += 3; groups.push([n3, n3, n3]); made = true; } }
                    else { var s = kit.randInt(1, 7, rand); if (c[s] < MAX_SAME && c[s + 1] < MAX_SAME && c[s + 2] < MAX_SAME) { c[s]++; c[s + 1]++; c[s + 2]++; groups.push([s, s + 1, s + 2]); made = true; } }
                }
                if (!made) ok = false;
            }
            if (!ok) continue;
            var all = []; for (var i = 1; i <= 9; i++) for (var j = 0; j < c[i]; j++) all.push(i);
            var x = kit.pick(all, rand), hand = all.slice(); hand.splice(hand.indexOf(x), 1);
            if (winners(hand).join() !== String(x)) continue;                         /* 答案要唯一 */
            var near = nearMisses(hand);
            if (near.length < need) continue;                                          /* 誘餌夠多 */
            var cc = countsOf(hand); cc[x]++;
            return { hand: hand, answer: x, groups: groupsOf(cc), near: near, tiles: m, level: level };
        }
        /* 保底（極少用到）：2 3 4 5 5 → 補 5 或 2… 這種不唯一的就不要；用 1 1 2 3 4 補 1：1 1 1 / 2 3 4（唯一：補 1） */
        var fb = [1, 1, 2, 3, 4], fc = countsOf(fb); fc[1]++;
        return { hand: fb, answer: 1, groups: groupsOf(fc), near: nearMisses(fb), tiles: 5, level: level };
    }
    function rating(n) {
        if (n >= 25) return '麻將神手！';
        if (n >= 15) return '牌感很好！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先把能湊的組挑出來，再看缺哪一張，再來一次！';
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

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[缺哪一張] 第 ' + level + ' 關：手牌 ' + q.hand.join(' ') + '（' + q.hand.length + ' 張），補 ' + q.answer + ' 可以分成 ' + q.groups.map(function (g) { return g.join(''); }).join('｜') + '；誘餌 ' + (q.near.join('、') || '（無）') + '；限時 ' + timeMs(level) + ' ms');

        var rule = h('div', { 'class': 'qz-note mj3-rule', text: '補哪一張，整排剛好分成「三張連號」或「三張一樣」的組？' });
        stage.appendChild(rule);
        var table = h('div', { 'class': 'mj3-table' });
        stage.appendChild(table);
        var handRow = strip(table, q.hand, [], [], -1, 'mj3-strip--hand');
        var note = h('div', { 'class': 'qz-note mj3-note', text: '手上 ' + q.hand.length + ' 張，補一張就是 ' + (q.hand.length + 1) + ' 張（' + (q.hand.length + 1) / 3 + ' 組）' });
        stage.appendChild(note);
        var keys = h('div', { 'class': 'mj3-keys' }), keyEls = [];
        for (var v = 1; v <= 9; v++) (function (v) {
            var b = h('button', { 'class': 'mj3-key', type: 'button' }, [h('span', { 'class': 'mj3-key-num', text: NUMERALS[v - 1] }), h('span', { 'class': 'mj3-key-pip', text: String(v) })]);
            kit.onTap(b, function () { judge(v); });
            keys.appendChild(b); keyEls.push(b);
        })(v);
        stage.appendChild(keys);
        api.timer(timeMs(level), function () { judge(null); });
        if (level === 1 && kit.once('mahjong3.hint')) kit.hintOn(stage, keyEls[q.answer - 1], { mode: 'tap', delay: 700, text: '請點補上去能湊成組的牌' });

        function judge(x) {
            if (api.over) return;
            keyEls.forEach(function (b) { b.disabled = true; });
            var ok = x === q.answer;
            if (x != null) keyEls[x - 1].classList.add(ok ? 'mj3-key--ok' : 'mj3-key--bad');
            keyEls[q.answer - 1].classList.add('mj3-key--ok');
            table.innerHTML = '';
            if (ok) {
                var L = layout(q.hand, x, q.groups);
                strip(table, L.tiles, L.groupIdx, [], L.addedIdx, 'mj3-strip--done');
                note.textContent = '補 ' + NUMERALS[x - 1] + '：' + q.groups.map(groupText).join('　') + '，剛好分完！';
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1500 });
                return;
            }
            /* 失敗：上排＝你補的那張（湊不起來的牌標紅）、下排＝正確的分組 */
            var lines = [];
            if (x != null) {
                var wrong = bestGroups(q.hand.concat([x]), x), Lw = layout(q.hand, x, wrong.groups), leftIdx = [];
                for (var p = 0; p < Lw.tiles.length; p++) if (!Lw.usedIdx[p]) leftIdx.push(p);
                table.appendChild(h('div', { 'class': 'mj3-cap', text: '你補 ' + NUMERALS[x - 1] + '：這幾張（紅色）湊不起來' }));
                strip(table, Lw.tiles, Lw.groupIdx, leftIdx, Lw.addedIdx, 'mj3-strip--wrong');
                lines.push('補「' + NUMERALS[x - 1] + '」最多只能分出 ' + wrong.n + ' 組，剩 ' + leftIdx.length + ' 張湊不起來');
            } else lines.push('時間到！');
            var Lr = layout(q.hand, q.answer, q.groups);
            table.appendChild(h('div', { 'class': 'mj3-cap mj3-cap--ok', text: '要補「' + NUMERALS[q.answer - 1] + '」：' + q.groups.map(groupText).join('　') }));
            strip(table, Lr.tiles, Lr.groupIdx, [], Lr.addedIdx, 'mj3-strip--done');
            lines.push('正確答案是補「' + NUMERALS[q.answer - 1] + '」：' + q.groups.map(groupText).join('　'));
            note.textContent = '';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2800, lines: lines });
        }
        function groupText(g) { return g.map(function (t) { return NUMERALS[t - 1]; }).join(''); }
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge(q.answer === 1 ? 2 : q.answer - 1); };
    }

    var G = {
        id: ID,
        name: '缺哪一張',
        rule: '麻將桌上有一排同花色的數字牌（一～九）。**補哪一張，就能把整排剛好分成「三張連號」或「三張一樣」的組？**例如 2 3 4 是連號、5 5 5 是三張一樣。**點下面的牌鍵補上去**，分好了就過關。答案一定只有一張。來不及或補錯就結束，看你能過幾關。越後面，牌越多、時間越短、越多牌「補了只能湊一部分」來騙你！',
        mount: mount,
        score: SCORE,
        test: {
            tilesFor: tilesFor, timeMs: timeMs, decoysFor: decoysFor, countsOf: countsOf, canGroup: canGroup, groupsOf: groupsOf, bestGroups: bestGroups, winners: winners, nearMisses: nearMisses, makeLevel: makeLevel, layout: layout, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TILES: TILES, TIME_S: TIME_S, DECOYS: DECOYS, MAX_SAME: MAX_SAME, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
