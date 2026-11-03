/* ═══════════════════════════════════════════════════════════════════
   reaction_milktea.js — 秒反應・奶茶調色（企劃 274）
   樣式：css/games/reaction_milktea.css（這款專屬的 class 一律以「milktea-」開頭；共用元件在 css/reaction_common.css）
   手搖飲店。左邊一杯客人點的「理想奶茶」（樣品色），右邊一杯純紅茶。**按住牛奶壺倒牛奶，奶茶的顏色慢慢變淡；放手就停**。
   兩杯顏色一樣就過關。放手後兩杯靠攏並排，下方顯示「顏色差 2.3184%」（ΔE）。
   ───────────────────────────────────────────────────────────────────
   · 混色：奶茶的顏色 = 紅茶色 T0 和牛奶色 M 依「牛奶比例 f」混合（f 隨按住的時間增加，流量 rate／秒）。
     樣品色 = 同一個混合在 f* 的顏色（所以一定調得出來）。顏色差用 CIELAB 的 ΔE（兩個顏色在 Lab 色彩空間的距離，越小越像；ΔE 2.3 左右是專家才看得出的差別），
     畫面上寫成「顏色差 X.XXXX%」，容許 8 → 1（TOL）。
   · 延遲：牛奶倒進去要攪勻——畫面上杯子的顏色是真正顏色的「一階延遲」（時間常數 τ：MIX_LAG，0.3 → 0.6 秒），
     所以看到顏色剛好的時候，其實已經多倒了一點（放手之後顏色還會再變一下）。判定用的是放手那一刻的 f，跟畫面上看到的延遲無關。
   · 同時對比：從第 CONTRAST_FROM 關起，樣品杯和奶茶杯放在不同的背景上（深色木桌 vs 白色托盤），同一個顏色看起來不一樣。
   · 難度（線性）：容許顏色差 8 → 1（TOL）、攪勻延遲 0.3 → 0.6 秒（MIX_LAG）、流量（每秒加幾成牛奶）0.16 → 0.3（RATE）、
     後面的關卡紅茶濃度不同、牛奶換成奶精（流量 ×1.5、顏色偏黃）。
   · 白色漩渦：牛奶倒下去時在杯子上層噴出白色小粒子，繞著漩渦中心轉、慢慢散開、淡出（粒子池、水波紋擺動、切線力、阻尼，
     改寫自 flower-moon 專案的 touchInk.js 粒子特效）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'milktea'：選單、成績、存檔都靠它；樣式在 css/games/reaction_milktea.css，裡面的 class 名稱一律以 milktea- 開頭。 */
    'use strict';

    var ID = 'milktea';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TOL = [8, 1];                           /* 容許的顏色差（ΔE）：第 1 關 → 到頂 */
    var MIX_LAG = [0.3, 0.6];                   /* 攪勻的延遲（秒，一階延遲的時間常數）：第 1 關 → 到頂 */
    var RATE = [0.16, 0.30];                    /* 流量：每秒多加幾成牛奶（f 的增加速度）：第 1 關 → 到頂 */
    var F_TARGET = [0.22, 0.72];                /* 樣品杯的牛奶比例 f* 範圍 */
    var T_RANGE = [1.2, 3.8];                   /* 按住多久到目標（秒）的範圍：太短按不準、太長無聊 */
    var CONTRAST_FROM = 4;                      /* 第幾關起樣品杯與奶茶杯的背景不同（同時對比） */
    var CREAMER_FROM = 8, CREAMER_P = 0.5;      /* 第幾關起牛奶可能換成奶精、機率 */
    var CREAMER_RATE = 1.5;                     /* 奶精的流量倍率 */
    var TIME_S = 20;                            /* 每關限時（秒）：免得一直不按 */
    var SETTLE_LAGS = 3;                        /* 放手後等幾倍的延遲時間才揭曉（顏色穩定了才比） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var SWIRL_MAX = 260;                        /* 白色漩渦的粒子池上限 */
    var MILK = [250, 246, 234];                 /* 牛奶的顏色（RGB） */
    var CREAMER = [252, 244, 218];              /* 奶精的顏色（偏黃） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function tolFor(level) { return Math.round(ramp(level, TOL) * 100) / 100; }  /* Math.round：四捨五入成整數 */
    function lagFor(level) { return Math.round(ramp(level, MIX_LAG) * 1000) / 1000; }
    function rateFor(level) { return ramp(level, RATE); }
    function timeMs() { return TIME_S * 1000; }
    /* sRGB（0～255）→ CIELAB（D65）：顏色差要在這個空間算才接近人眼的感覺 */
    function rgbToLab(c) {
        function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
        var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b, z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
        function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
        var fx = f(x), fy = f(y), fz = f(z);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    }
    /* 兩個顏色的差（ΔE76＝Lab 空間的歐氏距離） */
    function deltaE(c1, c2) {
        var a = rgbToLab(c1), b = rgbToLab(c2);
        return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]));  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
    }
    /* 紅茶 T0 和牛奶 M 依牛奶比例 f（0～1）混合 */
    function mixColor(t0, m, f) { return [t0[0] + (m[0] - t0[0]) * f, t0[1] + (m[1] - t0[1]) * f, t0[2] + (m[2] - t0[2]) * f]; }
    /* 一階延遲：現在的顏色 cur 往目標 target 靠近，時間常數 tau 秒，這一步 dt 秒 */
    function lagStep(cur, target, dt, tau) {
        var k = 1 - Math.exp(-dt / Math.max(tau, 1e-6));
        return [cur[0] + (target[0] - cur[0]) * k, cur[1] + (target[1] - cur[1]) * k, cur[2] + (target[2] - cur[2]) * k];
    }
    function css(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
    function hslToRgb(hh, s, l) {
        s /= 100; l /= 100; var k = function (n) { return (n + hh / 30) % 12; }, a = s * Math.min(l, 1 - l), f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
        return [255 * f(0), 255 * f(8), 255 * f(4)];
    }
    /* 出一關：{ t0（紅茶色）, milk（牛奶或奶精的顏色）, creamer, rate, tau, fTarget, sample（樣品色）, contrast（兩杯背景不同）, bgSample, bgTea（'wood'｜'tray'）, tol, tStar（按多久到目標）, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var creamer = level >= CREAMER_FROM && rand() < CREAMER_P, milk = creamer ? CREAMER : MILK;
        var t0 = hslToRgb(kit.randFloat(14, 30, rand), kit.randFloat(55, 75, rand), kit.randFloat(20, 36, rand));          /* 紅茶：深紅褐色，濃度（亮度）每關不同 */
        var fT = kit.randFloat(F_TARGET[0], F_TARGET[1], rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        var rate = rateFor(level) * (creamer ? CREAMER_RATE : 1) * kit.randFloat(0.9, 1.1, rand);
        var tStar = fT / rate;
        if (tStar < T_RANGE[0]) rate = fT / T_RANGE[0]; else if (tStar > T_RANGE[1]) rate = fT / T_RANGE[1];
        tStar = fT / rate;
        var contrast = level >= CONTRAST_FROM, bgS = 'tray', bgT = 'tray';
        if (contrast) { bgS = rand() < 0.5 ? 'wood' : 'tray'; bgT = bgS === 'wood' ? 'tray' : 'wood'; }
        return { t0: t0, milk: milk, creamer: creamer, rate: rate, tau: lagFor(level), fTarget: fT, sample: mixColor(t0, milk, fT), contrast: contrast, bgSample: bgS, bgTea: bgT, tol: tolFor(level), tStar: tStar, level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '調飲大師！';
        if (n >= 12) return '眼力很準！';
        if (n >= 7) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看到快一樣就要放手，因為牛奶還在攪勻！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'milktea-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 杯子外形（SVG path）：上寬下窄的梯形，下面兩個圓角；w＝上寬、wb＝下寬、hh＝高、liquidTop＝液面離杯口的距離 */
    function cupPath(w, wb, hh, top) {
        var dx = (w - wb) / 2, y0 = top, xl = dx * (y0 / hh), xr = w - xl, r = 14;
        return 'M' + xl.toFixed(1) + ',' + y0 + ' L' + xr.toFixed(1) + ',' + y0 + ' L' + (w - dx - r * 0.3).toFixed(1) + ',' + (hh - r) + ' Q' + (w - dx).toFixed(1) + ',' + hh + ' ' + (w - dx - r).toFixed(1) + ',' + hh + ' L' + (dx + r).toFixed(1) + ',' + hh + ' Q' + dx.toFixed(1) + ',' + hh + ' ' + (dx + r * 0.3).toFixed(1) + ',' + (hh - r) + ' Z';
    }

    /* 白色漩渦：粒子池（改寫自 touchInk.js 的粒子物理）。drawIn(ctx, w, h)：在這個畫布上畫；spawn(x, y, n)：在 (x, y) 噴 n 顆；step(dt)：前進 dt 秒 */
    function makeSwirl(vx, vy) {
        var pool = [], i, cursor = 0, alive = 0;
        for (i = 0; i < SWIRL_MAX; i++) pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, size: 0, life: 0, maxLife: 0, r: 0, g: 0, b: 0, phase: 0, freq: 0, amp: 0, isLine: false });
        var P = { GRAVITY: 30, DRAG: 0.25, SWAY: [3, 7], SWIRL: 26, RADIUS: 95, LIFE: [0.8, 2.2], SIZE: [1.5, 4.5], LINE_RATIO: 0.4, LINE_SCALE: 5 };
        return {
            alive: function () { return alive; },
            spawn: function (x, y, n, col) {
                for (var k = 0; k < n; k++) {
                    var p;
                    if (alive < SWIRL_MAX) { do { p = pool[cursor]; cursor = (cursor + 1) % SWIRL_MAX; } while (p.alive); alive++; } else { p = pool[cursor]; cursor = (cursor + 1) % SWIRL_MAX; }
                    p.alive = true; p.x = x + (Math.random() - 0.5) * 16; p.y = y + (Math.random() - 0.5) * 8;
                    p.vx = (Math.random() - 0.5) * 50; p.vy = 30 + Math.random() * 40;
                    p.size = P.SIZE[0] + Math.random() * (P.SIZE[1] - P.SIZE[0]);
                    p.maxLife = P.LIFE[0] + Math.random() * (P.LIFE[1] - P.LIFE[0]); p.life = p.maxLife;
                    p.r = Math.min(255, col[0] * (0.94 + Math.random() * 0.1)); p.g = Math.min(255, col[1] * (0.94 + Math.random() * 0.1)); p.b = Math.min(255, col[2] * (0.94 + Math.random() * 0.1));
                    p.isLine = Math.random() < P.LINE_RATIO;
                    p.phase = Math.random() * 6.2832; p.freq = 1.5 + Math.random() * 2.5; p.amp = P.SWAY[0] + Math.random() * (P.SWAY[1] - P.SWAY[0]);
                }
            },
            step: function (dt, time) {
                var dragK = Math.exp(Math.log(P.DRAG) * dt);
                for (var k = 0; k < SWIRL_MAX; k++) {
                    var p = pool[k]; if (!p.alive) continue;
                    p.life -= dt; if (p.life <= 0) { p.alive = false; alive--; continue; }
                    var dx = p.x - vx, dy = p.y - vy, d2 = dx * dx + dy * dy;
                    if (d2 < P.RADIUS * P.RADIUS && d2 > 1) {                              /* 繞著漩渦中心的切線力（越靠近越強） */
                        var d = Math.sqrt(d2), fall = 1 - d / P.RADIUS;
                        p.vx += (-dy / d) * P.SWIRL * fall * dt * 6; p.vy += (dx / d) * P.SWIRL * fall * dt * 6;
                    }
                    p.vx += Math.sin(time * p.freq + p.phase) * p.amp * dt * 3;             /* 水波紋擺動 */
                    p.vy += P.GRAVITY * dt;
                    p.vx *= dragK; p.vy *= dragK;
                    p.x += p.vx * dt; p.y += p.vy * dt;
                }
            },
            draw: function (ctx) {
                for (var k = 0; k < SWIRL_MAX; k++) {
                    var p = pool[k]; if (!p.alive) continue;
                    var lr = p.life / p.maxLife, alpha = Math.pow(lr, 0.8) * 0.8, size = p.size * (1 + (1 - lr) * 1.3);   /* 慢慢散開：越舊越大、越淡 */
                    ctx.fillStyle = ctx.strokeStyle = 'rgba(' + (p.r | 0) + ',' + (p.g | 0) + ',' + (p.b | 0) + ',' + alpha.toFixed(3) + ')';
                    if (p.isLine) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.016 * P.LINE_SCALE, p.y - p.vy * 0.016 * P.LINE_SCALE); ctx.lineWidth = size; ctx.stroke(); }
                    else { ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, 6.2832); ctx.fill(); }
                }
            }
        };
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[奶茶調色] 第 ' + level + ' 關：' + (q.creamer ? '奶精' : '牛奶') + '，目標牛奶比例 ' + q.fTarget.toFixed(3) + '（流量 ' + q.rate.toFixed(3) + '／秒，約按 ' + q.tStar.toFixed(2) + ' 秒），攪勻延遲 ' + q.tau + ' 秒，容許 ΔE ' + q.tol + (q.contrast ? '；背景：樣品在' + q.bgSample + '、奶茶在' + q.bgTea : ''));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'milktea-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        field.appendChild(h('div', { 'class': 'qz-note milktea-tip', text: '按住倒牛奶，兩杯一樣顏色就放手' }));
        var pw = Math.floor((W - 120) / 2), ph = 330, py = 56, cw = 124, cwb = 92, chh = 200;  /* Math.floor：無條件捨去成整數 */
        function panel(x, bg, title) {
            var p = h('div', { 'class': 'milktea-panel milktea-panel--' + bg }), cap = h('div', { 'class': 'milktea-cap', text: title });
            p.style.cssText = 'left:' + x + 'px;top:' + py + 'px;width:' + pw + 'px;height:' + ph + 'px;';
            field.appendChild(p); field.appendChild(cap); cap.style.left = x + 'px'; cap.style.width = pw + 'px'; cap.style.top = (py + ph + 6) + 'px';
            return p;
        }
        var xL = 24, xR = W - 24 - pw;
        var pL = panel(xL, q.bgSample, '客人點的'), pR = panel(xR, q.bgTea, '你的奶茶');
        /* 杯子（SVG）：液面離杯口 24px；樣品杯是滿的、奶茶杯一開始是純紅茶 */
        function cup(parent, color, cx) {
            var svg = kit.svg('svg', { 'class': 'milktea-cup', viewBox: '0 0 ' + cw + ' ' + chh, width: cw, height: chh }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
            svg.style.cssText = 'left:' + (cx - cw / 2) + 'px;top:' + (ph - chh - 22) + 'px;';
            var path = cupPath(cw, cwb, chh, 24);
            var liquid = kit.svg('path', { 'class': 'milktea-liquid', d: path }, svg); liquid.style.fill = css(color);
            kit.svg('path', { 'class': 'milktea-glass', d: cupPath(cw, cwb, chh, 0) }, svg);
            return { svg: svg, liquid: liquid };
        }
        var cupL = cup(pL, q.sample, pw / 2), cupR = cup(pR, q.t0, pw / 2);
        /* 漩渦畫布：蓋在奶茶杯上，用杯子的液面形狀剪裁 */
        var cv = h('canvas', { 'class': 'milktea-swirl' });
        cv.width = cw; cv.height = chh; cv.style.cssText = 'left:' + (pw / 2 - cw / 2) + 'px;top:' + (ph - chh - 22) + 'px;width:' + cw + 'px;height:' + chh + 'px;';
        pR.appendChild(cv);
        var cctx = cv.getContext('2d'), swirl = makeSwirl(cw / 2, 80);
        /* 牛奶壺：奶茶杯上方，倒的時候傾斜、噴出一條白色細線到液面 */
        var jug = h('div', { 'class': 'milktea-jug' });
        jug.style.cssText = 'left:' + (pw / 2 - 30) + 'px;top:' + (ph - chh - 22 - 92) + 'px;';
        jug.appendChild(h('div', { 'class': 'milktea-jug__body' })); jug.appendChild(h('div', { 'class': 'milktea-jug__lip' }));
        pR.appendChild(jug);
        var stream = h('div', { 'class': 'milktea-stream' });
        stream.style.cssText = 'left:' + (pw / 2 - 3) + 'px;top:' + (ph - chh - 22 - 30) + 'px;height:' + (30 + 24 + 4) + 'px;';
        pR.appendChild(stream);
        var info = h('div', { 'class': 'qz-note milktea-info', text: '' });
        info.style.top = (py + ph + 44) + 'px';
        field.appendChild(info);
        var btn = h('div', { 'class': 'milktea-btn' }, [h('div', { 'class': 'milktea-btn__text', text: '按住倒牛奶' })]);
        field.appendChild(btn);

        var f = 0, shownColor = q.t0.slice(), pouring = false, done = false, loop = null, ctl = null, tHold = 0;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        api.timer(timeMs(), function () { release(); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('milktea.hint')) kit.hintOn(stage, btn, { mode: 'hold', delay: 700, text: '按住倒牛奶，一樣顏色就放手' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        ctl = kit.hold(btn, {
            down: function () { if (done || api.over) return; pouring = true; btn.classList.add('milktea-btn--on'); jug.classList.add('milktea-jug--pour'); stream.classList.add('milktea-stream--on'); Sfx.play('click'); },  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            up: function () { if (pouring) release(); }
        });
        /* 每個畫格：f 增加（按住時）、顏色延遲地跟上、漩渦粒子前進並重畫（放手後漩渦繼續散開，直到粒子消失） */
        loop = api.my.loop(function (now, dt) {         /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!cv.isConnected) return false;                                                        /* 換關了：停止 */
            var d = Math.min(dt, 50) / 1000;
            if (pouring) {
                f = Math.min(1, f + q.rate * d);
                swirl.spawn(cw / 2, 26, 3, q.milk);
                if (f >= 1) release();
            }
            shownColor = lagStep(shownColor, mixColor(q.t0, q.milk, f), d, q.tau);
            cupR.liquid.style.fill = css(shownColor);
            swirl.step(d, now / 1000);
            cctx.clearRect(0, 0, cw, chh); cctx.save();
            var cp = new Path2D(cupPath(cw, cwb, chh, 24)); cctx.clip(cp); swirl.draw(cctx); cctx.restore();
        });
        function release() {
            if (done || api.over) return;
            done = true; pouring = false;
            btn.classList.remove('milktea-btn--on'); jug.classList.remove('milktea-jug--pour'); stream.classList.remove('milktea-stream--on');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (ctl) ctl.destroy();
            var finalColor = mixColor(q.t0, q.milk, f), de = deltaE(finalColor, q.sample), ok = de <= q.tol;
            var settleMs = Math.round(q.tau * 1000 * SETTLE_LAGS) + 200;
            info.textContent = '顏色還在攪勻……';              /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            api.after(settleMs, function () {           /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                /* 兩杯靠攏並排，背景一起變成中性色（不再有同時對比的錯覺） */
                pL.classList.add('milktea-panel--join'); pR.classList.add('milktea-panel--join'); field.classList.add('milktea-field--join');
                pL.style.left = (W / 2 - pw) + 'px'; pR.style.left = (W / 2) + 'px';                              /* 兩杯（連同背景）往中間靠攏 */
                api.after(750, function () {
                    var word = f < q.fTarget ? '牛奶倒太少了' : '牛奶倒太多了';
                    info.textContent = '顏色差 ' + de.toFixed(4) + '%' + (ok ? '，一樣了！' : '，' + word + '（要在 ' + q.tol + '% 內）');
                    kit.flash(stage, ok, api.my);       /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                    if (ok) { api.pass({ delay: 1700 }); return; }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                    api.fail({ delay: 2800, lines: ['顏色差 ' + de.toFixed(4) + '%（要在 ' + q.tol + '% 內）', word + '：你倒了 ' + (f * 100).toFixed(4) + '% 的牛奶，樣品是 ' + (q.fTarget * 100).toFixed(4) + '%'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                });
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { f = q.fTarget; release(); };
        api.wrong = function () { f = Math.max(0, q.fTarget - 0.3); release(); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '奶茶調色',
        rule: '左邊是客人點的「理想奶茶」，右邊是一杯純紅茶。**按住牛奶壺倒牛奶，奶茶的顏色會慢慢變淡，放手就停**。要讓兩杯顏色一樣，在容許範圍內才過關。小心：**牛奶倒進去要一點時間才會攪勻**，所以看到顏色剛好時，其實已經多倒了一點，要**提早放手**！後面的樣品杯會放在不同顏色的背景上，牛奶還會換成奶精。越後面，容許的顏色差越小！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            tolFor: tolFor, lagFor: lagFor, rateFor: rateFor, timeMs: timeMs, rgbToLab: rgbToLab, deltaE: deltaE, mixColor: mixColor, lagStep: lagStep, css: css, hslToRgb: hslToRgb, makeLevel: makeLevel, cupPath: cupPath, makeSwirl: makeSwirl, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TOL: TOL, MIX_LAG: MIX_LAG, RATE: RATE, F_TARGET: F_TARGET, T_RANGE: T_RANGE, CONTRAST_FROM: CONTRAST_FROM, CREAMER_FROM: CREAMER_FROM, CREAMER_RATE: CREAMER_RATE, TIME_S: TIME_S, SETTLE_LAGS: SETTLE_LAGS, MILK: MILK, CREAMER: CREAMER, MAX_LEVEL: MAX_LEVEL, SWIRL_MAX: SWIRL_MAX
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
