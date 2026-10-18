/* ═══════════════════════════════════════════════════════════════════
   reaction_shapes.js — 秒反應・形形色色
   一個格子接一個格子排成一塊黑底棋盤，幾乎所有格子都長得一模一樣，只有
   一格不一樣（形狀不同、顏色不同，或兩者都不同）——找出那一格、點下去。
   答對就進下一關，格子會越來越多、越來越小；答錯就結束，比比看能撐到第幾關。
   ───────────────────────────────────────────────────────────────────
   · 難度曲線＝格子數量：第 1 關 2×3（6 格），之後每一關高度格數 +1、
     寬度格數＝高度格數 ÷ 1.5 四捨五入（跟畫面本身扣掉文字區後大約 2:3 的
     比例對齊），上限寬 20 格×高 30 格——格子越多、每一格越小，自然越難找。
   · 難度慢慢增加（玩家說：第 11 關突然出現很複雜的字、難度一下變很難，應該慢慢變難，字要隨機出現）：
     ① 顏色：第 1 關的顏色最鮮豔（彩度 SAT_START）、之後每關線性變淡，第 SAT_END_LEVEL（15）關起完全沒有彩度（黑白）；
        「混合」考驗（形狀跟顏色都不一樣）裡，少數格與多數格的色相差也同時從 180 度縮小到 24 度（HUE_START → HUE_END）。
        第 1～14 關是「混合」，第 15 關起是「形狀」（全部格子同一個白色，顏色不是線索，只有形狀不一樣）。
     ② 題材：每一組圖案有一個「複雜度」cx（0～1）：向量符號最簡單，其次是 emoji、數字、英文字母，中文字依筆畫由少到多
        （cx ＝ 0.15 ＋ 0.85 × (筆畫 − 3) ÷ 22，筆畫約 3 → 25 畫）。每一關有一個「目標複雜度」T：第 1～CX_FLAT（10）關固定在最低
        （符號、數字、筆畫少的字），第 10 關之後線性升高，第 CX_RAMP（30）關到頂（筆畫最多的字）。
        抽題時每一組的權重＝鐘形 exp(−(cx − T)² ÷ (2σ²))：離目標複雜度越近越容易被抽到，所以符號、數字的機會慢慢減少、
        中文字的筆畫慢慢變多；另外「比目標複雜度難超過 CX_AHEAD（0.2）」的題材一律不抽（不會突然跳出太難的字，
        例如前 10 關只會有 6 畫以內的字）；而且每一關都是從題庫「隨機」抽（不是某一關固定出某個字）。
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
    var SIMILAR_MAX_ST = 26;                    /* 共用字庫的形近字，平均筆畫超過這個數就不用（太細，格子裡看不清楚） */
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
        { type: 'text', a: '二', b: '三', colorable: true, st: 2.5 },
        { type: 'text', a: '口', b: '回', colorable: true, st: 4.5 },
        { type: 'text', a: '上', b: '下', colorable: true, st: 3 },
        { type: 'text', a: '木', b: '林', colorable: true, st: 6 },
        { type: 'text', a: '2', b: '3', colorable: true },
        { type: 'text', a: '3', b: '8', colorable: true },
        { type: 'text', a: '6', b: '9', colorable: true },
        { type: 'text', a: '0', b: '8', colorable: true },
        { type: 'emoji', a: '😀', b: '😆', colorable: false },
        { type: 'emoji', a: '⚽', b: '🏐', colorable: false },
        { type: 'emoji', a: '🎲', b: '🀄', colorable: false },
        { type: 'emoji', a: '🔒', b: '🔓', colorable: false },
        { type: 'emoji', a: '⌛', b: '⏳', colorable: false }
    ].concat(
        /* V1.33：長得很像的中文字改用共用資料庫 js/similar_chars.js（SimilarChars），每一組取最像的前兩個字；
           st＝兩個字的平均筆畫數（第 10 關之後筆畫多的字才慢慢常出現，見 targetCx、pickPair）。想加字就加在共用資料庫裡。 */
        SimilarChars.pairs().filter(function (p) { return p.st <= SIMILAR_MAX_ST; })
            .map(function (p) { return { type: 'text', a: p.a, b: p.b, colorable: true, st: p.st }; })
    );
    /* COLORABLE：篩出能套用顏色的組合（emoji 自帶顏色，不能套） */
    var COLORABLE = PAIRS.filter(function (p) { return p.colorable; });
    /* ═══ 難度之一：題材的「複雜度」與每一關的「目標複雜度」（細節見檔頭說明）═══ */
    var CX_LOW = 0.10, CX_HIGH = 1.0;      /* 目標複雜度的最低（符號、數字、筆畫少的字）與最高（筆畫最多的字） */
    var CX_FLAT = 10, CX_RAMP = 30;        /* 第 1～CX_FLAT 關維持最低，之後線性升高，第 CX_RAMP 關到頂 */
    var CX_SIGMA = 0.18;                   /* 鐘形的寬度：越小，越集中在目標複雜度附近 */
    var CX_AHEAD = 0.20;                   /* 比目標複雜度難超過這麼多的題材一律不抽（避免突然跳出太難的字）；比目標簡單的不限制，只是機會逐漸變小 */
    /* 一組圖案的複雜度 cx（0～1）：向量符號 0.05 → emoji 0.10 → 數字 0.12 → 英文字母 0.15 → 中文字 0.15～1.0（依平均筆畫 st：3 畫約 0.15、25 畫＝1.0） */
    function complexityOf(p) {
        if (p.type === 'svg') return 0.05;
        if (p.type === 'emoji') return 0.10;
        if (p.st == null) return /^[0-9]$/.test(p.a) ? 0.12 : 0.15;
        return 0.15 + 0.85 * Math.min(1, Math.max(0, (p.st - 3) / 22));
    }
    /* 第 level 關的目標複雜度：前 CX_FLAT 關固定最低，之後線性升高到第 CX_RAMP 關的最高 */
    function targetCx(level) {
        if (level <= CX_FLAT) return CX_LOW;
        return CX_LOW + (CX_HIGH - CX_LOW) * Math.min(1, (level - CX_FLAT) / (CX_RAMP - CX_FLAT));
    }
    /* 從 pool 裡挑一組：每一組的權重＝exp(−(cx − T)² ÷ (2σ²))（鐘形；比目標難超過 CX_AHEAD 的權重是 0），再依權重隨機抽
       （輪盤抽法：總權重乘一個 0～1 的亂數，逐組扣掉權重，扣到小於 0 的那一組就是被抽到的） */
    function pickPair(pool, level, rand) {
        rand = rand || Math.random;
        var T = targetCx(level || 1), w = pool.map(function (p) { var d = complexityOf(p) - T; return d > CX_AHEAD ? 0 : Math.exp(-(d * d) / (2 * CX_SIGMA * CX_SIGMA)); });
        var sum = w.reduce(function (a, b) { return a + b; }, 0), r = rand() * sum;
        for (var i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) return pool[i]; }
        return pool[pool.length - 1];
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

    /* ═══ 難度之二：顏色（只給「混合」考驗用：少數格與多數格各給一個顏色）═══
       彩度（鮮豔程度）第 1 關最高（SAT_START），之後每關線性降低，第 SAT_END_LEVEL 關起是 0（黑白）；
       兩個顏色的色相差也從 HUE_START 度線性縮小到 HUE_END 度（第 SAT_END_LEVEL − 1 關）。
       CSS 沒有原生 hsv() 函式，顏色要先用下面的 hsvToRgb 換算成 rgb() 才能畫上畫面。 */
    var SAT_START = 85, SAT_END_LEVEL = 15, VAL = 90;        /* 第 1 關的彩度（0～100）、起幾關完全無彩度、明度（0～100，黑底上要亮） */
    var HUE_START = 180, HUE_END = 24;                       /* 「混合」考驗兩個顏色的色相差（度）：第 1 關 → 第 SAT_END_LEVEL − 1 關 */
    function satFor(level) { return SAT_START * Math.max(0, 1 - (Math.max(level, 1) - 1) / (SAT_END_LEVEL - 1)); }
    function hueDiffFor(level) { return HUE_START + (HUE_END - HUE_START) * Math.min(1, Math.max(0, (level - 1) / (SAT_END_LEVEL - 2))); }
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

    /* 依關卡決定考驗類型：第 1～14 關「混合」（形狀與顏色同時不同，顏色逐關變淡），第 15 關起「形狀」（黑白，只剩形狀不同） */
    function typeFor(level) {
        return level < SAT_END_LEVEL ? 'mixed' : 'shape';
    }
    /* 這一關顯示的提示文字 */
    function hintTextFor(type) {
        if (type === 'mixed') return '找出形狀（和顏色）不一樣的那一格';
        return '找出形狀不一樣的那一格';
    }

    /* 算出「多數格」與「少數格」各自要顯示的 HTML；fontPx 是文字型圖案的字級。回傳 { base, odd, pair }（pair 是這一關抽到的那一組圖案）。 */
    function buildRender(type, fontPx, level) {
        var flip = Math.random() < 0.5;
        if (type === 'shape') {
            /* 形狀考驗（第 SAT_END_LEVEL 關起）：所有格子同一個白色（黑白、無彩度），顏色不是線索，只有形狀不一樣；題材含 emoji（emoji 自帶顏色，也只能出現在這裡） */
            var pair = pickPair(PAIRS, level);
            var baseKind = flip ? pair.b : pair.a, oddKind = flip ? pair.a : pair.b;
            return {
                base: glyphHtml(pair.type, baseKind, '#FFFFFF', fontPx),
                odd: glyphHtml(pair.type, oddKind, '#FFFFFF', fontPx),
                pair: pair
            };
        }
        /* mixed：形狀跟顏色同時不一樣。兩個顏色的彩度同為 satFor(level)（逐關變淡）、色相差 hueDiffFor(level)（逐關變小），方向隨機 */
        var p3 = pickPair(COLORABLE, level);
        var bKind = flip ? p3.b : p3.a, oKind = flip ? p3.a : p3.b;
        var sat = satFor(level), bColor = { h: Math.random() * 360, s: sat, v: VAL };
        var oColor = { h: (bColor.h + (Math.random() < 0.5 ? 1 : -1) * hueDiffFor(level) + 360) % 360, s: sat, v: VAL };
        return {
            base: glyphHtml(p3.type, bKind, cssColor(bColor), fontPx),
            odd: glyphHtml(p3.type, oKind, cssColor(oColor), fontPx),
            pair: p3
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
            /* 主控台印出這一關實際的格數、考驗類型、抽到的圖案與複雜度、彩度與色相差，方便驗證難度 */
            try {
                console.info('[形形色色] 第 ' + level + ' 關：' + width + '×' + height + ' 格、' + (type === 'mixed' ? '混合' : '形狀（黑白）') + '；圖案「' + render.pair.a + '」／「' + render.pair.b + '」' + (render.pair.st != null ? '（平均 ' + render.pair.st + ' 畫）' : '') +
                    '，複雜度 ' + complexityOf(render.pair).toFixed(2) + '（目標 ' + targetCx(level).toFixed(2) + '）' + (type === 'mixed' ? '；彩度 ' + satFor(level).toFixed(1) + '、色相差 ' + hueDiffFor(level).toFixed(1) + ' 度' : '；無彩度'));
            } catch (e) { }
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
        rule: '畫面會被分成一格一格，裡面幾乎所有格子都長得一模一樣，**只有一格不一樣**。前面的關卡形狀和顏色都不同，顏色很鮮豔；越後面顏色越淡、差異越小，**第 15 關起變成黑白，只剩形狀不同**。圖案會從符號、數字，慢慢變成筆畫越來越多的字。找出那一格，點下去；答對就進下一關，格子會越來越多、越來越小。**答錯就結束**，比比看能撐到第幾關。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: {
            PAIRS: PAIRS, COLORABLE: COLORABLE, complexityOf: complexityOf, targetCx: targetCx, pickPair: pickPair, satFor: satFor, hueDiffFor: hueDiffFor, typeFor: typeFor, hintTextFor: hintTextFor,
            hsvToRgb: hsvToRgb, heightFor: heightFor, widthFor: widthFor,
            CX_LOW: CX_LOW, CX_HIGH: CX_HIGH, CX_FLAT: CX_FLAT, CX_RAMP: CX_RAMP, CX_SIGMA: CX_SIGMA, CX_AHEAD: CX_AHEAD, SAT_START: SAT_START, SAT_END_LEVEL: SAT_END_LEVEL, HUE_START: HUE_START, HUE_END: HUE_END
        }
    });
})();
