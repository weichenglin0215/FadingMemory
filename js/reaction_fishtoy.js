/* ═══════════════════════════════════════════════════════════════════
   reaction_fishtoy.js — 秒反應・釣魚玩具（企劃 373）
   樣式：css/games/reaction_fishtoy.css（這款專屬的 class 一律以「fishtoy-」開頭；共用元件在 css/reaction_common.css）
   小時候的釣魚玩具：一個圓形的池塘在轉，塑膠魚的嘴巴一張一合。**看準時機點一下放下釣竿**——釣竿要 0.4 秒才會落到水面，
   落下去的那一刻，**要剛好有「指定顏色」的魚、嘴巴張開著，經過釣竿正下方**，才釣得起來。每關只能放一次釣竿。
   釣空、魚嘴是閉著的、或釣到別種顏色的魚，都算失敗。
   ───────────────────────────────────────────────────────────────────
   · 池塘與魚（makeLevel）：N 條魚均勻排在圓圈上，整個池塘以 ω（圈／秒）轉動，魚在時間 t 的位置角度 a(t) ＝ ang0 ＋ 360·ω·t。
     釣竿固定在正上方（角度 270°，螢幕座標從 +x 順時針算）。魚的「偏離角」＝ a(t) 和釣竿角度的差（−180°～180°）；
     偏離角 ≤ TOL 度就算「在釣竿正下方」。
   · 魚嘴：每條魚有自己的週期 P（秒）和相位 φ。嘴巴的張開程度（角度 α，0～MAX_OPEN）：把時間換成週期裡的位置 u ＝ ((t＋φ)／P) 取小數，
     以 u＝0.5 為中心、張開的時間占一個週期的 duty；邊緣有一小段漸變（RAMP），所以 α 是平滑的。**α ≥ CATCH_FRAC × MAX_OPEN 才算「嘴巴張開」，咬得到鉤**。
   · 判定（judgeLanding）：釣竿落到水面的那一刻 t（＝點下去的時間 ＋ 0.4 秒）：沒有魚在正下方 → 'empty'；有魚但 α 不夠 → 'closed'
     （差幾度寫出來）；α 夠但顏色不對 → 'wrong'；顏色對 → 'ok'。
   · 保證有解：在 0.9 秒到 TIME_LIMIT 之內，挑一條指定顏色的魚的某一次「經過釣竿正下方」的時間點 t*，把這條魚的相位調成 u(t*) ＝ 0.5（嘴巴在那一刻正中央最張開），
     所以一定存在一段時間（落下的時間點在 t* 附近）能釣到；再用 catchWindow 算出這個窗口有多寬（測試要求 ≥ 0.06 秒）。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：轉速 0.12 → 0.34 圈／秒、魚嘴張開的時間比例 0.5 → 0.22、池塘裡指定顏色的魚 4 → 1 條、釣竿的判定寬度 ±16° → ±9°。
   · 揭曉：慢動作（0.3 倍）重播釣竿落下的那一段，停在落水那一刻，寫出「魚嘴只張開了 X.X°（要 Y.Y°）」、「釣竿下面沒有魚」或「釣到的是 X 色」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'fishtoy'：選單、成績、存檔都靠它；樣式在 css/games/reaction_fishtoy.css，裡面的 class 名稱一律以 fishtoy- 開頭。 */
    'use strict';

    var ID = 'fishtoy';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var OMEGA = [0.12, 0.34];                   /* 池塘的轉速（圈／秒）：第 1 關 → 到頂 */
    var DUTY = [0.5, 0.22];                     /* 魚嘴張開的時間占一個週期的比例：第 1 關 → 到頂 */
    var TARGETS = [4, 1];                       /* 池塘裡「指定顏色」的魚有幾條：第 1 關 → 到頂（四捨五入） */
    var TOL = [16, 9];                          /* 釣竿的判定寬度（度，左右各這麼多）：第 1 關 → 到頂 */
    var FISH_N = 8;                             /* 池塘裡的魚數 */
    var PERIOD = [1.3, 2.6];                    /* 魚嘴開合的週期（秒）範圍，每條魚不同 */
    var RAMP_FRAC = 0.08;                       /* 嘴巴張開／閉上的漸變占一個週期的比例 */
    var CATCH_FRAC = 0.5;                       /* α 要達到最大張開角度的幾成才算「張開」 */
    var MAX_OPEN = 44;                          /* 魚嘴最大張開角度（度） */
    var DROP_S = 0.4;                           /* 釣竿落到水面要多久（使用者企劃：0.4 秒） */
    var TIME_LIMIT = 14;                        /* 限時（秒）：一直沒放釣竿就失敗 */
    var T_MIN = 0.9, T_MAX_FRAC = 0.8;          /* 保證的機會：在 T_MIN 秒到 TIME_LIMIT×T_MAX_FRAC 秒之間 */
    var ROD_ANGLE = 270;                        /* 釣竿在池塘的正上方（螢幕座標角度） */
    var REPLAY_SPEED = 0.3;                     /* 揭曉重播速度 */
    var REPLAY_PRE = 0.25, REPLAY_POST = 0.35;  /* 重播：落下前幾秒開始、落水後多幾秒 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var COLORS = ['紅', '橙', '黃', '綠', '藍', '紫'];    /* 玩具魚的顏色：紅、橙、黃、綠、藍、紫 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function omegaFor(level) { return Math.round(ramp(level, OMEGA) * 10000) / 10000; }  /* Math.round：四捨五入成整數 */
    function dutyFor(level) { return Math.round(ramp(level, DUTY) * 1000) / 1000; }  /* Math.round：四捨五入成整數 */
    function targetsFor(level) { return Math.round(ramp(level, TARGETS)); }
    function tolFor(level) { return Math.round(ramp(level, TOL) * 100) / 100; }
    function wrap180(d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d; }
    function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
    /* 魚 f 在時間 t 的位置角度（度） */
    function angleAt(q, f, t) { return f.ang0 + 360 * q.omega * t; }
    /* 魚 f 在時間 t 離釣竿的偏離角（−180～180） */
    function offsetAt(q, f, t) { return wrap180(angleAt(q, f, t) - ROD_ANGLE); }
    /* 魚 f 在時間 t 的嘴巴張開角度 α（度，0～MAX_OPEN） */
    function mouthAt(q, f, t) {
        var u = (((t + f.phi) / f.P) % 1 + 1) % 1, uc = Math.abs(u - 0.5), half = q.duty / 2, rw = Math.min(RAMP_FRAC, half);  /* Math.abs：取絕對值（去掉負號） */
        return MAX_OPEN * smooth01((half - uc) / rw);
    }
    /* 落水的那一刻 t，釣到了什麼：{ result: 'empty'｜'closed'｜'wrong'｜'ok', fish（釣到／最近的那條的編號，empty 時是最近的）, off（偏離角）, alpha, need（需要的角度）, gap（還差幾度）} */
    function judgeLanding(q, t) {
        var best = -1, bo = 1e9, i;
        for (i = 0; i < q.fish.length; i++) { var o = Math.abs(offsetAt(q, q.fish[i], t)); if (o < bo) { bo = o; best = i; } }  /* Math.abs：取絕對值（去掉負號） */
        var need = CATCH_FRAC * MAX_OPEN;
        if (bo > q.tol) return { result: 'empty', fish: best, off: bo, alpha: mouthAt(q, q.fish[best], t), need: need, gap: bo - q.tol };
        var a = mouthAt(q, q.fish[best], t);
        if (a < need - 1e-9) return { result: 'closed', fish: best, off: bo, alpha: a, need: need, gap: need - a };
        if (q.fish[best].color !== q.target) return { result: 'wrong', fish: best, off: bo, alpha: a, need: need, gap: 0 };
        return { result: 'ok', fish: best, off: bo, alpha: a, need: need, gap: 0 };
    }
    /* 出一關：{ level, omega, duty, tol, N, target（指定顏色編號）, fish（[{ color, ang0, P, phi }]）, guaranteed（{ fish, t }：保證能釣到的那一刻）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var N = FISH_N, omega = omegaFor(level), duty = dutyFor(level), tol = tolFor(level), nt = Math.min(targetsFor(level), N - 1);
        var target = kit.randInt(0, COLORS.length - 1, rand), others = [], c;  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        for (c = 0; c < COLORS.length; c++) if (c !== target) others.push(c);
        var colors = []; for (var i = 0; i < nt; i++) colors.push(target);
        while (colors.length < N) colors.push(kit.pick(others, rand));  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        colors = kit.shuffle(colors, rand);             /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var off = kit.randFloat(0, 360 / N, rand), fish = colors.map(function (col, k) {  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            return { color: col, ang0: Math.round((off + k * 360 / N) * 100) / 100, P: Math.round(kit.randFloat(PERIOD[0], PERIOD[1], rand) * 1000) / 1000, phi: 0 };  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        });
        fish.forEach(function (f) { f.phi = Math.round(kit.randFloat(0, f.P, rand) * 1000) / 1000; });  /* forEach：對陣列的每個元素各做一次 */
        var q = { level: level, omega: omega, duty: duty, tol: tol, N: N, target: target, fish: fish, guaranteed: null };
        /* 保證有解：挑一條指定顏色的魚、它某一次經過釣竿正下方的時間 t*，把相位調成「那一刻嘴巴正中央最張開」 */
        var cand = []; fish.forEach(function (f, k) { if (f.color === target) cand.push(k); });  /* forEach：對陣列的每個元素各做一次 */
        var gi = kit.pick(cand, rand), g = fish[gi], per = 1 / omega, t0 = ((ROD_ANGLE - g.ang0) / (360 * omega)), tmax = TIME_LIMIT * T_MAX_FRAC;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        t0 = ((t0 % per) + per) % per;                                                     /* 第一次經過釣竿的時間（0～一圈的時間） */
        var passes = []; for (var tp = t0; tp <= tmax; tp += per) if (tp >= T_MIN) passes.push(tp);
        if (!passes.length) passes.push(t0 + per * Math.ceil((T_MIN - t0) / per));  /* Math.ceil：無條件進位成整數 */
        var ts = kit.pick(passes, rand); ts = Math.round(ts * 1000) / 1000;
        g.phi = Math.round((((0.5 * g.P - ts) % g.P) + g.P) % g.P * 1000) / 1000;
        q.guaranteed = { fish: gi, t: ts };
        return q;
    }
    /* 保證那次機會的窗口有多寬（秒）：落水時間在 t* 附近，judgeLanding 是 'ok' 的連續範圍（以 1 毫秒取樣）*/
    function catchWindow(q) {
        var ts = q.guaranteed.t, lo = ts, hi = ts, step = 0.001;
        if (judgeLanding(q, ts).result !== 'ok') return 0;
        while (judgeLanding(q, lo - step).result === 'ok' && ts - lo < 2) lo -= step;
        while (judgeLanding(q, hi + step).result === 'ok' && hi - ts < 2) hi += step;
        return hi - lo + step;
    }
    function whyText(r, q) {
        if (r.result === 'ok') return '叮！釣到了' + COLORS[q.target] + '色的魚';
        if (r.result === 'empty') return '釣空了！最近的魚離釣竿 ' + r.off.toFixed(4) + '°（要在 ±' + q.tol.toFixed(4) + '° 內）';
        if (r.result === 'closed') return '魚嘴沒張開！只張了 ' + r.alpha.toFixed(4) + '°，要 ' + r.need.toFixed(4) + '°（差 ' + r.gap.toFixed(4) + '°）';
        return '釣錯顏色！釣到' + COLORS[q.fish[r.fish].color] + '色，要釣' + COLORS[q.target] + '色';
    }
    function replayMs() { return Math.round((REPLAY_PRE + DROP_S + REPLAY_POST) / REPLAY_SPEED * 1000); }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '釣魚王！';
        if (n >= 9) return '看得很準！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '算好 0.4 秒再放釣竿！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'fishtoy-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一條魚（SVG，朝 +x 方向游，身體中心在 (0,0)）：身體、尾巴、眼睛、嘴（兩片嘴唇＋張開的黑洞，用 setMouth 改角度） */
    function drawFish(parent, color) {
        var g = kit.svg('g', { 'class': 'fishtoy-fish' }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('path', { 'class': 'fishtoy-tail fishtoy-c' + color, d: 'M-22,0 L-44,-15 Q-38,0 -44,15 Z' }, g);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('ellipse', { 'class': 'fishtoy-body fishtoy-c' + color, cx: 0, cy: 0, rx: 27, ry: 16 }, g);
        kit.svg('circle', { 'class': 'fishtoy-eye', cx: 12, cy: -6, r: 3.2 }, g);
        var hole = kit.svg('path', { 'class': 'fishtoy-hole', d: '' }, g), up = kit.svg('line', { 'class': 'fishtoy-lip', x1: 25, y1: 0, x2: 25, y2: 0 }, g), lo = kit.svg('line', { 'class': 'fishtoy-lip', x1: 25, y1: 0, x2: 25, y2: 0 }, g);
        return { g: g, hole: hole, up: up, lo: lo };
    }
    function setMouth(fs, a) {
        var r = a * Math.PI / 360, L = 13, ux = 25 + L * Math.cos(r), uy = -L * Math.sin(r), lx = ux, ly = L * Math.sin(r);
        fs.up.setAttribute('x2', ux.toFixed(2)); fs.up.setAttribute('y2', uy.toFixed(2)); fs.lo.setAttribute('x2', lx.toFixed(2)); fs.lo.setAttribute('y2', ly.toFixed(2));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        fs.hole.setAttribute('d', a < 2 ? '' : 'M25,0 L' + ux.toFixed(2) + ',' + uy.toFixed(2) + ' L' + lx.toFixed(2) + ',' + ly.toFixed(2) + ' Z');  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[釣魚玩具] 第 ' + level + ' 關：釣' + COLORS[q.target] + '色的魚（池塘裡 ' + q.fish.filter(function (f) { return f.color === q.target; }).length + ' 條）；轉速 ' + q.omega + ' 圈/秒、嘴巴張開比例 ' + q.duty + '、判定 ±' + q.tol + '°；保證的機會：第 ' + q.guaranteed.t.toFixed(2) + ' 秒（落水時間），窗口 ' + catchWindow(q).toFixed(3) + ' 秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cx = Math.round(W / 2), R = Math.min(W / 2 - 12, 176), cy = Math.round(H * 0.5), rf = Math.round(R * 0.66);
        var field = h('div', { 'class': 'fishtoy-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var goal = h('div', { 'class': 'fishtoy-goal' });
        goal.appendChild(h('span', { 'class': 'fishtoy-goal__t', text: '釣 ' })); goal.appendChild(h('span', { 'class': 'fishtoy-goal__c fishtoy-bg' + q.target, text: COLORS[q.target] + '色' })); goal.appendChild(h('span', { 'class': 'fishtoy-goal__t', text: ' 的魚' }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        field.appendChild(goal);
        var svg = kit.svg('svg', { 'class': 'fishtoy-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, field);
        kit.svg('circle', { 'class': 'fishtoy-pond', cx: cx, cy: cy, r: R }, svg);
        kit.svg('circle', { 'class': 'fishtoy-ring', cx: cx, cy: cy, r: rf }, svg);
        var rod = kit.svg('g', { 'class': 'fishtoy-rodg' }, svg);
        var tipX = cx + 78, tipY = 52, yHome = cy - rf - 118, yLand = cy - rf;
        kit.svg('line', { 'class': 'fishtoy-spot', x1: cx, y1: cy - R - 6, x2: cx, y2: cy - rf + 22 }, svg);                 /* 落水點的指示線 */
        kit.svg('line', { 'class': 'fishtoy-rod', x1: W - 6, y1: 18, x2: tipX, y2: tipY }, rod);
        var line = kit.svg('line', { 'class': 'fishtoy-line', x1: tipX, y1: tipY, x2: cx, y2: yHome }, rod);
        var hook = kit.svg('circle', { 'class': 'fishtoy-hook', cx: cx, cy: yHome, r: 9 }, rod);
        /* 魚（在池塘上轉動；每格影格更新位置和嘴巴） */
        var fishG = kit.svg('g', {}, svg), fs = q.fish.map(function (f) { var d = drawFish(fishG, f.color); return d; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var info = h('div', { 'class': 'qz-note fishtoy-info', text: level === 1 ? '釣竿 0.4 秒才落下：算好再點！' : '算好 0.4 秒，魚嘴張開時落水' }); info.style.top = (cy + R + 6) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '放釣竿', kind: 'primary', cls: 'fishtoy-btn', onTap: function () { drop(); } }], { cols: 1, h: 92, bottom: 12 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        if (level === 1 && kit.once('fishtoy.hint')) kit.hintOn(stage, btn.btns[0], { mode: 'tap', delay: 900, text: '魚嘴張開、到釣竿下才放' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        var phase = 'play', t0 = performance.now(), tDrop = null, tLand = null;  /* performance.now()：高精度的時間（毫秒），計時用 */
        function nowS() { return (performance.now() - t0) / 1000; }  /* performance.now()：高精度的時間（毫秒），計時用 */
        q.nowS = nowS;                                                       /* 給驗證腳本用：目前的關卡時間（秒） */
        /* 畫：在時間 t 的池塘（魚的位置、嘴巴）；釣竿落下的進度 p（0～1） */
        function paint(t) {
            q.fish.forEach(function (f, k) {
                var a = angleAt(q, f, t); fs[k].g.setAttribute('transform', 'translate(' + cx + ',' + cy + ') rotate(' + a.toFixed(2) + ') translate(' + rf + ',0) rotate(90)');
                setMouth(fs[k], mouthAt(q, f, t));
            });
        }
        function paintHook(p) { var y = yHome + (yLand - yHome) * p * p; hook.setAttribute('cy', y.toFixed(1)); line.setAttribute('y2', y.toFixed(1)); }
        paint(0); paintHook(0);
        api.my.loop(function (now) {                    /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (phase === 'end' || !stage.isConnected) return false;
            var t = (now - t0) / 1000; paint(t);
            if (tDrop != null) paintHook(Math.min(1, (t - tDrop) / DROP_S));
        });
        api.timer(TIME_LIMIT * 1000, function () { if (phase === 'play') { phase = 'end'; info.textContent = '時間到！一直沒有放釣竿'; info.classList.add('fishtoy-info--bad'); kit.flash(stage, false, api.my); api.fail({ delay: 2800, lines: ['時間到！一直沒有放釣竿', '要釣的是' + COLORS[q.target] + '色的魚'] }); } });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 放釣竿：點下去的時間 ＋ 0.4 秒＝落水的那一刻，那時才判定 */
        function drop() {
            if (phase !== 'play' || api.over) return;
            phase = 'drop'; tDrop = nowS(); tLand = tDrop + DROP_S; api.stopTimer(); Sfx.play('click');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            btn.btns[0].classList.add('fishtoy-btn--off');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            api.after(Math.round(DROP_S * 1000), function () { land(); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        }
        function land() {
            if (phase !== 'drop') return;
            var r = judgeLanding(q, tLand), why = whyText(r, q);
            phase = 'end'; paint(tLand); paintHook(1);
            info.textContent = why;                     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (r.result === 'ok') {
                Sfx.play('ok'); info.classList.add('fishtoy-info--ok');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                fs[r.fish].g.classList.add('fishtoy-fish--caught');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 2000 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            info.classList.add('fishtoy-info--bad'); kit.flash(stage, false, api.my);  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            replay(r);
            api.fail({ delay: replayMs() + 1800, lines: [why, '要釣的是' + COLORS[q.target] + '色的魚（池塘裡 ' + q.fish.filter(function (f) { return f.color === q.target; }).length + ' 條）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 慢動作重播：從落下前 0.25 秒到落水後 0.35 秒（0.3 倍），最後停在落水的那一刻，標出下面的那條魚 */
        function replay(r) {
            phase = 'replay';
            var r0 = performance.now(), ms = replayMs(), tv0 = tDrop - REPLAY_PRE, tv1 = tLand + REPLAY_POST, ring = null;
            api.my.loop(function (now) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                var pr = Math.min(1, (now - r0) / ms), tv = tv0 + (tv1 - tv0) * pr;
                paint(tv); paintHook(Math.max(0, Math.min(1, (tv - tDrop) / DROP_S)));
                if (tv >= tLand && !ring) { ring = true; fs[r.fish].g.classList.add('fishtoy-fish--focus'); }
                if (pr >= 1) return false;
            });
        }
        /* 驗證用：在「保證的機會」落水的時間放釣竿（solve）／找一個會失敗的時間放（wrong）；只排一次 */
        var armed = false;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (armed || phase !== 'play') return; armed = true; api.after(Math.max(0, Math.round((q.guaranteed.t - DROP_S - nowS()) * 1000)), drop); };  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        api.wrong = function () {
            if (armed || phase !== 'play') return; armed = true;
            var t = nowS() + 0.05; while (judgeLanding(q, t + DROP_S).result === 'ok' && t < TIME_LIMIT) t += 0.02;
            api.after(Math.max(0, Math.round((t - nowS()) * 1000)), drop);
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '釣魚玩具',
        rule: '池塘在轉，塑膠魚的嘴巴一張一合。**看準時機點一下放釣竿**——釣竿要 **0.4 秒**才會落到水面，所以要預判：落水的那一刻，**要剛好有指定顏色的魚、嘴巴張開著，經過釣竿正下方（畫面上方的指示線）**，才釣得起來。每關只能放一次釣竿；釣空、魚嘴閉著、或釣到別的顏色都算失敗。越後面，池塘轉得越快、魚嘴張開的時間越短、指定顏色的魚越少。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            omegaFor: omegaFor, dutyFor: dutyFor, targetsFor: targetsFor, tolFor: tolFor, wrap180: wrap180, smooth01: smooth01, angleAt: angleAt, offsetAt: offsetAt, mouthAt: mouthAt, judgeLanding: judgeLanding, makeLevel: makeLevel, catchWindow: catchWindow, whyText: whyText, replayMs: replayMs, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, OMEGA: OMEGA, DUTY: DUTY, TARGETS: TARGETS, TOL: TOL, FISH_N: FISH_N, PERIOD: PERIOD, RAMP_FRAC: RAMP_FRAC, CATCH_FRAC: CATCH_FRAC, MAX_OPEN: MAX_OPEN, DROP_S: DROP_S, TIME_LIMIT: TIME_LIMIT, T_MIN: T_MIN, T_MAX_FRAC: T_MAX_FRAC, ROD_ANGLE: ROD_ANGLE, REPLAY_SPEED: REPLAY_SPEED, COLORS: COLORS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
