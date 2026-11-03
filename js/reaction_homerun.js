/* ═══════════════════════════════════════════════════════════════════
   reaction_homerun.js — 秒反應・全壘打（企劃 362）
   樣式：css/games/reaction_homerun.css（這款專屬的 class 一律以「homerun-」開頭；共用元件在 css/reaction_common.css）
   從打者後方看投手投球。**球進到好球帶（畫面中央的方框）的那一瞬間，點一下畫面揮棒**；球如果偏出好球帶（壞球）就**不要揮**。
   揮得太早、太晚都打不到；壞球你揮了、好球你沒揮，也都算失敗。每關投一球。
   ───────────────────────────────────────────────────────────────────
   · 球路（makePitch）：每一球有「球種」type 和「最後的位置」F（以好球帶的半寬、半高為單位，好球帶內是 |x|≤1 且 |y|≤1）：
       fast＝速球：直直飛向 F；
       change＝變速球：路徑和速球一樣，但**飛得比較慢**（飛行時間 × CHANGE_X）——投手的出手動作一模一樣，要等；
       curve＝曲球：一開始飛向好球帶裡的一點 S（看起來是好球），**後半段才彎到 F（在好球帶外面）**，所以曲球一定是壞球。
     壞球的位置：離好球帶邊緣至少 BALL_DIST（單位同上）；難度越高，壞球離邊緣越近。
   · 判定（judgeSwing）：從投手出手算起 tSwing 秒點下去：
       還沒出手就揮（tSwing < 0）→ 'pre'；球是壞球 → 'ball'；好球而且 |tSwing − 飛行時間| ≤ HIT_WIN → 'hit'（打到、全壘打）；
       否則 'early'（早了）或 'late'（晚了），錯多少秒寫出來（X.XXXX 秒）。
       球飛過去了沒揮：好球 → 失敗（「好球！你沒有揮棒」）、壞球 → 過關（「壞球！你忍住了」）。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：速球飛行時間 1.7 → 0.6 秒、打擊窗口 ±0.13 → ±0.05 秒、壞球機率 0.3 → 0.5、
     壞球離邊緣 1.0 → 0.18、變速球機率 0 → 0.4、曲球（壞球裡）的比例 0 → 0.7。
   · 球的畫法：從投手的位置（V）飛向好球帶（C）；位置用 e(u)＝u 的 1.5 次方（越近越快），球的半徑跟著 e(u) 變大（近大遠小）；留幾格殘影。
   · 揭曉：失敗時用慢動作重播球路（0.35 倍），畫出球最後的位置和好球帶，並寫出早了／晚了幾秒或「這是壞球」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'homerun'：選單、成績、存檔都靠它；樣式在 css/games/reaction_homerun.css，裡面的 class 名稱一律以 homerun- 開頭。 */
    'use strict';

    var ID = 'homerun';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var FLY_S = [1.7, 0.6];                     /* 速球從出手到好球帶的時間（秒）：第 1 關 → 到頂 */
    var CHANGE_X = 1.5;                         /* 變速球的飛行時間是速球的幾倍 */
    var HIT_WIN = [0.13, 0.05];                 /* 打擊窗口（秒，到達時間的前後各這麼多）：第 1 關 → 到頂 */
    var P_BALL = [0.3, 0.5];                    /* 壞球的機率：第 1 關 → 到頂 */
    var BALL_DIST = [1.0, 0.18];                /* 壞球離好球帶邊緣的最短距離（好球帶半寬為單位）：第 1 關 → 到頂 */
    var BALL_DIST_MAX = 0.9;                    /* 壞球離邊緣最多再遠這麼多（加在最短距離上） */
    var P_CHANGE = [0, 0.4];                    /* 變速球的機率：第 1 關 → 到頂 */
    var P_CURVE = [0, 0.7];                     /* 壞球裡面是「曲球」的比例：第 1 關 → 到頂 */
    var STRIKE_EDGE = 0.85;                     /* 好球的落點在好球帶中央這麼大的範圍內（避免剛好壓線的爭議） */
    var WINDUP_MS = 900;                        /* 投手舉臂到出手的時間（每一球都一樣） */
    var AFTER_MS = 280;                         /* 球到了以後再等多久沒揮才算「沒揮」 */
    var REPLAY_SPEED = 0.35;                    /* 揭曉重播的速度 */
    var REPLAY_MIN_MS = 2000, REPLAY_MAX_MS = 4600;  /* REPLAY_MIN_MS／REPLAY_MAX_MS：揭曉時球飛行的重播長度最短 2000、最長 4600 毫秒 */
    var SWING_MS = 140;                         /* 揮棒動畫時間 */
    var CURVE_POW = 3;                          /* 曲球偏移的曲線：偏移量 ＝ (F − S) × u^CURVE_POW（越後面才彎得越明顯） */
    var BALL_R = [5, 22];                       /* 球的半徑（px）：遠 → 近 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var ZONE_W = 0.34, ZONE_ASPECT = 1.15;      /* 好球帶的寬占畫面寬度的比例、高÷寬 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function flyFor(level) { return Math.round(ramp(level, FLY_S) * 1000) / 1000; }  /* Math.round：四捨五入成整數 */
    function winFor(level) { return Math.round(ramp(level, HIT_WIN) * 10000) / 10000; }
    function pBallFor(level) { return Math.round(ramp(level, P_BALL) * 1000) / 1000; }
    function ballDistFor(level) { return Math.round(ramp(level, BALL_DIST) * 1000) / 1000; }
    function pChangeFor(level) { return Math.round(ramp(level, P_CHANGE) * 1000) / 1000; }
    function pCurveFor(level) { return Math.round(ramp(level, P_CURVE) * 1000) / 1000; }
    function inZone(p) { return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1; }  /* Math.abs：取絕對值（去掉負號） */
    /* 好球帶外的一點：離邊緣 d（好球帶單位，以 max(|x|,|y|) − 1 計），方向隨機 */
    function outsidePoint(d, rand) {
        var a = kit.randFloat(0, Math.PI * 2, rand), c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s)), r = (1 + d) / m;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        return { x: Math.round(c * r * 1000) / 1000, y: Math.round(s * r * 1000) / 1000 };
    }
    /* 出一球：{ level, type（'fast'｜'change'｜'curve'）, strike（最後是不是好球）, F（最後位置）, S（曲球一開始飛向的點；其他球等於 F）,
                 tFly（出手到好球帶的秒數）, win（打擊窗口 ±秒）, dist（壞球離邊緣多遠；好球為 0）} */
    function makePitch(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var isBall = rand() < pBallFor(level), type = 'fast', F, S, dist = 0;
        if (isBall) {
            dist = Math.round((ballDistFor(level) + kit.randFloat(0, BALL_DIST_MAX, rand)) * 1000) / 1000;
            F = outsidePoint(dist, rand);
            if (rand() < pCurveFor(level)) {
                type = 'curve';
                S = { x: Math.round(kit.randFloat(-STRIKE_EDGE, STRIKE_EDGE, rand) * 1000) / 1000, y: Math.round(kit.randFloat(-STRIKE_EDGE, STRIKE_EDGE, rand) * 1000) / 1000 };
            }
        } else F = { x: Math.round(kit.randFloat(-STRIKE_EDGE, STRIKE_EDGE, rand) * 1000) / 1000, y: Math.round(kit.randFloat(-STRIKE_EDGE, STRIKE_EDGE, rand) * 1000) / 1000 };
        if (type !== 'curve') { if (rand() < pChangeFor(level)) type = 'change'; S = F; }
        var tFly = flyFor(level) * (type === 'change' ? CHANGE_X : 1);
        return { level: level, type: type, strike: !isBall, F: F, S: S, tFly: Math.round(tFly * 1000) / 1000, win: winFor(level), dist: dist };
    }
    /* 球的「目標位置」（好球帶單位）在飛行進度 u（0～1）時：直球＝F；曲球＝S ＋ (F − S) × u^3（後半段才彎） */
    function targetAt(p, u) {
        if (p.type !== 'curve') return { x: p.F.x, y: p.F.y };
        var g = Math.pow(Math.max(0, Math.min(1.2, u)), CURVE_POW);
        return { x: p.S.x + (p.F.x - p.S.x) * g, y: p.S.y + (p.F.y - p.S.y) * g };
    }
    /* 進度 u 的視覺位置：越近越快（u 的 1.5 次方） */
    function easeU(u) { return Math.pow(Math.max(0, u), 1.5); }
    /* 球在畫面上的位置與半徑：geom ＝ { V（出手的位置）, C（好球帶中心）, hw、hh（好球帶半寬、半高 px）} */
    function ballAt(p, u, geom) {
        var t = targetAt(p, u), e = easeU(u), tx = geom.C.x + t.x * geom.hw, ty = geom.C.y + t.y * geom.hh;
        return { x: geom.V.x + (tx - geom.V.x) * e, y: geom.V.y + (ty - geom.V.y) * e, r: BALL_R[0] + (BALL_R[1] - BALL_R[0]) * Math.min(1.15, e) };
    }
    /* 判定揮棒：tSwing＝從出手算起第幾秒點下去 → { result: 'pre'｜'ball'｜'hit'｜'early'｜'late', err（點的時間 − 到達時間，秒） } */
    function judgeSwing(p, tSwing) {
        var err = tSwing - p.tFly;
        if (tSwing < 0) return { result: 'pre', err: err };
        if (!p.strike) return { result: 'ball', err: err };
        if (Math.abs(err) <= p.win + 1e-9) return { result: 'hit', err: err };
        return { result: err < 0 ? 'early' : 'late', err: err };
    }
    function fmt4(v) { return Math.abs(v).toFixed(4); }
    function whyText(r, p) {
        if (r.result === 'hit') return '全壘打！打擊誤差 ' + (r.err < 0 ? '早了 ' : '晚了 ') + fmt4(r.err) + ' 秒（窗口 ±' + fmt4(p.win) + ' 秒）';
        if (r.result === 'early') return '早了 ' + fmt4(r.err) + ' 秒！要在球到好球帶的瞬間揮（窗口 ±' + fmt4(p.win) + ' 秒）';
        if (r.result === 'late') return '晚了 ' + fmt4(r.err) + ' 秒！要在球到好球帶的瞬間揮（窗口 ±' + fmt4(p.win) + ' 秒）';
        if (r.result === 'ball') return '這是壞球！' + (p.type === 'curve' ? '曲球一開始像好球，最後彎出好球帶了' : '球偏出好球帶了') + '，不要揮';
        if (r.result === 'pre') return '球還沒出手你就揮棒了！';
        if (r.result === 'strike') return '好球！球進了好球帶，你沒有揮棒';
        return '壞球！你忍住了，沒有揮棒';
    }
    /* 重播要花多久（毫秒）：飛行時間 ÷ 重播速度，夾在 REPLAY_MIN_MS～REPLAY_MAX_MS */
    function replayMs(p) { return Math.round(Math.max(REPLAY_MIN_MS, Math.min(REPLAY_MAX_MS, p.tFly / REPLAY_SPEED * 1000))); }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 18) return '強打者！';
        if (n >= 10) return '好眼力！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '好球才揮、壞球不揮！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'homerun-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 投手（SVG）：帽子、頭、身體、一隻會轉的手臂（手上有球）。手臂的角度由 CSS 的 transform 轉 */
    function drawPitcher(parent) {
        var svg = kit.svg('svg', { 'class': 'homerun-pitcher', viewBox: '0 0 120 150', width: 96, height: 120 }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('rect', { 'class': 'homerun-leg', x: 44, y: 98, width: 14, height: 46, rx: 5 }, svg);
        kit.svg('rect', { 'class': 'homerun-leg', x: 64, y: 98, width: 14, height: 46, rx: 5 }, svg);
        kit.svg('rect', { 'class': 'homerun-body', x: 38, y: 52, width: 46, height: 52, rx: 12 }, svg);
        kit.svg('circle', { 'class': 'homerun-head', cx: 61, cy: 36, r: 16 }, svg);
        kit.svg('path', { 'class': 'homerun-cap', d: 'M44,34 Q44,16 61,16 Q78,16 78,34 Z' }, svg);
        kit.svg('rect', { 'class': 'homerun-cap', x: 60, y: 30, width: 28, height: 6, rx: 3 }, svg);
        var arm = kit.svg('g', { 'class': 'homerun-arm', transform: 'translate(78,60)' }, svg);
        var inner = kit.svg('g', { 'class': 'homerun-arm__in' }, arm);
        kit.svg('rect', { 'class': 'homerun-armrect', x: -7, y: -7, width: 44, height: 14, rx: 7 }, inner);
        var ball = kit.svg('circle', { 'class': 'homerun-handball', cx: 40, cy: 0, r: 8 }, inner);
        return { svg: svg, arm: inner, ball: ball };
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var p = makePitch(level, api.rand);
        api.info = p;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[全壘打] 第 ' + level + ' 關：' + (p.strike ? '好球' : '壞球（離邊緣 ' + p.dist.toFixed(2) + '）') + '、' + { fast: '速球', change: '變速球', curve: '曲球' }[p.type] + '；飛行 ' + p.tFly + ' 秒、窗口 ±' + p.win + ' 秒；落點 (' + p.F.x + ', ' + p.F.y + ')' + (p.type === 'curve' ? '，一開始飛向 (' + p.S.x + ', ' + p.S.y + ')' : ''));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var zw = Math.round(W * ZONE_W), zh = Math.round(zw * ZONE_ASPECT), geom = { V: { x: W / 2, y: Math.round(H * 0.2) + 36 }, C: { x: W / 2, y: Math.round(H * 0.6) }, hw: zw / 2, hh: zh / 2 };
        var field = h('div', { 'class': 'homerun-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note homerun-tip', text: level === 1 ? '球到好球帶的瞬間，點一下揮棒！' : '好球才揮，壞球不揮' });
        field.appendChild(tip);
        /* 球場：上面是觀眾席、下面是草地；好球帶是畫面中央的方框；本壘板在好球帶下面 */
        var crowd = h('div', { 'class': 'homerun-crowd' }); field.appendChild(crowd);
        var grass = h('div', { 'class': 'homerun-grass' }); grass.style.top = Math.round(H * 0.34) + 'px'; field.appendChild(grass);
        var mound = h('div', { 'class': 'homerun-mound' }); mound.style.cssText = 'left:' + Math.round(W / 2 - 60) + 'px;top:' + (geom.V.y + 38) + 'px;'; field.appendChild(mound);
        var zone = h('div', { 'class': 'homerun-zone' }); zone.style.cssText = 'left:' + Math.round(geom.C.x - geom.hw) + 'px;top:' + Math.round(geom.C.y - geom.hh) + 'px;width:' + zw + 'px;height:' + zh + 'px;'; field.appendChild(zone);
        var plate = h('div', { 'class': 'homerun-plate' }); plate.style.cssText = 'left:' + Math.round(geom.C.x - 36) + 'px;top:' + Math.round(geom.C.y + geom.hh + 20) + 'px;'; field.appendChild(plate);
        var pit = drawPitcher(field); pit.svg.style.cssText = 'left:' + Math.round(W / 2 - 48) + 'px;top:' + (geom.V.y - 78) + 'px;';
        /* 球與殘影 */
        var trail = []; for (var i = 0; i < 6; i++) { var tr = h('div', { 'class': 'homerun-trail' }); tr.style.display = 'none'; field.appendChild(tr); trail.push(tr); }
        var ballEl = h('div', { 'class': 'homerun-ball' }); ballEl.style.display = 'none'; field.appendChild(ballEl);
        /* 球棒（從打者後方看：在畫面下方，揮棒時繞著底部轉） */
        var bat = h('div', { 'class': 'homerun-bat' }); bat.style.cssText = 'left:' + Math.round(W * 0.5 - 18) + 'px;top:' + Math.round(H - 150) + 'px;'; bat.appendChild(h('div', { 'class': 'homerun-bat__in' })); field.appendChild(bat);
        var info = h('div', { 'class': 'qz-note homerun-info', text: '' }); field.appendChild(info);
        if (level === 1 && kit.once('homerun.hint')) kit.hintOn(stage, null, { mode: 'tap', x: geom.C.x, y: geom.C.y + geom.hh + 70, delay: 700, text: '球到框框裡，點一下' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        var phase = 'windup', t0 = performance.now(), tRel = t0 + WINDUP_MS, swingT = null, hist = [];  /* performance.now()：高精度的時間（毫秒），計時用 */
        function setBall(el, b, a) { el.style.cssText = 'display:block;left:' + (b.x - b.r).toFixed(1) + 'px;top:' + (b.y - b.r).toFixed(1) + 'px;width:' + (2 * b.r).toFixed(1) + 'px;height:' + (2 * b.r).toFixed(1) + 'px;' + (a != null ? 'opacity:' + a + ';' : ''); }
        function drawBall(u, withTrail) {
            var b = ballAt(p, u, geom); setBall(ballEl, b);
            if (withTrail) { hist.push(b); if (hist.length > trail.length + 2) hist.shift(); trail.forEach(function (el, k) { var hb = hist[hist.length - 2 - k]; if (hb) setBall(el, hb, (0.55 - 0.08 * k).toFixed(2)); else el.style.display = 'none'; }); }  /* forEach：對陣列的每個元素各做一次 */
            return b;
        }
        /* 投手：舉臂（CSS transition）→ 出手 → 球飛出去 */
        pit.arm.style.transform = 'rotate(-150deg)';
        api.after(60, function () { pit.arm.style.transition = 'transform ' + WINDUP_MS + 'ms ease-in'; pit.arm.style.transform = 'rotate(30deg)'; });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        api.after(WINDUP_MS, function () { if (phase !== 'windup') return; phase = 'fly'; tRel = performance.now(); pit.ball.style.display = 'none'; Sfx.play('click'); startFlight(); });  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
        function startFlight() {
            api.my.loop(function (now) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                if (phase !== 'fly' || !stage.isConnected) return false;
                var u = (now - tRel) / (p.tFly * 1000);
                if (u > 1.2) { ballEl.style.display = 'none'; return false; }
                drawBall(u, true);
            });
            /* 球到了還沒揮 → 好球＝失敗、壞球＝過關（用計時器，不靠 rAF） */
            api.after(Math.round(p.tFly * 1000) + AFTER_MS, function () { if (phase === 'fly') resolve({ result: p.strike ? 'strike' : 'pass', err: null }, null); });
        }
        /* 揮棒＝點畫面 */
        field.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (api.over || (phase !== 'windup' && phase !== 'fly')) return;
            e.preventDefault(); swing();                /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
        });
        function swing() {
            if (api.over || (phase !== 'windup' && phase !== 'fly')) return;
            var tS = (performance.now() - tRel) / 1000;                      /* 從出手算起第幾秒；負的＝球還沒出手（舉臂的時候 tRel 是預計出手的時間） */
            swingT = tS;
            bat.classList.add('homerun-bat--swing'); Sfx.play('click');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            resolve(judgeSwing(p, tS), tS);
        }
        /* 結果 */
        function resolve(r, tS) {
            if (phase !== 'windup' && phase !== 'fly') return;
            phase = 'end';
            var why = whyText(r, p);
            info.textContent = why;                     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (r.result === 'hit' || r.result === 'pass') {
                info.classList.add('homerun-info--ok');
                if (r.result === 'hit') homerun(); else { ballEl.style.display = 'none'; kit.flash(stage, true, api.my); }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                if (r.result === 'hit') kit.flash(stage, true, api.my);
                api.pass({ delay: r.result === 'hit' ? 2600 : 1900 });  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            info.classList.add('homerun-info--bad');
            kit.flash(stage, false, api.my);
            pit.ball.style.display = 'none';
            replay(r, tS);
            api.fail({ delay: replayMs(p) + 1700, lines: [why, (p.strike ? '好球' : '壞球') + '（' + { fast: '速球', change: '變速球', curve: '曲球' }[p.type] + '）；飛行 ' + p.tFly.toFixed(4) + ' 秒，窗口 ±' + p.win.toFixed(4) + ' 秒' + (tS != null && tS >= 0 ? '；你在出手後 ' + tS.toFixed(4) + ' 秒揮棒' : '')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 全壘打：球飛上天空、打字 */
        function homerun() {
            ballEl.style.display = 'none'; trail.forEach(function (el) { el.style.display = 'none'; });
            var hr = h('div', { 'class': 'homerun-hr', text: '全壘打！' }); field.appendChild(hr);
            var fly = h('div', { 'class': 'homerun-ball homerun-ball--hr' }); fly.style.cssText = 'display:block;left:' + (geom.C.x - 14) + 'px;top:' + (geom.C.y - 14) + 'px;width:28px;height:28px;'; field.appendChild(fly);
            api.after(30, function () { fly.classList.add('homerun-ball--go'); hr.classList.add('homerun-hr--show'); });
        }
        /* 慢動作重播球路（0.35 倍）：球一格一格飛，留殘影；最後把球最終的位置標出來；你揮棒的時間點用一條線標在球上 */
        function replay(r, tS) {
            ballEl.style.display = 'none'; trail.forEach(function (el) { el.style.display = 'none'; }); hist = [];
            var ms = replayMs(p), mark = h('div', { 'class': 'homerun-final' }); field.appendChild(mark);
            var fin = ballAt(p, 1, geom); mark.style.cssText = 'left:' + (fin.x - 30).toFixed(1) + 'px;top:' + (fin.y - 30).toFixed(1) + 'px;';
            mark.classList.add(p.strike ? 'homerun-final--strike' : 'homerun-final--ball');
            var r0 = performance.now(), swingU = (tS != null && tS >= 0) ? Math.min(1.1, tS / p.tFly) : null, swingMark = null;
            api.my.loop(function (now) {
                var pr = Math.min(1, (now - r0) / ms), u = pr * 1.0;
                drawBall(u, true);
                if (swingU != null && !swingMark && u >= swingU) { swingMark = h('div', { 'class': 'homerun-swingmark' }); var b = ballAt(p, u, geom); swingMark.style.cssText = 'left:' + (b.x - 22).toFixed(1) + 'px;top:' + (b.y - 22).toFixed(1) + 'px;'; field.appendChild(swingMark); }
                if (pr >= 1) { mark.classList.add('homerun-final--show'); return false; }
            });
        }
        /* 驗證用：好球 → 在球到達的瞬間揮；壞球 → 不揮（讓球飛過去就過關）；可以重複呼叫（只排一次） */
        var armed = false;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (armed || api.over || (phase !== 'windup' && phase !== 'fly')) return; armed = true; if (p.strike) api.after(Math.max(0, Math.round(WINDUP_MS + p.tFly * 1000 - (performance.now() - t0))), swing); };
        api.wrong = function () { if (armed || api.over || (phase !== 'windup' && phase !== 'fly')) return; armed = true; api.after(Math.max(0, Math.round(WINDUP_MS + (p.strike ? p.tFly * 1000 - Math.max(250, p.win * 3000 + 120) : p.tFly * 1000) - (performance.now() - t0))), swing); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '全壘打',
        rule: '投手投球，**球進到好球帶（畫面中央的方框）的那一瞬間，點一下畫面揮棒**。**壞球（偏出好球帶）不要揮**，好球沒揮也算失敗。小心：**變速球出手的動作一模一樣，但是飛得比較慢**，要多等一下；曲球一開始像好球，最後才彎出好球帶。越後面，球越快、打擊的時間窗越窄、壞球越貼近好球帶。失敗時會用慢動作重播球路，寫出早了或晚了幾秒。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            flyFor: flyFor, winFor: winFor, pBallFor: pBallFor, ballDistFor: ballDistFor, pChangeFor: pChangeFor, pCurveFor: pCurveFor, inZone: inZone, outsidePoint: outsidePoint, makePitch: makePitch, targetAt: targetAt, easeU: easeU, ballAt: ballAt, judgeSwing: judgeSwing, whyText: whyText, replayMs: replayMs, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, FLY_S: FLY_S, CHANGE_X: CHANGE_X, HIT_WIN: HIT_WIN, P_BALL: P_BALL, BALL_DIST: BALL_DIST, BALL_DIST_MAX: BALL_DIST_MAX, P_CHANGE: P_CHANGE, P_CURVE: P_CURVE, STRIKE_EDGE: STRIKE_EDGE, WINDUP_MS: WINDUP_MS, AFTER_MS: AFTER_MS, REPLAY_SPEED: REPLAY_SPEED, REPLAY_MIN_MS: REPLAY_MIN_MS, REPLAY_MAX_MS: REPLAY_MAX_MS, CURVE_POW: CURVE_POW, BALL_R: BALL_R, ZONE_W: ZONE_W, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
