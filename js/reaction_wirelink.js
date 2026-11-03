/* ═══════════════════════════════════════════════════════════════════
   reaction_wirelink.js — 秒反應・接電線（企劃 222）
   樣式：css/games/reaction_wirelink.css（這款專屬的 class 一律以「wirelink-」開頭；共用元件在 css/reaction_common.css）
   方格板上散著幾對同色的插頭（紅對紅、藍對藍…）。手指從一個插頭拖到同色的另一個，拖過的格子變成那條電線；
   **電線不能交叉，最後每一格都要被電線佔滿**才過關。畫錯了可以從插頭重拖（或從電線中間重拖，那一格之後的電線會收回去）。
   接通的那一對插頭會亮起小燈泡，全部接好、板子填滿時整塊板子的燈一起亮。
   ───────────────────────────────────────────────────────────────────
   · 這是手機上流行的「Flow」玩法。難度：棋盤 4×4 → 8×8（SIZE）、顏色 2 → 8 種（COLORS）、限時 30 → 70 秒（TIME_S），都是線性；
     顏色的出現順序是「紅、藍、綠、黃、紫、水藍、橘、粉紅」：第 6 種起水藍跟藍很接近、第 7 種起橘跟黃很接近（誘餌：看錯顏色就接錯）。
   · 出題（makePuzzle）：先隨機做出「走遍整個棋盤的一條路」（kit.hamPath，漢米爾頓路徑），再把這條路切成 k 段（每段至少 3 格），
     每一段就是一種顏色的電線，兩端各放一個插頭——所以每一題一定有解，而且電線全部不交叉、剛好填滿整塊板子。
     最近的兩個同色插頭往往不能直接連（會擋住別的顏色的路），這是這類題目自然的陷阱。
   · 判定：不拿「出題時的那組解」比對，只看「規則有沒有達成」——每一格都有電線、每一種顏色的兩個插頭都接通。
     所以只要接法合規，不管跟出題時的解一不一樣都算過關（玩家不會在「其實也對」的接法上被判錯）。
   · 電線的規則（applyDrag）：從插頭（或同色電線上的任何一格）按下；只能往相鄰的空格拖；拖回上一格＝把電線收回一格；
     碰到別的顏色的電線／插頭、或自己的電線（不是上一格）就擋住，不能穿過；拖到同色的另一個插頭就接通。
   · 時間到：把正確的接法一條一條畫出來，沒接通的電線閃紅，停格 3 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'wirelink'：選單、成績、存檔都靠它；樣式在 css/games/reaction_wirelink.css，裡面的 class 名稱一律以 wirelink- 開頭。 */
    'use strict';

    var ID = 'wirelink';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var SIZE = [4, 8];                          /* 棋盤邊長（格）：第 1 關 → 到頂 */
    var COLORS = [2, 8];                        /* 顏色（電線）種數：第 1 關 → 到頂；最多 8 種（PALETTE 的長度） */
    var TIME_S = [30, 70];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var MIN_SEG = 3;                            /* 每一條電線（一段路）至少幾格 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 顏色的名稱與出現順序（CSS 變數 --wlk-0～--wlk-7 在 css/theme.css；水藍(5)像藍(1)、橘(6)像黃(3)） */
    /* 電線顏色的名稱與編號（編號 0～7）；每種顏色在 CSS 對應 --wlk-編號 變數。水藍(5) 故意做得像藍(1)、橘(6) 像黃(3)，增加辨認難度 */
    var PALETTE = ['紅', '藍', '綠', '黃', '紫', '水藍', '橘', '粉紅'];
    var neighbors = kit.gridNeighbors, adjacent = kit.gridAdjacent;  /* neighbors：取一格的上下左右鄰格；adjacent：判斷兩格是否相鄰（都是共用工具箱 kit 的函式） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關棋盤的邊長（格） */
    function sizeFor(level) { return Math.round(kit.ramp(level, SIZE[0], SIZE[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關有幾種顏色：照線性算，但每種顏色至少要有 MIN_SEG 格，所以最多 floor(n² ÷ MIN_SEG) 種 */
    /* 這一關有幾種顏色（幾條電線）：依關卡線性增加，但每種顏色至少要 MIN_SEG 格、所以最多 n²÷MIN_SEG 種，也不能超過調色盤 */
    function colorsFor(level) { var n = sizeFor(level); return Math.max(1, Math.min(PALETTE.length, Math.floor(n * n / MIN_SEG), Math.round(kit.ramp(level, COLORS[0], COLORS[1], RAMP_LEVELS)))); }  /* Math.floor：無條件捨去成整數 */
    /* 這一關的限時（毫秒） */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 把 total 格分成 k 段，每段至少 min 格（多出來的格子隨機分給各段）；回傳每段的長度 */
    /* 把 total 格分成 k 段，每段至少 min 格，多出來的格子隨機分給各段（做法：先每段發 min 格，剩下的一格一格隨機丟給某一段）；回傳每段的長度 */
    function splitLengths(total, k, min, rand) {
        var lens = [], extra = total - k * min, i;
        for (i = 0; i < k; i++) lens.push(min);
        for (i = 0; i < extra; i++) lens[Math.floor(rand() * k)]++;
        return lens;
    }
    /* 出一題：{ n, k, plugs:[{ c（顏色編號 0～7）, a, b（兩個插頭的格子）}], solution:[每種顏色一條路（格子編號陣列，從 a 到 b）], level }；
       先用 kit.hamPath 做一條走遍整個棋盤的路，再切成 k 段 */
    /* 出一題：先用 kit.hamPath 做一條「走遍整個棋盤每一格剛好一次」的路（哈密頓路徑），再把這條路切成 k 段，每一段就是一種顏色的電線，
       兩端放上同色的插頭。這樣題目一定有解（答案就是 solution），而且每一格都要被電線填滿。回傳 { n, k, plugs 插頭, solution 答案, level }。 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = sizeFor(level), k = colorsFor(level), total = n * n, blocked = new Uint8Array(total), ham = null;
        for (var tr = 0; tr < 300 && !ham; tr++) { var s0 = Math.floor(rand() * total); if (kit.gridParityOk(n, blocked, s0)) ham = kit.hamPath(n, blocked, s0, rand, 4000); }  /* 隨機挑起點試最多 300 次，直到找到走遍全盤的路（kit.gridParityOk 先用「棋盤格奇偶性」快速排除不可能的起點） */
        if (!ham) { ham = []; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) ham.push(r * n + (r % 2 ? n - 1 - c : c)); }  /* 保底：萬一都找不到，就用「蛇形」（一排往右、一排往左）走遍全盤 */
        var lens = splitLengths(total, k, MIN_SEG, rand), cols = kit.shuffle(Array.apply(null, Array(k)).map(function (_, i) { return i; }), rand), plugs = [], solution = [], pos = 0;  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        lens.forEach(function (len, i) {                /* forEach：對陣列的每個元素各做一次 */
            var seg = ham.slice(pos, pos + len); pos += len;
            if (rand() < 0.5) seg.reverse();
            plugs.push({ c: cols[i], a: seg[0], b: seg[seg.length - 1] });
            solution.push(seg);
        });
        return { n: n, k: k, plugs: plugs, solution: solution, level: level };
    }
    /* 目前的接線狀態：occ[格子] ＝ 那一格的電線顏色（沒有＝−1，插頭那格一開始就是它的顏色）；paths[顏色] ＝ 這條電線已經鋪的格子（從某一個插頭開始）；done[顏色] ＝ 接通了嗎 */
    /* 建立目前的接線狀態：occ[格子]＝那一格的電線顏色（沒有＝−1；插頭那格一開始就是它的顏色）、plugOf＝插頭所在的格子、paths[顏色]＝這條電線已經鋪的格子、done[顏色]＝這條接通了嗎 */
    function newState(q) {
        var occ = new Int8Array(q.n * q.n).fill(-1), plugOf = {}, paths = {}, done = {};
        q.plugs.forEach(function (p) { occ[p.a] = p.c; occ[p.b] = p.c; plugOf[p.a] = p.c; plugOf[p.b] = p.c; paths[p.c] = []; done[p.c] = false; });
        return { n: q.n, occ: occ, plugOf: plugOf, paths: paths, done: done, plugs: q.plugs };
    }
    /* 同一種顏色的兩個插頭裡，「另一個」插頭在哪一格 */
    function otherPlug(st, c, cell) { var p = st.plugs.filter(function (x) { return x.c === c; })[0]; return p.a === cell ? p.b : p.a; }  /* filter：留下符合條件的元素，回傳新陣列 */
    /* 手指在格子 cell 按下：回傳這一筆畫的顏色（−1＝按在空格或不能開始的地方）。
       按在插頭上：那條電線整條收回，從這個插頭重新開始；按在同色電線的中間：那一格之後的電線收回，從這裡接著畫；按在電線的最前端：接著畫 */
    /* 手指在 cell 按下時要做什麼，回傳這一筆畫的顏色（−1＝按在空格或不能開始的地方）：按在插頭上＝這條電線整條收回、從這個插頭重新開始；按在同色電線的中間＝那格之後的收回、從這裡接著畫；按在電線最前端＝接著畫 */
    function startDraw(st, cell) {
        var c = st.occ[cell];
        if (c < 0) return -1;
        if (st.plugOf[cell] != null) { clearPath(st, c); st.paths[c] = [cell]; return c; }
        var p = st.paths[c], idx = p.indexOf(cell);     /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        if (idx < 0) return -1;
        while (p.length > idx + 1) { var gone = p.pop(); if (st.plugOf[gone] == null) st.occ[gone] = -1; }       /* 插頭那一格的顏色不能清掉 */
        st.done[c] = false;
        return c;
    }
    /* 把顏色 c 的電線整條收回（插頭那一格的顏色要保留） */
    function clearPath(st, c) {
        st.paths[c].forEach(function (k) { if (st.plugOf[k] == null) st.occ[k] = -1; });
        st.paths[c] = []; st.done[c] = false;
    }
    /* 這一筆畫（顏色 c）拖到格子 cell：回傳 'add'（往空格鋪一格）／'connect'（接到同色的另一個插頭）／'back'（拖回上一格＝收回一格）／null（不動：不相鄰、被擋住） */
    /* 這一筆畫（顏色 c）拖到 cell 時的處理，回傳 'add'（往空格鋪一格）／'connect'（接到同色的另一個插頭）／'back'（拖回上一格＝收回一格）／null（不動：不相鄰或被擋住） */
    function applyDrag(st, c, cell) {
        var p = st.paths[c];
        if (!p.length) return null;
        var head = p[p.length - 1];
        if (p.length >= 2 && cell === p[p.length - 2]) {
            if (st.plugOf[head] == null || st.done[c]) { if (st.plugOf[head] == null) st.occ[head] = -1; p.pop(); st.done[c] = false; return 'back'; }
        }
        if (st.done[c]) return null;                                  /* 已經接通了：只能往回收，不能再往前 */
        if (!adjacent(st.n, head, cell)) return null;
        if (st.occ[cell] === -1) { st.occ[cell] = c; p.push(cell); return 'add'; }
        if (st.plugOf[cell] === c && cell !== p[0] && cell === otherPlug(st, c, p[0])) { p.push(cell); st.done[c] = true; return 'connect'; }
        return null;
    }
    /* 已經有電線的格子數 */
    function filled(st) { var f = 0; for (var i = 0; i < st.occ.length; i++) if (st.occ[i] >= 0) f++; return f; }
    /* 已經接通的電線條數 */
    function linked(st) { var l = 0; Object.keys(st.done).forEach(function (c) { if (st.done[c]) l++; }); return l; }
    /* 過關：每一格都有電線、每一種顏色都接通 */
    /* 過關條件：每一格都有電線、每一種顏色都接通 */
    function isSolved(st) { return filled(st) === st.n * st.n && linked(st) === st.plugs.length; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '電線大師！';
        if (n >= 15) return '接線高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先接最容易被擋住的那一對，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'wirelink-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makePuzzle(level, api.rand), n = q.n, st = newState(q), over = false;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[接電線] 第 ' + level + ' 關：' + n + '×' + n + '、' + q.k + ' 種顏色（' + q.plugs.map(function (p) { return PALETTE[p.c]; }).join('、') + '）；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 56;
        var cell = Math.floor(Math.min((W - 20) / n, (H - topPad - 20) / n, 90)), BS = cell * n, bx = Math.round((W - BS) / 2), by = topPad + Math.round((H - topPad - BS) / 2) - 8;  /* 算棋盤尺寸：每格邊長 cell（寬或高放得下、最大 90px）、整個棋盤邊長 BS、棋盤左上角的位置 bx／by（置中） */
        var tip = h('div', { 'class': 'qz-note wirelink-tip', text: '' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var board = h('div', { 'class': 'wirelink-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BS + 'px;height:' + BS + 'px;';
        stage.appendChild(board);
        var cells = [];
        for (var i = 0; i < n * n; i++) {
            var r = Math.floor(i / n), c = i % n, el = h('div', { 'class': 'wirelink-cell' });
            el.style.cssText = 'left:' + c * cell + 'px;top:' + r * cell + 'px;width:' + cell + 'px;height:' + cell + 'px;';
            board.appendChild(el); cells.push(el);
        }
        /* 第 i 格的中心 x 座標（格子編號 ＝ 列 × n ＋ 欄） */
        function cx(i) { return (i % n + 0.5) * cell; }
        /* 第 i 格的中心 y 座標 */
        function cy(i) { return (Math.floor(i / n) + 0.5) * cell; }
        var svg = kit.svg('svg', { 'class': 'wirelink-svg', viewBox: '0 0 ' + BS + ' ' + BS, width: BS, height: BS }, board);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var gSol = kit.svg('g', {}, svg), wires = {}, plugEls = [];  /* gSol：時間到時用來放「正確接法」的群組；wires：每種顏色的電線（SVG path）；plugEls：所有插頭的畫面元素 */
        q.plugs.forEach(function (p) {
            var w = kit.svg('path', { 'class': 'wirelink-wire wirelink-c' + p.c, d: '' }, svg);
            w.setAttribute('stroke-width', (cell * 0.46).toFixed(1)); wires[p.c] = w;  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        });
        q.plugs.forEach(function (p) {
            [p.a, p.b].forEach(function (k) {
                var g = kit.svg('g', { 'class': 'wirelink-plug wirelink-c' + p.c }, svg);
                kit.svg('circle', { 'class': 'wirelink-plug-body', cx: cx(k), cy: cy(k), r: cell * 0.34 }, g);
                kit.svg('circle', { 'class': 'wirelink-plug-in', cx: cx(k), cy: cy(k), r: cell * 0.14 }, g);
                plugEls.push({ g: g, c: p.c });
            });
        });
        /* 把一串格子編號轉成 SVG path 的路徑文字（"M x y L x y …"：M 移到起點、L 畫線到下一點） */
        function pathD(p) { return p.map(function (k, j) { return (j ? 'L' : 'M') + cx(k).toFixed(1) + ' ' + cy(k).toFixed(1); }).join(' '); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        /* 重畫：每條電線依目前鋪的格子畫出路徑、接通的插頭亮起來、上方顯示「已接通幾條、填滿幾格」 */
        function paint() {
            q.plugs.forEach(function (p) {
                var path = st.paths[p.c];
                wires[p.c].setAttribute('d', path.length ? pathD(path) + (path.length === 1 ? ' L' + (cx(path[0]) + 0.01) + ' ' + cy(path[0]) : '') : '');
            });
            plugEls.forEach(function (pe) { pe.g.classList.toggle('wirelink-plug--on', !!st.done[pe.c]); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            tip.textContent = '已接通 ' + linked(st) + '／' + q.k + ' 條　填滿 ' + filled(st) + '／' + n * n + ' 格';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        }
        paint();
        api.timer(timeMs(level), function () { finish('time'); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('wirelink.hint')) { /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var p0 = q.plugs[0];
            kit.hintOn(stage, null, { mode: 'drag', x: bx + cx(p0.a), y: by + cy(p0.a), dx: cx(p0.b) - cx(p0.a), dy: cy(p0.b) - cy(p0.a), delay: 500, text: '從插頭拖到同色插頭且佈滿畫面' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }

        var pid = null, drawing = -1, lastPt = null;    /* pid：目前這根手指的編號（只認一根）；drawing：正在畫的顏色（−1＝沒在畫）；lastPt：手指上一個位置 */
        /* 把舞台座標換算成格子編號（在棋盤外回傳 −1） */
        function cellAt(x, y) {
            var c = Math.floor((x - bx) / cell), r = Math.floor((y - by) / cell);
            return c < 0 || c >= n || r < 0 || r >= n ? -1 : r * n + c;
        }
        /* 手指移動到 p：把「上一個位置到 p」這一段切成小步（每步最多 1/4 格），一步一步呼叫 applyDrag，這樣手指移太快也不會跳過格子 */
        function feed(p) {
            if (over || api.over) return;
            var from = lastPt || p, dist = kit.dist(from.x, from.y, p.x, p.y), steps = Math.max(1, Math.ceil(dist / (cell / 4)));  /* Math.ceil：無條件進位成整數 */
            for (var s = 1; s <= steps && !over && !api.over; s++) {
                var x = from.x + (p.x - from.x) * s / steps, y = from.y + (p.y - from.y) * s / steps, k = cellAt(x, y);
                if (k < 0) continue;
                var act = applyDrag(st, drawing, k);
                if (act) { Sfx.play(act === 'connect' ? 'ok' : (act === 'add' ? 'tick' : 'flip')); paint(); if (isSolved(st)) finish('ok'); }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            }
            lastPt = p;
        }
        stage.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (over || api.over || pid != null) return;
            var p = kit.localPt(e, stage), k = cellAt(p.x, p.y);
            if (k < 0) return;
            var c = startDraw(st, k);
            if (c < 0) return;
            e.preventDefault(); pid = e.pointerId; drawing = c; lastPt = p;  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            paint();
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        /* 手指放開：結束這一筆畫 */
        function up(e) { if (pid === e.pointerId) { pid = null; drawing = -1; lastPt = null; } }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* 結束：kind＝'ok'（接好了）／'time'（時間到） */
        /* 結束：kind 是 'ok'（接好了，燈全亮、過關）或 'time'（時間到，沒接通的電線閃紅，並一條一條畫出正確接法，然後失敗） */
        function finish(kind) {
            if (over || api.over) return;
            over = true; pid = null;
            if (kind === 'ok') {
                board.classList.add('wirelink-board--lit');
                tip.textContent = '全部接好了，燈全亮！';
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 1500 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            /* 時間到：沒接通的電線閃紅；正確的接法一條一條畫出來（每條晚 0.25 秒） */
            var miss = 0;
            q.plugs.forEach(function (p, i) {
                if (!st.done[p.c]) { wires[p.c].classList.add('wirelink-wire--bad'); miss++; }
                var sl = kit.svg('path', { 'class': 'wirelink-sol wirelink-c' + p.c, d: pathD(q.solution[i]), pathLength: 1 }, gSol);
                sl.setAttribute('stroke-width', (cell * 0.46).toFixed(1));
                sl.style.animationDelay = (i * 0.25) + 's';
            });
            board.classList.add('wirelink-board--reveal');
            gSol.classList.add('wirelink-sol--draw');
            tip.textContent = '時間到！彩色粗線是其中一種接法';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: ['時間到，還有 ' + miss + ' 條電線沒接通、' + (n * n - filled(st)) + ' 格沒填滿', '板子 ' + n + '×' + n + '、' + q.k + ' 種顏色'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：api.solve 把出題時的解一條一條接好；api.wrong 直接當作時間到 */
        api.solve = function () {
            q.plugs.forEach(function (p, i) {
                var c = startDraw(st, q.solution[i][0]);
                q.solution[i].slice(1).forEach(function (k) { applyDrag(st, c, k); });
            });
            paint(); if (isSolved(st)) finish('ok');
        };
        api.wrong = function () { finish('time'); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '接電線',
        rule: '方格板上有幾對同顏色的插頭。**手指從一個插頭拖到同色的另一個插頭**，拖過的格子會變成電線。**電線必須占滿每一格且不能交叉**才過關。拖錯了，從插頭重新拖就好。來不及就結束，看你能過幾關。越後面，棋盤越大、顏色越多，還會有兩種很像的顏色（藍和水藍、橘和黃）！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            sizeFor: sizeFor, colorsFor: colorsFor, timeMs: timeMs, splitLengths: splitLengths, makePuzzle: makePuzzle, newState: newState, startDraw: startDraw, applyDrag: applyDrag,
            filled: filled, linked: linked, isSolved: isSolved, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SIZE: SIZE, COLORS: COLORS, TIME_S: TIME_S, MIN_SEG: MIN_SEG, PALETTE: PALETTE, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
