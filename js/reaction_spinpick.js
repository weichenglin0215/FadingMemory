/* ═══════════════════════════════════════════════════════════════════
   reaction_spinpick.js — 秒反應・轉盤停哪格（企劃 218，指針版）
   樣式：css/games/reaction_spinpick.css（這款專屬的 class 一律以「spinpick-」開頭；共用元件在 css/reaction_common.css）
   圓盤正中央有一根旋轉的指針，底下的圓盤像披薩一樣切成好幾格（每格顏色不同）。指針一開始轉得很快，然後慢慢減速、
   最後停下來。可是指針會在「不固定的時間點」漸漸變成半透明、然後完全看不見（每一關都不一樣，有時候提早很多），
   等到停住，中央會出現「請點擊指針指向哪個方向」——請憑指針減速的節奏，推測它最後停在哪一格，點那一格。
   關卡制：點錯或來不及就結束，成績＝通過幾關。第一關圓盤只切成左右兩格，越後面切得越多。
   ───────────────────────────────────────────────────────────────────
   · 指針的角度是時間的純函式（規範 T3）：等減速運動  θ(t) ＝ θ0 ＋ ω0·t − ½·α·t²（α＝ω0÷T，所以剛好在 T 秒停住）。
     θ 是從正上方順時針量的角度（度）；第 k 格涵蓋 [k·360/N, (k+1)·360/N)，第 0 格在右上到右下（N＝2 時就是右半邊）。
   · 出題（規範 Q1、Q15）：先決定「停在第幾格、格內的哪個位置」（離格線至少 20％的格寬），再由 θ_終 ＝ θ0 ＋ ω0·T÷2 反推起始角度 θ0；
     所以答案絕對不會剛好落在格線上，判定不會有爭議。
   · 玩家說「太簡單：只要選指針消失位置的 180 度正對面就對了」，因為指針的轉速、消失的時間點每次幾乎都一樣。所以：
        ① 消失的時間點「不定時提前」：指針完全看不見的時刻，原本固定在停住前 2 秒（FADE_END_BASE），現在每一關再隨機提前 0～earlyMax 秒
           （第 1 關最多 0.4 秒、第 RAMP_LEVELS 關最多 1.2 秒，EARLY），漸隱的時間固定 FADE_DUR（1 秒）。
           看不見之後指針還會掃過的角度＝ ω0 × 剩餘時間² ÷ (2T)，剩餘時間每關不一樣，掃過的角度就不一樣，固定的「180 度」猜法行不通；
        ② 轉速每一關慢慢提高：起轉速度 1.2 → 2.6 圈／秒（原本是 1.5 → 0.9，越後面越慢）。
   · 難度線性（RAMP_LEVELS 關走到頂）：格數 2 → 12；起轉速度 1.2 → 2.6 圈／秒；最多提前 0.4 → 1.2 秒；作答限時 6 → 4 秒。
     旋轉總時間固定 T ＝ 5 秒。
   · 揭曉：指針重新出現在停住的位置，正確那一格加粗框；選錯的那一格用橘紅框標出。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'spinpick'：選單、成績、存檔都靠它；樣式在 css/games/reaction_spinpick.css，裡面的 class 名稱一律以 spinpick- 開頭。 */
    'use strict';

    var ID = 'spinpick';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var SECTORS = [2, 12];                      /* 圓盤切成幾格：第 1 關 → 到頂 */
    var OMEGA_REV = [1.2, 2.6];                 /* 指針起轉速度（圈／秒）：第 1 關 → 到頂（越後面越快；原本 1.5 → 0.9） */
    var SPIN_S = 5;                             /* 指針從起轉到停住的總秒數 */
    var FADE_DUR = 1.0;                         /* 指針從「開始變透明」到「完全看不見」花幾秒 */
    var FADE_END_BASE = 2.0;                    /* 指針「完全看不見」的時刻（離停住還剩幾秒）最少是這麼多（原本固定是 2.0；企劃：最後第 2 秒全透明） */
    var EARLY = [0.4, 1.2];                     /* 再「不定時提前」的隨機範圍上限（秒）：第 1 關 → 到頂；每一關在 0 ～ 上限之間隨機 */
    var ANS_S = [6, 4];                         /* 停住之後的作答限時（秒）：第 1 關 → 到頂 */
    var MARGIN = 0.2;                           /* 停點離格線至少多遠（格寬的幾分之幾） */
    var DISC_R = 190, NEEDLE_R = 168, DEAD_R = 54;   /* 圓盤半徑、指針長度、中央不能點的半徑 */
    var CENTER_Y = 300;                             /* 轉盤中心的 y 座標（px） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sectorsFor(level) { return kit.clamp(Math.round(kit.ramp(level, SECTORS[0], SECTORS[1], RAMP_LEVELS)), SECTORS[0], SECTORS[1]); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function omegaFor(level) { return kit.ramp(level, OMEGA_REV[0], OMEGA_REV[1], RAMP_LEVELS) * 360; }     /* 度／秒 */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    function norm360(a) { return ((a % 360) + 360) % 360; }
    /* 指針在第 t 秒的角度（t 超過 SPIN_S 就停在終點） */
    function thetaAt(sp, t) {
        var tt = Math.min(Math.max(t, 0), sp.T), alpha = sp.omega0 / sp.T;
        return sp.theta0 + sp.omega0 * tt - 0.5 * alpha * tt * tt;
    }
    /* 這一關「最多可以再提前幾秒」（線性：第 1 關 0.4 → 第 RAMP_LEVELS 關 1.2） */
    function earlyMax(level) { return kit.ramp(level, EARLY[0], EARLY[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關指針消失的時間點（都是「離停住還剩幾秒」）：完全看不見的時刻 fadeEnd ＝ FADE_END_BASE ＋ 隨機提前 0～earlyMax，
       開始變透明的時刻 fadeStart ＝ fadeEnd ＋ FADE_DUR */
    function fadeTimes(level, rand) {
        var end = FADE_END_BASE + (rand || Math.random)() * earlyMax(level);
        return { fadeEnd: end, fadeStart: end + FADE_DUR };
    }
    /* 指針的不透明度：剩餘時間 ≥ sp.fadeStart → 1；fadeStart → fadeEnd 之間線性漸隱；≤ fadeEnd → 0（sp 是 makeSpin 的結果） */
    function alphaAt(t, sp) {
        var rem = sp.T - t;
        if (rem >= sp.fadeStart) return 1;
        if (rem <= sp.fadeEnd) return 0;
        return (rem - sp.fadeEnd) / (sp.fadeStart - sp.fadeEnd);
    }
    /* 角度 theta 落在 N 格裡的第幾格 */
    function sectorOf(theta, N) { return Math.floor(norm360(theta) / (360 / N)) % N; }  /* Math.floor：無條件捨去成整數 */
    /* 出一關：{ N, s（停在第幾格）, thetaF（停點角度）, theta0, omega0, T, offset（停點在格內的位置 0～1） } */
    function makeSpin(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var N = sectorsFor(level), w = 360 / N;
        var s = kit.randInt(0, N - 1, rand), offset = kit.randFloat(MARGIN, 1 - MARGIN, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        var thetaF = s * w + offset * w, omega0 = omegaFor(level);
        var theta0 = norm360(thetaF - omega0 * SPIN_S / 2), fd = fadeTimes(level, rand);
        return { N: N, s: s, thetaF: thetaF, theta0: theta0, omega0: omega0, T: SPIN_S, offset: offset, fadeEnd: fd.fadeEnd, fadeStart: fd.fadeStart };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '轉盤預言家！';
        if (n >= 12) return '節奏感很準！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看指針減速的節奏，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var sp = makeSpin(level, api.rand), N = sp.N, w = 360 / N;
        api.info = sp;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[轉盤停哪格] 第 ' + level + ' 關：' + N + ' 格，停在第 ' + (sp.s + 1) + ' 格（格內 ' + (sp.offset * 100).toFixed(1) + '％）；起轉 ' + sp.omega0.toFixed(2) + ' 度/秒，起始角 ' + sp.theta0.toFixed(2) + ' 度，終點角 ' + sp.thetaF.toFixed(2) + ' 度；離停住 ' + sp.fadeStart.toFixed(2) + ' 秒時開始變透明、' + sp.fadeEnd.toFixed(2) + ' 秒時完全看不見（看不見之後還會掃過 ' + (thetaAt(sp, sp.T) - thetaAt(sp, sp.T - sp.fadeEnd)).toFixed(1) + ' 度）；限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, cx = W / 2, cy = CENTER_Y;
        var svg = kit.svg('svg', { 'class': 'spinpick-svg', viewBox: '0 0 ' + W + ' 640', width: W, height: 640 }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        /* 圓盤：N 個扇形 */
        function pt(theta, r) { var a = (theta - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
        var secs = [];
        for (var k = 0; k < N; k++) {
            var a0 = k * w, a1 = (k + 1) * w, p0 = pt(a0, DISC_R), p1 = pt(a1, DISC_R);
            var d = 'M' + cx + ' ' + cy + ' L' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + DISC_R + ' ' + DISC_R + ' 0 ' + (w > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' Z';
            var hue = (212 + k * (360 / N)) % 360;
            secs.push(kit.svg('path', { d: d, fill: kit.hsl(hue, 70, 72), 'class': 'spinpick-sec' }, svg));  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        }
        var needle = kit.svg('g', { 'class': 'spinpick-needle' }, svg);
        kit.svg('polygon', { points: (cx - 11) + ',' + cy + ' ' + (cx + 11) + ',' + cy + ' ' + cx + ',' + (cy - NEEDLE_R), 'class': 'spinpick-tip' }, needle);
        kit.svg('circle', { cx: cx, cy: cy, r: 17, 'class': 'spinpick-hub' }, svg);
        var center = h('div', { 'class': 'spinpick-center', html: '請點擊指針<br>指向哪個方向' });
        center.style.left = (cx - 90) + 'px'; center.style.top = (cy - 40) + 'px'; center.style.visibility = 'hidden';
        stage.appendChild(center);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note spinpick-tip-text', text: '看指針怎麼轉、怎麼慢下來' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var phase = 'spin', t0 = performance.now();     /* performance.now()：高精度的時間（毫秒），計時用 */
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint(t) {
            needle.setAttribute('transform', 'rotate(' + thetaAt(sp, t).toFixed(3) + ' ' + cx + ' ' + cy + ')');  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            needle.setAttribute('opacity', alphaAt(t, sp).toFixed(3));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        }
        paint(0);
        var loop = api.my.loop(function () {            /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            var t = (performance.now() - t0) / 1000;    /* performance.now()：高精度的時間（毫秒），計時用 */
            paint(t);
            if (t >= sp.T || phase !== 'spin') return false;
        });
        api.after(sp.T * 1000 + 30, function () {       /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            loop.stop(); paint(sp.T);
            phase = 'ask'; center.style.visibility = ''; needle.setAttribute('opacity', 0);
            tip.textContent = '指針停了：它指向哪一格？';           /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            api.timer(ansMs(level), function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
            if (level === 1 && kit.once('spinpick.hint')) {  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
                var hp = pt(sp.s * w + w / 2, DISC_R * 0.62);
                kit.hintOn(stage, null, { mode: 'tap', x: hp[0], y: hp[1], delay: 300, text: '請點擊指針指向的方向' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
            }
        });
        kit.onTap(stage, function (e) {                 /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            if (api.over || phase !== 'ask') return;
            var p = kit.localPt(e, stage), dx = p.x - cx, dy = p.y - cy, r = Math.sqrt(dx * dx + dy * dy);  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
            if (r < DEAD_R || r > DISC_R) return;
            judge(sectorOf(Math.atan2(dx, -dy) * 180 / Math.PI, N));
        });

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(k) {
            if (api.over || phase === 'done') return;
            phase = 'done'; loop.stop();
            var ok = k === sp.s;
            paint(sp.T); needle.setAttribute('opacity', 1);
            center.style.visibility = 'hidden';
            secs[sp.s].classList.add('spinpick-sec--right');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (k >= 0 && !ok) secs[k].classList.add('spinpick-sec--wrong');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            var pos = (sp.offset * 100).toFixed(4);
            tip.textContent = '指針停在第 ' + (sp.s + 1) + ' 格（格內 ' + pos + '％的位置）' + (ok ? '' : '，你選了第 ' + (k + 1) + ' 格');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1600 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 2600, lines: [            /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                (k < 0 ? '時間到！' : '你選了第 ' + (k + 1) + ' 格') + '，指針停在第 ' + (sp.s + 1) + ' 格（共 ' + N + ' 格）',
                '停點角度 ' + sp.thetaF.toFixed(4) + ' 度（從正上方順時針量）'
            ] });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (phase === 'ask') judge(sp.s); };
        api.wrong = function () { if (phase === 'ask') judge((sp.s + 1) % N); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '轉盤停哪格',
        rule: '圓盤中央的指針會轉動並慢慢減速到停住。但指針會在**不固定的時間點**漸漸變透明、**完全看不見**（每一關消失的時間都不一樣，有時候提早很多）。請憑它減速的節奏，**推測它最後停在哪一格，點那一格**。越後面，指針轉得越快、圓盤切得越多格！點錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            sectorsFor: sectorsFor, omegaFor: omegaFor, ansMs: ansMs, norm360: norm360, thetaAt: thetaAt, alphaAt: alphaAt, earlyMax: earlyMax, fadeTimes: fadeTimes, sectorOf: sectorOf, makeSpin: makeSpin, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SECTORS: SECTORS, OMEGA_REV: OMEGA_REV, SPIN_S: SPIN_S, FADE_DUR: FADE_DUR, FADE_END_BASE: FADE_END_BASE, EARLY: EARLY, MARGIN: MARGIN, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
