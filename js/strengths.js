/* ═══════════════════════════════════════════════════════════════════
   strengths.js — 「👑我的強項」彈窗（V1.57.4）：用雷達圖畫出玩家在每個遊戲分類的「學歷階段」
   ───────────────────────────────────────────────────────────────────
   · 打開的地方：主畫面左上角漢堡選單的「👑我的強項」（index.html、js/menu_nav.js）；「秒反應」的「選一個想玩的遊戲」標題列右邊的「👑」按鈕（js/menu.js）。
   · 每個分類（記憶、視覺、反應、數字、邏輯、手感、目測…）的分數＝該類每一款遊戲最佳成績的分數（小學 1 分…博士 6 分、沒玩過 0 分）加起來 ÷ 該類的款數，
     四捨五入（算法見 js/grade.js 的 byCategory）；一款都沒玩過停在圓心、顯示「都沒玩過」。下面一類一列：「名稱　階段　　總分 / 款數」。
   · 彈窗是全畫面（保留四個圓角），雷達圖盡量大；小學～博士各有自己的顏色（紅、橙、黃、綠、藍、紫，css/theme.css 的 --c-grade-1～6）。
   · **分類有哪些、每款遊戲屬於哪一類，全部是現場從 js/menu.js 的 GAME_TABS／GAME_CELLS 讀的**（model）：
     刪遊戲、改遊戲的分類、增減分類之後，不用改這個檔案，雷達圖自動跟著變（軸的數量就是現有分類的數量；已經刪掉的遊戲，玩家手機裡留著的紀錄會被忽略）。
     少於 3 個分類畫不成雷達圖，就只留下面的清單。
   · 雷達圖是 SVG（colors 用 css/menu_nav.css 的 .str-* class，吃主題變數）；幾何計算（axisPoints、polygon）是純函式，t_grade.js 測試。
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';
    var h = global.UI.h;
    var Grade = global.Grade, M = global.FMMenu;
    var NS = 'http://www.w3.org/2000/svg';

    /* ═══ 可以自己調的參數 ═══ */
    var VIEW_W = 460;                           /* 雷達圖畫布的寬（SVG 座標，實際大小會跟著彈窗寬度縮放；全畫面彈窗裡大約就是 1:1） */
    var VIEW_H = 410;                           /* 雷達圖畫布的高 */
    var CX = 230;                               /* 圓心的 x */
    var CY = 212;                               /* 圓心的 y */
    var RADIUS = 142;                           /* 最外圈（博士）的半徑（盡量大：左右兩邊還要放得下分類名稱與「都沒玩過」） */
    var LABEL_GAP = 34;                         /* 分類名稱離最外圈多遠 */
    var START_DEG = -90;                        /* 第一個分類放在幾度（−90＝正上方），之後順時針排 */
    var MIN_AXES = 3;                           /* 至少幾個分類才畫雷達圖 */

    /* ═══ 純函式 ═══ */
    /* n 個分類的軸：第 i 條軸在圓心 (cx, cy)、半徑 r 的位置（順時針，第一條在 startDeg 度）→ [{ x, y, cos, sin }] */
    function axisPoints(n, cx, cy, r, startDeg) {
        var out = [];
        for (var i = 0; i < n; i++) {
            var a = (startDeg + 360 * i / n) * Math.PI / 180;
            out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) });
        }
        return out;
    }
    /* 玩家的多邊形頂點：第 i 個分類的值 values[i]（0～maxv）→ 沿著第 i 條軸走 values[i] / maxv 的距離 */
    function polygon(values, maxv, cx, cy, r, startDeg) {
        var ax = axisPoints(values.length, 0, 0, 1, startDeg);
        return values.map(function (v, i) {                     /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var k = Math.max(0, Math.min(1, v / maxv)) * r;
            return { x: cx + ax[i].x * k, y: cy + ax[i].y * k };
        });
    }
    /* 目前的分類與分數：[{ id, name, count, played, sum, avg, value, stage }]（Grade.byCategory）。env 可以換掉資料（測試用） */
    function model(env) {
        env = env || {};
        var tabs = env.tabs || (M ? M.GAME_TABS : []), cells = env.cells || (M ? M.GAME_CELLS : []);
        return Grade.byCategory(tabs, cells, env.bestOf || Grade.bestOf, env.specOf || Grade.specOf);
    }

    /* ═══ 畫面 ═══ */
    function svg(tag, attrs, parent) {
        var el = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        if (parent) parent.appendChild(el);
        return el;
    }
    function pts(list) { return list.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '); }

    /* 分類分數 0～6 → 階段名稱（0＝都沒玩過）與顏色 class（str-grade--g1～g6 各一個顏色；g0＝灰） */
    function gradeName(v) { return v > 0 ? Grade.nameOf(v - 1) : '都沒玩過'; }
    function gradeClass(v) { return 'str-grade--g' + v; }

    /* 雷達圖（SVG 元素）：rows＝model() 的結果。六圈由內到外是 小學…博士；玩家的階段用藍色多邊形標出來；每個分類名稱下面寫階段 */
    function radar(rows) {
        var n = rows.length, levels = Grade.NAMES.length;
        var root = svg('svg', { 'class': 'str-radar', viewBox: '0 0 ' + VIEW_W + ' ' + VIEW_H, role: 'img', 'aria-label': '我的強項雷達圖' });
        var k, ring;
        for (k = levels; k >= 1; k--) {                          /* 六圈（由外往內畫，內圈才不會被外圈蓋住） */
            ring = axisPoints(n, CX, CY, RADIUS * k / levels, START_DEG);
            svg('polygon', { 'class': 'str-ring' + (k === levels ? ' str-ring--out' : ''), points: pts(ring) }, root);
        }
        axisPoints(n, CX, CY, RADIUS, START_DEG).forEach(function (p) { svg('line', { 'class': 'str-axis', x1: CX, y1: CY, x2: p.x.toFixed(1), y2: p.y.toFixed(1) }, root); });
        for (k = 1; k <= levels; k++) {                          /* 圈的名稱：寫在正上方那條軸的右邊（小學…博士） */
            var t = svg('text', { 'class': 'str-ringname str-grade--g' + k, x: CX + 4, y: (CY - RADIUS * k / levels + 13).toFixed(1) }, root);     /* 寫在那一圈線的下面（寫在上面會跟最上面那個分類的文字疊在一起） */
            t.textContent = Grade.NAMES[k - 1];
        }
        var poly = polygon(rows.map(function (r) { return r.value; }), levels, CX, CY, RADIUS, START_DEG);
        svg('polygon', { 'class': 'str-poly', points: pts(poly) }, root);
        poly.forEach(function (p, i) { if (rows[i].value > 0) svg('circle', { 'class': 'str-dot', cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5 }, root); });
        axisPoints(n, CX, CY, RADIUS + LABEL_GAP, START_DEG).forEach(function (p, i) {   /* 分類名稱＋階段 */
            var anchor = p.cos > 0.3 ? 'start' : (p.cos < -0.3 ? 'end' : 'middle'), tx = (p.x + (anchor === 'start' ? -8 : (anchor === 'end' ? 8 : 0))).toFixed(1);
            var name = svg('text', { 'class': 'str-name', x: tx, y: (p.y - 2).toFixed(1), 'text-anchor': anchor }, root);
            name.textContent = rows[i].name;
            var g = svg('text', { 'class': 'str-grade ' + gradeClass(rows[i].value), x: tx, y: (p.y + 21).toFixed(1), 'text-anchor': anchor }, root);
            g.textContent = gradeName(rows[i].value);
        });
        return root;
    }

    /* 下面的清單：每個分類一列「名稱｜階段（各階段不同顏色）｜總分 / 款數」 */
    function list(rows) {
        var box = h('div', { 'class': 'str-list' });
        rows.forEach(function (r) {
            box.appendChild(h('div', { 'class': 'str-row', attrs: { 'data-cat': r.id } }, [
                h('span', { 'class': 'str-row__name', text: r.name }),
                h('span', { 'class': 'str-row__stage str-row__stage--g' + r.value, text: gradeName(r.value) }),
                h('span', { 'class': 'str-row__score', text: r.sum + ' 總分 / ' + r.count + ' 款' })
            ]));
        });
        return box;
    }

    var openCtl = null;                                          /* 開著的彈窗（避免連點兩次疊兩層） */
    /* 打開「👑我的強項」彈窗 */
    function open() {
        if (openCtl && openCtl.isOpen()) return openCtl;
        var rows = model();
        var kids = [];
        if (rows.length >= MIN_AXES) kids.push(h('div', { 'class': 'str-chart' }, [radar(rows)]));
        kids.push(list(rows));
        openCtl = global.Dlg.open({
            cls: 'dlg--strengths dlg--top', title: '👑我的強項', children: kids,
            buttons: [{ text: '關閉', kind: 'line', cls: 'nav-close' }]
        });
        return openCtl;
    }

    global.FMStrengths = { open: open, model: model, radar: radar, axisPoints: axisPoints, polygon: polygon, gradeName: gradeName, MIN_AXES: MIN_AXES, RADIUS: RADIUS, VIEW_W: VIEW_W, VIEW_H: VIEW_H };
})(window);
