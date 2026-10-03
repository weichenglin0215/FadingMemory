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

(function () {
    'use strict';

    var ID = 'shapes';
    var h = UI.h;

    function fmtBest(v) { return v == null ? '' : '最佳 第 ' + v + ' 關'; }

    /* ═══ 格數：第 1 關 2×3，之後高度每關 +1，寬度＝高度/1.5 四捨五入，
       上限寬 20、高 30（兩個上限剛好同時在高度=30 的時候碰到，不用另外處理）═══ */
    function heightFor(level) { return Math.min(30, level + 2); }
    function widthFor(height) { return Math.min(20, Math.round(height / 1.5)); }

    /* ═══ 圖形／文字／emoji 的「一對」：a／b 兩個長得不一樣但同一類的東西，
       隨機決定哪個當多數、哪個當少數那一格。type='svg' 的 a/b 是下面
       SHAPE_DRAW 的 key；type='text'／'emoji' 的 a/b 就是要顯示的字本身。
       colorable=false（目前只有 emoji）不能套用動態顏色，只能用在形狀考驗。
       ★ 想增加題材：照同樣的格式加進這個陣列就好，不用改其他程式碼。 */
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
    var COLORABLE = PAIRS.filter(function (p) { return p.colorable; });

    /* ═══ 向量圖形：全部用正多邊形／星形的參數公式畫，不用一個一個手刻 ═══ */
    function polygonPoints(sides, r, rotateDeg) {
        var rot = (rotateDeg || 0) * Math.PI / 180;
        var pts = [];
        for (var i = 0; i < sides; i++) {
            var a = rot + i * 2 * Math.PI / sides;
            pts.push((50 + r * Math.sin(a)).toFixed(1) + ',' + (50 - r * Math.cos(a)).toFixed(1));
        }
        return pts.join(' ');
    }
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
    function glyphHtml(pairType, value, color, fontPx) {
        if (pairType === 'svg') {
            return '<svg class="shapes-glyph-svg" viewBox="0 0 100 100">' + SHAPE_DRAW[value](color) + '</svg>';
        }
        return '<span class="shapes-glyph-text" style="color:' + color + ';font-size:' + fontPx + 'px">' + UI.esc(value) + '</span>';
    }

    /* ═══ 顏色（只給「混合」考驗用：兩邊各給一個明顯不同的顏色）═══
       純「色彩辨識」的考驗已經取消，所以這裡不需要 js/reaction_spot.js 那種
       逐關縮小的知覺差異換算，只留下「隨機抽一個底色」＋「HSV→RGB 轉換」
       （CSS 沒有原生 hsv() 函式，顏色要先換算成 rgb() 才能畫上畫面）。 */
    var BASE = { s: { lo: 70, hi: 85 }, v: { lo: 70, hi: 90 } };
    function randBaseColor() {
        return { h: Math.random() * 360, s: BASE.s.lo + Math.random() * (BASE.s.hi - BASE.s.lo), v: BASE.v.lo + Math.random() * (BASE.v.hi - BASE.v.lo) };
    }
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
    function cssColor(c) {
        var rgb = hsvToRgb(c.h, c.s, c.v);
        return 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
    }

    function pickAny(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function typeFor(level) {
        return level <= 10 ? 'mixed' : 'shape';
    }
    function hintTextFor(type) {
        if (type === 'mixed') return '找出形狀和顏色都不一樣的那一格';
        return '找出形狀不一樣的那一格';
    }

    /* 「形狀」考驗整局共用的顏色：顏色不是線索（全部格子都一樣），所以
       一半機率乾脆用白色，另一半機率隨機抽一個高飽和度、高明度的鮮明顏色
       ——單純是視覺上的變化，不影響「找哪一格形狀不一樣」這件事的難度。 */
    function randShapeColor() {
        if (Math.random() < 0.5) return '#FFFFFF';
        return cssColor({ h: Math.random() * 360, s: 80 + Math.random() * 20, v: 85 + Math.random() * 15 });
    }

    /* 算出「多數格」跟「少數格」各自要顯示的 HTML：fontPx 是文字型圖案的字級
       （向量圖形用 % 寬高自動縮放，不需要這個）。 */
    function buildRender(type, fontPx) {
        if (type === 'shape') {
            var pair = pickAny(PAIRS);
            var flip = Math.random() < 0.5;
            var baseKind = flip ? pair.b : pair.a, oddKind = flip ? pair.a : pair.b;
            var color = randShapeColor();
            return {
                base: glyphHtml(pair.type, baseKind, color, fontPx),
                odd: glyphHtml(pair.type, oddKind, color, fontPx)
            };
        }
        /* mixed：形狀跟顏色同時不一樣，顏色故意拉開一大段色相差，讓它一眼就看得出來
           （安排在最前面幾關出現機率較高，兩種線索疊在一起找，比單一線索容易） */
        var p3 = pickAny(COLORABLE);
        var flip3 = Math.random() < 0.5;
        var bKind = flip3 ? p3.b : p3.a, oKind = flip3 ? p3.a : p3.b;
        var bColor = randBaseColor();
        var oColor = { h: (bColor.h + 150 + Math.random() * 60) % 360, s: bColor.s, v: bColor.v };
        return {
            base: glyphHtml(p3.type, bKind, cssColor(bColor), fontPx),
            odd: glyphHtml(p3.type, oKind, cssColor(oColor), fontPx)
        };
    }

    function mount(root, ctx) {
        root.classList.add('shapes-dark-bg');
        var level = 1;

        function round() {
            root.innerHTML = '';
            var best = fmtBest(Reaction.getBest(ID));
            ctx.setMeta('第 ' + level + ' 關' + (best ? '・' + best : ''));

            var type = typeFor(level);
            var height = heightFor(level);
            var width = widthFor(height);
            var n = width * height;
            var oddIdx = Math.floor(Math.random() * n);

            root.appendChild(h('div', { 'class': 'hint hint--on-dark', text: hintTextFor(type) + '（第 ' + level + ' 關）' }));

            var wrap = h('div', { 'class': 'shapes-wrap' });
            var board = h('div', { 'class': 'shapes-board' });
            board.style.gridTemplateColumns = 'repeat(' + width + ', 1fr)';
            board.style.gridTemplateRows = 'repeat(' + height + ', 1fr)';
            wrap.appendChild(board);
            root.appendChild(wrap);

            /* 格子必須是正方形：量 wrap 實際能用的寬高，兩個方向各自除以格數，
               取比較小的那個當邊長，board 的寬高就跟著設成「邊長 × 格數」，
               CSS Grid 的 1fr 軌道在這個已經算好比例的容器裡自然就會是正方形，
               剩下的空間（另一個方向量出來比較大的那邊）靠 .shapes-wrap 的
               flex 置中，留白會平均分在兩側／上下。 */
            var AW = wrap.clientWidth, AH = wrap.clientHeight;
            var cell = Math.max(4, Math.floor(Math.min(AW / width, AH / height)));
            board.style.width = (cell * width) + 'px';
            board.style.height = (cell * height) + 'px';

            /* 文字型圖案的字級：0.8 ＝使用者要求「圖案再放大 1.33 倍」套用在原本
               0.6 的字級係數上（0.6 × 1.33 ≈ 0.8），讓文字盡量佈滿整個格子，
               不要留下太多空白；向量圖形那邊同一個 1.33 倍反映在
               .shapes-glyph-svg 的寬高百分比（css/reaction.css，70% → 93%）。 */
            var render = buildRender(type, Math.round(cell * 0.8));
            for (var i = 0; i < n; i++) {
                (function (i) {
                    var cellEl = h('button', { 'class': 'shapes-cell', html: i === oddIdx ? render.odd : render.base });
                    cellEl.addEventListener('click', function () { answer(i === oddIdx, cellEl, board, oddIdx); });
                    board.appendChild(cellEl);
                })(i);
            }
        }

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
            UI.wait(700).then(function () {
                /* 不清空畫面：保留剛剛的棋盤（哪格答錯、哪格才是真正不一樣的）
                   留在背景，結算卡片疊一層半透明底蓋上去——跟其他遊戲同一套做法。 */
                root.appendChild(h('div', { 'class': 'drop-result-overlay', attrs: { 'data-sfx': level >= 8 ? 'win' : 'fail' } }, [
                    h('div', { 'class': 'drop-result-card' }, [
                        h('div', { 'class': 'rx-result__num', text: '第 ' + level + ' 關' }),
                        h('div', { 'class': 'rx-result__label', text: '答錯了，挑戰結束' }),
                        isNew ? h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }) : null,
                        h('button', { 'class': 'btn btn--primary', text: '再挑戰一次', on: { click: function () { level = 1; round(); } } })
                    ])
                ]));
            });
        }

        round();
    }

    Reaction.register({
        id: ID,
        name: '形形色色',
        rule: '畫面會被分成一格一格，裡面幾乎所有格子都長得一模一樣，只有一格不一樣（形狀不同，或是形狀和顏色都不同）。找出那一格，點下去；答對就進下一關，格子會越來越多、越來越小，越後面要越仔細看。答錯就結束，比比看能撐到第幾關。',
        mount: mount
    });
})();
