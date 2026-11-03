/* ═══════════════════════════════════════════════════════════════════
   reaction_gearmark.js — 秒反應・齒輪對記號（企劃 254）
   樣式：css/games/reaction_gearmark.css（這款專屬的 class 一律以「gearmark-」開頭；共用元件在 css/reaction_common.css）
   一串咬在一起的齒輪（銅色，像老時鐘的內部），每個齒輪上有一根紅色的針。手指在**最大的那個齒輪**上畫圈轉動它，
   其他齒輪跟著轉（相鄰的反方向、齒數少的轉得快）。**讓所有紅針同時指向正上方**，放手就判定。
   ───────────────────────────────────────────────────────────────────
   · 轉速：第 i 個齒輪的轉角 rot_i(θ0) = (−1)^i × θ0 × T0 ÷ T_i（T 是齒數；偶數號順時針、奇數號逆時針；齒數少的轉得快）。
   · 紅針的方向 = 初始針角 m_i + rot_i(θ0)（從正上方起算、順時針為正）；誤差 = 這個角度離「正上方」多遠（取 −180～180 的絕對值）。
     全部齒輪的誤差都在容許範圍（TOL）以內才算對準。
   · 一定有解：先決定「對準時」大齒輪轉了 θ0*（120°～500°、方向隨機），再反推每根針的初始角 m_i = −rot_i(θ0*)；
     因為每轉 P 圈（P＝各齒輪「齒數 ÷ 跟大齒輪的最大公因數」的最小公倍數）所有齒輪才會同時回到原位，所以對準的位置每 P 圈才重複一次——
     這就是企劃說的「要轉到最小公倍數那一圈」。P 隨關卡增加（PERIOD_MAX：1 圈 → 12 圈），第 1 關每一圈都對得上。
   · 齒輪咬合要「看起來對」：每個齒輪的齒相位（base）依據它和前一個齒輪的接觸方向算出，使得一個齒輪的齒永遠對著下一個的齒縫（layout／meshSum，有單元測試）。
   · 難度（線性）：齒輪數 2 → 5（GEARS）、容許誤差 8° → 3°（TOL）、全部回到原位的圈數上限 1 → 12（PERIOD_MAX）、限時 45 → 25 秒（TIME_S）。
   · 放手判定：每個齒輪的誤差（X.XXXX 度）逐一列出，超過容許誤差的標紅；全部對準時齒輪一起閃光。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'gearmark'：選單、成績、存檔都靠它；樣式在 css/games/reaction_gearmark.css，裡面的 class 名稱一律以 gearmark- 開頭。 */
    'use strict';

    var ID = 'gearmark';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var GEARS = [2, 5];                         /* 齒輪數：第 1 關 → 到頂 */
    var TOL = [8, 3];                           /* 紅針離正上方的容許誤差（度）：第 1 關 → 到頂 */
    var PERIOD_MAX = [1, 12];                   /* 「全部回到原位」最多要轉幾圈（最小公倍數那一圈）：第 1 關 → 到頂 */
    var TIME_S = [45, 25];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var T0_LIST = [24, 30, 36, 40, 48, 60];     /* 大齒輪（最左邊）的齒數可選 */
    var TEETH_MIN = 8, TEETH_GAP = 3;           /* 其他齒輪最少幾齒；相鄰兩個齒輪齒數至少差幾齒（轉速不能太像） */
    var TARGET_TURN = [120, 500];               /* 對準時大齒輪離起點轉了幾度（絕對值範圍） */
    var MIN_TAP_MOVE = 12;                      /* 手指在畫面上至少移動幾 px 才算「畫圈」，放手才判定（避免誤點就失敗） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function nFor(level) { return Math.round(ramp(level, GEARS)); }  /* Math.round：四捨五入成整數 */
    function tolFor(level) { return Math.round(ramp(level, TOL) * 10) / 10; }  /* Math.round：四捨五入成整數 */
    function periodMaxFor(level) { return Math.round(ramp(level, PERIOD_MAX)); }
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function wrap180(a) { var x = ((a + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; }       /* 角度換到 (−180, 180] */
    function wrap360(a) { return ((a % 360) + 360) % 360; }
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    function lcm(a, b) { return a / gcd(a, b) * b; }
    function rad(d) { return d * Math.PI / 180; }
    /* 第 i 個齒輪的轉角（度，順時針為正）：偶數號跟大齒輪同方向、奇數號反方向，齒數少的轉得快 */
    function rotOf(teeth, i, theta0) { return (i % 2 ? -1 : 1) * theta0 * teeth[0] / teeth[i]; }
    /* 所有齒輪回到同一個狀態要轉幾圈（大齒輪的圈數）：各齒輪「齒數 ÷ 跟大齒輪的最大公因數」的最小公倍數 */
    function ratioPeriod(teeth) {
        var p = 1;
        for (var i = 1; i < teeth.length; i++) p = lcm(p, teeth[i] / gcd(teeth[0], teeth[i]));
        return p;
    }
    /* 每根針離正上方的誤差（度，0～180）；theta0 是大齒輪現在轉了幾度 */
    function errors(q, theta0) {
        return q.teeth.map(function (t, i) { return Math.abs(wrap180(q.marks[i] + rotOf(q.teeth, i, theta0))); });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
    }
    function solved(q, theta0) { return Math.max.apply(null, errors(q, theta0)) <= q.tol; }
    /* 出一關：{ teeth, marks（初始針角）, target（對準時大齒輪轉的度數）, tol, period, n, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = nFor(level), tol = tolFor(level), pmax = periodMaxFor(level);
        for (var tr = 0; tr < 2000; tr++) {
            var T0 = kit.pick(T0_LIST, rand), teeth = [T0], i;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            for (i = 1; i < n; i++) {
                var cand = [];
                for (var t = TEETH_MIN; t <= T0 - 2; t++) if (Math.abs(t - teeth[i - 1]) >= TEETH_GAP && teeth.indexOf(t) < 0) cand.push(t);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                if (!cand.length) break;
                teeth.push(kit.pick(cand, rand));       /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            }
            if (teeth.length < n) continue;
            var P = ratioPeriod(teeth);
            if (P > pmax) continue;
            var target = kit.randFloat(TARGET_TURN[0], TARGET_TURN[1], rand) * (rand() < 0.5 ? 1 : -1);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            var marks = teeth.map(function (tt, k) { return wrap360(-rotOf(teeth, k, target)); });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var q = { teeth: teeth, marks: marks, target: target, tol: tol, period: P, n: n, level: level };
            if (Math.max.apply(null, errors(q, 0)) <= tol * 3) continue;          /* 起點附近不能已經對準 */
            return q;
        }
        var ft = [24, 12], fm = ft.map(function (tt, k) { return wrap360(-rotOf(ft, k, 200)); });
        return { teeth: ft, marks: fm, target: 200, tol: tol, period: 1, n: 2, level: level };
    }
    /* 齒輪的擺放與咬合相位（單位：以「每個齒的半徑」為 1，也就是齒輪的節圓半徑 = 齒數）。
       dirs[i]＝第 i 個齒輪指向第 i+1 個的方向（從正上方起算、順時針的度數）；
       bases[i]＝第 i 個齒輪「一個齒的中心」的方向（轉角 0 時）。
       咬合條件（推導見檔頭）：T_A (dirAB − base_A − rot_A) + T_B (dirBA − base_B − rot_B) ≡ 180°（mod 360°），
       因為相鄰兩個齒輪的 rot 反向、大小反比於齒數，這個和不隨轉動改變，所以只要轉角 0 時成立，轉到哪裡都咬得上。 */
    /* 用「之」字形的斜角 delta 擺一串齒輪：回傳 { pos, dirs }（pos＝各齒輪中心、dirs＝指向下一個齒輪的方向） */
    function chain(teeth, delta) {
        var n = teeth.length, pos = [{ x: 0, y: 0 }], dirs = [], i;
        for (i = 0; i < n - 1; i++) {
            var dir = 90 + (i % 2 === 0 ? -delta : delta), d = teeth[i] + teeth[i + 1];
            dirs.push(dir);
            pos.push({ x: pos[i].x + d * Math.sin(rad(dir)), y: pos[i].y - d * Math.cos(rad(dir)) });
        }
        return { pos: pos, dirs: dirs };
    }
    /* 不相鄰的兩個齒輪不能撞在一起（中心距要大於兩個外圓半徑相加；齒頂比節圓高 1 個單位） */
    function noOverlap(teeth, pos) {
        for (var i = 0; i < teeth.length; i++) for (var j = i + 2; j < teeth.length; j++) {
            if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < teeth[i] + teeth[j] + 4) return false;
        }
        return true;
    }
    function layout(teeth) {
        var n = teeth.length, bases = [], i, cands = n === 2 ? [0] : [60, 50, 40, 30, 20, 10, 0], c, pos, dirs;
        for (c = 0; c < cands.length; c++) {                                        /* 從最斜（最節省橫向空間）的開始試，第一個不撞的就用 */
            var ch = chain(teeth, cands[c]);
            pos = ch.pos; dirs = ch.dirs;
            if (noOverlap(teeth, pos)) break;
        }
        bases[0] = n > 1 ? dirs[0] : 0;                                              /* 大齒輪：接觸方向上剛好是齒中心 */
        for (i = 1; i < n; i++) {
            var a = teeth[i - 1] * (dirs[i - 1] - bases[i - 1]);                     /* T_A (dirAB − base_A) */
            bases[i] = (dirs[i - 1] + 180) - (180 - a) / teeth[i];
        }
        return { pos: pos, dirs: dirs, bases: bases };
    }
    /* 驗證用：第 i 與第 i+1 個齒輪的咬合量（度，應該永遠 ≡ 180 mod 360） */
    function meshSum(teeth, L, i, theta0) {
        var A = teeth[i], B = teeth[i + 1], rA = rotOf(teeth, i, theta0), rB = rotOf(teeth, i + 1, theta0);
        return wrap360(A * (L.dirs[i] - L.bases[i] - rA) + B * (L.dirs[i] + 180 - L.bases[i + 1] - rB));
    }
    function deg4(x) { return x.toFixed(4); }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '鐘錶大師！';
        if (n >= 15) return '手感很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '慢慢轉，看紅針有沒有同時指向上！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'gearmark-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一個齒輪的外形（SVG path 字串）：齒中心在 base（度）＋360/T 的整數倍；節圓半徑 R，齒頂比節圓高 add、齒根比節圓低 ded */
    function gearPath(T, R, base, add, ded) {
        var pts = [], w = 360 / T, k;
        function P(r, ang) { var a = rad(ang); return (r * Math.sin(a)).toFixed(2) + ',' + (-r * Math.cos(a)).toFixed(2); }
        for (k = 0; k < T; k++) {
            var c = base + k * w;
            pts.push(P(R - ded, c - 0.34 * w), P(R + add, c - 0.17 * w), P(R + add, c + 0.17 * w), P(R - ded, c + 0.34 * w));
        }
        return 'M' + pts.join(' L') + ' Z';
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand), teeth = q.teeth, n = q.n, L = layout(teeth);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[齒輪對記號] 第 ' + level + ' 關：' + n + ' 個齒輪，齒數 ' + teeth.join(':') + '，全部回到原位要 ' + q.period + ' 圈；對準位置＝大齒輪轉 ' + q.target.toFixed(1) + '°；容許誤差 ' + q.tol + '°；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        stage.appendChild(h('div', { 'class': 'qz-note gearmark-tip', text: '畫圈轉大齒輪，讓紅針全指向上' }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 縮放：讓整串齒輪放進 (W−16)×(H−330) 的範圍，置中 */
        var ext = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
        L.pos.forEach(function (p, i) { var r = teeth[i] + 2; ext.x0 = Math.min(ext.x0, p.x - r); ext.x1 = Math.max(ext.x1, p.x + r); ext.y0 = Math.min(ext.y0, p.y - r - 8); ext.y1 = Math.max(ext.y1, p.y + r); });  /* forEach：對陣列的每個元素各做一次 */
        var areaT = 64, areaH = Math.min(H - 250, 420);
        var s = Math.min((W - 16) / (ext.x1 - ext.x0), areaH / (ext.y1 - ext.y0), 3.2);
        var ox = (W - (ext.x1 - ext.x0) * s) / 2 - ext.x0 * s, oy = areaT + (areaH - (ext.y1 - ext.y0) * s) / 2 - ext.y0 * s;
        var svg = kit.svg('svg', { 'class': 'gearmark-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var cx = L.pos.map(function (p) { return ox + p.x * s; }), cy = L.pos.map(function (p) { return oy + p.y * s; });
        var rot = [], gears = [], hands = [];
        teeth.forEach(function (T, i) {                 /* forEach：對陣列的每個元素各做一次 */
            var R = T * s, g = kit.svg('g', { 'class': 'gearmark-gear', transform: 'translate(' + cx[i].toFixed(2) + ',' + cy[i].toFixed(2) + ')' }, svg);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
            /* 固定的「正上方」記號：齒輪頂端外面一個小三角形 */
            kit.svg('path', { 'class': 'gearmark-tick', d: 'M-7,' + (-R - 20) + ' L7,' + (-R - 20) + ' L0,' + (-R - 6) + ' Z' }, g);
            var spin = kit.svg('g', {}, g);
            kit.svg('path', { 'class': 'gearmark-body' + (i === 0 ? ' gearmark-body--main' : ''), d: gearPath(T, R, L.bases[i], 1.0 * s, 1.15 * s) }, spin);
            kit.svg('circle', { 'class': 'gearmark-ring', cx: 0, cy: 0, r: R * 0.62 }, spin);
            var hand = kit.svg('g', { transform: 'rotate(' + q.marks[i].toFixed(3) + ')' }, spin);          /* 紅針：初始針角 */
            kit.svg('path', { 'class': 'gearmark-needle', d: 'M-5,0 L0,' + (-R * 0.9).toFixed(1) + ' L5,0 Z' }, hand);
            kit.svg('circle', { 'class': 'gearmark-hub', cx: 0, cy: 0, r: Math.max(6, R * 0.1) }, spin);
            rot.push(0); gears.push(spin); hands.push(hand);
        });
        var list = h('div', { 'class': 'gearmark-list' });
        list.style.top = (areaT + areaH + 8) + 'px';
        stage.appendChild(list);                        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip2 = h('div', { 'class': 'qz-note gearmark-hint', text: '誤差要在 ' + q.tol + '° 內，放手就判定' });
        tip2.style.top = (areaT + areaH + 8) + 'px';
        stage.appendChild(tip2);

        var theta = 0, done = false, drag = null;
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() { teeth.forEach(function (T, i) { gears[i].setAttribute('transform', 'rotate(' + rotOf(teeth, i, theta).toFixed(3) + ')'); }); }  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        paint();
        api.timer(timeMs(level), function () { judge(); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('gearmark.hint')) kit.hintOn(stage, null, { mode: 'drag', x: cx[0], y: cy[0] - teeth[0] * s * 0.7, dx: teeth[0] * s * 0.7, dy: teeth[0] * s * 0.7, delay: 700, text: '在大齒輪上畫圈' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        function ang(p) { return Math.atan2(p.x - cx[0], -(p.y - cy[0])) * 180 / Math.PI; }     /* 手指在大齒輪的哪個方向（從正上方順時針的度數） */
        svg.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (done || api.over || drag) return;
            var p = kit.localPt(e, svg);
            if (kit.dist(p.x, p.y, cx[0], cy[0]) > teeth[0] * s * 1.25 + 10) return;           /* 只接大齒輪上（附近）的按下 */
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { svg.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            drag = { id: e.pointerId, a: ang(p), x: p.x, y: p.y, moved: 0 };
            stage.classList.add('gearmark-turning');    /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        });
        svg.addEventListener('pointermove', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (!drag || e.pointerId !== drag.id || done) return;
            var p = kit.localPt(e, svg), a = ang(p);
            theta += wrap180(a - drag.a);                                                     /* 累加轉動量（不會因為轉過 360° 而跳回去） */
            drag.moved += kit.dist(p.x, p.y, drag.x, drag.y); drag.a = a; drag.x = p.x; drag.y = p.y;
            paint();
        });
        function release(e) {
            if (!drag || e.pointerId !== drag.id) return;
            var moved = drag.moved; drag = null; stage.classList.remove('gearmark-turning');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (moved >= MIN_TAP_MOVE) judge();
        }
        svg.addEventListener('pointerup', release);
        svg.addEventListener('pointercancel', release);

        /* 判定：每個齒輪的誤差逐一列出；全部在容許範圍內就過關 */
        function judge() {
            if (done || api.over) return;
            done = true; drag = null; stage.classList.remove('gearmark-turning');
            var errs = errors(q, theta), worst = Math.max.apply(null, errs), ok = worst <= q.tol, worstIdx = errs.indexOf(worst);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            tip2.style.display = 'none';
            errs.forEach(function (er, i) {
                var good = er <= q.tol;
                list.appendChild(h('div', { 'class': 'gearmark-row ' + (good ? 'gearmark-row--ok' : 'gearmark-row--bad'), text: '齒輪 ' + (i + 1) + '（' + teeth[i] + ' 齒）：差 ' + deg4(er) + ' 度' }));
                hands[i].firstChild.setAttribute('class', 'gearmark-needle ' + (good ? 'gearmark-needle--ok' : 'gearmark-needle--bad'));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            });
            if (ok) {
                stage.classList.add('gearmark-flash');
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 2000 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 3200, lines: ['最大的誤差是齒輪 ' + (worstIdx + 1) + '：差了 ' + deg4(worst) + ' 度', '要在 ' + q.tol + ' 度以內才算對準（全部回到原位要轉 ' + q.period + ' 圈）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { theta = q.target; paint(); judge(); };
        api.wrong = function () { theta = q.target + 77; paint(); judge(); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '齒輪對記號',
        rule: '一串咬在一起的齒輪，每個齒輪上有一根紅針。**手指在最大的齒輪上畫圈**轉動它，其他齒輪跟著轉：相鄰的反方向、齒數少的轉得快。**讓所有紅針同時指向正上方**，放手就判定。每個齒輪轉得不一樣快，要轉到**剛好每個齒輪都回到原位的那一圈**才會全部對準。越後面，齒輪越多、允許的誤差越小！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            nFor: nFor, tolFor: tolFor, periodMaxFor: periodMaxFor, timeMs: timeMs, wrap180: wrap180, wrap360: wrap360, gcd: gcd, lcm: lcm, rotOf: rotOf, ratioPeriod: ratioPeriod,
            errors: errors, solved: solved, makeLevel: makeLevel, layout: layout, meshSum: meshSum, gearPath: gearPath, deg4: deg4, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, GEARS: GEARS, TOL: TOL, PERIOD_MAX: PERIOD_MAX, TIME_S: TIME_S, T0_LIST: T0_LIST, TEETH_MIN: TEETH_MIN, TEETH_GAP: TEETH_GAP, TARGET_TURN: TARGET_TURN, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
