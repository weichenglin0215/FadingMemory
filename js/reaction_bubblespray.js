/* ═══════════════════════════════════════════════════════════════════
   reaction_bubblespray.js — 秒反應・泡泡掃射
   樣式：css/games/reaction_bubblespray.css（這款專屬的 class 一律以「bubblespray-」開頭；共用元件在 css/reaction_common.css）
   **按住畫面，砲塔就朝手指的方向一直連射**。大泡泡被打中會破成兩顆小一號的泡泡，小泡泡再破成兩顆更小的……
   一層一個顏色：紅 → 橘 → 黃 → 綠 → 藍 → 靛 → 紫（LAYERS 層），最小的紫泡泡被打中就直接破掉。限時 TIME_S 秒，成績＝打破幾顆。
   ───────────────────────────────────────────────────────────────────
   · 這款求的是「連射的爽感」：子彈打不完、不會失敗，只比打破多少顆。
   · 第 0 秒出現第 1 顆紅色大泡泡，之後每 SPAWN_EVERY（10）秒再多一顆（第 10 秒第 2 顆、第 20 秒第 3 顆…）。
     一顆紅泡泡全部打完是 2^LAYERS − 1 顆（7 層＝127 顆），30 秒 3 顆紅泡泡＝滿分 381 顆。
   · 泡泡之間可以互相重疊、不會碰撞；碰到畫面邊緣會反彈。越小的泡泡飄得越快（SPEED）。
   · 子彈從畫面下方中央的砲塔射出，朝手指的方向直直飛（每秒 FIRE_RATE 發，略有散布 SPREAD_DEG）；**每顆子彈打中一顆泡泡就消失**。
     碰撞用「這一格子彈走過的線段」對每顆泡泡算交點（掃掠），子彈很快也不會穿過小泡泡；同一格碰到好幾顆，取最先碰到的那顆。
   · 破掉時有「分子」特效：一圈水珠往外噴、慢慢變小變淡，再加一圈擴散的光環。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'bubblespray'：選單、成績、存檔都靠它；樣式在 css/games/reaction_bubblespray.css，裡面的 class 名稱一律以 bubblespray- 開頭。 */
    'use strict';

    var ID = 'bubblespray';                             /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 顆', label: '打破幾顆', min: 1, max: 1000 };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var TIME_S = 30;                                    /* 限時幾秒 */
    var SPAWN_EVERY = 10;                               /* 每隔幾秒多一顆紅色大泡泡（第 0 秒就有第 1 顆） */
    /* 每一層的顏色（由大到小）：紅、橘、黃、綠、藍、靛、紫；有幾個顏色就有幾層 */
    var COLORS = ['#E8433A', '#F5892B', '#F7C934', '#5CBF4A', '#3FA9E8', '#4A5FD1', '#9B57D3'];
    var LAYERS = COLORS.length;                         /* 幾層（最後一層打中就直接破掉，不再分裂） */
    var R0 = 110;                                       /* 紅色大泡泡的半徑（px） */
    var R_SHRINK = 0.74;                                /* 每往下一層，半徑乘幾倍（110 → 81 → 60 → 45 → 33 → 24 → 18） */
    var SPEED = [36, 150];                              /* 飄浮速度（px／秒）：最大的紅泡泡 → 最小的紫泡泡（中間線性） */
    var KICK = [70, 160];                               /* 分裂時兩顆小泡泡往兩邊彈開的速度（px／秒）：第 2 層 → 最後一層 */
    var FIRE_RATE = 12;                                 /* 按住時每秒射幾發 */
    var BULLET_V = 950;                                 /* 子彈速度（px／秒） */
    var BULLET_R = 5;                                   /* 子彈半徑（px） */
    var SPREAD_DEG = 2.5;                               /* 子彈的散布（左右各幾度以內隨機），掃射起來比較有感覺 */
    var MIN_UP_DEG = 8;                                 /* 砲口最低只能壓到水平線上幾度（手指按在砲塔旁邊時，不會射進地面） */
    var DRIFT_SPAWN_Y = 0.28;                           /* 新的紅泡泡從畫面上方幾分之幾的高度飄進來 */
    var SOLVE_CAP = 60;                                 /* 驗證用：api.solve 最多幫你打破幾顆 */
    var MAX_LEVEL = 1;                                  /* 只有一局（成績用 scoreOf＝打破幾顆） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 layer 層（0＝紅色大泡泡）的半徑、顏色、飄浮速度 */
    function radiusOf(layer) { return R0 * Math.pow(R_SHRINK, layer); }
    function colorOf(layer) { return COLORS[Math.max(0, Math.min(LAYERS - 1, layer))]; }
    function speedOf(layer) { return SPEED[0] + (SPEED[1] - SPEED[0]) * layer / Math.max(1, LAYERS - 1); }
    /* 一顆紅泡泡全部打完一共幾顆（1 + 2 + 4 + … ＝ 2^LAYERS − 1） */
    function perRed() { return Math.pow(2, LAYERS) - 1; }
    /* 這一局哪幾秒會出現紅色大泡泡（0、10、20…，在 TIME_S 之前） */
    function spawnTimes(total) { var out = []; for (var t = 0; t < (total == null ? TIME_S : total); t += SPAWN_EVERY) out.push(t); return out; }
    /* 滿分：每一顆紅泡泡都打完 */
    function maxScore() { return spawnTimes().length * perRed(); }
    /* 線段 (x0,y0)→(x1,y1) 第一次碰到圓 (cx,cy,r) 的位置（0～1，線段上的比例）；碰不到回傳 −1（起點已經在圓裡面算 0） */
    function segHit(x0, y0, x1, y1, cx, cy, r) {
        var dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy;
        var a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
        if (c <= 0) return 0;
        if (a === 0) return -1;
        var disc = b * b - 4 * a * c;
        if (disc < 0) return -1;
        var t = (-b - Math.sqrt(disc)) / (2 * a);
        return t >= 0 && t <= 1 ? t : -1;
    }
    /* 子彈這一格會打中哪一顆：bubbles 是 [{ x, y, r }]；回傳最先碰到的編號，沒有回傳 −1 */
    function firstHit(x0, y0, x1, y1, bubbles, br) {
        var best = -1, bt = 2;
        for (var i = 0; i < bubbles.length; i++) {
            var b = bubbles[i], t = segHit(x0, y0, x1, y1, b.x, b.y, b.r + (br == null ? BULLET_R : br));
            if (t >= 0 && t < bt) { bt = t; best = i; }
        }
        return best;
    }
    /* 從砲口 (mx,my) 往手指 (px,py) 的方向（弧度；0＝往右、−π/2＝正上方），最低壓到水平線上 MIN_UP_DEG 度 */
    function aimAngle(mx, my, px, py) {
        var a = Math.atan2(py - my, px - mx), lo = -Math.PI + MIN_UP_DEG * Math.PI / 180, hi = -MIN_UP_DEG * Math.PI / 180;
        if (a > 0) a = px >= mx ? hi : lo;                      /* 手指在砲口下面：看在哪一邊，壓到最低角度 */
        return Math.max(lo, Math.min(hi, a));
    }
    /* 一顆泡泡被往 ang 方向飛的子彈打中，分裂成兩顆下一層的泡泡（最後一層回傳空陣列）：往子彈方向的兩側彈開，保留一半原本的速度 */
    function split(b, ang, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        if (b.layer >= LAYERS - 1) return [];
        var L = b.layer + 1, r = radiusOf(L), k = KICK[0] + (KICK[1] - KICK[0]) * (L - 1) / Math.max(1, LAYERS - 2), out = [];
        for (var s = -1; s <= 1; s += 2) {
            var pa = ang + s * Math.PI / 2 + (rand() - 0.5) * 0.6;   /* 跟子彈方向垂直、往兩邊 */
            out.push({ layer: L, r: r, x: b.x + Math.cos(pa) * r * 0.6, y: b.y + Math.sin(pa) * r * 0.6, vx: (b.vx || 0) * 0.5 + Math.cos(pa) * k, vy: (b.vy || 0) * 0.5 + Math.sin(pa) * k });
        }
        return out;
    }
    /* 泡泡往前飄 dt 秒，碰到範圍 [0, W]×[0, H] 的邊就反彈；越跑越快的會被慢慢拉回「這一層的速度」 */
    function drift(b, W, H, dt) {
        var want = speedOf(b.layer), sp = Math.hypot(b.vx, b.vy) || 1, k = Math.min(1, dt * 1.2);
        var ns = sp + (want - sp) * k;
        b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
        return b;
    }
    /* 結算評語 */
    function rating(n) {
        if (n >= 300) return '泡泡終結者！';
        if (n >= 200) return '火力全開！';
        if (n >= 120) return '掃得好爽！';
        if (n >= 50) return '再按久一點！';
        return '按住不要放，一直掃！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把流程（結算、最佳紀錄）交給共用骨架 kit.run；只有一局，成績用 scoreOf（S.score＝打破幾顆）。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 100, stageClass: 'bubblespray-stage', resume: false,
            head: function () { return '泡泡掃射'; },
            info: function (S) { return '打破 ' + S.score + ' 顆'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 顆'; },
            rating: rating,
            lines: function (S) { return [TIME_S + ' 秒內打破 ' + S.score + ' 顆泡泡（滿分 ' + maxScore() + ' 顆）']; },
            setup: setup
        });
    }

    /* setup(api)：遊戲開始時呼叫一次，把畫面建出來、開始動畫迴圈並處理按壓。 */
    function setup(api) {
        var stage = api.stage, S = api.S, rand = api.rand;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var GROUND = H - 30, MX = W / 2, MY = GROUND - 52, BARREL = 46;     /* 砲塔的位置、砲管長度 */
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = h('canvas', { 'class': 'bubblespray-canvas' });
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);    /* Math.round：四捨五入成整數 */
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var g = cv.getContext('2d'); g.scale(dpr, dpr);

        var bubbles = [], bullets = [], parts = [], spawns = spawnTimes(), spawned = 0, clock = 0, over = false, fireAcc = 0, auto = false;
        var down = null, aim = -Math.PI / 2;
        S.score = 0; api.setInfo('打破 0 顆');
        api.info = { get bubbles() { return bubbles; }, get clock() { return clock; }, get score() { return S.score; } };
        console.log('[泡泡掃射] ' + LAYERS + ' 層，一顆紅泡泡 ' + perRed() + ' 顆；紅泡泡出現在第 ' + spawns.join('、') + ' 秒，滿分 ' + maxScore());  /* 在瀏覽器主控台（按 F12）印出設定，方便除錯 */
        if (kit.once('bubblespray.hint')) kit.hintOn(stage, null, { mode: 'hold', x: W * 0.5, y: H * 0.35, delay: 500, text: '按住不放，一直掃射' });  /* 操作提示（手指圖示）：玩家第一次按下就消失 */
        api.timer(TIME_S * 1000, timeUp);               /* 開始倒數（畫面上方的時間條）：時間到就呼叫 timeUp */

        /* 按住＝連射；手指移動＝改方向 */
        cv.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            var p = kit.localPt(e, cv); down = { id: e.pointerId, x: p.x, y: p.y };
            if (fireAcc < 1) fireAcc = 1;               /* 一按下就先射一發 */
        });
        cv.addEventListener('pointermove', function (e) { if (down && e.pointerId === down.id) { var p = kit.localPt(e, cv); down.x = p.x; down.y = p.y; } });
        function up(e) { if (down && e.pointerId === down.id) down = null; }
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

        api.my.loop(function (now, dt) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!cv.isConnected) return false;
            var d = Math.min(dt, 50) / 1000;
            if (!over) { clock += d; update(d); }
            else updateParts(d);
            draw();
        });

        function addRed() {
            var r = radiusOf(0), fromLeft = rand() < 0.5;
            bubbles.push({ layer: 0, r: r, x: fromLeft ? r : W - r, y: H * DRIFT_SPAWN_Y + (rand() - 0.5) * 60, vx: (fromLeft ? 1 : -1) * speedOf(0), vy: (rand() - 0.5) * 30, ph: rand() * 6.28 });
        }
        function update(d) {
            while (spawned < spawns.length && clock >= spawns[spawned]) { addRed(); spawned++; }
            /* 瞄準：有按著就朝手指（自動驗證時朝最近的泡泡） */
            var target = down || (auto && bubbles.length ? bubbles[0] : null);
            if (target) aim = aimAngle(MX, MY, target.x, target.y);
            /* 連射 */
            if (target) {
                fireAcc += d * FIRE_RATE;
                while (fireAcc >= 1) { fireAcc -= 1; shoot(); }
            } else fireAcc = Math.min(fireAcc, 0.999);
            bubbles.forEach(function (b) { drift(b, W, GROUND, d); });  /* forEach：對陣列的每個元素各做一次 */
            /* 子彈：掃掠碰撞，打中就消失 */
            for (var i = bullets.length - 1; i >= 0; i--) {
                var u = bullets[i], x1 = u.x + u.vx * d, y1 = u.y + u.vy * d;
                var k = firstHit(u.x, u.y, x1, y1, bubbles, BULLET_R);
                if (k >= 0) { bullets.splice(i, 1); pop(k, Math.atan2(u.vy, u.vx)); continue; }  /* splice：從陣列中刪掉元素 */
                u.x = x1; u.y = y1;
                if (u.x < -20 || u.x > W + 20 || u.y < -20 || u.y > H + 20) bullets.splice(i, 1);
            }
            updateParts(d);
        }
        function updateParts(d) {
            for (var j = parts.length - 1; j >= 0; j--) {
                var q = parts[j]; q.t += d;
                if (q.t >= q.life) { parts.splice(j, 1); continue; }
                var drag = Math.exp(-3 * d); q.vx *= drag; q.vy *= drag; q.vy += 60 * d;
                q.x += q.vx * d; q.y += q.vy * d; q.r += (q.grow || 0) * d;
            }
        }
        function shoot() {
            var a = aim + (rand() - 0.5) * 2 * SPREAD_DEG * Math.PI / 180;
            bullets.push({ x: MX + Math.cos(aim) * BARREL, y: MY + Math.sin(aim) * BARREL, vx: Math.cos(a) * BULLET_V, vy: Math.sin(a) * BULLET_V });
        }
        /* 打破第 k 顆：+1、分子特效、分裂成兩顆下一層的 */
        function pop(k, ang) {
            var b = bubbles[k];
            bubbles.splice(k, 1);
            S.score++; api.setInfo('打破 ' + S.score + ' 顆'); Sfx.play('pop');  /* Sfx.play(名稱)：播放音效（音效是程式即時合成的） */
            molecules(b);
            Array.prototype.push.apply(bubbles, split(b, ang, rand));
        }
        /* 分子特效：一圈水珠往外噴（顏色跟泡泡一樣，還有幾顆白色亮點），加一圈擴散的光環 */
        function molecules(b) {
            var n = 10 + Math.round(b.r / 6), col = colorOf(b.layer);
            parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: b.r, grow: b.r * 2.2, t: 0, life: 0.28, kind: 'ring', c: col });
            for (var i = 0; i < n; i++) {
                var a = i / n * Math.PI * 2 + rand() * 0.4, v = (90 + rand() * 160) * (0.6 + b.r / R0);
                parts.push({ x: b.x + Math.cos(a) * b.r * 0.8, y: b.y + Math.sin(a) * b.r * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + rand() * (2 + b.r / 18), t: 0, life: 0.45 + rand() * 0.35, kind: 'dot', c: rand() < 0.25 ? '#FFFFFF' : col });
            }
        }
        function timeUp() {
            if (over) return;
            over = true; down = null;
            console.log('[泡泡掃射] 時間到：' + S.score + ' 顆');
            api.fail({ delay: 1500, lines: [TIME_S + ' 秒到了！'] });  /* api.fail({ delay, lines })：這局結束，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }

        /* ═══ 畫面 ═══ */
        function draw() {
            var sky = g.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0, '#1C2A4A'); sky.addColorStop(1, '#3B5B8C');
            g.fillStyle = sky; g.fillRect(0, 0, W, H);
            g.fillStyle = '#26354F'; g.fillRect(0, GROUND, W, H - GROUND);
            bubbles.forEach(drawBubble);
            parts.forEach(drawPart);
            g.fillStyle = '#FFF3B0';
            bullets.forEach(function (u) { g.beginPath(); g.arc(u.x, u.y, BULLET_R, 0, Math.PI * 2); g.fill(); });
            drawTurret();
        }
        /* 一顆泡泡：半透明的彩色球、外框、左上角的反光 */
        function drawBubble(b) {
            var col = colorOf(b.layer), wob = 1 + 0.03 * Math.sin(clock * 5 + (b.ph || 0));
            var gr = g.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
            gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.35, col); gr.addColorStop(1, col);
            g.save(); g.globalAlpha = 0.82;
            g.fillStyle = gr; g.beginPath(); g.ellipse(b.x, b.y, b.r * wob, b.r / wob, 0, 0, Math.PI * 2); g.fill();
            g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1.5, b.r * 0.05); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(b.x - b.r * 0.38, b.y - b.r * 0.42, b.r * 0.18, b.r * 0.1, -0.6, 0, Math.PI * 2); g.fill();
            g.restore();
        }
        function drawPart(q) {
            var k = q.t / q.life;
            g.save();
            if (q.kind === 'ring') { g.globalAlpha = 0.7 * (1 - k); g.strokeStyle = q.c; g.lineWidth = 4 * (1 - k) + 1; g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.stroke(); }
            else { g.globalAlpha = 1 - k; g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, Math.max(0.5, q.r * (1 - k * 0.7)), 0, Math.PI * 2); g.fill(); }
            g.restore();
        }
        function drawTurret() {
            g.save();
            g.translate(MX, MY); g.rotate(aim);
            g.fillStyle = '#9AA7B8'; g.fillRect(0, -8, BARREL, 16);
            g.fillStyle = '#5E6B7D'; g.fillRect(BARREL - 6, -10, 8, 20);
            g.restore();
            g.fillStyle = '#C9D2DE'; g.beginPath(); g.arc(MX, MY, 24, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#5E6B7D'; g.fillRect(MX - 40, MY + 14, 80, GROUND - MY - 14);
        }

        /* 驗證用（會被重複呼叫，要冪等）：solve＝直接打破畫面上的泡泡（最多 SOLVE_CAP 顆）；wrong＝開啟自動掃射（瞄準第一顆泡泡） */
        api.solve = function () { if (over) return; while (S.score < SOLVE_CAP && bubbles.length) pop(0, -Math.PI / 2); };
        api.wrong = function () { auto = true; };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '泡泡掃射',
        rule: '**按住畫面，砲塔就朝手指的方向一直連射**，手指移到哪裡就掃到哪裡。紅色大泡泡被打中會破成兩顆橘色泡泡，橘色再破成黃色，接著是綠、藍、靛、紫，越破越小、越多、飄得越快。每顆子彈打中一顆泡泡就會消失，泡泡之間會重疊不會互撞。第 0 秒出現第一顆紅泡泡，之後每 10 秒再多一顆。限時 30 秒，**看你能打破幾顆**！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            radiusOf: radiusOf, colorOf: colorOf, speedOf: speedOf, perRed: perRed, spawnTimes: spawnTimes, maxScore: maxScore, segHit: segHit, firstHit: firstHit, aimAngle: aimAngle, split: split, drift: drift, rating: rating,
            TIME_S: TIME_S, SPAWN_EVERY: SPAWN_EVERY, COLORS: COLORS, LAYERS: LAYERS, R0: R0, R_SHRINK: R_SHRINK, SPEED: SPEED, KICK: KICK, FIRE_RATE: FIRE_RATE, BULLET_V: BULLET_V, BULLET_R: BULLET_R, SPREAD_DEG: SPREAD_DEG, MIN_UP_DEG: MIN_UP_DEG, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
