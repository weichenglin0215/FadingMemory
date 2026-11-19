/* ═══════════════════════════════════════════════════════════════════
   fillpath_ui.js — 「填滿」系列遊戲的畫面與操作（一筆填滿 blockfill、多色填滿 multifill 共用；V1.57.3.0）
   題目、規則、解題器在 js/fillpath_core.js；樣式在 css/fillpath.css（class 一律以 fillpath- 開頭）。
   ───────────────────────────────────────────────────────────────────
   Reaction.fillPath.build(api, pk, o)：在 api.stage 畫出一關，並處理拖曳、過關、時間到。
     api：kit.run 的 api（stage、level、my、timer、pass、fail…）；
     pk：Reaction.fillPath.pick 挑出來的題目 { p 題目物件（已翻轉旋轉）, … }；
     o：{ colors（每條路的顏色編號 0～9，要跟 css 的 .fillpath-c0～9 對應）, timeMs（限時，毫秒）, name（遊戲名，結算說明用）, tipEnd（提示文字）, hint（要不要顯示第一次的操作提示）}。
   操作：手指從起點（或某條路中間的一格）按下，拖過相鄰的格子就鋪路；拖回上一格＝收回一格；按在起點＝整條重來；
         不能穿過別條路、不能走空洞。全部格子都蓋滿 → 過關（終點會出現星星）。時間到：用解題器找出一種填法，一條一條畫出來，然後失敗。
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';
    var FP = global.Reaction.fillPath, h = global.UI && global.UI.h;

    /* 五角星（SVG polygon 的 points 文字）：中心 (cx, cy)、外半徑 r */
    function starPoints(cx, cy, r) {
        var pts = [], i;
        for (i = 0; i < 10; i++) {
            var rad = (i % 2 ? r * 0.45 : r), ang = -Math.PI / 2 + i * Math.PI / 5;
            pts.push((cx + rad * Math.cos(ang)).toFixed(1) + ',' + (cy + rad * Math.sin(ang)).toFixed(1));
        }
        return pts.join(' ');
    }

    FP.build = function (api, pk, o) {
        h = global.UI.h;
        var kit = global.Reaction.kit, Sfx = global.Sfx, p = pk.p, st = FP.newState(p), stage = api.stage, cols = p.w, rows = p.h, over = false;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 56, botPad = 66;
        /* 算棋盤尺寸：每格邊長 cell（寬或高放得下、最大 80px）、整個棋盤的寬高、棋盤左上角位置 bx／by（置中；下面留一排放「重來」鈕） */
        var cell = Math.floor(Math.min((W - 20) / cols, (H - topPad - botPad) / rows, 80)), BW = cell * cols, BH = cell * rows;
        var bx = Math.round((W - BW) / 2), by = topPad + Math.round((H - topPad - botPad - BH) / 2);
        var tip = h('div', { 'class': 'qz-note fillpath-tip', text: '' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var board = h('div', { 'class': 'fillpath-board' });
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BW + 'px;height:' + BH + 'px;';
        stage.appendChild(board);
        var tiles = [], gap = Math.max(2, Math.round(cell * 0.06)), i;
        for (i = 0; i < cols * rows; i++) {
            if (!p.mask[i]) { tiles.push(null); continue; }
            var r = Math.floor(i / cols), c = i % cols, el = h('div', { 'class': 'fillpath-tile' });
            el.style.cssText = 'left:' + (c * cell + gap) + 'px;top:' + (r * cell + gap) + 'px;width:' + (cell - gap * 2) + 'px;height:' + (cell - gap * 2) + 'px;';
            el.appendChild(h('div', { 'class': 'fillpath-fill' }));
            board.appendChild(el); tiles.push(el);
        }
        function cx(k) { return (k % cols + 0.5) * cell; }
        function cy(k) { return (Math.floor(k / cols) + 0.5) * cell; }
        var svg = kit.svg('svg', { 'class': 'fillpath-svg', viewBox: '0 0 ' + BW + ' ' + BH, width: BW, height: BH }, board);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var gSol = kit.svg('g', {}, svg), wires = [], marks = [], stars = [];
        p.starts.forEach(function (s0, j) {
            var w = kit.svg('path', { 'class': 'fillpath-wire fillpath-c' + o.colors[j], d: '' }, svg);
            w.setAttribute('stroke-width', (cell * 0.4).toFixed(1)); wires.push(w);   /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        });
        p.starts.forEach(function (s0, j) {
            var g = kit.svg('g', { 'class': 'fillpath-mark fillpath-c' + o.colors[j] }, svg);
            kit.svg('circle', { 'class': 'fillpath-mark-body', cx: cx(s0), cy: cy(s0), r: cell * 0.3 }, g);
            kit.svg('circle', { 'class': 'fillpath-mark-in', cx: cx(s0), cy: cy(s0), r: cell * 0.12 }, g);
            marks.push(g);
        });
        var gStar = kit.svg('g', {}, svg);
        /* 把一串格子編號轉成 SVG path 的路徑文字（"M x y L x y …"：M 移到起點、L 畫線到下一點） */
        function pathD(path) { return path.map(function (k, j) { return (j ? 'L' : 'M') + cx(k).toFixed(1) + ' ' + cy(k).toFixed(1); }).join(' '); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        /* 重畫畫面：每條路依目前走過的格子畫出路徑、蓋到的格子染上那條路的顏色、上方顯示填了幾格 */
        function paint() {
            st.paths.forEach(function (path, j) { wires[j].setAttribute('d', path.length > 1 ? pathD(path) : ''); });
            for (var k = 0; k < tiles.length; k++) {
                if (!tiles[k]) continue;
                var cv = st.cover[k], cl = 'fillpath-tile' + (cv >= 0 ? ' fillpath-tile--on fillpath-c' + o.colors[cv] : '');
                if (tiles[k].className !== cl) tiles[k].className = cl;
            }
            tip.textContent = '已填 ' + FP.filled(st) + '／' + p.tiles + ' 格　' + o.tipEnd;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        }
        paint();
        /* 「重來」鈕：全部路收回到只剩起點（時間照走） */
        var btn = h('button', { 'class': 'btn btn--line btn--sm fillpath-reset', text: '全部重來' });
        btn.style.top = (by + BH + 14) + 'px';
        stage.appendChild(btn);
        kit.onTap(btn, function () { if (over || api.over) return; FP.reset(st); Sfx.play('click'); paint(); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        api.timer(o.timeMs, function () { finish('time'); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (o.hint && kit.once('fillpath.hint.' + o.name)) {   /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var s0 = p.starts[0], nbs = st.g.nb[s0], to = nbs.length ? nbs[0] : s0;
            kit.hintOn(stage, null, { mode: 'drag', x: bx + cx(s0), y: by + cy(s0), dx: cx(to) - cx(s0), dy: cy(to) - cy(s0), delay: 500, text: '從起點拖出一條路，走過每一格' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }

        var pid = null, drawing = -1, lastPt = null;    /* pid：目前這根手指的編號（只認一根）；drawing：正在畫的顏色（−1＝沒在畫）；lastPt：手指上一個位置 */
        /* 把舞台座標換算成格子編號（在棋盤外回傳 −1；空洞也回傳 −1） */
        function cellAt(x, y) {
            var c = Math.floor((x - bx) / cell), r = Math.floor((y - by) / cell);
            if (c < 0 || c >= cols || r < 0 || r >= rows) return -1;
            var k = r * cols + c;
            return p.mask[k] ? k : -1;
        }
        /* 手指移動到 pt：把「上一個位置到 pt」這一段切成小步（每步最多 1/4 格），一步一步呼叫 FP.applyDrag，這樣手指移太快也不會跳過格子 */
        function feed(pt) {
            if (over || api.over) return;
            var from = lastPt || pt, dist = kit.dist(from.x, from.y, pt.x, pt.y), steps = Math.max(1, Math.ceil(dist / (cell / 4)));  /* Math.ceil：無條件進位成整數 */
            for (var s = 1; s <= steps && !over && !api.over; s++) {
                var x = from.x + (pt.x - from.x) * s / steps, y = from.y + (pt.y - from.y) * s / steps, k = cellAt(x, y);
                if (k < 0) continue;
                var act = FP.applyDrag(st, drawing, k);
                if (act) { Sfx.play(act === 'add' ? 'tick' : 'flip'); paint(); if (FP.isSolved(st)) finish('ok'); }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            }
            lastPt = pt;
        }
        stage.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (over || api.over || pid != null) return;
            if (e.target && e.target.closest && e.target.closest('button')) return;    /* 「全部重來」自己處理，不當成畫線 */
            var pt = kit.localPt(e, stage), k = cellAt(pt.x, pt.y);
            if (k < 0) return;
            var c = FP.startDraw(st, k);
            if (c < 0) return;
            e.preventDefault(); pid = e.pointerId; drawing = c; lastPt = pt;  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            paint();
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        /* 手指放開：結束這一筆畫 */
        function up(e) { if (pid === e.pointerId) { pid = null; drawing = -1; lastPt = null; } }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* 結束：kind 是 'ok'（全部填滿，過關）或 'time'（時間到：用解題器找一種填法，一條一條畫出來，然後失敗） */
        function finish(kind) {
            if (over || api.over) return;
            over = true; pid = null; btn.disabled = true;
            if (kind === 'ok') {
                st.paths.forEach(function (path, j) {          /* 每條路的終點放一顆星星 */
                    var e0 = path[path.length - 1];
                    kit.svg('polygon', { 'class': 'fillpath-star fillpath-c' + o.colors[j], points: starPoints(cx(e0), cy(e0), cell * 0.27) }, gStar);
                });
                board.classList.add('fillpath-board--lit');    /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                tip.textContent = '全部填滿了！終點在星星那裡';
                kit.flash(stage, true, api.my);          /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 1600 });               /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            var sol = FP.solve(st.g, p.starts, { limit: 1, budget: 3000000 }), left = p.tiles - FP.filled(st);
            if (sol.first) {
                sol.first.forEach(function (path, j) {
                    var sl = kit.svg('path', { 'class': 'fillpath-sol fillpath-c' + o.colors[j], d: pathD(path), pathLength: 1 }, gSol);
                    sl.setAttribute('stroke-width', (cell * 0.4).toFixed(1));
                    sl.style.animationDelay = (j * 0.5) + 's';
                    var e1 = path[path.length - 1];
                    kit.svg('polygon', { 'class': 'fillpath-star fillpath-star--sol fillpath-c' + o.colors[j], points: starPoints(cx(e1), cy(e1), cell * 0.27) }, gStar);
                });
            }
            board.classList.add('fillpath-board--reveal'); gSol.classList.add('fillpath-sol--draw');
            tip.textContent = '時間到！彩色粗線是其中一種填法';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3500, lines: ['時間到，還有 ' + left + ' 格沒填滿', '棋盤 ' + p.tiles + ' 格、' + p.k + ' 條路'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：api.solve 把解題器找到的填法一條一條鋪好；api.wrong 直接當作時間到 */
        api.solve = function () {
            var sol = FP.solve(st.g, p.starts, { limit: 1, budget: 3000000 });
            if (!sol.first) return;
            FP.reset(st);
            sol.first.forEach(function (path, j) { var c = FP.startDraw(st, path[0]); path.slice(1).forEach(function (k) { FP.applyDrag(st, c, k); }); });
            paint(); if (FP.isSolved(st)) finish('ok');
        };
        api.wrong = function () { finish('time'); };
        api.fill = { st: st, cell: cell, bx: bx, by: by, board: board, cols: cols, rows: rows };      /* 給測試與 debug 用：目前的畫線狀態與棋盤位置 */
        return api.fill;
    };
    FP.starPoints = starPoints;
})(window);
