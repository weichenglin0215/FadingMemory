/* ═══════════════════════════════════════════════════════════════════
   reaction_numchain.js — 秒反應・連號長龍
   介面與操作（盤面、拖曳、手指一離開就計算、「浮窗」、掉落動畫）跟「拖曳湊十」共用 js/numgrid_ui.js、css/numgrid.css；這個檔案只有「連號長龍的規則」。
   方格裡每一格有一個 1～9 的數字。手指從一格拖到上下左右相鄰的格子，**每一步數字要剛好差 1**
   （例如 2→3→4→5→4→3→4，可以往上也可以往下），**至少連 3 格**，把這些方格收走拿分。
   連 n 格得 1＋2＋…＋n 分（3 格＝6 分、4 格＝10 分、5 格＝15 分），所以**越長越划算**。
   收走的格子會消失，**上面的方格往下掉、最上面再掉下新的方格補滿**（像 Candy Crush）。
   棋盤大小隨關卡變大：第 1 關 5×7，第 20 關起 8×11（參數在 js/numgrid_ui.js 的 GRID_W、GRID_H、GRID_RAMP_LEVELS）。
   ───────────────────────────────────────────────────────────────────
   · 闖關制：每一關有「目標分數」，**不限拖曳次數**，在時間內湊到目標分數就過關；時間到就失敗（會把盤面上目前最長的一串標出來）。
   · 挑選的規則：拖曳只能往相鄰、數字差 1 的格子接；手指一離開就檢查（chainOrder），至少 3 格才收走。
     操作方式（拖曳、浮窗）見 js/numgrid_ui.js 開頭。
   · 掉下來的新數字（fillNew，這款遊戲的核心）：**收走之後，每一欄剩下的方格往下掉到底，缺幾格就從上面補幾格新的**。
     因為方格怎麼掉是算得出來的（collapse），新方格「最後停在哪一格」在掉下來之前就知道了，
     所以**先看停下來之後，它四周（上下左右）的格子是什麼數字，再決定它要寫什麼數字**：
       1. 對每個可以寫的數字（1～9），算「寫這個數字，經過這一格最長能連幾格」（potential：左右兩邊跟它差 1 的鄰居，各自往外最長能接多長，加起來再加 1）；
       2. 挑「最接近 AIM_LEN」的那幾個（前 PICK_K 名裡隨機挑一個）：AIM_LEN 是推算法「想讓玩家有機會連多長」，簡單的關卡設得長，
          玩家很容易在新掉下來的方格旁邊找到相鄰數字、連出高分；
       3. 只有 ASSIST_P 的機率才用上面的推算法，其餘照一般隨機（越難，隨機的越多）；
       4. BREAK_P 的機率反過來：故意挑「跟四周的格子都不差 1」的數字（落地之後孤立的死格子，越難越多）；
       5. 最後保證盤面上至少有一串 MIN_BEST_LEN 格的連號可以拿（ensureChain），不會整個盤面沒路可走。
     開局的盤面也是用同一套方法填出來的（所有格子都當成新掉下來的）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、落下、判斷，單元測試直接測它們）；
       ③ 交給共用介面的規則（spec）。最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。
       'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'numchain'：選單、成績、存檔都靠它；樣式在 css/numgrid.css（兩款共用，class 以 numgrid- 開頭）。 */
    'use strict';

    var ID = 'numchain';                                /* 這款遊戲的代號：選單、成績、存檔都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var kit = Reaction.kit, NG = Reaction.numGrid;      /* kit：闖關遊戲共用的工具箱；NG：數字方格系列共用的引擎與介面（js/numgrid_ui.js） */

    /* ═══ 可以自己調的參數 ═══
       （盤面大小、浮窗、數字高度、掉落動畫這些「兩款共用的介面參數」在 js/numgrid_ui.js） */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TIME_S = [120, 600];                     /* 每關限時（秒）：第 1 關 → 到頂（不限拖曳次數，所以「目標分數」與「時間」一起決定難度） */
    var TARGET = [300, 900];                     /* 過關的目標分數：第 1 關 → 到頂（越高越難；連 5 格 15 分、連 8 格 36 分、連 10 格 55 分；簡單關卡一串平均約 8～10 格、難的關卡約 4～5 格，可以拿這個估要收幾串） */
    var MIN_CHAIN = 3;                          /* 一串至少連幾格才能收走 */
    /* ── 掉下來的新數字怎麼挑（推算法，說明見檔案開頭）──
       每個數字都是 [第 1 關, 到頂]，線性變化（PICK_K 會四捨五入成整數）。 */
    var ASSIST_P = [0.9, 0.35];                 /* 用推算法挑數字的機率（其餘的新方格是 1～9 隨機）：越高，新方格越常剛好跟旁邊的數字差 1，越容易連出長串 */
    var AIM_LEN = [9, 5];                       /* 推算法想讓玩家連到多長：挑「經過這一格最長能連幾格」最接近這個數字的數字（簡單的關卡設長，新掉下來的方格旁邊就容易連出高分） */
    var PICK_K = [1, 3];                        /* 推算法在最接近 AIM_LEN 的前幾名裡隨機挑一個（1＝每次都挑最好的，越大越不準、越難預測） */
    var BREAK_P = [0, 0.25];                    /* 反過來「搗蛋」的機率：新方格故意挑跟四周都不差 1 的數字（落地後就是孤立的死格子；越高越難） */
    var MIN_BEST_LEN = [6, 3];                  /* 盤面上至少保證有一串幾格的連號可以拿（太少會整個盤面沒路可走；最少 3） */
    var MAX_LEVEL = 90;                         /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var RUN_CAP = 20;                           /* 算「往外最長能接多長」時，最多算到幾格（再長不影響挑數字） */
    var RUN_BUDGET = 300;                       /* 算「往外最長能接多長」時，最多搜幾步（盤面全是連號時，搜尋可能很多，限制一下免得卡住） */

    /* ═══ 純函式（不碰畫面，單元測試直接測）═══ */
    var gridOf = NG.gridOf, adjacent = NG.adjacent, neighbors = NG.neighbors, collapse = NG.collapse, growWalk = NG.growWalk;

    /* 連 n 格的分數：1＋2＋…＋n */
    function chainScore(n) { return n * (n + 1) / 2; }

    /* 第 level 關的各項難度（都是 [第 1 關, 到頂] 線性變化） */
    function ramp(level, pair) { return NG.ramp(level, pair, RAMP_LEVELS); }
    function targetFor(level) { return Math.max(chainScore(MIN_CHAIN), Math.round(ramp(level, TARGET))); }  /* Math.round：四捨五入成整數 */
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function fillParams(level) {
        return { assist: ramp(level, ASSIST_P), aim: ramp(level, AIM_LEN), k: Math.max(1, Math.round(ramp(level, PICK_K))), brk: ramp(level, BREAK_P) };
    }
    function minBestFor(level) { return Math.max(MIN_CHAIN, Math.round(ramp(level, MIN_BEST_LEN))); }

    /* 從第 start 格出發（不能走 banned 那一格），一格差 1 一格差 1 往外，最長能連幾格（含 start 自己） */
    function runFrom(gr, vals, start, banned) {
        var best = 1, left = RUN_BUDGET, mark = {};
        mark[start] = 1; mark[banned] = 1;
        (function go(c, len) {
            if (len > best) best = len;
            if (best >= RUN_CAP || left-- <= 0) return;
            gr.nb[c].forEach(function (m) {
                if (mark[m] || vals[m] == null || Math.abs(vals[m] - vals[c]) !== 1) return;
                mark[m] = 1; go(m, len + 1); mark[m] = 0;
            });
        })(start, 1);
        return best;
    }
    /* 這一格（k）寫上數字 v，經過這一格最長能連幾格：跟 v 差 1 的鄰居，各自往外最長的長度，取最長的兩個加起來，再加這一格自己。
       （兩邊可能走回同一批格子，所以是「估計」，只用來比較哪個數字比較好。）runs＝{ 鄰居編號: 往外最長長度 }，先算好的 */
    function potentialOf(gr, vals, k, v, runs) {
        var ls = [];
        gr.nb[k].forEach(function (n) { if (vals[n] != null && Math.abs(vals[n] - v) === 1) ls.push(runs[n]); });
        ls.sort(function (a, b) { return b - a; });  /* sort：排序；比較函式回傳負數代表 a 排前面（這裡由大到小） */
        return ls.length ? 1 + ls[0] + (ls[1] || 0) : 1;
    }
    /* 挑第 k 格（新方格最後停的位置）要寫的數字：依難度參數 P（fillParams）決定「搗蛋」「用推算法」還是「隨機」 */
    function pickValue(gr, vals, k, P, rand) {
        var v, roll = rand();
        if (roll < P.brk) {                              /* 搗蛋：挑跟四周都不差 1 的數字 */
            var calm = [];
            for (v = 1; v <= 9; v++) if (!gr.nb[k].some(function (n) { return vals[n] != null && Math.abs(vals[n] - v) === 1; })) calm.push(v);  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
            return calm.length ? kit.pick(calm, rand) : kit.randInt(1, 9, rand);
        }
        if (rand() < P.assist) {                         /* 推算法：算每個數字的潛力，挑最接近想要的長度的前 K 名之一 */
            var runs = {}, cands = [];
            gr.nb[k].forEach(function (n) { if (vals[n] != null) runs[n] = runFrom(gr, vals, n, k); });
            for (v = 1; v <= 9; v++) { var pot = potentialOf(gr, vals, k, v, runs); cands.push({ v: v, pot: pot, d: Math.abs(pot - P.aim) }); }   /* 連 1 格（跟四周都不差 1）也是候選：旁邊的串已經比想要的長很多時，寧可不接，不然盤面會變成一整條超長的龍 */
            cands = kit.shuffle(cands, rand);            /* 先洗牌，同樣接近的就隨機 */
            cands.sort(function (a, b) { return a.d - b.d || b.pot - a.pot; });
            return kit.pick(cands.slice(0, P.k), rand).v;
        }
        return kit.randInt(1, 9, rand);
    }
    /* 把 fresh（缺的格子＝新方格最後停的位置）都填上數字（直接改 vals；填的順序見 NG.fillNew） */
    function fillNew(gr, vals, fresh, level, rand) {
        rand = rand || Math.random;
        var P = fillParams(level);
        return NG.fillNew(gr, vals, fresh, function (k) { return pickValue(gr, vals, k, P, rand); }, rand);
    }

    /* 找盤面上最長的一串（深度優先搜尋，限制搜尋步數）：回傳格子編號的陣列；stopAt（可省略）＝找到這麼長就停 */
    function bestChain(gr, vals, stopAt, budget) {
        var best = [], left = budget || 60000, mark = {};
        function go(path) {
            if (path.length > best.length) best = path.slice();
            if (left-- <= 0 || (stopAt && best.length >= stopAt)) return;
            var last = path[path.length - 1];
            gr.nb[last].forEach(function (k) {
                if (left <= 0 || (stopAt && best.length >= stopAt)) return;
                if (mark[k] || vals[k] == null || Math.abs(vals[k] - vals[last]) !== 1) return;
                mark[k] = 1; path.push(k); go(path); path.pop(); mark[k] = 0;
            });
        }
        for (var i = 0; i < gr.n && left > 0 && !(stopAt && best.length >= stopAt); i++) if (vals[i] != null) { mark = {}; mark[i] = 1; go([i]); }
        return best;
    }
    function longestChain(gr, vals, budget) { return bestChain(gr, vals, 0, budget).length; }
    /* 盤面上有沒有任何一串 3 格以上（有一格 b，旁邊有兩個不同的格子，數字都跟 b 差 1） */
    function hasChain(gr, vals) {
        for (var b = 0; b < gr.n; b++) {
            if (vals[b] == null) continue;
            var ok = gr.nb[b].filter(function (k) { return vals[k] != null && Math.abs(vals[k] - vals[b]) === 1; });  /* filter：留下符合條件的元素，回傳新陣列 */
            if (ok.length >= 2) return true;
        }
        return false;
    }
    /* 沿著一條 len 格的路，產生一串數字：第一個隨機 1～9，之後每格是前一格 +1 或 −1（不能超出 1～9） */
    function walkValues(len, rand) {
        var v = kit.randInt(1, 9, rand), out = [v];
        for (var i = 1; i < len; i++) {
            var opts = [];
            if (v > 1) opts.push(v - 1);
            if (v < 9) opts.push(v + 1);
            v = kit.pick(opts, rand);                     /* kit.pick(陣列, rand)：隨機挑一個元素 */
            out.push(v);
        }
        return out;
    }
    /* 保證盤面上至少有一串 minLen 格的連號可以拿：沒有的話，隨機種一條 minLen 格的路、數字一格 ±1（直接改 vals）。回傳有沒有改 */
    function ensureChain(gr, vals, minLen, rand) {
        if (minLen < MIN_CHAIN || bestChain(gr, vals, minLen).length >= minLen) return false;
        var free = vals.map(function (v) { return v != null; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var path = growWalk(gr, free, minLen, rand);
        if (!path) return false;
        var vs = walkValues(minLen, rand);
        path.forEach(function (k, j) { vals[k] = vs[j]; });
        return true;
    }

    /* 出題：回傳 { vals（開局的盤面）, target（目標分數）, level, gr（棋盤）, w, h }。開局的盤面也是「全部格子都是新掉下來的」，用同一套推算法填 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var gr = NG.gridFor(level), vals = [], all = [], i;
        for (i = 0; i < gr.n; i++) { vals.push(null); all.push(i); }
        fillNew(gr, vals, all, level, rand);
        ensureChain(gr, vals, minBestFor(level), rand);
        return { vals: vals, target: targetFor(level), level: level, gr: gr, w: gr.w, h: gr.h };
    }

    /* ── 玩的狀態 ──
       st：{ gr（棋盤）, vals（每格目前的數字）, sel（這次拖曳挑到的格子，依拖的順序）, score（已得分）, done（已收走幾串）, level } */
    function newState(q) { return { gr: q.gr, vals: q.vals.slice(), sel: [], score: 0, done: 0, level: q.level || 1 }; }

    /* 這些挑選的格子（cells）能不能排成一串？（每一格都有數字、一格接一格相鄰、數字差 1、每格只用一次）能就回傳排好的順序，不能回傳 null。
       不看傳進來的先後順序，找「用掉全部格子的路」（格子很少，直接用深度優先搜尋）；拖曳挑到的本來就是一條路，這裡照樣驗證一次、不靠介面保證 */
    function chainOrder(gr, vals, cells) {
        var set = {}, list = [];
        cells.forEach(function (k) { if (!set[k]) { set[k] = 1; list.push(k); } });
        if (!list.length) return [];
        if (list.some(function (k) { return vals[k] == null; })) return null;
        var adj = {}, n = list.length, left = 20000;
        list.forEach(function (k) { adj[k] = gr.nb[k].filter(function (m) { return set[m] && Math.abs(vals[m] - vals[k]) === 1; }); });
        if (n > 1 && list.some(function (k) { return !adj[k].length; })) return null;      /* 有孤零零的格子：不可能連成一串 */
        function go(path, mark) {
            if (path.length === n) return path.slice();
            if (left-- <= 0) return null;
            var last = path[path.length - 1], opts = adj[last];
            for (var j = 0; j < opts.length; j++) {
                if (mark[opts[j]]) continue;
                mark[opts[j]] = 1; path.push(opts[j]);
                var r = go(path, mark);
                if (r) return r;
                path.pop(); mark[opts[j]] = 0;
            }
            return null;
        }
        var starts = list.slice().sort(function (a, b) { return adj[a].length - adj[b].length; });   /* 路的頭尾只有一個鄰居，先從鄰居少的試 */
        for (var s = 0; s < starts.length && left > 0; s++) {
            var mark = {}; mark[starts[s]] = 1;
            var r = go([starts[s]], mark);
            if (r) return r;
        }
        return null;
    }

    /* 拖曳的規則：要往數字剛好差 1 的格子拖（相鄰由共用的 NG.dragStep 檢查） */
    function canStep(st, last, k) { return Math.abs(st.vals[k] - st.vals[last]) === 1; }
    function beginDrag(st, k) { return NG.beginDrag(st, k); }
    function dragStep(st, k) { return NG.dragStep(st, k, canStep); }

    /* 手指離開時收走挑到的格子：排得成一串、至少 MIN_CHAIN 格才行——得分、其餘的方格往下掉、上面補新的方格（collapse＋fillNew），盤面沒有夠長的就補一串（ensureChain）。
       成功回傳 { ok:true, n（這一串幾格）, gain（得幾分）, cells（收走的格子，排好的順序）, oldVals（收走的數字）, moves（掉落）, fresh（新方格的位置）}，挑選清空；
       不行回傳 { ok:false, reason:'short'（不到 3 格）或 'broken'（連不成一串）, n, cells }（這裡不動挑選，介面會清掉）；沒有挑選就回傳 null */
    function commit(st, rand) {
        var sel = st.sel;
        if (!sel.length) return null;
        if (sel.length < MIN_CHAIN) return { ok: false, reason: 'short', n: sel.length, cells: sel.slice() };
        var order = chainOrder(st.gr, st.vals, sel);
        if (!order) return { ok: false, reason: 'broken', n: sel.length, cells: sel.slice() };
        rand = rand || Math.random;
        var gain = chainScore(order.length), oldVals = order.map(function (k) { return st.vals[k]; });
        var cz = collapse(st.gr, st.vals, order);
        fillNew(st.gr, cz.vals, cz.fresh, st.level, rand);
        ensureChain(st.gr, cz.vals, minBestFor(st.level), rand);
        st.vals = cz.vals; st.score += gain; st.done++; st.sel = [];
        return { ok: true, n: order.length, gain: gain, cells: order, oldVals: oldVals, moves: cz.moves, fresh: cz.fresh };
    }

    /* 結算評語：n ＝ 通過幾關 */
    function rating(n) {
        if (n >= 20) return '連號大師！';
        if (n >= 10) return '眼力驚人！';
        if (n >= 5) return '找得很準！';
        if (n >= 2) return '不錯喔！';
        return '先找最長的那一串，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把規則（spec）交給共用的介面 NG.mount（說明見 js/numgrid_ui.js 開頭）。 */
    function mount(root, ctx) {
        NG.mount(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, rating: rating,
            makePuzzle: makePuzzle, newState: newState, timeMs: timeMs, canStep: canStep, commit: commit,
            logLine: function (q, level) { return '[連號長龍] 第 ' + level + ' 關：棋盤 ' + q.gr.w + '×' + q.gr.h + '、目標 ' + q.target + ' 分；限時 ' + timeMs(level) + ' ms；推算法 ' + JSON.stringify(fillParams(level)); },
            failMsg: function (r) { return r.reason === 'short' ? '至少連 ' + MIN_CHAIN + ' 格' : '這些方格連不成一串'; },
            best: function (st, stopAt) { return bestChain(st.gr, st.vals, stopAt || 0, stopAt ? 60000 : 30000); },
            links: function (st) {                       /* 挑選的格子裡，彼此相鄰又差 1 的兩格連一條線（看得出哪些接起來了、哪些是孤零零的） */
                var out = [], sel = st.sel;
                for (var i = 0; i < sel.length; i++) for (var j = i + 1; j < sel.length; j++) if (adjacent(st.gr, sel[i], sel[j]) && Math.abs(st.vals[sel[i]] - st.vals[sel[j]]) === 1) out.push([sel[i], sel[j]]);
                return out;
            },
            hintText: '往相鄰、差 1 的數字拖，連 3 格以上',
            failLines: function (st, q, shown) { return ['時間到，得分 ' + st.score + '／目標 ' + q.target, '收走了 ' + st.done + ' 串；盤面上最長還有 ' + shown.length + ' 格可以連']; }
        });
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '連號長龍',
        rule: '方格裡每一格有一個 1～9 的數字。**手指從一格拖到上下左右相鄰的格子，每一步數字要剛好差 1**，例如 2、3、4、3、2；拖回上一格可以收回一格。**至少連 3 格，手指一離開就收走拿分**：連 n 格得 1＋2＋…＋n 分（3 格 6 分、4 格 10 分、5 格 15 分），越長越划算。勾選「浮窗」，手指上方會浮出手指附近的九格，不怕被手指擋住。收走的格子消失後，上面的方格會往下掉，最上面再掉下新的方格補滿。**不限拖曳次數，在時間內湊到目標分數**就過關。時間到就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            gridOf: gridOf, neighbors: neighbors, adjacent: adjacent, chainScore: chainScore, ramp: ramp, targetFor: targetFor, timeMs: timeMs, dimsFor: NG.dimsFor, gridFor: NG.gridFor, fillParams: fillParams, minBestFor: minBestFor,
            collapse: collapse, runFrom: runFrom, potentialOf: potentialOf, pickValue: pickValue, fillNew: fillNew, bestChain: bestChain, longestChain: longestChain, hasChain: hasChain,
            growWalk: growWalk, walkValues: walkValues, ensureChain: ensureChain, makePuzzle: makePuzzle, newState: newState, chainOrder: chainOrder, beginDrag: beginDrag, dragStep: dragStep,
            commit: commit, rating: rating, bounce: NG.bounce, loupeAt: NG.loupeAt, getOpts: NG.getOpts,
            RAMP_LEVELS: RAMP_LEVELS, TIME_S: TIME_S, TARGET: TARGET, GRID_W: NG.GRID_W, GRID_H: NG.GRID_H, GRID_RAMP_LEVELS: NG.GRID_RAMP_LEVELS, MIN_CHAIN: MIN_CHAIN, DIAG: NG.DIAG,
            ASSIST_P: ASSIST_P, AIM_LEN: AIM_LEN, PICK_K: PICK_K, BREAK_P: BREAK_P, MIN_BEST_LEN: MIN_BEST_LEN, HIT: NG.HIT, DIGIT_H: NG.DIGIT_H, MAX_LEVEL: MAX_LEVEL,
            DEFAULT_LOUPE: NG.DEFAULT_LOUPE, LOUPE_CELL_MAX: NG.LOUPE_CELL_MAX, BAR_H: NG.BAR_H, CELL_MAX: NG.CELL_MAX
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
