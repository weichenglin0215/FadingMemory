/* ═══════════════════════════════════════════════════════════════════
   reaction_sumten.js — 秒反應・拖曳湊十
   介面與操作（盤面、拖曳、手指一離開就計算、「浮窗」、掉落動畫）跟「連號長龍」完全一樣，共用 js/numgrid_ui.js、css/numgrid.css；這個檔案只有「拖曳湊十的規則」和數字的顏色（1～4 綠、5 橘、6～9 黑）。
   方格裡每一格有一個 1～9 的數字。手指從一格拖到上下左右相鄰的格子（數字沒有限制），**依拖曳的順序一路累加，必須「剛好」湊成一段一段的 10**：
     · 累加到剛好 10 → 這一段完成，下一格從 0 重新累加；
     · 累加超過 10（例如 8＋9＝17）→ 失敗，後面不用再看；
     · 拖完的時候最後一段還沒滿 10（例如 6＋2＝8）→ 失敗。
   **只要有任何一段不對就整串失敗、完全不計分**（前面已經湊成的 10 也不算）。至少要湊成一段。得分＝收走的數字總和（一段 10 分）。
   成功的例子：1＋2＋3＋4、4＋6、5＋5、1＋2＋3＋4＋4＋6（＝兩段）、5＋5＋3＋7、8＋2＋9＋1。
   失敗的例子：1＋2＋3、4＋5、1＋2＋3＋4＋6＋2（第二段只有 8）、5＋5＋3＋8（第二段 11）、8＋2＋9＋8（第二段 17）。
   （V1.57.5 玩家回饋改的規則：以前「超過頭的尾巴自動放棄」＋「藍底顯示算到哪裡」，玩家不用計算、把整盤手指掃過去就能拿高分。
     現在畫面上**不會提示**挑的這串對不對：挑選的格子一律同一種藍底，手指離開才知道結果。失敗時那幾格閃紅一下、挑選清掉。）
   · 收走的格子會消失，上面的方格往下掉、最上面再掉下新的方格補滿（像 Candy Crush）；棋盤大小隨關卡變大（第 1 關 5×7，第 20 關起 8×11）。
   · 闖關制：每一關有「目標分數」，**不限拖曳次數**，在時間內湊到目標分數就過關；時間到就失敗（會把盤面上目前得分最高的一串標出來）。
   ───────────────────────────────────────────────────────────────────
   · 掉下來的新數字（V1.57.5 重做；玩家回饋：盤面常出現 7373737373… 這種「不用想、一路拖下去就一直是 10」的花樣，完全沒有難度）：
     新方格「最後停在哪一格」在掉下來之前就知道，所以先看停下來之後四周的數字，再決定它寫什麼：
       0. **三條禁止規則**（所有新方格都要遵守，開局盤面也一樣）：
          ・不准出現「互補兩數交替」超過 ALT_MAX 格的串（a、10−a、a、10−a…，包含 5、5、5、5）——這就是 7373 花樣；
          ・四周最多 SAME_MAX 格跟自己同數字（不讓同一個數字擠成一團）；
          ・數字要平均：盤面上越多的數字越不容易被選到（BAL），不會某幾個數字特別多。
       1. 有 ASSIST_P 的機率用推算法：挑「讓這一格附近需要 AIM_CELLS 格才湊得出 10」的數字（簡單的關卡 AIM_CELLS 接近 2＝旁邊就有兩格湊十，
          難的關卡接近 3～4＝要心算三、四個數字才湊得出來）；在最接近的前 PICK_K 名裡挑。
       2. BREAK_P 的機率反過來：挑「旁邊沒有任何鄰居能跟它兩格湊十」的數字。
       3. 盤面上至少要有 MIN_MOVES 個不同的「一段湊十」（2～SEG_MAX 格），不夠就改幾格新方格補上（ensureMoves），不會沒路可走。
     開局的盤面也是用同一套方法填出來的（所有格子都當成新掉下來的）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、落下、判斷，單元測試直接測它們）；
       ③ 交給共用介面的規則（spec）。最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。
       'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'sumten'：選單、成績、存檔都靠它；樣式在 css/numgrid.css（兩款共用，class 以 numgrid- 開頭）。 */
    'use strict';

    var ID = 'sumten';                                  /* 這款遊戲的代號：選單、成績、存檔都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var kit = Reaction.kit, NG = Reaction.numGrid;      /* kit：闖關遊戲共用的工具箱；NG：數字方格系列共用的引擎與介面（js/numgrid_ui.js） */

    /* ═══ 可以自己調的參數 ═══
       （盤面大小、浮窗、數字高度、掉落動畫這些「兩款共用的介面參數」在 js/numgrid_ui.js） */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TIME_S = [120, 600];                     /* 每關限時（秒）：第 1 關 → 到頂（不限拖曳次數，所以「目標分數」與「時間」一起決定難度） */
    var TARGET = [300, 900];                    /* 過關的目標分數：第 1 關 → 到頂（得分＝這一串的總和，10 分、20 分、30 分…；越高越難） */
    var TEN = 10;                               /* 每一段要剛好湊成這個數字（玩家指定：10） */
    var MIN_CELLS = 2;                          /* 一串至少幾格（1 格最大才 9，湊不出 10，所以最少是 2） */
    var LEN_BONUS = 0;                          /* 長度加分：一串每多一格（超過 2 格的部分）多得幾分（0＝得分就是總和，不管幾格） */
    var SEARCH_LEN = 12;                        /* 找「盤面上最好的一串」（時間到標出來、測試用）時，最多看幾格的串（再長搜尋會太慢） */
    var SEARCH_BUDGET = 60000;                  /* 找最好的一串時，最多搜幾步（超過就用目前找到最好的） */
    /* ── 掉下來的新數字怎麼挑（V1.57.5 重做，說明見檔案開頭）──
       有 [ ] 的數字都是 [第 1 關, 到頂]，線性變化（PICK_K、MIN_MOVES、ALT_MAX 會四捨五入成整數）。 */
    var ASSIST_P = [0.9, 0.35];                 /* 用推算法挑數字的機率（其餘的新方格是隨機，但一樣要守禁止規則、一樣偏向盤面上比較少的數字） */
    var AIM_CELLS = [2, 3.4];                   /* 推算法想讓玩家「幾格才湊得出 10」：2＝旁邊就有兩格湊十（簡單）；3～4＝要心算三、四個數字（難） */
    var PICK_K = [1, 3];                        /* 推算法在最接近 AIM_CELLS 的前幾名裡挑一個（1＝每次都挑最接近的，越大越不準、越難預測） */
    var BREAK_P = [0, 0.4];                     /* 反過來「搗蛋」的機率：新方格故意挑「旁邊沒有任何鄰居能跟它兩格湊十」的數字（越高越難） */
    var SEG_MAX = 4;                            /* 推算法、保證有路可走時，考慮的「一段湊十」最長幾格 */
    var MIN_MOVES = [14, 6];                    /* 盤面上至少要有幾個不同的「一段湊十」（2～SEG_MAX 格的不同格子組合）；不夠就改幾格新方格補上 */
    var ALT_MAX = [3, 2];                       /* 「互補兩數交替」最長幾格（7、3、7＝3 格；2＝連 7、3、7 都不准）：超過的組合不准出現，避免 7373… 這種不用想的花樣 */
    var ALT_HARD = 3;                           /* 整個盤面的保證：不管怎麼掉落，「互補兩數交替」最多只有這麼多格（3＝永遠不會出現 7373 這種 4 格以上的花樣）。
                                                   超過時只改「剛掉下來」或「剛出現」的格子（沒動過的格子數字不會自己變） */
    var SAME_MAX = 1;                           /* 一格四周（上下左右）最多幾格跟它同數字 */
    var BAL = 2;                                /* 數字平均分配的力道：某個數字被選到的權重 ＝ 1 ÷（1＋盤面上它的個數）的 BAL 次方（越大分配越平均） */
    /* 盤面數字的字色（玩家指定：1～4 綠色、5 橘色、6～9 黑色）。挑選中、失敗閃紅、時間到標出的格子一律白字 */
    var COLOR_LOW = 'rgb(0, 128, 0)';           /* 1～4：綠色 */
    var COLOR_FIVE = 'rgb(230, 115, 0)';        /* 5：橘色 */
    var COLOR_HIGH = 'rgb(0, 0, 0)';            /* 6～9：黑色 */
    var MAX_LEVEL = 90;                         /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（不碰畫面，單元測試直接測）═══ */
    var gridOf = NG.gridOf, adjacent = NG.adjacent, neighbors = NG.neighbors, collapse = NG.collapse;

    /* 數字 v 在盤面上的字色 */
    function digitColor(v) { return v < 5 ? COLOR_LOW : (v === 5 ? COLOR_FIVE : COLOR_HIGH); }

    /* 一串（n 格、總和 sum）的得分：總和＋長度加分 */
    function scoreOf(sum, n) { return sum + LEN_BONUS * Math.max(0, n - MIN_CELLS); }

    /* 第 level 關的各項難度（都是 [第 1 關, 到頂] 線性變化） */
    function ramp(level, pair) { return NG.ramp(level, pair, RAMP_LEVELS); }
    function targetFor(level) { return Math.max(TEN, Math.round(ramp(level, TARGET))); }  /* Math.round：四捨五入成整數 */
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function fillParams(level) {
        return { assist: ramp(level, ASSIST_P), aim: ramp(level, AIM_CELLS), k: Math.max(1, Math.round(ramp(level, PICK_K))), brk: ramp(level, BREAK_P), alt: Math.max(2, Math.round(ramp(level, ALT_MAX))) };
    }
    function minMovesFor(level) { return Math.max(1, Math.round(ramp(level, MIN_MOVES))); }

    /* ── 判定一串（格子編號，依拖曳的順序）──
       規則：每一格都要有數字、不重複、跟上一格相鄰；依順序累加，剛好 10 就算完成一段、從 0 重來；超過 10 立刻失敗；最後一段沒滿 10 也失敗。
       回傳 { ok, why（ok 是 ''；失敗：'short' 沒拖到任何格子、'path' 沒有連成一串、'over' 超過 10、'under' 最後一段不到 10）, segs（完成幾段）, sum（總和）, at（在第幾格出錯，從 0 起；沒錯是 −1）} */
    function judge(gr, vals, sel) {
        var run = 0, sum = 0, segs = 0, seen = {};
        function bad(why, at) { return { ok: false, why: why, segs: segs, sum: sum, at: at }; }
        if (!sel.length) return bad('short', -1);
        for (var i = 0; i < sel.length; i++) {
            var k = sel[i];
            if (vals[k] == null || seen[k] || (i > 0 && !adjacent(gr, sel[i - 1], k))) return bad('path', i);
            seen[k] = 1;
            run += vals[k]; sum += vals[k];
            if (run === TEN) { segs++; run = 0; }
            else if (run > TEN) return bad('over', i);
        }
        if (run !== 0) return bad('under', sel.length - 1);
        return { ok: true, why: '', segs: segs, sum: sum, at: -1 };
    }

    /* ── 掉下來的新數字 ── */
    /* 第 k 格寫上 v 之後，「v 和 10−v 交替」的串（a、10−a、a…，v＝5 就是一堆 5 連在一起）裡，經過第 k 格最長有幾格 */
    function altRun(gr, vals, k, v, limit) {
        var other = TEN - v, comp = [k], seen = {}, i;
        function val(c) { return c === k ? v : vals[c]; }
        seen[k] = 1;
        for (i = 0; i < comp.length; i++) {              /* 先找出跟第 k 格用「交替」連在一起的所有格子 */
            gr.nb[comp[i]].forEach(function (m) { if (!seen[m] && val(m) != null && val(m) + val(comp[i]) === TEN && (val(m) === v || val(m) === other)) { seen[m] = 1; comp.push(m); } });
        }
        if (comp.length <= 2) return comp.length;
        var best = 1, left = 2000, cap = limit || 99;
        function walk(c, len, mark, hasK) {             /* 在這一團裡找最長的、而且經過第 k 格的路 */
            if (hasK && len > best) best = len;
            if (best > cap || left-- <= 0) return;
            gr.nb[c].forEach(function (m) {
                if (!seen[m] || mark[m] || val(m) + val(c) !== TEN) return;
                mark[m] = 1; walk(m, len + 1, mark, hasK || m === k); mark[m] = 0;
            });
        }
        for (i = 0; i < comp.length && best <= cap && left > 0; i++) { var mk = {}; mk[comp[i]] = 1; walk(comp[i], 1, mk, comp[i] === k); }
        if (left <= 0 && comp.length > cap) best = Math.max(best, cap + 1);      /* 一大團搜不完：當作超過 */
        return best;
    }
    /* 第 k 格所在的「交替」團：跟它用「v、10−v 交替」連在一起的所有格子（含自己） */
    function altGroup(gr, vals, k) {
        var v = vals[k], comp = [k], seen = {};
        seen[k] = 1;
        for (var i = 0; i < comp.length; i++) {
            gr.nb[comp[i]].forEach(function (m) { if (!seen[m] && vals[m] != null && vals[m] + vals[comp[i]] === TEN && (vals[m] === v || vals[m] === TEN - v)) { seen[m] = 1; comp.push(m); } });
        }
        return comp;
    }
    /* 整個盤面的花樣檢查：只要有超過 ALT_HARD 格的交替串，就把串裡的一格換成不違反規則的數字（直接改 vals）。
       groups＝可以改的格子，依優先順序一組一組（先改剛出現的新方格，再改剛掉下來的）；任何新花樣一定包含這些格子（沒動過的格子彼此的關係沒有改變）。回傳改了幾格 */
    function breakPatterns(gr, vals, groups, rand) {
        var changed = 0;
        for (var t = 0; t < 60; t++) {
            var bad = -1;
            for (var k = 0; k < gr.n && bad < 0; k++) if (vals[k] != null && altRun(gr, vals, k, vals[k], ALT_HARD + 1) > ALT_HARD) bad = k;
            if (bad < 0) return changed;
            var comp = altGroup(gr, vals, bad), pool = null;
            for (var g = 0; g < groups.length && !pool; g++) { var inGroup = {}; groups[g].forEach(function (c) { inGroup[c] = 1; }); var hit = comp.filter(function (c) { return inGroup[c]; }); if (hit.length) pool = hit; }
            pool = kit.shuffle(pool || comp, rand);
            var done = false;
            for (var i = 0; i < pool.length && !done; i++) {
                var c = pool[i], old = vals[c], digits = kit.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
                for (var d = 0; d < digits.length && !done; d++) { if (digits[d] !== old && violation(gr, vals, c, digits[d], ALT_HARD) === 0) { vals[c] = digits[d]; changed++; done = true; } }
            }
            if (!done) { vals[pool[0]] = 1 + (vals[pool[0]] % 9); changed++; }       /* 極少見：沒有完全合格的數字，換一個再檢查 */
        }
        return changed;
    }
    /* 第 k 格四周有幾格跟 v 同數字 */
    function sameCount(gr, vals, k, v) { return gr.nb[k].filter(function (m) { return vals[m] === v; }).length; }  /* filter：留下符合條件的元素，回傳新陣列 */
    /* 第 k 格寫 v 有沒有違反禁止規則（交替太長、同數字擠在一起）：0＝沒有；數字越大越嚴重 */
    function violation(gr, vals, k, v, altMax) {
        var s = Math.max(0, sameCount(gr, vals, k, v) - SAME_MAX);
        if (!s) gr.nb[k].forEach(function (m) { if (vals[m] === v) { var cnt = gr.nb[m].filter(function (x) { return x !== k && vals[x] === v; }).length + 1; if (cnt > SAME_MAX) s += 1; } });   /* 鄰居那一格也不能因此超過 */
        var a = altRun(gr, vals, k, v, altMax + 1);
        return (a > altMax ? 10 * (a - altMax) : 0) + s;
    }
    /* 從第 k 格出發（寫 v），最少拖幾格（含自己）可以讓總和剛好是 10：回傳格數（2～SEG_MAX），湊不出回傳 0 */
    function segLen(gr, vals, k, v) {
        var best = 0, mark = {};
        mark[k] = 1;
        (function go(c, sum, n) {
            if (best && n >= best - 1) return;
            gr.nb[c].forEach(function (m) {
                if (mark[m] || vals[m] == null || sum + vals[m] > TEN || (best && n + 1 >= best)) return;
                if (sum + vals[m] === TEN) { best = n + 1; return; }
                if (n + 1 >= SEG_MAX) return;
                mark[m] = 1; go(m, sum + vals[m], n + 1); mark[m] = 0;
            });
        })(k, v, 1);
        return best;
    }
    /* 依權重隨機挑一個：數字在盤面上越多，權重越小（讓九個數字平均） */
    function pickBalanced(cands, counts, rand) {
        var w = cands.map(function (v) { return 1 / Math.pow(1 + (counts[v] || 0), BAL); }), total = w.reduce(function (a, x) { return a + x; }, 0), r = rand() * total;  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列；reduce：把陣列「累積」成一個值 */
        for (var i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) return cands[i]; }
        return cands[cands.length - 1];
    }
    function countDigits(vals) { var c = {}; vals.forEach(function (v) { if (v != null) c[v] = (c[v] || 0) + 1; }); return c; }
    /* 挑第 k 格（新方格最後停的位置）要寫的數字：先濾掉違反禁止規則的，再依難度參數 P（fillParams）決定「搗蛋」「用推算法」還是「隨機」，最後偏向盤面上比較少的數字 */
    function pickValue(gr, vals, k, P, rand) {
        var v, bad = [], allowed = [], counts = countDigits(vals);
        for (v = 1; v <= 9; v++) { var x = violation(gr, vals, k, v, P.alt); if (x === 0) allowed.push(v); else bad.push({ v: v, x: x }); }
        if (!allowed.length) {                            /* 每個數字都違反（很少見）：挑違反得最輕的 */
            var least = Math.min.apply(null, bad.map(function (o) { return o.x; }));
            allowed = bad.filter(function (o) { return o.x === least; }).map(function (o) { return o.v; });
        }
        var roll = rand();
        if (roll < P.brk) {                              /* 搗蛋：挑「旁邊沒有鄰居能跟它兩格湊十」的數字 */
            var calm = allowed.filter(function (d) { return !gr.nb[k].some(function (m) { return vals[m] === TEN - d; }); });  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
            return pickBalanced(calm.length ? calm : allowed, counts, rand);
        }
        if (rand() < P.assist) {                         /* 推算法：挑「幾格才湊得出 10」最接近想要的格數的前 K 名 */
            var scored = [];
            allowed.forEach(function (d) { var n = segLen(gr, vals, k, d); if (n) scored.push({ v: d, d: Math.abs(n - P.aim) }); });
            if (scored.length) {
                scored = kit.shuffle(scored, rand);       /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列 */
                scored.sort(function (a, b) { return a.d - b.d; });  /* sort：排序；比較函式回傳負數代表 a 排前面 */
                var cut = scored[Math.min(P.k, scored.length) - 1].d, top = scored.filter(function (o) { return o.d <= cut + 1e-9; }).map(function (o) { return o.v; });
                return pickBalanced(top, counts, rand);
            }
        }
        return pickBalanced(allowed, counts, rand);
    }
    /* 把 fresh（缺的格子＝新方格最後停的位置）都填上數字（直接改 vals；填的順序見 NG.fillNew） */
    function fillNew(gr, vals, fresh, level, rand) {
        rand = rand || Math.random;
        var P = fillParams(level);
        return NG.fillNew(gr, vals, fresh, function (k) { return pickValue(gr, vals, k, P, rand); }, rand);
    }

    /* 盤面上有幾個不同的「一段湊十」（2～SEG_MAX 格、依相鄰順序累加剛好 10 的不同格子組合）；數到 cap 就停。回傳陣列（每個是格子編號） */
    function segments(gr, vals, cap) {
        var out = [], seen = {};
        for (var s = 0; s < gr.n && out.length < cap; s++) {
            if (vals[s] == null) continue;
            var mark = {}; mark[s] = 1;
            (function go(path, sum) {
                var last = path[path.length - 1], nb = gr.nb[last];
                for (var j = 0; j < nb.length && out.length < cap; j++) {
                    var m = nb[j];
                    if (mark[m] || vals[m] == null || sum + vals[m] > TEN) continue;
                    path.push(m); mark[m] = 1;
                    if (sum + vals[m] === TEN) { var key = path.slice().sort(function (a, b) { return a - b; }).join(); if (!seen[key]) { seen[key] = 1; out.push(path.slice()); } }
                    else if (path.length < SEG_MAX) go(path, sum + vals[m]);
                    path.pop(); mark[m] = 0;
                }
            })([s], vals[s]);
        }
        return out;
    }
    /* 保證盤面上至少有 minMoves 個不同的「一段湊十」：不夠就挑新方格（cells；沒給就整盤）改成能跟旁邊湊十、又不違反禁止規則的數字（直接改 vals）。回傳改了幾格 */
    function ensureMoves(gr, vals, minMoves, cells, level, rand) {
        var P = fillParams(level), changed = 0, pool = cells && cells.length ? cells : vals.map(function (v, i) { return i; });
        for (var t = 0; t < 80 && segments(gr, vals, minMoves).length < minMoves; t++) {
            var k = kit.pick(t < 40 ? pool : vals.map(function (v, i) { return i; }), rand);   /* 新方格改不出來，才動別的格子 */
            if (vals[k] == null) continue;
            var before = segments(gr, vals, 999).length, old = vals[k], opts = [];
            for (var v = 1; v <= 9; v++) if (v !== old && violation(gr, vals, k, v, P.alt) === 0) opts.push(v);
            opts = kit.shuffle(opts, rand);
            for (var o = 0; o < opts.length; o++) {
                vals[k] = opts[o];
                if (segments(gr, vals, 999).length > before) { changed++; break; }
                vals[k] = old;
            }
        }
        return changed;
    }

    /* 找盤面上得分最高的一串（依規則累加、剛好完成整段的串；深度優先搜尋，最多 SEARCH_LEN 格）：回傳格子編號的陣列（沒有就是空陣列）；
       stopAt（可省略）＝找到得分到這麼高就停。超過 10 的路直接不走，所以搜尋比「任意走」快很多 */
    function bestMove(gr, vals, stopAt, budget) {
        var best = [], bestScore = 0, left = budget || SEARCH_BUDGET, mark = {};
        function go(path, run, sum) {
            if (left-- <= 0 || (stopAt && bestScore >= stopAt)) return;
            if (run === 0) { var sc = scoreOf(sum, path.length); if (sc > bestScore) { bestScore = sc; best = path.slice(); } }
            if (path.length >= SEARCH_LEN) return;
            var last = path[path.length - 1], nb = gr.nb[last];
            for (var j = 0; j < nb.length; j++) {
                var k = nb[j];
                if (left <= 0 || (stopAt && bestScore >= stopAt)) return;
                if (mark[k] || vals[k] == null || run + vals[k] > TEN) continue;
                mark[k] = 1; path.push(k); go(path, run + vals[k] === TEN ? 0 : run + vals[k], sum + vals[k]); path.pop(); mark[k] = 0;
            }
        }
        for (var i = 0; i < gr.n && left > 0 && !(stopAt && bestScore >= stopAt); i++) if (vals[i] != null) { mark = {}; mark[i] = 1; go([i], vals[i], vals[i]); }
        return best;
    }
    /* 一串（格子編號）的總和與得分 */
    function sumOf(vals, cells) { return cells.reduce(function (a, k) { return a + vals[k]; }, 0); }
    function bestScore(gr, vals, budget) { var p = bestMove(gr, vals, 0, budget); return p.length ? scoreOf(sumOf(vals, p), p.length) : 0; }

    /* 盤面上最長的「互補兩數交替」串有幾格（7373… 花樣的長度；測試與除錯用） */
    function longestAlt(gr, vals) {
        var best = 0;
        for (var k = 0; k < gr.n; k++) if (vals[k] != null) best = Math.max(best, altRun(gr, vals, k, vals[k], 40));
        return best;
    }

    /* 出題：回傳 { vals（開局的盤面）, target（目標分數）, level, gr（棋盤）, w, h }。開局的盤面也是「全部格子都是新掉下來的」，用同一套推算法填 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var gr = NG.gridFor(level), vals = [], all = [], i;
        for (i = 0; i < gr.n; i++) { vals.push(null); all.push(i); }
        fillNew(gr, vals, all, level, rand);
        breakPatterns(gr, vals, [all], rand);
        ensureMoves(gr, vals, minMovesFor(level), all, level, rand);
        return { vals: vals, target: targetFor(level), level: level, gr: gr, w: gr.w, h: gr.h };
    }

    /* ── 玩的狀態 ──
       st：{ gr（棋盤）, vals（每格目前的數字）, sel（這次拖曳挑到的格子，依拖的順序）, score（已得分）, done（已收走幾串）, level } */
    function newState(q) { return { gr: q.gr, vals: q.vals.slice(), sel: [], score: 0, done: 0, level: q.level || 1 }; }

    /* 拖曳的規則：數字沒有限制（相鄰由共用的 NG.dragStep 檢查） */
    function canStep() { return true; }
    function beginDrag(st, k) { return NG.beginDrag(st, k); }
    function dragStep(st, k) { return NG.dragStep(st, k, canStep); }

    /* 手指離開時：依規則判定（judge）。**拖的當下不能洩漏這串對不對**（玩家回饋：以前藍底／分數會提示、不用計算就能過關），挑選的格子一律同一種顏色。成功——整串收走、得分＝總和、其餘的方格往下掉、上面補新的方格（collapse＋fillNew），
       盤面上的「一段湊十」太少就補幾個（ensureMoves）。
       成功回傳 { ok:true, n, sum, segs, gain, cells（收走的格子，拖的順序）, oldVals, moves, fresh }，挑選清空；
       不行回傳 { ok:false, reason:'short'（不到 2 格）／'over'／'under'／'path', fail（true＝這一串算失敗：介面會讓這幾格閃紅）, n, cells }（介面收不走一律清掉挑選）；沒有挑選就回傳 null */
    function commit(st, rand) {
        var sel = st.sel;
        if (!sel.length) return null;
        if (sel.length < MIN_CELLS) return { ok: false, reason: 'short', fail: false, n: sel.length, cells: sel.slice() };
        var j = judge(st.gr, st.vals, sel);
        if (!j.ok) return { ok: false, reason: j.why, fail: true, n: sel.length, cells: sel.slice() };
        rand = rand || Math.random;
        var cells = sel.slice(), gain = scoreOf(j.sum, cells.length), oldVals = cells.map(function (k) { return st.vals[k]; });
        var cz = collapse(st.gr, st.vals, cells);
        fillNew(st.gr, cz.vals, cz.fresh, st.level, rand);
        var moved = cz.moves.filter(function (m) { return m.from !== m.to; }).map(function (m) { return m.to; });
        breakPatterns(st.gr, cz.vals, [cz.fresh, moved], rand);
        ensureMoves(st.gr, cz.vals, minMovesFor(st.level), cz.fresh, st.level, rand);
        st.vals = cz.vals; st.score += gain; st.done++; st.sel = [];
        return { ok: true, n: cells.length, sum: j.sum, segs: j.segs, gain: gain, cells: cells, oldVals: oldVals, moves: cz.moves, fresh: cz.fresh };
    }

    /* 結算評語：n ＝ 通過幾關 */
    function rating(n) {
        if (n >= 20) return '十全十美！';
        if (n >= 10) return '心算高手！';
        if (n >= 5) return '湊得很準！';
        if (n >= 2) return '不錯喔！';
        return '先找兩格剛好湊十的，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把規則（spec）交給共用的介面 NG.mount（說明見 js/numgrid_ui.js 開頭）。 */
    function mount(root, ctx) {
        NG.mount(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, rating: rating,
            makePuzzle: makePuzzle, newState: newState, timeMs: timeMs, canStep: canStep, commit: commit, digitColor: digitColor,
            logLine: function (q, level) { return '[拖曳湊十] 第 ' + level + ' 關：棋盤 ' + q.gr.w + '×' + q.gr.h + '、目標 ' + q.target + ' 分；限時 ' + timeMs(level) + ' ms；推算法 ' + JSON.stringify(fillParams(level)); },
            failMsg: function (r) { return r.reason === 'short' ? '至少要拖 ' + MIN_CELLS + ' 格' : (r.reason === 'path' ? '失敗：沒有連成一串' : '失敗：沒有剛好湊成 ' + TEN); },        /* 標題列右邊放不下長句（會換行、把盤面往下推），要短 */
            best: function (st, stopAt) { return bestMove(st.gr, st.vals, stopAt || 0, stopAt ? SEARCH_BUDGET : 30000); },
            hint: function (st) { var two = segments(st.gr, st.vals, 400).filter(function (p) { return p.length === 2; })[0]; return two || segments(st.gr, st.vals, 1)[0] || []; },   /* 第 1 關的操作提示：指一組相鄰兩格湊十的（只教怎麼拖） */
            links: function (st) {                       /* 挑選的格子，依挑選的先後，相鄰的兩格連一條線（看得出拖的順序；不代表對不對） */
                var out = [], sel = st.sel;
                for (var i = 1; i < sel.length; i++) if (adjacent(st.gr, sel[i - 1], sel[i])) out.push([sel[i - 1], sel[i]]);
                return out;
            },
            hintText: '拖過的數字加起來是 10（例如 3＋7）',
            failLines: function (st, q, shown) {
                var best = shown.length ? scoreOf(sumOf(st.vals, shown), shown.length) : 0;
                return ['時間到，得分 ' + st.score + '／目標 ' + q.target, '收走了 ' + st.done + ' 串；盤面上最高還能拿 ' + best + ' 分（' + shown.length + ' 格）'];
            }
        });
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '拖曳湊十',
        rule: '方格裡每一格有一個 1～9 的數字。**手指從一格拖到上下左右相鄰的格子，照拖的順序一路累加，要剛好湊成一段一段的 10**：加到剛好 10 就從下一格重新加。例如 1＋2＋3＋4、5＋5＋3＋7 都成功。**手指一離開就直接計算**，拖回上一格可以收回一格。**只要有一段超過 10 或最後不到 10，整串失敗、完全不計分**，畫面不會告訴你對不對，要自己算。勾選「浮窗」，手指上方會浮出附近的九格，不怕被手指擋住。得分是收走的數字總和，收走後上面的方格會往下掉、最上面再掉下新的方格補滿。**不限拖曳次數，在時間內湊到目標分數**就過關，時間到就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            gridOf: gridOf, neighbors: neighbors, adjacent: adjacent, scoreOf: scoreOf, ramp: ramp, targetFor: targetFor, timeMs: timeMs, dimsFor: NG.dimsFor, gridFor: NG.gridFor, fillParams: fillParams, minMovesFor: minMovesFor,
            collapse: collapse, judge: judge, altRun: altRun, sameCount: sameCount, violation: violation, segLen: segLen, pickValue: pickValue, fillNew: fillNew, segments: segments, ensureMoves: ensureMoves, breakPatterns: breakPatterns, altGroup: altGroup, longestAlt: longestAlt,
            bestMove: bestMove, bestScore: bestScore, sumOf: sumOf, makePuzzle: makePuzzle, newState: newState, beginDrag: beginDrag, dragStep: dragStep, digitColor: digitColor, COLOR_LOW: COLOR_LOW, COLOR_FIVE: COLOR_FIVE, COLOR_HIGH: COLOR_HIGH,
            commit: commit, rating: rating, growWalk: NG.growWalk, loupeAt: NG.loupeAt, getOpts: NG.getOpts,
            RAMP_LEVELS: RAMP_LEVELS, TIME_S: TIME_S, TARGET: TARGET, TEN: TEN, MIN_CELLS: MIN_CELLS, LEN_BONUS: LEN_BONUS, SEARCH_LEN: SEARCH_LEN,
            ASSIST_P: ASSIST_P, AIM_CELLS: AIM_CELLS, PICK_K: PICK_K, BREAK_P: BREAK_P, SEG_MAX: SEG_MAX, MIN_MOVES: MIN_MOVES, ALT_MAX: ALT_MAX, ALT_HARD: ALT_HARD, SAME_MAX: SAME_MAX, BAL: BAL, MAX_LEVEL: MAX_LEVEL,
            DEFAULT_LOUPE: NG.DEFAULT_LOUPE, DIGIT_H: NG.DIGIT_H
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
