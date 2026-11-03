/* ═══════════════════════════════════════════════════════════════════
   reaction_kit3.js — 第三批共用工具（V1.22.0 的 23 款新遊戲用）
   ───────────────────────────────────────────────────────────────────
   載入順序：reaction_kit2.js 之後、各遊戲之前。內容（都掛在 Reaction.kit 底下）：
     kit.btnGrid()   在遊戲區底部排一排（或一格一格的）按鈕，回傳每顆按鈕的 DOM 元素
     kit.mod()       「永遠不會是負數」的餘數（JavaScript 的 % 遇到負數會給負數，不好用）
     kit.sample()    從陣列隨機挑 n 個不重複的元素
     kit.dist()      兩點距離
     kit.hsl()       組出 'hsl(色相,飽和度%,亮度%)' 色碼字串
     kit.flash()     讓一個元素閃一下「答對／答錯」的框（回饋感）
   這些都是小工具，跟哪一款遊戲無關；遊戲檔案只要寫「這一關長什麼樣子、怎麼判定」。
   ═══════════════════════════════════════════════════════════════════ */

/* 【新手導讀】這個檔案不是遊戲，是「好幾款遊戲都會用到的小零件」。看遊戲檔案時，遇到 kit.btnGrid(...)
   就是「在畫面下方排幾顆按鈕」，遇到 kit.mod(...) 就是「取餘數」。 */
(function (global) {
    'use strict';

    var h = UI.h;
    var kit = Reaction.kit;

    /* kit.btnGrid(parent, items, o)：在 parent（要是 position:relative 的遊戲區）底部排按鈕。
       items：每顆按鈕一個物件 { text 或 html（按鈕上的字）, kind（'go'綠／'primary'橘／'sky'藍／'line'外框，預設 'line'）,
                               cls（額外 class）, onTap(按鈕元素, 第幾顆, 事件) }
       o.cols：每一排幾顆（預設全部排成一排）；o.gap：按鈕間距（px）；o.h：每顆按鈕的高度（px，預設 --btn-h-sm）；
       o.cls：整排容器的額外 class；o.bottom：離遊戲區底部多遠（px，預設 0）
       回傳 { el: 容器, btns: [每顆按鈕的 DOM 元素] }。
       判定一律用 pointerdown（kit.onTap），不用 click（規範 T1）。 */
    kit.btnGrid = function (parent, items, o) {
        o = o || {};
        var cols = o.cols || items.length;
        var grid = h('div', { 'class': 'rx-grid' + (o.cls ? ' ' + o.cls : '') });
        grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
        if (o.gap != null) grid.style.gap = o.gap + 'px';
        if (o.h) grid.style.setProperty('--rx-grid-h', o.h + 'px');  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        if (o.bottom) grid.style.bottom = o.bottom + 'px';
        var btns = items.map(function (it, i) {         /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var b = h('button', { 'class': 'btn btn--' + (it.kind || 'line') + (it.cls ? ' ' + it.cls : '') });
            if (it.html != null) b.innerHTML = it.html; else b.textContent = it.text;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (it.onTap) kit.onTap(b, function (e) { it.onTap(b, i, e); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            grid.appendChild(b);                        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            return b;
        });
        parent.appendChild(grid);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        return { el: grid, btns: btns };
    };

    /* 永遠不是負數的餘數：kit.mod(-1, 12) 是 11（JavaScript 的 -1 % 12 是 -1） */
    kit.mod = function (a, n) { return ((a % n) + n) % n; };
    /* 從陣列隨機挑 n 個不重複的元素（rand 可以注入，測試用） */
    kit.sample = function (arr, n, rand) { return kit.shuffle(arr, rand).slice(0, n); };  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
    /* 兩點距離 */
    kit.dist = function (x1, y1, x2, y2) { return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)); };  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
    /* 色碼字串：色相 0～360、飽和度與亮度 0～100 */
    kit.hsl = function (hue, s, l) { return 'hsl(' + (Math.round(hue * 10) / 10) + ',' + s + '%,' + l + '%)'; };  /* Math.round：四捨五入成整數 */
    /* 答對／答錯時，讓元素（通常是遊戲區）閃一下顏色框：ok＝綠、否則橘紅，0.5 秒後自動拿掉 */
    kit.flash = function (el, ok, my) {
        var cls = ok ? 'rx-flash-ok' : 'rx-flash-bad';
        el.classList.add(cls);                          /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        var off = function () { el.classList.remove(cls); };  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        if (my) my.after(500, off); else setTimeout(off, 500);  /* setTimeout(函式, 毫秒)：過一段時間後執行一次函式 */
    };
})(window);
