/* ═══════════════════════════════════════════════════════════════════
   reaction_colorrecall.js — 秒反應・記色調色
   樣式：css/games/reaction_colorrecall.css（這款專屬的 class 一律以「colorrecall-」開頭；共用元件在 css/reaction_common.css）
   先看左邊的色塊 3 秒（右上倒數、右下「請記住左邊顏色」），3 秒後左邊色塊消失，
   右邊出現一塊隨機起始色的色塊；拖曳下方橫條，讓右邊色塊變回剛剛看到的顏色。按「確定」，只有一次機會。
   每一回合只考「色相」「彩度」「明度」其中一項（隨機抽），另外兩項跟目標色一樣。
   ───────────────────────────────────────────────────────────────────
   · 色彩用 HSL 控制（色相 0～360°、彩度 0～100%、明度 L_MIN～L_MAX%）；目標色的彩度 40～90%、
     明度 35～65%（避免太灰太暗）。
   · 橫條的軌道沒有漸層（避免玩家用軌道顏色對照）；起始值離目標至少一段距離（色相 ≥ 60°、彩度／明度 ≥ 25／20 個百分點）。
   · 微調：拖曳慢速打折（kit.dragDamp）；橫條兩端的 ◀ ▶ 每按一下調 NUDGE（0.5 單位，按住會連續）。
   · 色差 ΔE：HSL → sRGB → XYZ（D65）→ CIE Lab，取 CIE76（Lab 空間的歐氏距離）。成績＝ΔE（越小越好）。
   · 背景固定中灰（HSL 0,0%,50%），避免對比錯覺干擾兩塊顏色。
   · 揭曉動畫（V1.28 玩家意見）：按「確定」後，左圖去掉右邊的白框線、右圖去掉左邊的白框線，兩張圖往中間靠攏、緊密併齊
     （兩塊顏色貼在一起才看得出差異）；同時畫面下方用大字體顯示「差異 XX.XXXX%」，從 0.0000% 一路上升到最後的色差
     （數字就是 ΔE，跟結算的成績同一個值，緊張地揭曉），停住 HOLD_MS 之後才結算。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'colorrecall'：選單、成績、存檔都靠它；樣式在 css/games/reaction_colorrecall.css，裡面的 class 名稱一律以 colorrecall- 開頭。 */
    'use strict';

    var ID = 'colorrecall';                             /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'min', decimals: 4, format: 'ΔE {v}', label: '色差', min: 0, max: 260 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var MEMO_S = 3;                             /* 記憶秒數 */
    var L_MIN = 20, L_MAX = 80;                 /* 明度橫條的範圍（%） */
    var TARGET_S = [40, 90], TARGET_L = [35, 65];   /* TARGET_S：目標顏色的彩度範圍 40～90（%）；TARGET_L：目標顏色的明度範圍 35～65（%） */
    var START_GAP = { hue: [60, 180], sat: [25, 45], light: [20, 30] };   /* 起始值離目標的距離範圍（度／百分點） */
    var JOIN_MS = 1000;                         /* 兩個色塊靠攏的時間 */
    var COUNT_MS = 2200;                        /* 差異數字從 0 升到最後數值的時間 */
    var HOLD_MS = 1500;                         /* 數字停住之後，再維持多久才跳出結算 */
    var NUDGE = 0.5;                            /* ◀ ▶ 每按一下調幾個單位 */
    var TRACK_W = 380, KNOB = 64;                   /* TRACK_W：滑桿軌道的寬度（px）；KNOB：滑桿圓鈕的直徑（px） */
    var DIMS = ['hue', 'sat', 'light'];             /* 會被考的三種顏色屬性：hue 色相、sat 彩度、light 明度 */
    var DIM_NAME = { hue: '色相', sat: '彩度', light: '明度' };  /* 屬性的中文名稱 */
    var DIM_UNIT = { hue: '度', sat: '%', light: '%' };  /* 屬性顯示時的單位（色相是「度」，彩度與明度是 %） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 把 HSL（色相 0～360 度、彩度 %、明度 %）轉成 RGB：先算「色彩強度」c 與中間值 x，依色相落在哪個 60 度區間決定 R、G、B 的分配，再加上亮度補償 m */
    function hslToRgb(hh, s, l) {
        hh = ((hh % 360) + 360) % 360; s /= 100; l /= 100;
        var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;  /* Math.abs：取絕對值（去掉負號） */
        if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; }
        else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    /* 把 RGB 轉成 CIELAB（L 亮度、a 紅綠、b 黃藍）：先把 sRGB 還原成線性亮度，乘上轉換矩陣得 XYZ，再用立方根曲線轉成 Lab。Lab 空間裡兩個顏色的距離，才接近人眼覺得「差多少」 */
    function rgbToLab(rgb) {
        var lin = rgb.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var X = (0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2]) / 0.95047;
        var Y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.0721750 * lin[2];
        var Z = (0.0193339 * lin[0] + 0.1191920 * lin[1] + 0.9503041 * lin[2]) / 1.08883;
        var f = function (t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; };
        var fx = f(X), fy = f(Y), fz = f(Z);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    }
    /* 一個 HSL 顏色（{h, s, l}）轉成 Lab */
    function labOf(c) { return rgbToLab(hslToRgb(c.h, c.s, c.l)); }
    /* 兩個顏色的差 ΔE：就是它們在 Lab 空間裡的直線距離（勾股定理）；這個遊戲的成績就是 ΔE，越小越準 */
    function deltaE(c1, c2) {
        var a = labOf(c1), b = labOf(c2);
        return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
    }
    /* 橫條位置 t（0～1）與維度數值互換 */
    /* 橫條位置 t（0～1）換成顏色屬性的數值：色相 0～360、彩度 0～100、明度 L_MIN～L_MAX */
    function valueAt(dim, t) { return dim === 'hue' ? t * 360 : (dim === 'sat' ? t * 100 : L_MIN + t * (L_MAX - L_MIN)); }
    /* 反過來：屬性數值 v 換成橫條位置 t（0～1） */
    function tFor(dim, v) { return dim === 'hue' ? v / 360 : (dim === 'sat' ? v / 100 : (v - L_MIN) / (L_MAX - L_MIN)); }
    /* 橫條走完整條（t 從 0 到 1）相當於幾個單位（微調鍵用它換算） */
    function unitsPerT(dim) { return dim === 'hue' ? 360 : (dim === 'sat' ? 100 : L_MAX - L_MIN); }
    /* 屬性名稱換成顏色物件的欄位：hue→h、sat→s、light→l */
    function dimKey(dim) { return dim === 'hue' ? 'h' : (dim === 'sat' ? 's' : 'l'); }
    /* 把目標色的某一個維度換成 v */
    /* 複製顏色 c，只把其中一個屬性換成 v（玩家調的是哪個屬性，就只改那個） */
    function withDim(c, dim, v) { var o = { h: c.h, s: c.s, l: c.l }; o[dimKey(dim)] = v; return o; }
    /* 出一回合：隨機決定目標顏色，隨機選這回合考哪個屬性（色相／彩度／明度），再決定起始值（離目標一段距離，往隨機一個方向，超出範圍就改往另一邊）。回傳 { target, dim, start } */
    function makeRound(rand, forceDim) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var target = { h: kit.randFloat(0, 360, rand), s: kit.randFloat(TARGET_S[0], TARGET_S[1], rand), l: kit.randFloat(TARGET_L[0], TARGET_L[1], rand) };  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        var dim = forceDim || kit.pick(DIMS, rand), tv = target[dimKey(dim)], gap = START_GAP[dim], g = kit.randFloat(gap[0], gap[1], rand), sign = rand() < 0.5 ? 1 : -1, v;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        if (dim === 'hue') v = ((tv + sign * g) % 360 + 360) % 360;
        else {
            var lo = dim === 'sat' ? 0 : L_MIN, hi = dim === 'sat' ? 100 : L_MAX;
            v = tv + sign * g;
            if (v < lo || v > hi) v = tv - sign * g;
            v = kit.clamp(v, lo, hi);                   /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        }
        return { target: target, dim: dim, start: v };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(e) {
        if (e < 1.5) return '神乎其技！';
        if (e < 4) return '高手！';
        if (e < 8) return '很準！';
        if (e < 15) return '不錯喔！';
        return '再試一次，會更準！';
    }
    /* 揭曉：兩個色塊的左邊界在進度 e（0～1）時的位置：左塊 10 → 20、右塊 246 → 235（右塊多蓋 1px，避免兩塊中間露出一條細縫） */
    var JOIN_FROM = { l: 10, r: 246 }, JOIN_TO = { l: 20, r: 235 };
    /* 揭曉動畫進度 e（0～1）時，兩個色塊的位置（線性內插） */
    function joinPos(e) { return { l: JOIN_FROM.l + (JOIN_TO.l - JOIN_FROM.l) * e, r: JOIN_FROM.r + (JOIN_TO.r - JOIN_FROM.r) * e }; }
    /* 差異數字的字串：0.0000% → XX.XXXX% */
    /* 差異數字的格式：小數 4 位加百分比，例如 12.3456% */
    function fmtDiffPct(v) { return v.toFixed(4) + '%'; }
    /* 把 {h, s, l} 轉成 CSS 的 hsl(…) 顏色文字 */
    function css(c) { return 'hsl(' + c.h.toFixed(2) + ',' + c.s.toFixed(2) + '%,' + c.l.toFixed(2) + '%)'; }

    /* mount：選單按下這款遊戲時會呼叫它。把「單回合計時」的流程（開始、計時、結算、最佳紀錄）交給共用骨架 kit.single，我們只提供 setup（怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '先記住左邊的顏色，再把右邊調成一樣',
            stageClass: 'colorrecall-stage',
            numText: function (v) { return 'ΔE ' + v.toFixed(4); },
            rating: rating,
            sfx: function (v) { return v < 4 ? 'perfect' : (v < 10 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472;
        var cfg = makeRound(), t = tFor(cfg.dim, cfg.start), phase = 'memo', locked = false, hint = null;  /* cfg：這回合的設定；t：玩家目前調到的位置（0～1）；phase：階段（memo 記憶→adjust 調整→揭曉）；locked：已交卷；hint：操作提示 */
        console.log('[記色調色] 這回合考' + DIM_NAME[cfg.dim] + '；目標 H' + cfg.target.h.toFixed(2) + ' S' + cfg.target.s.toFixed(2) + ' L' + cfg.target.l.toFixed(2) + '；起始 ' + cfg.start.toFixed(2));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var left = h('div', { 'class': 'colorrecall-block colorrecall-block--l' });
        var right = h('div', { 'class': 'colorrecall-block colorrecall-block--r' });
        var count = h('div', { 'class': 'colorrecall-count', text: String(MEMO_S) });
        var memo = h('div', { 'class': 'colorrecall-memo', text: '請記住左邊顏色' });
        var dimTag = h('div', { 'class': 'colorrecall-dim', text: '這次考：' + DIM_NAME[cfg.dim] });
        left.style.background = css(cfg.target);
        right.classList.add('colorrecall-block--info'); /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        right.appendChild(count); right.appendChild(memo);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        [left, right, dimTag].forEach(function (e) { stage.appendChild(e); });  /* forEach：對陣列的每個元素各做一次 */

        /* 調整區（記憶結束後才出現） */
        var trackY = 420, x0 = (W - TRACK_W) / 2;       /* 調整區的位置：橫條的 y 座標 trackY、左邊起點 x0（讓橫條置中） */
        var track = h('div', { 'class': 'colorrecall-track' });
        track.style.left = x0 + 'px'; track.style.top = trackY + 'px'; track.style.width = TRACK_W + 'px';
        var knob = h('div', { 'class': 'colorrecall-knob' }); knob.style.top = (trackY + 4 - KNOB / 2) + 'px';
        var bL = h('button', { 'class': 'btn btn--line colorrecall-nudge', text: '◀' }), bR = h('button', { 'class': 'btn btn--line colorrecall-nudge', text: '▶' });
        var nudges = h('div', { 'class': 'colorrecall-nudges' }, [bL, bR]);
        var okBtn = h('button', { 'class': 'btn btn--go colorrecall-ok', text: '確定' });
        var msg = h('div', { 'class': 'colorrecall-msg' });
        var big = h('div', { 'class': 'colorrecall-big', text: fmtDiffPct(0) });        /* 揭曉時的大字：差異 XX.XXXX% */
        var ctrl = [track, knob, nudges, okBtn];
        ctrl.forEach(function (e) { e.style.display = 'none'; stage.appendChild(e); });
        stage.appendChild(msg); stage.appendChild(big);
        /* 玩家現在調出來的顏色：目標顏色把被考的那個屬性換成玩家橫條所在的值 */
        function mine() { return withDim(cfg.target, cfg.dim, valueAt(cfg.dim, t)); }
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        /* 重畫：圓鈕移到橫條上的位置；調整階段時，右邊色塊換成玩家現在調出的顏色 */
        function paint() {
            knob.style.left = (x0 + t * TRACK_W - KNOB / 2) + 'px';
            if (phase === 'adjust') right.style.background = css(mine());
        }

        /* 倒數 */
        for (var k = 1; k <= MEMO_S; k++) (function (k) { my.after(k * 1000, function () { if (k < MEMO_S) { count.textContent = String(MEMO_S - k); Sfx.play('tick'); } else toAdjust(); }); })(k);  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */  /* 倒數：每一秒把數字減一（最後一秒結束就進入調整階段）；用立即執行函式存住 k */
        /* 記憶時間到：左邊色塊蓋掉（改成說明文字）、右邊變成玩家調整的色塊，顯示橫條與按鈕 */
        function toAdjust() {
            phase = 'adjust';
            left.style.background = ''; left.classList.add('colorrecall-block--info'); left.textContent = '請調整下方橫條，讓右邊色塊與剛剛相同';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            right.classList.remove('colorrecall-block--info'); right.innerHTML = '';  /* innerHTML = ''：把元素裡面的東西全部清掉 */
            ctrl.forEach(function (e) { e.style.display = ''; });
            paint();
            /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從圓點現在的位置往「剛剛那個顏色的位置」重複移動（第一次的正確答案） */
            if (kit.once('colorrecall.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: x0 + t * TRACK_W, y: trackY + 4, dx: (tFor(cfg.dim, cfg.target[dimKey(cfg.dim)]) - t) * TRACK_W, dy: 0, delay: 300 });  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            Sfx.play('go');
        }
        /* 拿掉操作提示 */
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {                           /* kit.dragDamp：拖曳時「慢慢拖就微調、快速拖就大幅移動」的阻尼效果（讓玩家可以調得很精準）；這裡把橫向拖曳換成橫條位置 t */
            enabled: function () { return phase === 'adjust' && !locked; },
            start: function () { hideHint(); return true; },
            move: function (dx) { t = kit.clamp(t + dx / TRACK_W, 0, 1); paint(); }
        });
        /* 微調鍵（◀ ▶）：按一下動一小格，按住不放會連續移動（先慢後快）；dir 是方向（−1 往左、+1 往右） */
        function nudge(btn, dir) {
            var rep = null;
            function step() { if (phase === 'adjust' && !locked) { t = kit.clamp(t + dir * NUDGE / unitsPerT(cfg.dim), 0, 1); paint(); } }
            btn.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
                e.preventDefault(); hideHint(); step(); /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
                var n = 0;
                (function again() { rep = my.after(n++ < 3 ? 350 : 60, function () { step(); again(); }); })();
            });
            function stop() { if (rep != null) { my.cancel(rep); rep = null; } }
            btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
        }
        nudge(bL, -1); nudge(bR, 1);
        kit.onTap(okBtn, function () { submit(); });    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        /* 按「確定」交卷：算玩家的顏色跟目標的 ΔE，揭曉（兩個色塊靠攏、差異數字跳動），最後呼叫 api.finish 結算（成績＝ΔE，越小越好） */
        function submit() {
            if (locked || phase !== 'adjust') return;
            locked = true; hideHint(); ctrl.forEach(function (e) { e.style.display = 'none'; });
            Sfx.play('click');
            var m = mine(), real = deltaE(m, cfg.target);
            left.classList.remove('colorrecall-block--info'); left.textContent = ''; left.style.background = css(cfg.target);
            var tv = cfg.target[dimKey(cfg.dim)], mv = valueAt(cfg.dim, t);
            /* 揭曉：左圖去掉右邊的白框線、右圖去掉左邊的白框線 → 兩張圖往中間靠攏併齊，同時下方的差異數字從 0 往上跳 */
            left.classList.add('colorrecall-block--join-l'); right.classList.add('colorrecall-block--join-r');
            big.classList.add('colorrecall-big--on');
            my.tween(COUNT_MS, function (e) { big.textContent = fmtDiffPct(real * e); }, kit.easeOutCubic).then(function () {  /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
                big.textContent = fmtDiffPct(real);
                my.after(HOLD_MS, function () {
                    api.finish(real, { lines: [
                        '這一回合考' + DIM_NAME[cfg.dim] + '：目標 ' + tv.toFixed(4) + DIM_UNIT[cfg.dim] + '，你調到 ' + mv.toFixed(4) + DIM_UNIT[cfg.dim],
                        '色差 ΔE ＝ ' + real.toFixed(4) + '（Lab 空間的距離，越小越接近）',
                        '只有一次機會，想拚更準就再挑戰一次（下次可能考別的項目）'
                    ] });
                });
            });
            my.tween(JOIN_MS, function (e) {
                var p = joinPos(e); left.style.left = p.l.toFixed(2) + 'px'; right.style.left = p.r.toFixed(2) + 'px';
            }, kit.easeInOutCubic);
        }

        G.debug = {
            state: function () { return { cfg: cfg, t: t, phase: phase, locked: locked, value: valueAt(cfg.dim, t) }; },
            skipMemo: function () { if (phase === 'memo') toAdjust(); },
            setValue: function (v) { t = kit.clamp(tFor(cfg.dim, v), 0, 1); paint(); },
            solve: function () { if (phase === 'memo') toAdjust(); t = tFor(cfg.dim, cfg.target[dimKey(cfg.dim)]); paint(); submit(); },
            wrong: function () { if (phase === 'memo') toAdjust(); t = kit.clamp(tFor(cfg.dim, cfg.start), 0, 1); paint(); submit(); }
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '記色調色',
        rule: '先看左邊的色塊 3 秒，**記住它的顏色**。3 秒後色塊消失，右邊會出現另一塊顏色，拖曳下方橫條，**把它調回剛剛看到的顏色**。每次只考色相、彩度、明度其中一項。只有一次機會，按「確定」後會告訴你色差。',
        mount: mount,
        score: SCORE,
        test: { joinPos: joinPos, fmtDiffPct: fmtDiffPct, JOIN_FROM: JOIN_FROM, JOIN_TO: JOIN_TO, JOIN_MS: JOIN_MS, COUNT_MS: COUNT_MS, HOLD_MS: HOLD_MS, hslToRgb: hslToRgb, rgbToLab: rgbToLab, deltaE: deltaE, valueAt: valueAt, tFor: tFor, unitsPerT: unitsPerT, withDim: withDim, makeRound: makeRound, rating: rating, DIMS: DIMS, START_GAP: START_GAP, L_MIN: L_MIN, L_MAX: L_MAX, TARGET_S: TARGET_S, TARGET_L: TARGET_L }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
