/* ═══════════════════════════════════════════════════════════════════
   reaction_shapes.js — 秒反應・形形色色
   一個格子接一個格子排成一塊黑底棋盤，幾乎所有格子都長得一模一樣，只有
   一格不一樣（形狀不同、顏色不同，或兩者都不同）——找出那一格、點下去。
   答對就進下一關，格子會越來越多、越來越小；答錯就結束，比比看能撐到第幾關。
   ───────────────────────────────────────────────────────────────────
   · 難度曲線＝格子數量：第 1 關 2×3（6 格），之後每一關高度格數 +1、
     寬度格數＝高度格數 ÷ 1.5 四捨五入（跟畫面本身扣掉文字區後大約 2:3 的
     比例對齊），上限寬 20 格×高 30 格——格子越多、每一格越小，自然越難找。
   · 兩種考驗，依關卡數決定（不是隨機）：
     - 第 1～10 關固定是「混合」（mixed）：形狀跟顏色同時不一樣，兩種線索
       疊在一起找，比較好上手，適合安排在前面。
     - 第 11 關開始固定是「形狀」（shape）：所有格子同色，一格的形狀跟其他
       不一樣——這個顏色不是每次都白色，是每一局隨機抽一個鮮明顏色（也可能
       抽到白色），抽到什麼全部格子就統一用那個顏色，顏色本身不是線索，
       只有形狀在變（純色彩辨識的版本已經取消，顏色只在「混合」考驗裡當
       輔助線索，不會單獨出題）。
   · 形狀／文字／emoji 的「一對」寫在 PAIRS：colorable:false 的（目前只有
     emoji）沒辦法套用顏色（emoji 是自帶顏色的點陣圖示，CSS color 對它沒用），
     只能出現在「形狀」考驗；其餘（向量圖形、英文字母、中文字、數字）在
     「混合」考驗時兩邊各給一個顏色（刻意拉開一大段色相差，一眼就看得出來）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」。這款是較早寫的遊戲，直接在 mount 裡用變數 level 記關卡，結構更簡單） */
(function () {
    'use strict';

    /* 遊戲代號 */
    var ID = 'shapes';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 shapes 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    /* UI.h：建立 HTML 元素的小工具 */
    var h = UI.h;

    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 第 ' + v + ' 關'; }

    /* 格數：第 1 關 2×3，之後高度每關 +1，寬度＝高度 ÷ 1.5 四捨五入；Math.min 限制上限（寬 20、高 30） */
    /* ═══ 格數：第 1 關 2×3，之後高度每關 +1，寬度＝高度/1.5 四捨五入，
       上限寬 20、高 30（兩個上限剛好同時在高度=30 的時候碰到，不用另外處理）═══ */
    function heightFor(level) { return Math.min(30, level + 2); }
    function widthFor(height) { return Math.min(20, Math.round(height / 1.5)); }

    /* ═══ 圖形／文字／emoji 的「一對」：a／b 兩個長得不一樣但同一類的東西，
       隨機決定哪個當多數、哪個當少數那一格。type='svg' 的 a/b 是下面
       SHAPE_DRAW 的 key；type='text'／'emoji' 的 a/b 就是要顯示的字本身。
       colorable=false（目前只有 emoji）不能套用動態顏色，只能用在形狀考驗。
       ★ 想增加題材：照同樣的格式加進這個陣列就好，不用改其他程式碼。 */
    /* PAIRS：「一對」長得相近的圖案資料表（a、b 兩邊，隨機決定誰當多數、誰當少數）。想增加題材只要在這裡加一筆 */
    var PAIRS = [
        { type: 'svg', a: 'circle', b: 'octagon', colorable: true },
        { type: 'svg', a: 'circle', b: 'hexagon', colorable: true },
        { type: 'svg', a: 'square', b: 'octagon', colorable: true },
        { type: 'svg', a: 'square', b: 'diamond', colorable: true },
        { type: 'svg', a: 'triangle', b: 'square', colorable: true },
        { type: 'svg', a: 'pentagon', b: 'hexagon', colorable: true },
        { type: 'svg', a: 'circle', b: 'pentagon', colorable: true },
        { type: 'svg', a: 'star5', b: 'star6', colorable: true },
        { type: 'text', a: 'I', b: 'J', colorable: true },
        { type: 'text', a: 'O', b: 'Q', colorable: true },
        { type: 'text', a: 'M', b: 'W', colorable: true },
        { type: 'text', a: 'E', b: 'F', colorable: true },
        { type: 'text', a: '二', b: '三', colorable: true },
        { type: 'text', a: '口', b: '回', colorable: true },
        { type: 'text', a: '上', b: '下', colorable: true },
        { type: 'text', a: '木', b: '林', colorable: true },
        { type: 'text', a: '士', b: '土', colorable: true },
        { type: 'text', a: '大', b: '犬', colorable: true },
        { type: 'text', a: '未', b: '末', colorable: true },
        /* V1.21.0 新增：筆畫很多（約 19～25 畫）、長得很像的中文字（hard:true）。格子越小越難分辨，第 4 關起才會抽到，
           出現機率隨關卡增加（見 hardChance）；一樣要找「只有一格不一樣」。 */
        { type: 'text', a: '讚', b: '讀', colorable: true, hard: true },
        { type: 'text', a: '驚', b: '警', colorable: true, hard: true },
        { type: 'text', a: '響', b: '饗', colorable: true, hard: true },
        { type: 'text', a: '灣', b: '彎', colorable: true, hard: true },
        { type: 'text', a: '麟', b: '鱗', colorable: true, hard: true },
        { type: 'text', a: '讓', b: '壤', colorable: true, hard: true },
        { type: 'text', a: '蘿', b: '羅', colorable: true, hard: true },
        { type: 'text', a: '躍', b: '耀', colorable: true, hard: true },
        { type: 'text', a: '贏', b: '羸', colorable: true, hard: true },
        { type: 'text', a: '鑑', b: '鑒', colorable: true, hard: true },
        { type: 'text', a: '體', b: '髓', colorable: true, hard: true },
        { type: 'text', a: '欖', b: '攬', colorable: true, hard: true },
        { type: 'text', a: '籬', b: '籮', colorable: true, hard: true },
        { type: 'text', a: '鑲', b: '鑰', colorable: true, hard: true },
        { type: 'text', a: '戀', b: '孿', colorable: true, hard: true },
        { type: 'text', a: '2', b: '3', colorable: true },
        { type: 'text', a: '3', b: '8', colorable: true },
        { type: 'text', a: '6', b: '9', colorable: true },
        { type: 'text', a: '0', b: '8', colorable: true },
        { type: 'emoji', a: '😀', b: '😆', colorable: false },
        { type: 'emoji', a: '⚽', b: '🏐', colorable: false },
        { type: 'emoji', a: '🎲', b: '🀄', colorable: false },
        { type: 'emoji', a: '🔒', b: '🔓', colorable: false },
        { type: 'emoji', a: '⌛', b: '⏳', colorable: false }
    ];
    /* COLORABLE：篩出能套用顏色的組合（emoji 自帶顏色，不能套） */
    var COLORABLE = PAIRS.filter(function (p) { return p.colorable; });
    /* 筆畫多的中文字組合（hard:true）出現的機率：第 1～3 關完全不出現，第 4 關 15%，之後線性升到第 20 關的 55%（純函式） */
    function hardChance(level) {
        if (level < 4) return 0;
        return Math.min(0.55, 0.15 + (level - 4) * (0.4 / 16));
    }
    /* 從 pool 裡挑一組：先依 hardChance 決定這關要不要抽「筆畫多」的，再從對應的那一堆隨機挑 */
    function pickPair(pool, level) {
        var hard = pool.filter(function (p) { return p.hard; }), easy = pool.filter(function (p) { return !p.hard; });
        if (hard.length && Math.random() < hardChance(level || 1)) return pickAny(hard);
        return pickAny(easy.length ? easy : pool);
    }

    /* 向量圖形：用公式畫正多邊形與星形，不用一個一個手刻座標 */
    /* ═══ 向量圖形：全部用正多邊形／星形的參數公式畫，不用一個一個手刻 ═══ */
    /* 正多邊形的頂點：sides 邊、半徑 r、旋轉角度；用 sin／cos 算出每個頂點在圓周上的座標 */
    function polygonPoints(sides, r, rotateDeg) {
        var rot = (rotateDeg || 0) * Math.PI / 180;
        var pts = [];
        for (var i = 0; i < sides; i++) {
            var a = rot + i * 2 * Math.PI / sides;
            pts.push((50 + r * Math.sin(a)).toFixed(1) + ',' + (50 - r * Math.cos(a)).toFixed(1));
        }
        return pts.join(' ');
    }
    /* 星形的頂點：外圈與內圈交替的點 */
    function starPoints(points, rOuter, rInner, rotateDeg) {
        var rot = (rotateDeg || 0) * Math.PI / 180;
        var pts = [];
        for (var i = 0; i < points * 2; i++) {
            var r = i % 2 === 0 ? rOuter : rInner;
            var a = rot + i * Math.PI / points;
            pts.push((50 + r * Math.sin(a)).toFixed(1) + ',' + (50 - r * Math.cos(a)).toFixed(1));
        }
        return pts.join(' ');
    }
    /* SHAPE_DRAW：每種圖形對應一個函式，回傳 SVG 字串；c 是顏色 */
    var SHAPE_DRAW = {
        circle: function (c) { return '<circle cx="50" cy="50" r="38" fill="' + c + '"/>'; },
        square: function (c) { return '<rect x="14" y="14" width="72" height="72" fill="' + c + '"/>'; },
        diamond: function (c) { return '<polygon points="' + polygonPoints(4, 42, 0) + '" fill="' + c + '"/>'; },
        triangle: function (c) { return '<polygon points="' + polygonPoints(3, 42, 0) + '" fill="' + c + '"/>'; },
        pentagon: function (c) { return '<polygon points="' + polygonPoints(5, 42, 0) + '" fill="' + c + '"/>'; },
        hexagon: function (c) { return '<polygon points="' + polygonPoints(6, 42, 0) + '" fill="' + c + '"/>'; },
        octagon: function (c) { return '<polygon points="' + polygonPoints(8, 42, 22.5) + '" fill="' + c + '"/>'; },
        star5: function (c) { return '<polygon points="' + starPoints(5, 42, 17, 0) + '" fill="' + c + '"/>'; },
        star6: function (c) { return '<polygon points="' + starPoints(6, 42, 21, 0) + '" fill="' + c + '"/>'; }
    };
    /* 產生一個圖案的 HTML：SVG 圖形或文字（UI.esc 把特殊字元跳脫，避免被當成 HTML） */
    function glyphHtml(pairType, value, color, fontPx) {
        if (pairType === 'svg') {
            return '<svg class="shapes-glyph-svg" viewBox="0 0 100 100">' + SHAPE_DRAW[value](color) + '</svg>';
        }
        return '<span class="shapes-glyph-text" style="color:' + color + ';font-size:' + fontPx + 'px">' + UI.esc(value) + '</span>';
    }

    /* 顏色：只有「混合」考驗用，兩邊各給一個明顯不同的顏色 */
    /* ═══ 顏色（只給「混合」考驗用：兩邊各給一個明顯不同的顏色）═══
       純「色彩辨識」的考驗已經取消，所以這裡不需要 js/reaction_spot.js 那種
       逐關縮小的知覺差異換算，只留下「隨機抽一個底色」＋「HSV→RGB 轉換」
       （CSS 沒有原生 hsv() 函式，顏色要先換算成 rgb() 才能畫上畫面）。 */
    /* 底色的飽和度 s 與明度 v 範圍 */
    var BASE = { s: { lo: 70, hi: 85 }, v: { lo: 70, hi: 90 } };
    function randBaseColor() {
        return { h: Math.random() * 360, s: BASE.s.lo + Math.random() * (BASE.s.hi - BASE.s.lo), v: BASE.v.lo + Math.random() * (BASE.v.hi - BASE.v.lo) };
    }
    /* HSV 轉 RGB：CSS 沒有原生 hsv() 函式，要先換算成 rgb() 才能畫在畫面上 */
    function hsvToRgb(hh, ss, vv) {
        var s = ss / 100, v = vv / 100;
        var c = v * s;
        var hp = hh / 60;
        var x = c * (1 - Math.abs(hp % 2 - 1));
        var r1 = 0, g1 = 0, b1 = 0;
        if (hp < 1) { r1 = c; g1 = x; b1 = 0; }
        else if (hp < 2) { r1 = x; g1 = c; b1 = 0; }
        else if (hp < 3) { r1 = 0; g1 = c; b1 = x; }
        else if (hp < 4) { r1 = 0; g1 = x; b1 = c; }
        else if (hp < 5) { r1 = x; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x; }
        var m = v - c;
        return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
    }
    /* 把 HSV 顏色轉成 CSS 的 rgb() 字串 */
    function cssColor(c) {
        var rgb = hsvToRgb(c.h, c.s, c.v);
        return 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
    }

    /* 從陣列隨機挑一個 */
    function pickAny(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    /* 依關卡決定考驗類型：1～10 關「混合」（形狀與顏色同時不同，比較好找），之後「形狀」 */
    function typeFor(level) {
        return level <= 10 ? 'mixed' : 'shape';
    }
    /* 這一關顯示的提示文字 */
    function hintTextFor(type) {
        if (type === 'mixed') return '找出形狀和顏色都不一樣的那一格';
        return '找出形狀不一樣的那一格';
    }

    /* 「形狀」考驗整局共用的顏色：一半機率白色、一半機率隨機鮮明顏色（顏色本身不是線索） */
    /* 「形狀」考驗整局共用的顏色：顏色不是線索（全部格子都一樣），所以
       一半機率乾脆用白色，另一半機率隨機抽一個高飽和度、高明度的鮮明顏色
       ——單純是視覺上的變化，不影響「找哪一格形狀不一樣」這件事的難度。 */
    function randShapeColor() {
        if (Math.random() < 0.5) return '#FFFFFF';
        return cssColor({ h: Math.random() * 360, s: 80 + Math.random() * 20, v: 85 + Math.random() * 15 });
    }

    /* 算出「多數格」與「少數格」各自要顯示的 HTML；fontPx 是文字型圖案的字級 */
    /* 算出「多數格」跟「少數格」各自要顯示的 HTML：fontPx 是文字型圖案的字級
       （向量圖形用 % 寬高自動縮放，不需要這個）。 */
    function buildRender(type, fontPx, level) {
        if (type === 'shape') {
            var pair = pickPair(PAIRS, level);
            var flip = Math.random() < 0.5;
            var baseKind = flip ? pair.b : pair.a, oddKind = flip ? pair.a : pair.b;
            var color = randShapeColor();
            return {
                base: glyphHtml(pair.type, baseKind, color, fontPx),
                odd: glyphHtml(pair.type, oddKind, color, fontPx)
            };
        }
        /* mixed：形狀與顏色同時不一樣，少數格的色相與多數格差 150～210 度，一眼就看得出來 */
        /* mixed：形狀跟顏色同時不一樣，顏色故意拉開一大段色相差，讓它一眼就看得出來
           （安排在最前面幾關出現機率較高，兩種線索疊在一起找，比單一線索容易） */
        var p3 = pickPair(COLORABLE, level);
        var flip3 = Math.random() < 0.5;
        var bKind = flip3 ? p3.b : p3.a, oKind = flip3 ? p3.a : p3.b;
        var bColor = randBaseColor();
        var oColor = { h: (bColor.h + 150 + Math.random() * 60) % 360, s: bColor.s, v: bColor.v };
        return {
            base: glyphHtml(p3.type, bKind, cssColor(bColor), fontPx),
            odd: glyphHtml(p3.type, oKind, cssColor(oColor), fontPx)
        };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 替整個畫面加上黑底 class（樣式在 css/reaction.css 的 .shapes-dark-bg） */
        root.classList.add('shapes-dark-bg');
        /* level：目前關卡，放在 mount 裡讓下面的函式共用（閉包） */
        var level = 1;

        /* round：畫一關 */
        function round() {
            root.innerHTML = '';
            var best = fmtBest(Reaction.getBest(ID));
            ctx.setMeta('第 ' + level + ' 關' + (best ? '・' + best : ''));

            /* 決定這一關的考驗類型、格數（高×寬）和「不一樣的那一格」的位置 */
            var type = typeFor(level);
            var height = heightFor(level);
            var width = widthFor(height);
            var n = width * height;
            var oddIdx = Math.floor(Math.random() * n);

            root.appendChild(h('div', { 'class': 'hint hint--on-dark', text: hintTextFor(type) + '（第 ' + level + ' 關）' }));

            var wrap = h('div', { 'class': 'shapes-wrap' });
            var board = h('div', { 'class': 'shapes-board' });
            /* board 用 CSS Grid 排成 width 欄 × height 列 */
            board.style.gridTemplateColumns = 'repeat(' + width + ', 1fr)';
            board.style.gridTemplateRows = 'repeat(' + height + ', 1fr)';
            wrap.appendChild(board);
            root.appendChild(wrap);

            /* 格子必須是正方形：量可用寬高，兩個方向各自除以格數，取較小的當邊長 */
            /* 格子必須是正方形：量 wrap 實際能用的寬高，兩個方向各自除以格數，
               取比較小的那個當邊長，board 的寬高就跟著設成「邊長 × 格數」，
               CSS Grid 的 1fr 軌道在這個已經算好比例的容器裡自然就會是正方形，
               剩下的空間（另一個方向量出來比較大的那邊）靠 .shapes-wrap 的
               flex 置中，留白會平均分在兩側／上下。 */
            var AW = wrap.clientWidth, AH = wrap.clientHeight;
            var cell = Math.max(4, Math.floor(Math.min(AW / width, AH / height)));
            board.style.width = (cell * width) + 'px';
            board.style.height = (cell * height) + 'px';

            /* 文字型圖案的字級＝格子邊長的 0.8 倍，讓文字盡量佈滿格子 */
            /* 文字型圖案的字級：0.8 ＝使用者要求「圖案再放大 1.33 倍」套用在原本
               0.6 的字級係數上（0.6 × 1.33 ≈ 0.8），讓文字盡量佈滿整個格子，
               不要留下太多空白；向量圖形那邊同一個 1.33 倍反映在
               .shapes-glyph-svg 的寬高百分比（css/reaction.css，70% → 93%）。 */
            /* 產生多數格與少數格的圖案 */
            var render = buildRender(type, Math.round(cell * 0.8), level);
            /* for 迴圈建立 n 個格子，只有 oddIdx 那一格用「少數」圖案 */
            for (var i = 0; i < n; i++) {
                /* (function (i) {...})(i)：立即執行函式，讓每格的點擊事件記住自己的編號 */
                (function (i) {
                    var cellEl = h('button', { 'class': 'shapes-cell', html: i === oddIdx ? render.odd : render.base });
                    /* 這款用 click 判定（不是計時遊戲，不需要 pointerdown 的即時性） */
                    cellEl.addEventListener('click', function () { answer(i === oddIdx, cellEl, board, oddIdx); });
                    board.appendChild(cellEl);
                })(i);
            }
            /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在這一關「不一樣的那一格」上（也等於第一關的答案） */
            if (Reaction.kit.once('shapes.hint')) Reaction.kit.hintOn(root, board.children[oddIdx], { mode: 'tap', text: '請點擊不一樣的圖形' });
        }

        /* 答題：答對進下一關；答錯顯示正確位置並結算 */
        function answer(ok, cellEl, board, oddIdx) {
            Array.prototype.forEach.call(board.children, function (c) { c.disabled = true; });
            if (ok) {
                if (window.Sfx) Sfx.play('ok');
                cellEl.classList.add('shapes-cell--ok');
                level++;
                UI.wait(450).then(round);
                return;
            }
            if (window.Sfx) Sfx.play('bad');
            cellEl.classList.add('shapes-cell--bad');
            board.children[oddIdx].classList.add('shapes-cell--ok');
            var isNew = Reaction.setBest(ID, level, function (v, b) { return v > b; });
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));
            /* 結算卡片疊在棋盤上（跟其他遊戲同一套 CSS：drop-result-overlay） */
            UI.wait(700).then(function () {
                /* 不清空畫面：保留剛剛的棋盤（哪格答錯、哪格才是真正不一樣的）
                   留在背景，結算卡片疊一層半透明底蓋上去——跟其他遊戲同一套做法。 */
                /* 結算彈窗（公版 kit.result）：帶 score 會在彈窗出現之後自動送世界排行榜 */
                Reaction.kit.result(root, {
                    num: '第 ' + level + ' 關', label: '答錯了，挑戰結束', isNew: isNew, score: level,
                    sfx: level >= 8 ? 'win' : 'fail', onAgain: function () { level = 1; round(); }
                });
            });
        }

        round();
    }

    /* Reaction.register：把這款遊戲登記到遊戲清單（這款直接傳物件，不另外存成變數 G） */
    Reaction.register({
        id: ID,
        name: '形形色色',
        rule: '畫面會被分成一格一格，裡面幾乎所有格子都長得一模一樣，**只有一格不一樣**（形狀不同，或是形狀和顏色都不同）。找出那一格，點下去；答對就進下一關，格子會越來越多、越來越小，越後面要越仔細看。**答錯就結束**，比比看能撐到第幾關。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { PAIRS: PAIRS, hardChance: hardChance, pickPair: pickPair, COLORABLE: COLORABLE }
    });
})();
