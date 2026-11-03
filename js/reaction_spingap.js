/* ═══════════════════════════════════════════════════════════════════
   reaction_spingap.js — 秒反應・穿過旋轉縫（企劃 178，砲台版）
   樣式：css/games/reaction_spingap.css（這款專屬的 class 一律以「spingap-」開頭；共用元件在 css/reaction_common.css）
   畫面中間有一個一直旋轉的圓環，環上有一個缺口；環裡面偏下方有一座傳統砲台，點一下螢幕就發射一顆砲彈，
   砲彈直直往上飛，飛 0.6 秒後抵達圓環的上緣——那一刻缺口要剛好轉到上方，砲彈才能穿出去，
   撞到環就結束。看你能連續射出幾顆砲彈。一顆砲彈穿出環之後，才能再發射下一顆。
   ───────────────────────────────────────────────────────────────────
   · 一顆砲彈＝一關（kit.run）：成功穿出去就是過一關，撞到環就結束，成績＝成功穿出幾顆。
     環的轉動角度會接著上一顆砲彈繼續轉（不是每顆重新亂數開始）。
   · 全部都是時間的純函式（規範 T3）：缺口中心角度 φ(t) ＝ φ0 ＋ ω × t（度，從正右方順時針量）；
     砲彈從砲口出發，到「環內緣」的飛行時間固定 FLIGHT_S 秒，所以抵達時刻 ＝ 發射時刻 ＋ FLIGHT_S，
     判定就是看那一刻 φ 離「正上方（−90 度）」差多少，跟畫面影格率無關。
   · 判定：差距 ≤ 缺口一半 − 砲彈半徑對應的角度（BALL_R ÷ RING_R 的反正弦）→ 穿出；否則撞環。
   · 難度線性（RAMP_LEVELS 發走到頂）：轉速 0.25 → 0.75 圈／秒；缺口 80 度 → 36 度。
     到頂時容許的時間誤差約 ±52 毫秒（有人類能做到的餘裕，規範 Q15）。
   · 揭曉：寫出「缺口與砲彈差 X.XXXX 度（容許 ±Y.YYYY 度）」。
   · V1.34（玩家意見：每一圈的速度不能相同、也不能每一關線性加快，很容易被玩家抓到節奏）：
       - omegaDeg(level) 現在只是「基準轉速」（依關卡慢慢加快的趨勢）；每一圈實際的轉速由 nextOmega 決定：
         比上一圈的轉速隨機變快或變慢 SPEED_STEP（5%～20%）——方向（快／慢）隨機，幅度在 5%～20% 之間隨機，所以每一圈都跟上一圈不一樣、
         也不是一路加快；
       - 為了不讓轉速跑太遠（連續變快幾次後面會快到做不到），實際轉速限制在基準轉速的 ±SPEED_BAND（15%）以內：
         快要碰到上界就只能變慢、碰到下界就只能變快，其他時候快慢各半；整體還是慢慢往上加難。
       - 轉速要接著上一圈（carry 記著上一圈的轉速），第一圈（或中途從第 N 關開始）在基準的 ±SPEED_BAND 內隨機。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'spingap'：選單、成績、存檔都靠它；樣式在 css/games/reaction_spingap.css，裡面的 class 名稱一律以 spingap- 開頭。 */
    'use strict';

    var ID = 'spingap';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 顆', label: '射出砲彈', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾發之後難度到頂 */
    var OMEGA_REV = [0.25, 0.66];               /* 圓環轉速（圈／秒）：第 1 發 → 到頂 */
    var GAP_DEG = [90, 30];                     /* 缺口的寬度（度）：第 1 發 → 到頂 */
    var SPEED_STEP = [0.05, 0.20];              /* 每一圈比上一圈變快或變慢多少（比例）：每圈在 5%～20% 之間隨機，快或慢也隨機 */
    var SPEED_BAND = 0.15;                      /* 實際轉速最多離「基準轉速」快或慢多少（比例）：避免連續變快、越跑越遠 */
    var FLIGHT_S = 0.6;                         /* 砲彈從砲口飛到環內緣要幾秒（固定，企劃指定 0.6 秒） */
    var RING_R = 178;                           /* 圓環中心線的半徑（邏輯 px） */
    var RING_W = 24;                            /* 圓環的粗細 */
    var BALL_R = 12;                            /* 砲彈半徑 */
    var CENTER_Y = 232;                         /* 圓環中心的 y（離遊戲區上緣） */
    var MUZZLE_DY = 80;                         /* 砲口比圓環中心低多少（砲台在環內偏下方） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var TOP_DEG = -90;                          /* 「正上方」的角度（從正右方順時針量，上方是 −90 度） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function omegaDeg(level) { return kit.ramp(level, OMEGA_REV[0], OMEGA_REV[1], RAMP_LEVELS) * 360; }       /* 度／秒 */
    function gapFor(level) { return kit.ramp(level, GAP_DEG[0], GAP_DEG[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一圈（第 level 發）實際的轉速（度／秒）：prev＝上一圈的轉速（第一圈傳 null）。
       規則：在基準轉速 omegaDeg(level) 的 ±SPEED_BAND 範圍內，比上一圈快或慢 SPEED_STEP[0]～SPEED_STEP[1]（5%～20%）；
       往上加快 5% 會超出範圍就只能變慢，往下變慢 5% 會低於範圍就只能變快，兩邊都行就各半機率。 */
    function nextOmega(prev, level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var base = omegaDeg(level), lo = base * (1 - SPEED_BAND), hi = base * (1 + SPEED_BAND);
        if (prev == null) return kit.randFloat(lo, hi, rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        var upOk = prev * (1 + SPEED_STEP[0]) <= hi, downOk = prev * (1 - SPEED_STEP[0]) >= lo;
        var up = upOk && (!downOk || rand() < 0.5);
        if (!upOk && !downOk) up = prev < lo;                    /* prev 已經在範圍外（基準自己往上走了）：往範圍的方向走 */
        /* 新轉速落在哪個區間：往上＝比上一圈快 5%～20%，往下＝慢 5%～20%；
           但「一定要在範圍 [lo, hi] 內」比「變化不超過 20%」更重要（換到下一發時基準轉速會往上走，上一圈的轉速可能已經落在新範圍的下面，要補回來） */
        var from, to;
        if (up) { from = Math.max(prev * (1 + SPEED_STEP[0]), lo); to = Math.max(from, Math.min(prev * (1 + SPEED_STEP[1]), hi)); }
        else { to = Math.min(prev * (1 - SPEED_STEP[0]), hi); from = Math.min(to, Math.max(prev * (1 - SPEED_STEP[1]), lo)); }
        return kit.randFloat(from, to, rand);
    }
    /* 把角度整理到 −180～180 */
    function norm180(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
    /* 缺口中心在第 t 秒的角度 */
    function gapAt(phi0, omega, t) { return phi0 + omega * t; }
    /* 砲彈半徑在環上對應的角度（度）：缺口要多留這麼多給砲彈 */
    function ballHalfDeg() { return Math.asin(BALL_R / RING_R) * 180 / Math.PI; }
    /* 這一發的容許誤差（度）：缺口中心離正上方的差距要 ≤ 缺口一半 − 砲彈半徑對應的角度 */
    function tolDeg(level) { return gapFor(level) / 2 - ballHalfDeg(); }
    /* 容許的「時間誤差」（毫秒）＝ 容許角度 ÷ 轉速 */
    function tolMs(level) { return tolDeg(level) / omegaDeg(level) * 1000; }
    /* 判定：phiAtContact＝砲彈抵達環的那一刻，缺口中心的角度 */
    function judgeShot(level, phiAtContact) {
        var diff = norm180(phiAtContact - TOP_DEG), tol = tolDeg(level);
        return { pass: Math.abs(diff) <= tol + 1e-9, diff: diff, tol: tol };  /* Math.abs：取絕對值（去掉負號） */
    }
    /* 從現在起（缺口中心角度 phi、轉速 omega 度／秒），最早什麼時候發射，砲彈抵達時缺口剛好在正上方？回傳「幾秒後發射」（0 以上） */
    function perfectDelay(phi, omega) {
        var need = norm180(TOP_DEG - phi);                      /* 缺口還要轉多少度才到正上方（−180～180） */
        var wait = (need < 0 ? need + 360 : need) / omega;      /* 幾秒後缺口到正上方（轉速為正，只會往順時針轉） */
        var d = wait - FLIGHT_S;
        var period = 360 / omega;
        while (d < 0) d += period;
        return d;
    }
    /* 砲彈在發射後第 t 秒的 y（離遊戲區上緣）：砲口 → 以固定速度往上，到環內緣的飛行時間剛好是 FLIGHT_S */
    function ballGeom() {
        var y0 = CENTER_Y + MUZZLE_DY, yc = CENTER_Y - RING_R + RING_W / 2 + BALL_R;       /* 出發點、接觸環內緣時砲彈中心的 y */
        return { y0: y0, yc: yc, v: (y0 - yc) / FLIGHT_S };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 30) return '神砲手！';
        if (n >= 18) return '百發百中！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '缺口要「提前」到上方，再來一次！';
    }

    var carry = null;                           /* 上一發結束時環的角度與時間，下一發接著轉 */

    function mount(root, ctx) {
        carry = null;
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            head: function (lv) { return '第 ' + lv + ' 發'; },
            numText: function (v) { return v + ' 顆'; },
            rating: rating,
            lines: function (S) { return ['成功射出 ' + S.cleared + ' 顆砲彈']; },
            setup: setup
        });
    }

    /* 傳統砲台：粗粗的砲管（砲口向上、砲口有一圈箍）、尾端的圓球、木頭砲架與兩個木輪（輪輻用細線） */
    function cannonSvg() {
        return '<svg viewBox="0 0 120 150" aria-hidden="true">' +
            '<g class="spingap-barrel"><path d="M43 14 H77 L84 94 H36 Z" class="spingap-iron"/><rect x="38" y="4" width="44" height="15" rx="6" class="spingap-iron-d"/>' +
            '<circle cx="60" cy="96" r="21" class="spingap-iron"/><circle cx="60" cy="120" r="7" class="spingap-iron-d"/></g>' +
            '<path d="M24 102 H96 L102 128 H18 Z" class="spingap-wood"/>' +
            '<g class="spingap-wheel"><circle cx="30" cy="126" r="22" class="spingap-wood-d"/><circle cx="30" cy="126" r="6" class="spingap-iron"/><path d="M30 104 V148 M8 126 H52 M14 110 L46 142 M46 110 L14 142" class="spingap-spoke"/></g>' +
            '<g class="spingap-wheel"><circle cx="90" cy="126" r="22" class="spingap-wood-d"/><circle cx="90" cy="126" r="6" class="spingap-iron"/><path d="M90 104 V148 M68 126 H112 M74 110 L106 142 M106 110 L74 142" class="spingap-spoke"/></g></svg>';
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var W = stage.clientWidth || 472, cx = W / 2, cy = CENTER_Y;
        /* 這一圈的轉速：接著上一圈（上一發剛結束、carry.level ＝ level − 1）的轉速變快或變慢 5%～20%；第一圈（或中途開始）在基準附近隨機 */
        var om = nextOmega(carry && carry.level === level - 1 ? carry.om : null, level, api.rand), gap = gapFor(level), geom = ballGeom();
        /* 環的起始角度：接著上一發轉（第 1 發隨機） */
        var now0 = performance.now();                   /* performance.now()：高精度的時間（毫秒），計時用 */
        var phi0 = (level === 1 || !carry) ? kit.randFloat(-180, 180, api.rand) : carry.phi + carry.om * (now0 - carry.t) / 1000;
        var tBase = now0;
        function phiNow(tMs) { return gapAt(phi0, om, (tMs - tBase) / 1000); }
        api.info = { omega: om, base: omegaDeg(level), gap: gap, tol: tolDeg(level), tolMs: tolDeg(level) / om * 1000 };
        console.log('[穿過旋轉縫] 第 ' + level + ' 發：轉速 ' + om.toFixed(4) + ' 度/秒（基準 ' + omegaDeg(level).toFixed(4) + '，上一圈 ' + (carry && carry.level === level - 1 ? carry.om.toFixed(4) : '—') + '），缺口 ' + gap.toFixed(4) + ' 度，容許 ±' + tolDeg(level).toFixed(4) + ' 度（±' + (tolDeg(level) / om * 1000).toFixed(1) + ' ms）');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var svg = kit.svg('svg', { 'class': 'spingap-svg', viewBox: '0 0 ' + W + ' 640', width: W, height: 640 }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var C = 2 * Math.PI * RING_R;
        var ring = kit.svg('circle', {
            cx: cx, cy: cy, r: RING_R, 'class': 'spingap-ring', 'stroke-width': RING_W,
            'stroke-dasharray': (C * (1 - gap / 360)).toFixed(2) + ' ' + (C * gap / 360).toFixed(2)
        }, svg);
        /* 正上方的出口記號（一個小三角形） */
        kit.svg('path', { d: 'M' + (cx - 14) + ' ' + (cy - RING_R - RING_W / 2 - 22) + ' L' + (cx + 14) + ' ' + (cy - RING_R - RING_W / 2 - 22) + ' L' + cx + ' ' + (cy - RING_R - RING_W / 2 - 4) + ' Z', 'class': 'spingap-mark' }, svg);
        var ball = kit.svg('circle', { cx: cx, cy: geom.y0, r: BALL_R, 'class': 'spingap-ball', visibility: 'hidden' }, svg);
        var cannon = h('div', { 'class': 'spingap-cannon', html: cannonSvg() });
        cannon.style.left = (cx - 60) + 'px'; cannon.style.top = (geom.y0 - 6) + 'px';
        stage.appendChild(cannon);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note spingap-tip', text: '點擊畫面發射砲彈：缺口要提前轉到上方！' });
        stage.appendChild(tip);
        var msg = h('div', { 'class': 'qz-note spingap-msg', text: '已射出 ' + (level - 1) + ' 顆' });
        stage.appendChild(msg);

        var state = 'ready', tFire = 0;
        function paintRing(tMs) { ring.setAttribute('transform', 'rotate(' + (phiNow(tMs) + gap / 2).toFixed(3) + ' ' + cx + ' ' + cy + ')'); }  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        paintRing(performance.now());
        var loop = api.my.loop(function () {            /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            var t = performance.now();
            if (state !== 'blocked') paintRing(t);
            carry = { phi: phiNow(t), om: om, t: t, level: level };
            if (state === 'flying' || state === 'passed') {
                var s = (t - tFire) / 1000, y = geom.y0 - geom.v * s;
                ball.setAttribute('cy', y.toFixed(2));
                if (y < -30) ball.setAttribute('visibility', 'hidden');
            }
            if (api.over && state !== 'passed') return false;           /* 失敗結束後停止；過關後讓砲彈繼續飛出去，由下面的 api.after 收掉 */
        });
        function fire() {
            if (state !== 'ready' || api.over) return;
            state = 'flying'; tFire = performance.now();
            Sfx.play('pop');                            /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            ball.setAttribute('visibility', 'visible'); ball.setAttribute('cy', geom.y0);
            cannon.classList.add('spingap-cannon--fire'); api.after(160, function () { cannon.classList.remove('spingap-cannon--fire'); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            tip.textContent = '砲彈飛行中…';                 /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            /* 抵達環內緣的那一刻判定 */
            api.after(FLIGHT_S * 1000, function () {
                var phi = phiNow(tFire + FLIGHT_S * 1000), r = judgeShot(level, phi);
                console.log('[穿過旋轉縫] 抵達：缺口中心 ' + norm180(phi).toFixed(4) + ' 度，差 ' + r.diff.toFixed(4) + ' 度，容許 ±' + r.tol.toFixed(4) + ' 度 → ' + (r.pass ? '穿出' : '撞環'));
                var line = '缺口與砲彈差 ' + Math.abs(r.diff).toFixed(4) + ' 度（容許 ±' + r.tol.toFixed(4) + ' 度）';
                if (r.pass) {
                    state = 'passed'; tip.textContent = '穿出去了！' + line; kit.flash(stage, true, api.my);  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                    api.pass({ delay: 800 });           /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                    api.after(780, function () { loop.stop(); ball.setAttribute('visibility', 'hidden'); });       /* 換下一發之前，把這一發的動畫迴圈收掉 */
                } else {
                    state = 'blocked'; ball.setAttribute('cy', geom.yc);
                    ball.classList.add('spingap-ball--boom'); tip.textContent = '撞到環了。' + line; kit.flash(stage, false, api.my);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                    api.fail({ delay: 2000, lines: ['第 ' + level + ' 發撞到環了', line] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                }
            });
        }
        kit.onTap(stage, function () { fire(); });      /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        if (level === 1 && kit.once('spingap.hint')) kit.hintOn(stage, cannon, { mode: 'tap', delay: 500, text: '請點擊畫面發射砲彈' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 驗證用：api.solve 在「剛好」的時間發射、api.wrong 在缺口在下方時發射 */
        var scheduled = false;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () {
            if (scheduled || state !== 'ready') return; scheduled = true;
            var d = perfectDelay(phiNow(performance.now()), om);
            api.after(d * 1000, fire);
        };
        api.wrong = function () {
            if (scheduled || state !== 'ready') return; scheduled = true;
            var d = perfectDelay(phiNow(performance.now()), om) + 180 / om;           /* 再多等半圈：缺口在正下方 */
            api.after(d * 1000, fire);
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '穿過旋轉縫',
        rule: '圓環一直在旋轉，環上有一個缺口。點一下螢幕，環裡的砲台會射出砲彈，飛 0.6 秒後抵達環的上緣，**那一刻缺口要剛好轉到上方**，砲彈才能穿出去。**撞到環就結束**，看你能射出幾顆。**每一圈的轉速都不一樣**（比上一圈快或慢 5%～20%），別想靠節奏！越後面，整體轉得越快、缺口越小！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            omegaDeg: omegaDeg, nextOmega: nextOmega, gapFor: gapFor, norm180: norm180, gapAt: gapAt, ballHalfDeg: ballHalfDeg, tolDeg: tolDeg, tolMs: tolMs, judgeShot: judgeShot, perfectDelay: perfectDelay, ballGeom: ballGeom, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SPEED_STEP: SPEED_STEP, SPEED_BAND: SPEED_BAND, OMEGA_REV: OMEGA_REV, GAP_DEG: GAP_DEG, FLIGHT_S: FLIGHT_S, RING_R: RING_R, BALL_R: BALL_R, TOP_DEG: TOP_DEG, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
