/* ═══════════════════════════════════════════════════════════════════
   reaction_hangpic.js — 秒反應・掛畫
   把相框轉到「剛好是水平的」。牆面沒有任何水平或垂直的線條，只有刻意傾斜的條紋或碎花，
   畫框的顏色又跟牆面很接近，很難靠對比判斷。按「掛好了」之後，鏡頭推進看差了幾度。
   只有一次機會（就像零秒出手）：玩家追求的是「單次」的最小誤差，想再拚就按「再挑戰一次」。
   ───────────────────────────────────────────────────────────────────
   · 牆面兩種：斜條紋（傾斜角 12°～78°，故意不是水平也不是垂直）或碎花（位置抖動、方向隨機，
     沒有成列成行的對齊線索）。
   · 畫框顏色比牆面暗 CONTRAST 個亮度 %（越小越難分辨）。
   · 起始歪斜角度最大 START_DEV 度（隨機左右，實際是最大值的 60%～100%）。
   · （舊版是 5 回合、難度逐回合變難、成績取平均；改成單次之後，難度固定在原本第 3 回合的程度。）
   · 轉動：手指在畫面上繞著相框中心轉，轉動量依手指速度打折（慢 ×GAIN_MIN、快 ×1），所以可以微調；
     另有 ◀ ▶ 每次 0.1°（按住會連續）。過程中不顯示任何刻度。
   · 判定值＝相框相對真水平的夾角（全精度；矩形轉 180° 看起來一樣，所以取 (-90°, 90°]）。
   · 結算：以相框右下角為固定錨點，鏡頭推進 ×8／×80／×800（紅色水平線是真水平，從左下角拉出來），
     放大到「紅線還在畫面內」為止，最後寫「差了 X.XX 度」。
   · 成績＝這一次的誤差（度，越小越好）；誤差的第 3、4 位若是 0 會偽造成非 0（Leaderboard.fake4，結算時只產生一次）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'hangpic';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 hangpic 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 度', label: '誤差', min: 0, max: 91 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 相框大小與外框粗細（px） */
    var FRAME_W = 300, FRAME_H = 220, BORDER = 16;
    var CONTRAST = 7;                                   /* 畫框比牆面暗幾個 L%（越小越難分；舊版第 1 → 5 回合是 10 → 4，單次取中間） */
    var START_DEV = 16;                                 /* 起始歪斜角度上限（度；舊版第 1 → 5 回合是 25 → 8，單次取中間） */
    /* 手指轉動的「增益」：轉得慢時 ×0.12（方便微調），轉得快時 ×1 */
    var GAIN_MIN = 0.12, SPEED_FULL = 0.25;            /* 手指轉動：慢 ×0.12，快到 0.25 度／毫秒以上 ×1 */
    var NUDGE_DEG = 0.1;
    /* 結算時鏡頭放大的倍率（8 倍 → 80 倍 → 800 倍） */
    var ZOOMS = [8, 80, 800];
    var ZOOM_MS = 1000, ZOOM_HOLD_MS = 600, VIEW_RED_PX = 200;
    var NEXT_MS = 1600;
    var DEAD_ZONE = 30;                                /* 離相框中心多近就不理（px，客戶端座標）*/

    /* 最佳紀錄顯示文字（單次誤差，度，4 位小數） */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v.toFixed(4) + '°'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 角度正規化：矩形轉 180 度長得一樣，所以把角度整理到 −90～90 度之間。 ((deg % 180) + 180) % 180 可以讓負數也得到正確結果 */
    /* 角度正規化成 (-90, 90]：矩形轉 180° 一樣 */
    function norm180(deg) { var d = ((deg % 180) + 180) % 180; return d > 90 ? d - 180 : d; }
    /* 誤差＝相框離水平差幾度（取絕對值） */
    function errDeg(theta) { return Math.abs(norm180(theta)); }
    /* 依手指轉動速度算增益：kit.lerp 線性插值，kit.clamp 把速度限制在 0～1 */
    function gainFor(speed) { return kit.lerp(GAIN_MIN, 1, kit.clamp(speed / SPEED_FULL, 0, 1)); }
    /* 兩個角度之間的最短有號差（避免 359 度到 1 度被誤認為轉了 358 度） */
    /* 兩個角度之間的最短有號差 */
    function angDelta(a, b) { return ((b - a + 540) % 360) - 180; }
    /* 算出要放大到哪些倍率：紅線與錨點的距離 × 倍率 ≤ VIEW_RED_PX（螢幕上 200px）才能保證紅線還在畫面內 */
    /* 要放大到哪些倍率：紅線到錨點的距離（倍率 1 時，px）× 倍率 ≤ VIEW_RED_PX 的最大一段為止 */
    function zoomPlan(distAt1) {
        var stages = [];
        for (var i = 0; i < ZOOMS.length; i++) { if (distAt1 * ZOOMS[i] <= VIEW_RED_PX) stages.push(ZOOMS[i]); else break; }
        if (!stages.length) { var z = VIEW_RED_PX / Math.max(distAt1, 1e-9); if (z > 1.15) stages.push(Math.min(z, ZOOMS[0])); }
        return stages;
    }
    /* 相框右下角比左下角低多少 px（邊長 × sin 角度）＝要放大多少倍的依據 */
    /* 相框右下角與左下角的高度差（px）＝推進的依據 */
    function cornerDrop(theta) { return FRAME_W * Math.sin(theta * Math.PI / 180); }
    /* 出題：隨機決定牆面種類（條紋／碎花）、傾斜角度、起始歪斜、顏色（難度固定，每一次挑戰都一樣難） */
    /* 出題：牆面種類／參數、起始角度 */
    function makeRound(rand) {
        rand = rand || Math.random;
        var wall = rand() < 0.5 ? 'stripes' : 'flowers';
        var mag = kit.randFloat(12, 38, rand);
        /* 牆面條紋的傾斜角：刻意避開 0 度（水平）與 90 度（垂直），才不會有線索 */
        var alpha = (rand() < 0.5 ? 1 : -1) * (rand() < 0.5 ? mag : 90 - mag + 0);      /* 12～38° 或 52～78° */
        var dev = START_DEV * kit.randFloat(0.6, 1, rand);
        return {
            hue: kit.randInt(0, 359, rand), wall: wall, alpha: alpha,
            start: (rand() < 0.5 ? 1 : -1) * dev, contrast: CONTRAST,
            seed: kit.randInt(1, 1e9, rand)
        };
    }
    /* 依這一次的誤差給評語 */
    function rating(e) {
        if (e < 0.05) return '神乎其技！';
        if (e < 0.2) return '高手！';
        if (e < 0.5) return '很準！';
        if (e < 1) return '不錯喔！';
        return '再試一次，會更準！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版的最佳紀錄是「五回合的平均誤差」，跟現在的「單次誤差」不能比：第一次進來清掉，從頭累積（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.single');
        var R = null;

        /* round：開一局（只有一次機會） */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* theta 相框目前的旋轉角度；cfg 這一次的設定；lastErr 這一次的誤差（按下「掛好了」之後才有） */
            var theta = 0, state = 'idle', cfg = null, lastErr = null;
            /* 建立畫面元素：標題、牆面場地、◀ 掛好了 ▶ 按鈕列、結果橫幅 */
            var head = h('div', { 'class': 'hp-head' });
            var field = h('div', { 'class': 'hp-field' });
            var nudgeL = h('button', { 'class': 'btn btn--line hp-nudge', text: '◀' });
            var doneBtn = h('button', { 'class': 'btn btn--go hp-done', text: '掛好了' });
            var nudgeR = h('button', { 'class': 'btn btn--line hp-nudge', text: '▶' });
            var ctrl = h('div', { 'class': 'hp-ctrl' }, [nudgeL, doneBtn, nudgeR]);
            var verdict = h('div', { 'class': 'hp-verdict' });
            [head, field, ctrl].forEach(function (x) { root.appendChild(x); });
            field.appendChild(verdict);
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            /* SVG 繪圖用的變數：場地大小、各個圖層（牆、相框、紅線、綠線）和相框中心 (CX,CY) */
            var FW = 0, FH = 0, svg = null, gWall = null, gFrame = null, refLine = null, edgeLine = null, full = null, CX = 0, CY = 0;

            /* 可重現的亂數函式（mulberry32）：同一個 seed 每次都畫出一樣的碎花，這回合重新建構畫面時不會變 */
            function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

            /* build：畫出這一回合的牆面與相框 */
            function build() {
                if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
                FW = field.clientWidth; FH = field.clientHeight; CX = FW / 2; CY = FH * 0.46;
                /* 用 SVG 畫：viewBox 是畫布座標，結算時改 viewBox 就能「鏡頭推進」，而且向量圖放大永遠不糊 */
                svg = kit.svg('svg', { 'class': 'hp-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' });
                field.insertBefore(svg, verdict);
                full = { vx: 0, vy: 0, vw: FW, vh: FH };
                var wallL = 84, hue = cfg.hue;
                /* 牆面底色：大矩形鋪滿（座標故意超出畫面，放大時才不會露出邊緣） */
                kit.svg('rect', { x: -2000, y: -2000, width: 5000, height: 5000, fill: 'hsl(' + hue + ',32%,' + wallL + '%)' }, svg);
                gWall = kit.svg('g', {}, svg);
                var rnd = seeded(cfg.seed);
                /* 斜條紋牆：畫很多斜的長條矩形，整組 rotate(傾斜角) */
                if (cfg.wall === 'stripes') {
                    var g = kit.svg('g', { transform: 'rotate(' + cfg.alpha + ' ' + CX + ' ' + CY + ')' }, gWall);
                    var diag = Math.sqrt(FW * FW + FH * FH);
                    for (var x = -diag; x < diag; x += 58) kit.svg('rect', { x: CX + x, y: CY - diag, width: 26, height: diag * 2, fill: 'hsl(' + hue + ',32%,' + (wallL - 5) + '%)' }, g);
                } else {
                    /* 碎花牆：「拒絕取樣」——隨機取點，離已有的花太近就丟掉重取，避免碎花排成整齊的行列（那會變成判斷水平的線索） */
                    /* 碎花：位置抖動、方向隨機。用「拒絕取樣」避免成列成行 */
                    var pts = [];
                    for (var tries = 0; tries < 900 && pts.length < 62; tries++) {
                        var px = rnd() * FW, py = rnd() * FH, okp = true;
                        for (var q = 0; q < pts.length; q++) { var dx = pts[q][0] - px, dy = pts[q][1] - py; if (dx * dx + dy * dy < 62 * 62) { okp = false; break; } }
                        if (okp) pts.push([px, py]);
                    }
                    /* 每朵花：5 片花瓣的圓 + 中心花蕊 */
                    pts.forEach(function (p) {
                        var f = kit.svg('g', { transform: 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ') rotate(' + (rnd() * 72).toFixed(0) + ') scale(' + (0.8 + rnd() * 0.5).toFixed(2) + ')' }, gWall);
                        for (var k = 0; k < 5; k++) {
                            var a = k * 72 * Math.PI / 180;
                            kit.svg('circle', { cx: 11 * Math.sin(a), cy: -11 * Math.cos(a), r: 8, fill: 'hsl(' + ((hue + 20) % 360) + ',38%,' + (wallL - 9) + '%)' }, f);
                        }
                        kit.svg('circle', { cx: 0, cy: 0, r: 5, fill: 'hsl(' + ((hue + 60) % 360) + ',40%,' + (wallL - 3) + '%)' }, f);
                    });
                }
                /* 相框：整組（gFrame）一起繞中心旋轉，所以之後只要改這個 g 的 transform 就能轉動 */
                /* 相框（整組繞中心旋轉）*/
                gFrame = kit.svg('g', {}, svg);
                var W = FRAME_W, H = FRAME_H, B = BORDER, frameL = wallL - cfg.contrast;
                kit.svg('rect', { x: CX - W / 2 + 5, y: CY - H / 2 + 7, width: W, height: H, fill: 'rgba(74,59,30,0.12)' }, gFrame);        /* 直角，沒有圓角：放大之後才看得到邊緣 */
                kit.svg('rect', { x: CX - W / 2, y: CY - H / 2, width: W, height: H, fill: 'hsl(' + hue + ',32%,' + frameL + '%)' }, gFrame);
                kit.svg('rect', { x: CX - W / 2 + B, y: CY - H / 2 + B, width: W - 2 * B, height: H - 2 * B, fill: 'hsl(' + hue + ',22%,93%)' }, gFrame);
                /* 畫框內的圖案：用曲線和圓，不要有水平垂直線 */
                /* 畫裡面的圖案：曲線和圓，不用水平垂直的線 */
                kit.svg('circle', { cx: CX + 52, cy: CY - 34, r: 20, fill: 'hsl(' + ((hue + 40) % 360) + ',45%,82%)' }, gFrame);
                kit.svg('path', { d: 'M' + (CX - W / 2 + B) + ' ' + (CY + 40) + ' Q ' + (CX - 60) + ' ' + (CY - 30) + ' ' + (CX + 10) + ' ' + (CY + 30) + ' T ' + (CX + W / 2 - B) + ' ' + (CY + 20) + ' L ' + (CX + W / 2 - B) + ' ' + (CY + H / 2 - B) + ' L ' + (CX - W / 2 + B) + ' ' + (CY + H / 2 - B) + ' Z', fill: 'hsl(' + ((hue + 120) % 360) + ',30%,84%)' }, gFrame);
                /* 畫框下緣的綠色邊緣線（跟著相框轉） */
                /* 畫框下緣的邊緣線（綠色，跟著相框轉，兩端拉得很長）：按「掛好了」之後才顯示 */
                edgeLine = kit.svg('line', { x1: CX - 4000, x2: CX + 4000, y1: CY + H / 2, y2: CY + H / 2, stroke: 'hsl(135,60%,32%)', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', opacity: 0 }, gFrame);
                /* 紅色水平線：真正的水平，結算時才顯示（vector-effect: non-scaling-stroke 讓線寬不被縮放影響） */
                refLine = kit.svg('line', { x1: -3000, x2: 4000, y1: 0, y2: 0, stroke: 'hsl(2,75%,48%)', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', opacity: 0 }, svg);
                setTheta(theta);
            }
            /* 轉到角度 t：設定 SVG 的 rotate(角度 圓心x 圓心y) */
            function setTheta(t) { theta = t; gFrame.setAttribute('transform', 'rotate(' + t.toFixed(4) + ' ' + CX + ' ' + CY + ')'); }

            /* 開始（只有一次機會） */
            function startRound() {
                if (my.dead) return;
                /* 產生這一次的設定 */
                cfg = makeRound();
                theta = cfg.start;
                build();
                verdict.textContent = ''; verdict.classList.remove('hp-verdict--on');
                state = 'play';
                head.textContent = '只有一次機會　把相框轉成水平';
                try { console.info('[掛畫] 牆面 ' + cfg.wall + (cfg.wall === 'stripes' ? '（條紋傾斜 ' + cfg.alpha.toFixed(1) + '°）' : '') + '，畫框比牆暗 ' + cfg.contrast.toFixed(1) + '%，起始歪斜 ' + cfg.start.toFixed(2) + '°'); } catch (e) { }
            }

            /* 手指轉動相框的處理 */
            /* ─── 轉動 ─── */
            /* drag 記錄正在拖曳的手指 */
            var drag = null;
            /* 相框中心在螢幕上的座標（每次重新量，因為畫面會被縮放） */
            function centerClient() { var rc = svg.getBoundingClientRect(); return { x: rc.left + rc.width * CX / FW, y: rc.top + rc.height * CY / FH }; }
            /* 手指按下：離中心太近的位置不理（角度會抖得很厲害） */
            field.addEventListener('pointerdown', function (e) {
                if (state !== 'play' || drag) return;
                var c = centerClient(), dx = e.clientX - c.x, dy = e.clientY - c.y;
                if (Math.sqrt(dx * dx + dy * dy) < DEAD_ZONE) return;
                e.preventDefault();
                try { field.setPointerCapture(e.pointerId); } catch (err) { }
                /* 記下手指目前的角度（Math.atan2 算出角度，乘 180/π 把弧度換成度）與時間 */
                drag = { id: e.pointerId, a: Math.atan2(dy, dx) * 180 / Math.PI, t: performance.now() };
            });
            /* 手指移動：計算角度變化 da 與花費時間 dt，速度＝da/dt；轉越慢增益越小，方便微調 */
            field.addEventListener('pointermove', function (e) {
                if (state !== 'play' || !drag || e.pointerId !== drag.id) return;
                var c = centerClient(), dx = e.clientX - c.x, dy = e.clientY - c.y;
                if (Math.sqrt(dx * dx + dy * dy) < DEAD_ZONE) return;
                var a = Math.atan2(dy, dx) * 180 / Math.PI, now = performance.now();
                var da = angDelta(drag.a, a), dt = Math.max(1, now - drag.t);
                setTheta(theta + da * gainFor(Math.abs(da) / dt));
                drag.a = a; drag.t = now;
            });
            function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
            field.addEventListener('pointerup', endDrag);
            field.addEventListener('pointercancel', endDrag);

            /* ◀ ▶ 微調按鈕：按一下轉 0.1 度，按住會連續轉（先等 350ms×3 次，之後每 60ms 一次） */
            function nudge(btn, dir) {
                var rep = null;
                function step() { if (state === 'play') setTheta(theta + dir * NUDGE_DEG); }
                btn.addEventListener('pointerdown', function (e) {
                    e.preventDefault(); step();
                    var n = 0;
                    /* 這是遞迴的小技巧：again() 每次排下一次 step()，直到 stop() 取消 */
                    (function again() { rep = my.after(n++ < 3 ? 350 : 60, function () { step(); again(); }); })();
                });
                function stop() { if (rep != null) { my.cancel(rep); rep = null; } }
                btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
            }
            nudge(nudgeL, -1); nudge(nudgeR, 1);
            /* 「掛好了」按鈕：送出 */
            doneBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); submit(); });

            /* 結算：鏡頭推進 */
            /* ─── 結算：鏡頭推進 ─── */
            /* 算出相框底邊左／右角在畫面上的位置（旋轉矩陣：x' = x·cosθ − y·sinθ，y' = x·sinθ + y·cosθ） */
            function corner(sign) {      /* 相框底邊左(-1)／右(+1) 角在畫面上的位置 */
                var a = theta * Math.PI / 180, x = sign * FRAME_W / 2, y = FRAME_H / 2;
                return { x: CX + x * Math.cos(a) - y * Math.sin(a), y: CY + x * Math.sin(a) + y * Math.cos(a) };
            }
            /* 算出放大 z 倍、以某個點為中心的新 viewBox */
            function boxFor(tip, z) {
                var vw = FW / z, vh = FH / z;
                return { vx: tip.x - (tip.x / FW) * vw, vy: tip.y - (tip.y / FH) * vh, vw: vw, vh: vh };
            }
            /* 送出：算出誤差，顯示紅線與綠線，然後依序把鏡頭推進到右下角 */
            function submit() {
                if (state !== 'play') return;
                state = 'zoom';
                /* 這一次的誤差（度）＝最終成績：第 3、4 位不為 0，只產生這一次；畫面上的文字、最佳紀錄、世界排行榜都用它。
                   放大看到的紅線與綠線（zoomPlan）仍然是真實的角度差 */
                var realE = errDeg(theta);
                var e = Leaderboard.fake4(realE);
                console.log('掛畫：實際差 ' + realE.toFixed(6) + ' 度 → 成績 ' + e.toFixed(4) + ' 度');
                lastErr = e;
                Sfx.play('click');
                var bl = corner(-1), br = corner(1);
                refLine.setAttribute('y1', bl.y); refLine.setAttribute('y2', bl.y); refLine.setAttribute('opacity', 1);
                edgeLine.setAttribute('opacity', 1);
                head.textContent = '紅線是真正的水平，綠線是畫框的下緣';
                /* plan＝要放大的倍率清單 */
                var plan = zoomPlan(Math.abs(br.y - bl.y));
                /* my.wait 回傳 Promise（等一下）；用 .then 把每一段放大動畫「串」起來，一段播完才播下一段 */
                var chain = my.wait(400), cur = full;
                plan.forEach(function (z) {
                    chain = chain.then(function () {
                        Sfx.play('zoom');
                        gWall.style.display = 'none';
                        var to = boxFor(br, z);
                        /* kit.tweenViewBox：動畫修改 SVG 的 viewBox，達成平順的鏡頭推進 */
                        return kit.tweenViewBox(my, svg, cur, to, ZOOM_MS, kit.easeInOutCubic).then(function () { cur = to; return my.wait(ZOOM_HOLD_MS); });
                    });
                });
                chain.then(function () {
                    var side = norm180(theta) > 0.005 ? '（順時針歪）' : (norm180(theta) < -0.005 ? '（逆時針歪）' : '');
                    verdict.textContent = e < 0.005 ? '差了 ' + e.toFixed(4) + ' 度・分毫不差！' : '差了 ' + e.toFixed(4) + ' 度' + side;
                    verdict.classList.add('hp-verdict--on');
                    Sfx.play(e < 0.2 ? 'win' : 'click');
                    /* 讓玩家看一下放大後的畫面，再蓋上結算卡片（有「再挑戰一次」） */
                    my.after(NEXT_MS, function () { finish(e, side); });
                });
            }

            /* 結算：這一次的誤差就是成績（只有一次機會，想再拚就按「再挑戰一次」） */
            function finish(e, side) {
                state = 'done';
                /* 這個遊戲誤差「越小越好」，所以比較函式是 v < b */
                var isNew = Reaction.setBest(ID, e, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                kit.result(root, {
                    score: e,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                    num: e.toFixed(4) + ' 度', label: rating(e),
                    lines: ['相框' + (side ? side.replace(/[（）]/g, '') : '剛好水平'), '只有一次機會，想拚更準就再挑戰一次'],
                    isNew: isNew, sfx: e < 0.5 ? 'perfect' : (e < 1.5 ? 'win' : 'fail'), onAgain: round
                });
            }

            /* G.debug：測試用後門，spin 可以用真的 PointerEvent 模擬手指轉動 */
            G.debug = {
                state: function () { return { state: state, theta: theta, cfg: cfg, last: lastErr }; },
                setTheta: setTheta,
                submit: submit,
                spin: function (deg) {      /* 用真的 PointerEvent 繞著相框中心轉 deg 度（快速） */
                    var c = centerClient(), rad = 120, a0 = 0, n = Math.max(1, Math.ceil(Math.abs(deg) / 8));
                    function at(a) { var t = a * Math.PI / 180; return { clientX: c.x + rad * Math.cos(t), clientY: c.y + rad * Math.sin(t) }; }
                    var p = at(a0);
                    field.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.clientX, clientY: p.clientY, bubbles: true, cancelable: true, pointerId: 21 }));
                    for (var i = 1; i <= n; i++) { var q = at(a0 + deg * i / n); field.dispatchEvent(new PointerEvent('pointermove', { clientX: q.clientX, clientY: q.clientY, bubbles: true, cancelable: true, pointerId: 21 })); }
                    field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21 }));
                    return theta;
                }
            };
            /* 開場等 300 毫秒再開始第一回合 */
            my.after(300, startRound);
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '掛畫',
        rule: '把相框轉到剛好水平。牆上沒有水平或垂直的線，畫框顏色又和牆很像，只能靠眼睛判斷。手指繞著相框轉，慢慢轉可以微調，也可以按 ◀ ▶。每次只有一次機會，按「掛好了」之後鏡頭會放大，告訴你差了幾度，目標是 0.0000 度！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { norm180: norm180, errDeg: errDeg, gainFor: gainFor, angDelta: angDelta, zoomPlan: zoomPlan, cornerDrop: cornerDrop, makeRound: makeRound, rating: rating, CONTRAST: CONTRAST, START_DEV: START_DEV, FRAME_W: FRAME_W }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
