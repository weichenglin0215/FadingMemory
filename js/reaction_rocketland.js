/* ═══════════════════════════════════════════════════════════════════
   reaction_rocketland.js — 秒反應・火箭回收
   樣式：css/games/reaction_rocketland.css（這款專屬的 class 一律以「rocketland-」開頭；共用元件在 css/reaction_common.css）
   回收型火箭從畫面上方降下來（一開始只看得到火箭下面 1/3），要讓它**整個落進**畫面下方的橢圓形標靶（寬度＝畫面的 1/4）。
   火箭的腳有任何一點超出標靶、或落地太快（SAFE_VY），就算失敗。關卡制，一共 30 關，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 操作：手指點一下或按住畫面任何地方＝噴火（往上推）；火焰大小＝往上的推力。
     手指按的左右位置＝往左右推：以畫面正中央為準，越靠兩側推得越用力（線性，最旁邊＝SIDE_A）；火箭傾斜的角度表示往左右推的力道。
   · 推力不是一按就全開：按住時油門從 0 慢慢加到 1（SPOOL_UP 秒），放手後慢慢降回 0（SPOOL_DOWN 秒）。
     第 1 關（登月小艇）很輕、油門反應快，點幾下就會往上；越後面火箭越重（滿油門的推力只比重力大一點：A_MAX）、油門越慢，
     **要提早按住**才擋得住往下掉的速度，常常就是推力不夠而墜毀。
   · 火箭下緣的寬度（連腳）：第 1 關＝畫面的 1/10，第 30 關＝剛好等於標靶寬度（線性）；第 30 關幾乎要落在正中央（只留 SLACK px 的誤差）。
   · 風：每一關的風向（左或右）與強度隨機，越後面越強（WIND），還會一陣一陣地變強變弱（GUST）；畫面右上角的風向旗顯示風往哪吹、多強。
   · 燃料：滿油門能噴的秒數，第 1 關 30 秒、第 30 關 60 秒（FUEL_S）；油門開一半就燒一半的速度。上方橫條顯示剩下的燃料：
     平常水藍色，剩 20% 變紅色，剩 10% 紅色閃爍。燃料燒完就噴不出火了。
   · 越靠近地面風越小（WIND_LOW、WIND_H），最後要對準時比較有機會修正。
   · 即使一直按住，火箭的下緣也不會超出天空的上緣（TOP_MIN），你一定看得到火箭的腳。燃料條在天空上方自己的一條（BAR_H），不會擋住火箭。
   · 物理用固定的小步長（STEP_S）計算（純函式 step），跟手機的畫面更新頻率無關；單元測試用自動駕駛（autopilot）驗證每一關都降落得了。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'rocketland'：選單、成績、存檔都靠它；樣式在 css/games/reaction_rocketland.css，裡面的 class 名稱一律以 rocketland- 開頭。 */
    'use strict';

    var ID = 'rocketland';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數（寫成 [起, 終] 的：第 1 關 → 第 30 關線性變化）═══ */
    var MAX_LEVEL = 30;                                 /* 最後一關 */
    var GRAVITY = 150;                                  /* 重力加速度（px／秒²） */
    var A_MAX = [2.6, 1.32];                            /* 滿油門的往上加速度是重力的幾倍（越後面越重：只比重力大一點點） */
    var SPOOL_UP = [0.12, 1.5];                         /* 按住時油門從 0 加到 1 要幾秒（越後面越慢） */
    var SPOOL_DOWN = [0.2, 0.9];                        /* 放手後油門從 1 降到 0 要幾秒 */
    var FUEL_S = [30, 60];                              /* 燃料：滿油門能噴幾秒 */
    var SIDE_A = [190, 125];                            /* 手指按在最旁邊時，往左右推的加速度（px／秒²；越後面火箭越重、推得越慢） */
    var DRAG_X = 0.8;                                   /* 左右方向的空氣阻力（每秒減掉速度的幾倍；風吹久了速度會穩定在 風力 ÷ DRAG_X） */
    var WIND = [8, 62];                                 /* 風的最大強度（px／秒²）：每關再乘 0.6～1 的隨機倍率 */
    var GUST = 0.35, GUST_W = 1.3;                      /* 陣風：強度在 ±35% 之間變動，變動的快慢（弧度／秒） */
    var WIND_LOW = 0.3, WIND_H = 220;                   /* 越靠近地面風越小：貼地只剩 30%，離地 WIND_H px 以上才是全部的風（右上角的風向旗顯示高空的風） */
    var V0 = [30, 60];                                  /* 一開始往下掉的速度（px／秒） */
    var X_OFF = [50, 150];                              /* 火箭一開始離標靶中心的水平距離（px，隨機往左或右） */
    var SAFE_VY = 75;                                   /* 落地時往下的速度不能超過這個（px／秒），太快就墜毀 */
    var SLACK = 3;                                      /* 「完全在標靶裡」的容許誤差（px）：第 30 關火箭跟標靶一樣寬，留一點點才辦得到 */
    var MAX_TILT = 22;                                  /* 手指按在最旁邊時，火箭傾斜幾度（只是表示往左右推的力道） */
    var TOP_MIN = 24;                                   /* 火箭下緣離天空上緣至少多遠（px）：一直按住也不會飛出去 */
    var BAR_H = 40;                                     /* 最上方留給燃料條的高度（px）：天空（畫布）從這條下面開始，火箭不會被燃料條擋住 */
    var GROUND_GAP = 50;                                /* 地面（標靶的中心線）離畫面下緣多遠（px） */
    var PAD_FRAC = 0.25;                                /* 標靶寬度＝畫面寬度的幾分之幾 */
    var BASE_FRAC = [0.1, 0.25];                        /* 火箭下緣（連腳）的寬度＝畫面寬度的幾分之幾 */
    var LANDER_LEVELS = 3;                              /* 前幾關是登月小艇的造型（之後是回收火箭） */
    var STEP_S = 1 / 120;                               /* 物理計算的步長（秒） */
    var READY_MS = 700;                                 /* 每關開始前停多久（讓你看清楚風向與位置） */
    var FUEL_LOW = 0.2, FUEL_CRIT = 0.1;                /* 燃料剩 20% 變紅色、剩 10% 紅色閃爍 */
    /* 畫布用的顏色（canvas 不能直接用 CSS 變數，所以寫在這裡） */
    var COL = {
        sky1: '#1F3B66', sky2: '#F2A46B', hill: '#4A4F6B', ground: '#5C5A55', ground2: '#3F3D3A',
        padA: '#F4F1E8', padB: '#D9483B', ink: '#1E2328', white: '#F4F4F0', metal: '#9AA4AC', metalDk: '#4D5760',
        gold: '#D8A93B', goldDk: '#9C7420', flame1: '#FFF4B0', flame2: '#FFB23F', flame3: '#F0602A', flag: '#E8483A', pole: '#E6E6E6'
    };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(level) { return Math.min(1, Math.max(0, (level - 1) / (MAX_LEVEL - 1))); }
    function lerp(pair, p) { return pair[0] + (pair[1] - pair[0]) * p; }
    /* 第 level 關的設定：畫面寬 W、高 H；rand 決定風與起點 */
    function levelParams(level, W, H, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var p = prog(level), baseW = W * lerp(BASE_FRAC, p), lander = level <= LANDER_LEVELS;
        var rocketH = lander ? baseW * 0.95 : baseW * lerp([2.4, 3.3], p);
        var windDir = rand() < 0.5 ? -1 : 1, wind = windDir * lerp(WIND, p) * kit.randFloat(0.6, 1, rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        var padX = W / 2, offDir = rand() < 0.5 ? -1 : 1, x0 = padX + offDir * lerp(X_OFF, p) * kit.randFloat(0.7, 1, rand);
        x0 = Math.min(W - baseW / 2, Math.max(baseW / 2, x0));
        return {
            level: level, W: W, H: H, lander: lander, baseW: baseW, rocketH: rocketH, padX: padX, padW: W * PAD_FRAC,
            groundY: H - GROUND_GAP, aMax: GRAVITY * lerp(A_MAX, p), spoolUp: lerp(SPOOL_UP, p), spoolDown: lerp(SPOOL_DOWN, p),
            fuel: lerp(FUEL_S, p), sideA: lerp(SIDE_A, p), wind: wind, gustPh: rand() * Math.PI * 2,
            x0: x0, y0: rocketH / 3, v0: lerp(V0, p)
        };
    }
    /* 第 t 秒、離地 hgt px 的風（px／秒²；正＝往右吹）；hgt 不給＝高空的風 */
    function windAt(P, t, hgt) {
        var near = hgt == null ? 1 : WIND_LOW + (1 - WIND_LOW) * Math.min(1, Math.max(0, hgt) / WIND_H);
        return P.wind * (1 + GUST * Math.sin(t * GUST_W + P.gustPh)) * near;
    }
    /* 風力幾級（0～6，給畫面上的文字用） */
    function windLevel(w) { return Math.min(6, Math.round(Math.abs(w) / 11)); }
    /* 一開始的狀態：x 火箭中心、y 火箭下緣（往下為正）、vx／vy 速度、thr 油門 0～1、fuel 剩幾秒燃料、tilt 傾斜角度、t 經過秒數 */
    function initState(P) { return { x: P.x0, y: P.y0, vx: 0, vy: P.v0, thr: 0, fuel: P.fuel, tilt: 0, t: 0, landed: false }; }
    /* 手指在畫面上的 x → 往左右推的比例（−1～1，正中央＝0，越靠邊越大） */
    function sideOf(px, W) { return Math.max(-1, Math.min(1, (px - W / 2) / (W / 2))); }
    /* 往前算一小步 dt 秒。inp ＝ { press: 有沒有按著, side: −1～1 }。會直接改 st，並回傳它 */
    function step(st, inp, P, dt) {
        if (st.landed) return st;
        var press = !!inp.press && st.fuel > 0;
        /* 油門：按住慢慢加、放手慢慢減 */
        st.thr = press ? Math.min(1, st.thr + dt / P.spoolUp) : Math.max(0, st.thr - dt / P.spoolDown);
        if (st.fuel <= 0) st.thr = Math.max(0, st.thr - dt / P.spoolDown * 2);
        var thrust = st.fuel > 0 ? st.thr * P.aMax : 0;
        st.fuel = Math.max(0, st.fuel - st.thr * dt);
        /* 上下：重力往下、推力往上 */
        st.vy += (GRAVITY - thrust) * dt;
        /* 左右：手指的推力（只在按著的時候）＋風－空氣阻力 */
        var side = inp.press ? (inp.side || 0) : 0;
        st.vx += (side * P.sideA + windAt(P, st.t, P.groundY - st.y) - DRAG_X * st.vx) * dt;
        st.x += st.vx * dt; st.y += st.vy * dt; st.t += dt;
        /* 傾斜：慢慢轉到「手指推的方向」 */
        var want = side * MAX_TILT;
        st.tilt += (want - st.tilt) * Math.min(1, dt * 6);
        /* 天花板：下緣不能超出畫面上緣 */
        if (st.y < TOP_MIN) { st.y = TOP_MIN; if (st.vy < 0) st.vy = 0; }
        /* 左右牆壁 */
        if (st.x < P.baseW / 2) { st.x = P.baseW / 2; if (st.vx < 0) st.vx = 0; }
        if (st.x > P.W - P.baseW / 2) { st.x = P.W - P.baseW / 2; if (st.vx > 0) st.vx = 0; }
        /* 落地 */
        if (st.y >= P.groundY) { st.y = P.groundY; st.landed = true; }
        return st;
    }
    /* 落地判定：完全在標靶裡（超出的 px ≤ SLACK）而且夠慢（≤ SAFE_VY）才算成功 */
    function judge(st, P) {
        var over = Math.abs(st.x - P.padX) + P.baseW / 2 - P.padW / 2;
        var inside = over <= SLACK, soft = st.vy <= SAFE_VY;
        return { ok: inside && soft, inside: inside, soft: soft, over: over, vy: st.vy };
    }
    /* 燃料條的樣子：'ok' 水藍色、'low' 紅色、'crit' 紅色閃爍 */
    function fuelClass(frac) { return frac <= FUEL_CRIT ? 'crit' : frac <= FUEL_LOW ? 'low' : 'ok'; }
    /* 自動駕駛（給單元測試驗證「每一關都辦得到」、也給 api.solve 用）：回傳這一刻要不要按、按在哪個左右比例 */
    function autopilot(st, P) {
        var hgt = P.groundY - st.y;
        /* 上下（降落）：算「現在開始按住，要多遠才能把速度降到 VLAND」——油門要 (1 − thr) × spoolUp 秒才加滿，這段時間加速度從 a0 線性變到 a1；
           加滿之後用 a1 減速。煞車距離（再加一點餘裕）已經比離地高度長了，就要按 */
        var VLAND = 38, tu = (1 - st.thr) * P.spoolUp, a0 = GRAVITY - st.thr * P.aMax, a1 = GRAVITY - P.aMax;
        var v1 = st.vy + (a0 + a1) / 2 * tu, d1 = st.vy * tu + (2 * a0 + a1) / 6 * tu * tu;
        var dist = v1 > VLAND ? d1 + (v1 * v1 - VLAND * VLAND) / (2 * -a1) : d1;
        var brake = (st.vy > VLAND * 0.6 && dist + 10 >= hgt) || st.vy > 150;     /* 已經夠慢了就不用煞車（不然會一直停在離地幾 px 的地方） */
        /* 左右：先算想要的左右速度，再算需要的推力（要抵消風）；只有按著的時候才推得動，平均只有「懸停油門」那麼多時間在按，所以除以它 */
        var e = P.padX - st.x, room = Math.max(0, (P.padW - P.baseW) / 2), wind = windAt(P, st.t, hgt);
        var vxd = Math.max(-70, Math.min(70, e * 1.2));
        st.apI = Math.max(-40, Math.min(40, (st.apI || 0) + e * STEP_S));             /* 偏差的累積（積分項）：風一直吹時，慢慢把「推不夠」的部分補回來（存在 st 上） */
        var need = (vxd - st.vx) * 3 + st.apI * 2 - wind + DRAG_X * st.vx, duty = Math.max(0.3, Math.min(1, GRAVITY / P.aMax));
        var side = Math.max(-1, Math.min(1, need / (P.sideA * duty)));
        /* 還沒對準：停在離地 HOVER px 左右的高度（期望的下降速度跟高度差成正比），一邊修正左右；對準了（或已經很低）才往下降 */
        var aligned = Math.abs(e) <= Math.max(1, (room + SLACK) * 0.4) && Math.abs(st.vx) < 8, press;
        /* 降落：煞車距離不夠就按；已經很慢（或在往上）就放手，維持大約 VLAND 的速度慢慢落地 */
        var sink = st.vy + a0 * P.spoolUp * 0.5;
        if (aligned || hgt < 40) press = st.vy > 0 && (brake || sink > VLAND + 6);
        else {
            var HOVER = Math.min(170, P.groundY - TOP_MIN - 30), vd = Math.max(-40, Math.min(120, (hgt - HOVER) * 0.8));
            press = st.vy + a0 * P.spoolUp * 0.5 > vd || brake;
        }
        return { press: press, side: press ? side : 0 };
    }
    /* 結算評語 */
    function rating(n) {
        if (n >= 30) return '回收大師！';
        if (n >= 22) return '王牌飛控員！';
        if (n >= 14) return '穩穩落地！';
        if (n >= 6) return '越來越上手了！';
        return '提早噴火，慢慢降！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8, stageClass: 'rocketland-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['成功降落 ' + S.cleared + ' 次']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = (stage.clientHeight || 640) - BAR_H;     /* H：天空（畫布）的高度 */
        var P = levelParams(api.level, W, H, api.rand), st = initState(P);
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = h('canvas', { 'class': 'rocketland-canvas' });
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);    /* Math.round：四捨五入成整數 */
        cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.top = BAR_H + 'px';
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var g = cv.getContext('2d'); g.scale(dpr, dpr);
        /* 燃料條（網頁元素，蓋在畫布上方） */
        var fuelFill = h('div', { 'class': 'rocketland-fuel__fill' }), fuel = h('div', { 'class': 'rocketland-fuel' }, [fuelFill, h('div', { 'class': 'rocketland-fuel__t', text: '燃料' })]);
        stage.appendChild(fuel);
        var msg = h('div', { 'class': 'rocketland-msg', text: '第 ' + api.level + ' 關　準備…' }); stage.appendChild(msg);
        api.setInfo('風力 ' + windLevel(P.wind) + ' 級');
        console.log('[火箭回收] 第 ' + api.level + ' 關：火箭寬 ' + P.baseW.toFixed(1) + '／標靶寬 ' + P.padW.toFixed(1) + ' px、推力 ' + (P.aMax / GRAVITY).toFixed(2) + ' 倍重力、油門 ' + P.spoolUp.toFixed(2) + ' 秒、燃料 ' + P.fuel.toFixed(1) + ' 秒、風 ' + P.wind.toFixed(1));  /* 在瀏覽器主控台（按 F12）印出這一關的設定，方便除錯 */

        /* 手指：按著＝噴火；按的左右位置＝往左右推 */
        var pointers = {}, lastX = W / 2, phase = 'ready', acc = 0, auto = null, parts = [], clock = 0;
        function pressing() { for (var k in pointers) if (pointers[k]) return true; return false; }
        cv.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            pointers[e.pointerId] = true; lastX = kit.localPt(e, cv).x;
        });
        cv.addEventListener('pointermove', function (e) { if (pointers[e.pointerId]) lastX = kit.localPt(e, cv).x; });
        function up(e) { delete pointers[e.pointerId]; }
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        if (api.level <= 2 && kit.once('rocketland.hint')) kit.hintOn(stage, null, { mode: 'hold', x: W * 0.5, y: H * 0.7, delay: READY_MS, text: '按住噴火，按左右邊可以移動' });  /* 操作提示（手指圖示指出該按哪裡）：玩家第一次按下就消失 */
        api.after(READY_MS, function () { phase = 'fly'; msg.textContent = ''; });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */

        my.loop(function (now, dt) {                    /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!cv.isConnected) return false;
            var d = Math.min(dt, 50) / 1000;
            clock += d;
            if (phase === 'fly') {
                acc += d;
                while (acc >= STEP_S && phase === 'fly') {
                    acc -= STEP_S;
                    var inp = auto === 'solve' ? autopilot(st, P) : auto === 'wrong' ? { press: false, side: 0 } : { press: pressing(), side: sideOf(lastX, W) };
                    step(st, inp, P, STEP_S);
                    st.pressNow = inp.press;                /* 記下這一步有沒有按（給除錯看） */
                    if (st.landed) land();
                }
            }
            for (var i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.t += d; if (q.t >= q.life) { parts.splice(i, 1); continue; } q.x += q.vx * d; q.y += q.vy * d; q.vy += 200 * d; }  /* splice：從陣列中刪掉元素 */
            paintFuel();
            draw();
        });

        function paintFuel() {
            var f = st.fuel / P.fuel, cls = fuelClass(f);
            fuelFill.style.width = (100 * Math.max(0, f)).toFixed(1) + '%';
            fuel.classList.toggle('rocketland-fuel--low', cls !== 'ok');  /* classList.toggle(名稱, 條件)：條件成立就加上 class、不成立就拿掉 */
            fuel.classList.toggle('rocketland-fuel--crit', cls === 'crit');
        }
        /* 落地：判定成功或墜毀 */
        function land() {
            phase = 'done'; st.thr = 0;                 /* 落地就熄火 */
            var j = judge(st, P);
            console.log('[火箭回收] 落地：速度 ' + j.vy.toFixed(1) + '（上限 ' + SAFE_VY + '）、超出標靶 ' + j.over.toFixed(1) + ' px（容許 ' + SLACK + '）→ ' + (j.ok ? '成功' : '失敗'));
            if (j.ok) {
                msg.textContent = '穩穩降落！'; msg.classList.add('rocketland-msg--ok');
                kit.flash(stage, true, my);             /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 1300 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            var why = !j.soft ? '落地太快了！（每秒 ' + Math.round(j.vy) + '，要在 ' + SAFE_VY + ' 以下）' : '火箭超出標靶 ' + Math.max(1, Math.round(j.over)) + ' px！';
            if (!j.soft && !j.inside) why += '，而且超出標靶 ' + Math.max(1, Math.round(j.over)) + ' px';
            if (st.fuel <= 0) why += '（燃料用完了）';
            msg.textContent = j.soft ? '沒有落進標靶！' : '墜毀！'; msg.classList.add('rocketland-msg--bad');
            if (!j.soft) boom();
            kit.flash(stage, false, my);
            api.fail({ delay: 2200, lines: [why] });    /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        function boom() {
            for (var i = 0; i < 46; i++) {
                var a = -Math.PI * Math.random(), v = 80 + Math.random() * 260;
                parts.push({ x: st.x + (Math.random() - 0.5) * P.baseW * 0.6, y: P.groundY - Math.random() * P.rocketH * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 3 + Math.random() * 6, t: 0, life: 0.6 + Math.random() * 0.8, c: [COL.flame1, COL.flame2, COL.flame3, COL.metalDk][i % 4] });
            }
            st.wreck = true;
        }

        /* ═══ 畫面 ═══ */
        function draw() {
            var sky = g.createLinearGradient(0, 0, 0, P.groundY);
            sky.addColorStop(0, COL.sky1); sky.addColorStop(1, COL.sky2);
            g.fillStyle = sky; g.fillRect(0, 0, W, H);
            g.fillStyle = COL.hill; g.beginPath(); g.moveTo(0, P.groundY - 30);
            for (var x = 0; x <= W; x += 20) g.lineTo(x, P.groundY - 30 - 18 * Math.sin(x / 60 + 1) - 8 * Math.sin(x / 17));
            g.lineTo(W, P.groundY); g.lineTo(0, P.groundY); g.closePath(); g.fill();
            var gr = g.createLinearGradient(0, P.groundY - 12, 0, H); gr.addColorStop(0, COL.ground); gr.addColorStop(1, COL.ground2);
            g.fillStyle = gr; g.fillRect(0, P.groundY - 12, W, H);
            drawPad();
            drawFlag();
            if (!st.wreck) drawRocket();
            parts.forEach(function (q) { g.save(); g.globalAlpha = 1 - q.t / q.life; g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.fill(); g.restore(); });  /* forEach：對陣列的每個元素各做一次 */
        }
        /* 標靶：橢圓、紅白相間的同心圈、中間一個 ✕ */
        function drawPad() {
            var rx = P.padW / 2, ry = P.padW * 0.15, cx = P.padX, cy = P.groundY;
            for (var i = 0; i < 4; i++) { var k = 1 - i * 0.24; g.fillStyle = i % 2 ? COL.padB : COL.padA; g.beginPath(); g.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2); g.fill(); }
            g.strokeStyle = COL.ink; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
            g.beginPath(); g.moveTo(cx - ry * 0.5, cy - ry * 0.3); g.lineTo(cx + ry * 0.5, cy + ry * 0.3); g.moveTo(cx + ry * 0.5, cy - ry * 0.3); g.lineTo(cx - ry * 0.5, cy + ry * 0.3); g.stroke();
        }
        /* 風向旗（右上角）：旗子往下風的方向飄；越強越平、越長、抖得越快 */
        function drawFlag() {
            var w = windAt(P, st.t), s = Math.min(1, Math.abs(w) / 70), dir = w >= 0 ? 1 : -1;
            var px = W - 46, top = 58, bottom = 140;
            g.fillStyle = COL.pole; g.fillRect(px - 2, top, 4, bottom - top);
            g.fillStyle = COL.ink; g.fillRect(px - 8, bottom, 16, 4);
            var len = 20 + 34 * s, droop = (1 - s) * 1.25, wav = (2 + 4 * s) * Math.sin(clock * (4 + 10 * s));
            g.save(); g.translate(px, top + 4); g.rotate(dir * droop);
            g.fillStyle = COL.flag; g.beginPath(); g.moveTo(0, 0);
            g.quadraticCurveTo(dir * len * 0.5, wav, dir * len, wav * 0.5 + 8);
            g.quadraticCurveTo(dir * len * 0.5, 18 + wav, 0, 22); g.closePath(); g.fill();
            g.restore();
            g.fillStyle = COL.white; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
            g.fillText((dir > 0 ? '風 → ' : '← 風 ') + windLevel(P.wind) + ' 級', px - 6, bottom + 8);   /* 級數寫這一關的基本風力（跟標題列一樣）；旗子本身會跟著陣風變化 */
        }
        /* 火箭：以下緣中心為轉軸傾斜；先畫火焰（大小＝油門），再畫機身 */
        function drawRocket() {
            var bw = P.baseW, rh = P.rocketH;
            g.save(); g.translate(st.x, st.y); g.rotate(st.tilt * Math.PI / 180);
            var thr = st.thr;
            if (thr > 0.02 && st.fuel > 0) {
                var fw = (P.lander ? bw * 0.26 : bw * 0.34), fl = (P.lander ? rh * 0.9 : rh * 0.42) * thr * (0.85 + 0.15 * Math.sin(clock * 40)) + 6;
                var ey = P.lander ? -rh * 0.08 : -bw * 0.05;
                g.fillStyle = COL.flame3; g.beginPath(); g.moveTo(-fw / 2, ey); g.quadraticCurveTo(0, ey + fl * 1.15, fw / 2, ey); g.fill();
                g.fillStyle = COL.flame2; g.beginPath(); g.moveTo(-fw * 0.35, ey); g.quadraticCurveTo(0, ey + fl * 0.85, fw * 0.35, ey); g.fill();
                g.fillStyle = COL.flame1; g.beginPath(); g.moveTo(-fw * 0.18, ey); g.quadraticCurveTo(0, ey + fl * 0.5, fw * 0.18, ey); g.fill();
            }
            if (P.lander) drawLander(bw, rh); else drawBooster(bw, rh);
            g.restore();
        }
        function drawLander(bw, rh) {
            g.strokeStyle = COL.metal; g.lineWidth = Math.max(2, bw * 0.05);
            g.beginPath(); g.moveTo(-bw * 0.22, -rh * 0.4); g.lineTo(-bw * 0.46, -1); g.moveTo(bw * 0.22, -rh * 0.4); g.lineTo(bw * 0.46, -1); g.stroke();   /* 四隻腳（看得到兩隻） */
            g.fillStyle = COL.metal; g.fillRect(-bw / 2, -3, bw * 0.16, 3); g.fillRect(bw / 2 - bw * 0.16, -3, bw * 0.16, 3);   /* 腳墊（火箭下緣最寬的地方） */
            g.fillStyle = COL.metalDk; g.beginPath(); g.moveTo(-bw * 0.12, -rh * 0.25); g.lineTo(bw * 0.12, -rh * 0.25); g.lineTo(bw * 0.16, -rh * 0.08); g.lineTo(-bw * 0.16, -rh * 0.08); g.closePath(); g.fill();   /* 噴嘴 */
            g.fillStyle = COL.gold; g.fillRect(-bw * 0.3, -rh * 0.55, bw * 0.6, rh * 0.3);   /* 下降段（金色隔熱膜） */
            g.fillStyle = COL.goldDk; g.fillRect(-bw * 0.3, -rh * 0.3, bw * 0.6, rh * 0.05);
            g.fillStyle = COL.metal; g.beginPath(); g.moveTo(-bw * 0.24, -rh * 0.55); g.lineTo(-bw * 0.18, -rh * 0.92); g.lineTo(bw * 0.18, -rh * 0.92); g.lineTo(bw * 0.24, -rh * 0.55); g.closePath(); g.fill();   /* 上升段 */
            g.fillStyle = COL.ink; g.beginPath(); g.arc(0, -rh * 0.74, bw * 0.07, 0, Math.PI * 2); g.fill();   /* 窗 */
        }
        function drawBooster(bw, rh) {
            var body = bw * 0.4, legTop = -rh * 0.22;
            g.strokeStyle = COL.ink; g.lineWidth = Math.max(3, bw * 0.045);
            g.beginPath(); g.moveTo(-body / 2, legTop); g.lineTo(-bw / 2 + 3, -2); g.moveTo(body / 2, legTop); g.lineTo(bw / 2 - 3, -2); g.stroke();   /* 著陸腳 */
            g.fillStyle = COL.ink; g.fillRect(-bw / 2, -4, bw * 0.12, 4); g.fillRect(bw / 2 - bw * 0.12, -4, bw * 0.12, 4);   /* 腳墊（火箭下緣最寬的地方） */
            g.fillStyle = COL.metalDk; g.fillRect(-body * 0.42, -bw * 0.12, body * 0.84, bw * 0.08);   /* 發動機 */
            g.fillStyle = COL.white; g.fillRect(-body / 2, -rh, body, rh - bw * 0.1);                   /* 箭身 */
            g.fillStyle = '#C9CDD1'; g.fillRect(-body / 2, -rh * 0.3, body, rh * 0.06);                  /* 燒焦的痕跡 */
            g.fillStyle = COL.ink; g.fillRect(-body / 2, -rh, body, rh * 0.08);                           /* 級間段 */
            g.fillStyle = COL.metalDk; g.fillRect(-body / 2 - body * 0.28, -rh * 0.9, body * 0.28, body * 0.22); g.fillRect(body / 2, -rh * 0.9, body * 0.28, body * 0.22);   /* 柵格翼 */
            g.fillStyle = '#2E5AA8'; g.fillRect(-body * 0.12, -rh * 0.75, body * 0.24, rh * 0.3);        /* 標誌 */
        }

        /* 驗證用：solve＝交給自動駕駛降落；wrong＝什麼都不按（自由落體墜毀）。可重複呼叫 */
        api.solve = function () { if (phase !== 'done') auto = 'solve'; };
        api.wrong = function () { if (phase !== 'done') auto = 'wrong'; };
        api.info = { get state() { return st; }, params: P, get phase() { return phase; } };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '火箭回收',
        rule: '回收火箭從天上降下來，要讓它**整個落進下方的標靶**，火箭的腳超出標靶、或落地太快都會失敗。**點一下或按住畫面任何地方就會噴火往上推**，火焰越大推力越大。按在畫面左邊火箭往左、按在右邊往右，越靠邊推得越用力。前面幾關火箭很輕，點幾下就會往上；越後面火箭越重、推力越慢才出來，**要提早按住**才不會墜毀。注意右上角的風向旗，風會把火箭吹歪。上方的燃料條變紅就快用完了。一共 30 關，火箭越來越大，最後一關剛好跟標靶一樣寬！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            levelParams: levelParams, windAt: windAt, windLevel: windLevel, initState: initState, sideOf: sideOf, step: step, judge: judge, fuelClass: fuelClass, autopilot: autopilot, rating: rating,
            MAX_LEVEL: MAX_LEVEL, GRAVITY: GRAVITY, A_MAX: A_MAX, SPOOL_UP: SPOOL_UP, SPOOL_DOWN: SPOOL_DOWN, FUEL_S: FUEL_S, SIDE_A: SIDE_A, DRAG_X: DRAG_X, WIND: WIND, GUST: GUST, WIND_LOW: WIND_LOW, WIND_H: WIND_H, V0: V0, X_OFF: X_OFF,
            SAFE_VY: SAFE_VY, SLACK: SLACK, MAX_TILT: MAX_TILT, TOP_MIN: TOP_MIN, BAR_H: BAR_H, GROUND_GAP: GROUND_GAP, PAD_FRAC: PAD_FRAC, BASE_FRAC: BASE_FRAC, LANDER_LEVELS: LANDER_LEVELS, STEP_S: STEP_S, FUEL_LOW: FUEL_LOW, FUEL_CRIT: FUEL_CRIT
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
