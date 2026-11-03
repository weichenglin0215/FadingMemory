/* ═══════════════════════════════════════════════════════════════════
   reaction_euler.js — 秒反應・能一筆畫嗎
   樣式：css/games/reaction_euler.css（這款專屬的 class 一律以「euler-」開頭；共用元件在 css/reaction_common.css）
   畫面是一個由點和線構成的圖形，判斷「能不能不重複走同一條線、筆不離開，把全部線畫完」。
   下方左邊「不能」、右邊「能」。關卡制，答錯或逾時就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 規律（歐拉）：圖形連通，而且「奇數度的點」有 0 個或 2 個 → 能；否則不能。
   · 圖形長在 4×4 格點上：線連接水平／垂直／斜向相鄰的點，每個格子最多一條斜線（不交叉），
     所以所有線的交會處都有點。
   · 邊數 EDGES 6→20（線性）；「能」「不能」各約一半；反直覺的題目比例 COUNTER 20%→60%：
     看起來複雜的「能」（邊數 ≥ COMPLEX_MIN）或看起來簡單的「不能」（邊數 ≤ SIMPLE_MAX）。
   · 限時 TIME_S 15→8 秒。
   · 評審動畫（V1.28 玩家意見）：判斷之後，從起點開始把線一條一條畫出來（penRoute）——
       能一筆畫完：全部都是「粗綠線＋黑色箭頭」（箭頭指著前進的方向）；
       不能一筆畫完：畫到走不下去時必須重複走已經畫過的線才能繼續，重複的線改用「粗紅色虛線」顯示，
       玩家用看的就知道無法一筆完成；不再用文字說明奇數點（玩家看不懂、覺得生硬）。
     動畫畫完後停 HOLD_MS（2 秒）才出現結算（答對時直接進下一題前也停一下）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'euler'：選單、成績、存檔都靠它；樣式在 css/games/reaction_euler.css，裡面的 class 名稱一律以 euler- 開頭。 */
    'use strict';

    var ID = 'euler';                                   /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var EDGES = [6, 20];                        /* 邊數：第 1 題 → 到頂 */
    var TIME_S = [15, 8];                       /* 每題限時（秒） */
    var COUNTER = [0.2, 0.6];                   /* 反直覺題目的比例 */
    var COMPLEX_MIN = 14, SIMPLE_MAX = 8;       /* 「看起來複雜」「看起來簡單」的邊數界線 */
    var STEP_MS = [120, 450], ANIM_MAX_MS = 3200;     /* 評審動畫：每畫一條線花幾毫秒（範圍）、整段動畫最久幾毫秒 */
    var HOLD_MS = 2000;                         /* 動畫畫完之後停多久才出現結算彈窗 */
    var HOLD_PASS_MS = 1000;                    /* 答對時動畫畫完停多久才進下一題 */
    var N = 4;                                  /* 格點 N×N */
    var TRIES = 4000;                               /* 出題時最多重抽幾次，抽到符合條件的圖就停 */
    var GX = 36, GY = 50, GAPX = 133, GAPY = 130;    /* 格點位置（舞台座標） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function edgesAt(level) { return Math.round(kit.ramp(level, EDGES[0], EDGES[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    function counterFrac(level) { return kit.ramp(level, COUNTER[0], COUNTER[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 線段 a→b 的黑色箭頭（三角形，放在線段 55% 的位置，尖端指向前進方向 b）：回傳 SVG polygon 的 points */
    function arrowPoints(a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len, px = -uy, py = ux;  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
        var cx = a.x + dx * 0.55, cy = a.y + dy * 0.55, L = 15, Wd = 11;
        return [(cx + ux * L).toFixed(1) + ',' + (cy + uy * L).toFixed(1), (cx - ux * L * 0.6 + px * Wd).toFixed(1) + ',' + (cy - uy * L * 0.6 + py * Wd).toFixed(1), (cx - ux * L * 0.6 - px * Wd).toFixed(1) + ',' + (cy - uy * L * 0.6 - py * Wd).toFixed(1)].join(' ');
    }
    function nid(r, c) { return r * N + c; }
    function posOf(id) { return { x: GX + (id % N) * GAPX, y: GY + Math.floor(id / N) * GAPY }; }  /* Math.floor：無條件捨去成整數 */
    /* 候選邊：格點相鄰（橫、直）與每個格子的兩種斜線（同一格最多選一種） */
    function candidates() {
        var out = [], r, c;
        for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
            if (c + 1 < N) out.push({ a: nid(r, c), b: nid(r, c + 1), cell: -1 });
            if (r + 1 < N) out.push({ a: nid(r, c), b: nid(r + 1, c), cell: -1 });
            if (r + 1 < N && c + 1 < N) {
                out.push({ a: nid(r, c), b: nid(r + 1, c + 1), cell: r * N + c });
                out.push({ a: nid(r, c + 1), b: nid(r + 1, c), cell: r * N + c });
            }
        }
        return out;
    }
    var CANDS = candidates();
    function degrees(edges) { var d = {}; edges.forEach(function (e) { d[e[0]] = (d[e[0]] || 0) + 1; d[e[1]] = (d[e[1]] || 0) + 1; }); return d; }  /* forEach：對陣列的每個元素各做一次 */
    function oddNodes(edges) { var d = degrees(edges); return Object.keys(d).map(Number).filter(function (k) { return d[k] % 2 === 1; }).sort(function (x, y) { return x - y; }); }  /* filter：留下符合條件的元素，回傳新陣列 */
    function connected(edges) {
        if (!edges.length) return true;
        var adj = {}; edges.forEach(function (e) { (adj[e[0]] = adj[e[0]] || []).push(e[1]); (adj[e[1]] = adj[e[1]] || []).push(e[0]); });  /* forEach：對陣列的每個元素各做一次 */
        var start = edges[0][0], seen = {}, stack = [start]; seen[start] = true;
        while (stack.length) { var u = stack.pop(); adj[u].forEach(function (v) { if (!seen[v]) { seen[v] = true; stack.push(v); } }); }
        return Object.keys(adj).every(function (k) { return seen[k]; });  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
    }
    function isEulerian(edges) { var o = oddNodes(edges).length; return connected(edges) && (o === 0 || o === 2); }
    /* 每個格點有哪些候選邊（候選邊的索引） */
    var ADJ = (function () { var m = {}; CANDS.forEach(function (c, i) { (m[c.a] = m[c.a] || []).push(i); (m[c.b] = m[c.b] || []).push(i); }); return m; })();
    var EKEY = function (c) { return c.a + '-' + c.b; };
    /* 隨機「走一條路」：從一個點出發，每次走一條還沒走過的邊（同一格最多一條斜線），最多走 E 條。
       走過的邊所組成的圖必定可以一筆畫（它本來就是一筆走出來的），而且一定連通。 */
    function randomTrail(E, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var cur = kit.randInt(0, N * N - 1, rand), used = {}, cells = {}, edges = [];  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        while (edges.length < E) {
            var opts = ADJ[cur].filter(function (i) {   /* filter：留下符合條件的元素，回傳新陣列 */
                var c = CANDS[i];
                if (used[EKEY(c)]) return false;
                if (c.cell >= 0 && cells[c.cell] && cells[c.cell] !== EKEY(c)) return false;
                return true;
            });
            if (!opts.length) break;
            var c = CANDS[kit.pick(opts, rand)];        /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            used[EKEY(c)] = true; if (c.cell >= 0) cells[c.cell] = EKEY(c);
            edges.push([c.a, c.b]); cur = c.a === cur ? c.b : c.a;
        }
        return edges;
    }
    /* 在現有的點上再加一條邊（不重複、不違反斜線規則）；加不了回傳 null */
    function addEdge(edges, rand) {
        var nodes = {}, have = {}, cells = {};
        edges.forEach(function (e) { nodes[e[0]] = nodes[e[1]] = true; have[Math.min(e[0], e[1]) + '-' + Math.max(e[0], e[1])] = true; });
        edges.forEach(function (e) {
            CANDS.forEach(function (c) { if (c.cell >= 0 && ((c.a === e[0] && c.b === e[1]) || (c.a === e[1] && c.b === e[0]))) cells[c.cell] = true; });
        });
        var opts = CANDS.filter(function (c) {
            if (have[Math.min(c.a, c.b) + '-' + Math.max(c.a, c.b)]) return false;
            if (c.cell >= 0 && cells[c.cell]) return false;
            return nodes[c.a] || nodes[c.b];
        });
        if (!opts.length) return null;
        var c = kit.pick(opts, rand);                   /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        return [c.a, c.b];
    }
    /* 出題：回傳 { edges, odd, yes, counter }。
       「能」＝隨機走一條路（邊數接近目標）；「不能」＝走一條路再加幾條邊，直到奇數點 ≥ 4 個。 */
    function makeGraph(level, rand, wantYes) {
        rand = rand || Math.random;
        if (wantYes == null) wantYes = rand() < 0.5;
        var E = edgesAt(level), counter = rand() < counterFrac(level), mode = null;
        if (counter) mode = wantYes ? (level >= 10 ? 'complexYes' : null) : 'simpleNo';
        var e = E;
        if (mode === 'complexYes') e = Math.max(E, COMPLEX_MIN);
        if (mode === 'simpleNo') e = Math.max(5, Math.min(E, SIMPLE_MAX));
        for (var t = 0; t < TRIES; t++) {
            var edges = randomTrail(wantYes ? e : e - 1, rand), k;
            if (wantYes) {
                if (edges.length < e - 1) continue;
                if (mode === 'complexYes' && edges.length < COMPLEX_MIN) continue;
            } else {
                if (edges.length < e - 3) continue;
                for (k = 0; k < 4 && oddNodes(edges).length < 4; k++) { var add = addEdge(edges, rand); if (!add) break; edges.push(add); }
                if (oddNodes(edges).length < 4) continue;
                if (mode === 'simpleNo' && edges.length > SIMPLE_MAX) continue;
            }
            return { edges: edges, odd: oddNodes(edges), yes: isEulerian(edges), counter: mode != null };
        }
        /* 保底：房子（能，奇數點 2 個）／十字星（不能，奇數點 4 個） */
        var house = [[5, 6], [6, 10], [10, 9], [9, 5], [1, 5], [1, 6]];
        var star = [[5, 1], [5, 4], [5, 6], [5, 9]];
        var fb = wantYes ? house : star;
        return { edges: fb, odd: oddNodes(fb), yes: isEulerian(fb), counter: false };
    }
    /* 一筆畫路線（Hierholzer）：回傳點的順序（長度 邊數＋1）；不是歐拉圖回傳 null */
    function eulerPath(edges) {
        if (!isEulerian(edges)) return null;
        var adj = {};
        edges.forEach(function (e, i) { (adj[e[0]] = adj[e[0]] || []).push({ to: e[1], id: i }); (adj[e[1]] = adj[e[1]] || []).push({ to: e[0], id: i }); });
        var odd = oddNodes(edges), start = odd.length ? odd[0] : edges[0][0], used = {}, stack = [start], path = [];
        while (stack.length) {
            var u = stack[stack.length - 1], list = adj[u];
            while (list.length && used[list[list.length - 1].id]) list.pop();
            if (!list.length) { path.push(stack.pop()); }
            else { var nx = list.pop(); used[nx.id] = true; stack.push(nx.to); }
        }
        return path.reverse();
    }
    /* 評審動畫的畫線路線：從起點開始一條一條畫。能一筆畫（歐拉圖）→ 用 eulerPath，全部都是新的線（kind 'new'）；
       不能 → 從奇數點出發，優先走沒畫過的線；走到死路（這個點沒有沒畫過的線了）就沿最短路徑「重複走已經畫過的線」
       （kind 'repeat'）走到還有沒畫過的線的點，再繼續。回傳 { steps: [{ a, b, kind }], repeats: 重複走的線數 }。
       每一步的起點都是上一步的終點（筆不離開）。 */
    function penRoute(edges) {
        var steps = [], path = eulerPath(edges), i, k;
        if (path) {
            for (i = 1; i < path.length; i++) steps.push({ a: path[i - 1], b: path[i], kind: 'new' });
            return { steps: steps, repeats: 0 };
        }
        var adj = {}, used = {}, left = edges.length;
        edges.forEach(function (e, id) { (adj[e[0]] = adj[e[0]] || []).push({ to: e[1], id: id }); (adj[e[1]] = adj[e[1]] || []).push({ to: e[0], id: id }); });
        function hasFree(u) { return adj[u].some(function (x) { return !used[x.id]; }); }  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
        var odd = oddNodes(edges), cur = odd.length ? odd[0] : edges[0][0], repeats = 0, guard = 0;
        while (left > 0 && guard++ < 500) {
            var free = adj[cur].filter(function (x) { return !used[x.id]; });
            if (free.length) { var nx = free[0]; used[nx.id] = true; left--; steps.push({ a: cur, b: nx.to, kind: 'new' }); cur = nx.to; continue; }
            /* 死路：BFS 找最近的、還有沒畫過的線的點，沿路重複走 */
            var prev = {}, queue = [cur], seen = {}, goal = null; seen[cur] = true;
            while (queue.length && goal == null) {
                var u = queue.shift();
                for (k = 0; k < adj[u].length; k++) {
                    var v = adj[u][k].to; if (seen[v]) continue;
                    seen[v] = true; prev[v] = u; queue.push(v);
                    if (hasFree(v)) { goal = v; break; }
                }
            }
            if (goal == null) break;                                           /* 圖不連通（不會發生在本遊戲的題目裡） */
            var way = []; for (var x = goal; x !== cur; x = prev[x]) way.push(x); way.reverse();
            way.forEach(function (to) { steps.push({ a: cur, b: to, kind: 'repeat' }); repeats++; cur = to; });
        }
        return { steps: steps, repeats: repeats };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 40) return '一筆畫大師！';
        if (n >= 25) return '高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '數數看有幾個點連著奇數條線，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        var hist = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            head: function (lv) { return '第 ' + lv + ' 題'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.cleared + ' 題']; },
            setup: function (api) { if (api.level === 1) hist.length = 0; setup(api, hist); }
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api, hist) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var wantYes = hist.length >= 3 && hist.slice(-3).every(function (v) { return v === hist[hist.length - 1]; }) ? !hist[hist.length - 1] : api.rand() < 0.5;  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
        var q = makeGraph(level, api.rand, wantYes);
        hist.push(q.yes);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[能一筆畫嗎] 第 ' + level + ' 題：' + q.edges.length + ' 條邊，奇數點 ' + q.odd.length + ' 個（' + (q.yes ? '能' : '不能') + (q.counter ? '，反直覺題' : '') + '），限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var svg = kit.svg('svg', { 'class': 'euler-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var gl = kit.svg('g', {}, svg);                 /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var routeLayer = kit.svg('g', {}, svg);                                 /* 評審動畫的路線畫在線上、點的下面 */
        var lines = q.edges.map(function (e) { var a = posOf(e[0]), b = posOf(e[1]); return kit.svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'euler-edge' }, gl); });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var deg = degrees(q.edges), dots = {};
        Object.keys(deg).forEach(function (k) { var p = posOf(Number(k)); dots[k] = kit.svg('circle', { cx: p.x, cy: p.y, r: 11, 'class': 'euler-node' }, svg); });
        var msg = h('div', { 'class': 'euler-msg', text: '不重複、筆不離開，能把全部的線畫完嗎？' });
        stage.appendChild(msg);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var bNo = h('button', { 'class': 'btn btn--primary', text: '不能' });
        var bYes = h('button', { 'class': 'btn btn--go', text: '能' });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bNo, bYes]));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        api.timer(timeMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 評審動畫：從起點開始一條一條畫出路線——粗綠線＋黑色箭頭；必須重複走已畫過的線時用粗紅色虛線（不用文字說明奇數點）。
           回傳整段動畫要花的毫秒數 */
        function drawRoute() {
            var route = penRoute(q.edges), n = route.steps.length, each = Math.max(STEP_MS[0], Math.min(STEP_MS[1], ANIM_MAX_MS / Math.max(1, n)));
            var layer = routeLayer;
            route.steps.forEach(function (s, i) {
                api.after(each * i, function () {       /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                    var a = posOf(s.a), b = posOf(s.b);
                    kit.svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'euler-route' + (s.kind === 'repeat' ? ' euler-route--rep' : '') }, layer);
                    kit.svg('polygon', { points: arrowPoints(a, b), 'class': 'euler-arrow' }, layer);
                    Sfx.play('tick');                   /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                });
            });
            return each * n;
        }
        var judged = false;
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(sayYes) {
            if (api.over || judged) return;
            judged = true; api.stopTimer();
            bNo.disabled = bYes.disabled = true;
            msg.textContent = '';                       /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            var right = sayYes === q.yes, ms = drawRoute();
            if (right) api.after(ms + HOLD_PASS_MS, function () { api.pass({ delay: 0 }); });  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            else api.after(ms + HOLD_MS, function () {  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                api.fail({ delay: 0, lines: [(sayYes == null ? '時間到！' : '答錯了：') + '這個圖形' + (q.yes ? '可以' : '不能') + '一筆畫'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
            });
        }
        kit.onTap(bYes, function () { judge(true); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(bNo, function () { judge(false); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.yes); };
        api.wrong = function () { judge(!q.yes); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '能一筆畫嗎',
        rule: '畫面上是一個由點和線組成的圖形。判斷能不能**「不重複走同一條線、筆不離開」**，把全部的線一次畫完。答錯或來不及就結束，看你能連續答對幾題。提示：數數看，**每個點連著幾條線**。',
        mount: mount,
        score: SCORE,
        test: { penRoute: penRoute, arrowPoints: arrowPoints, HOLD_MS: HOLD_MS, HOLD_PASS_MS: HOLD_PASS_MS, STEP_MS: STEP_MS, ANIM_MAX_MS: ANIM_MAX_MS, edgesAt: edgesAt, timeMs: timeMs, counterFrac: counterFrac, posOf: posOf, candidates: candidates, degrees: degrees, oddNodes: oddNodes, connected: connected, isEulerian: isEulerian, randomTrail: randomTrail, addEdge: addEdge, makeGraph: makeGraph, eulerPath: eulerPath, rating: rating, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, EDGES: EDGES, COMPLEX_MIN: COMPLEX_MIN, SIMPLE_MAX: SIMPLE_MAX, N: N }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
