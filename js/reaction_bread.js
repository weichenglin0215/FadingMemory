/* ═══════════════════════════════════════════════════════════════════
   reaction_bread.js — 秒反應・秤麵包重量
   把一塊麵包垂直切成左右兩半，掉到左右兩個電子秤上，兩邊的重量差距要在標準以內才能過關。
   後面的關卡麵包會變成梯形、不等邊三角形，中間切不一定剛好一半。
   ───────────────────────────────────────────────────────────────────
   · 過關標準：兩邊重量差距 = |左 − 右| ÷ 較重的那一邊。第 1 關 10.00%，之後每關少 1.00%，
     第 10 關起固定 1.00%（thrFor）。
   · 麵包的形狀（均勻密度，重量＝面積）：
        第 1 關     橫向長方形
        第 2~7 關   梯形（橫向長方形，其中一邊的高度比另一邊矮，矮邊/高邊比 0.95 → 0.45，每關少 0.1，
                    所以第 2 關就是「稍微斜一點」的梯形，斜度每關線性加大）
        第 8 關起   不等邊三角形（頂點的位置在底邊 15%~35% 或 65%~85% 處，不會是正中央）
     每一關的總重量也不一樣（250~480 公克），所以不能背數字。
   · 操作：在麵包上拖曳決定刀的位置——手指一碰，刀先跳到手指下面（粗調），之後手指移動時
     刀的移動量依「手指速度」打折（慢慢移動 ×0.2，快速移動 ×1），所以可以微調到 0.1 個像素；
     另外有 ◀ ▶ 兩顆按鈕，每按一次移動 0.5 px（按住會連續）。位置決定好按「切下去」才切。
     過程中不顯示任何比例或重量，只能憑眼睛判斷。
   · 判定：用多邊形裁切（Sutherland–Hodgman）算出左右兩塊的面積，換成公克（四捨五入到 0.1 g），
     用「顯示在秤上的數字」算差距，所以玩家看到的數字跟判定一致。
   · 成績＝通過幾關，只要有一關超過標準就結束。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'bread';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 過關標準（兩邊重量差距 %）：第 1 關 10%，每關少 1%，最少 1% */
    var THR_START = 10, THR_STEP = 1, THR_MIN = 1;      /* 差距標準（%）：10、9、8 … 1 */
    /* 麵包的寬 360、最高的高度 140（SVG 單位） */
    var W = 360, HB = 140;                              /* 麵包的寬、最高的高度（SVG 單位） */
    var G_MIN = 250, G_MAX = 480;                       /* 總重量範圍（公克） */
    var BREAD_Y = 40;                                   /* 麵包上緣 y（麵包區的 SVG 座標） */
    /* 梯形的矮邊／高邊比例：第 2 關 0.95，之後每關少 0.1 */
    var TRAP_START = 0.95, TRAP_STEP = 0.1;             /* 梯形的矮邊/高邊比：第 2 關 0.95，之後每關少 0.1（第 7 關 0.45）*/
    /* ◀ ▶ 每按一次，刀移動 0.5px */
    var NUDGE = 0.5;                                    /* ◀ ▶ 每次移動多少 px */
    /* 手指速度快到 1px/ms 以上時，刀的移動量不打折（gain=1）；慢的時候最多打到 0.2 折，方便微調 */
    var GAIN_MIN = 0.2, GAIN_MAX = 1, SPEED_FULL = 1.0; /* 手指速度（px/ms）到 SPEED_FULL 以上時 gain＝1 */
    var FALL_MS = 650;
    var NEXT_MS = 2000;

    /* 這一關的過關標準 */
    function thrFor(level) { return Math.max(THR_MIN, THR_START - (level - 1) * THR_STEP); }
    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 麵包的形狀：多邊形頂點的座標。第 1 關長方形、2～7 關梯形、之後三角形 */
    /* 麵包的形狀（多邊形，座標原點在麵包的左上角，y 向下，底邊在 y=HB）。type：rect／trap／tri */
    function makeBread(level, rand) {
        rand = rand || Math.random;
        var type = level <= 1 ? 'rect' : (level <= 7 ? 'trap' : 'tri');
        var pts;
        if (type === 'rect') {
            pts = [[0, 0], [W, 0], [W, HB], [0, HB]];
        } else if (type === 'trap') {
            /* 梯形：矮邊高度＝最高 × 比例；矮邊在左或右隨機 */
            var ratio = TRAP_START - (level - 2) * TRAP_STEP;    /* 矮邊 / 高邊 */
            var hs = HB * ratio, left = rand() < 0.5;           /* 左邊矮還是右邊矮 */
            pts = left ? [[0, HB - hs], [W, 0], [W, HB], [0, HB]] : [[0, 0], [W, HB - hs], [W, HB], [0, HB]];
        } else {
            var side = rand() < 0.5 ? -1 : 1;
            var a = 0.5 + side * kit.randFloat(0.15, 0.35, rand);       /* 頂點在底邊的哪個比例 */
            pts = [[a * W, 0], [W, HB], [0, HB]];
        }
        return { type: type, pts: pts };
    }
    /* 多邊形面積（鞋帶公式 shoelace）：把相鄰頂點的座標交叉相乘後加總再除以 2 */
    function polyArea(pts) {
        var s = 0;
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i], q = pts[(i + 1) % pts.length];
            s += p[0] * q[1] - q[0] * p[1];
        }
        return Math.abs(s) / 2;
    }
    /* 用垂直線 x=c 裁切多邊形（Sutherland–Hodgman 演算法）：逐一檢查每條邊，穿過切線時補一個交點 */
    /* 用垂直線 x=c 裁切凸多邊形，keepLeft＝保留左邊（x ≤ c）或右邊 */
    function clipV(pts, c, keepLeft) {
        var out = [];
        function inside(p) { return keepLeft ? p[0] <= c : p[0] >= c; }
        for (var i = 0; i < pts.length; i++) {
            var cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
            var ci = inside(cur), pi = inside(prev);
            if (ci !== pi) {
                var t = (c - prev[0]) / (cur[0] - prev[0]);
                out.push([c, prev[1] + (cur[1] - prev[1]) * t]);
            }
            if (ci) out.push(cur);
        }
        return out;
    }
    /* 切在 x=c 時，左邊那塊的面積 */
    function areaLeft(pts, c) { var p = clipV(pts, c, true); return p.length < 3 ? 0 : polyArea(p); }
    /* 找出剛好對半切的 x：二分搜尋法——每次取中間，面積太小往右、太大往左，重複 60 次 */
    /* 剛好把面積切成兩半的 x（二分搜尋） */
    function balanceX(pts) {
        var total = polyArea(pts), lo = 0, hi = W;
        for (var i = 0; i < 60; i++) {
            var mid = (lo + hi) / 2;
            if (areaLeft(pts, mid) < total / 2) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }
    /* 切在 c，總重 grams：回傳左右兩邊顯示在秤上的重量（四捨五入到 0.1 g）與差距%。判定用「秤上顯示的數字」，所以玩家看到的跟判定一致 */
    /* 切在 c，總重量 grams：回傳左右兩邊顯示在秤上的重量（四捨五入到 0.1 g）和差距% */
    function weighCut(pts, c, grams) {
        var total = polyArea(pts), aL = areaLeft(pts, c);
        var wL = Math.round(grams * aL / total * 10) / 10;
        var wR = Math.round(grams * (total - aL) / total * 10) / 10;
        var diff = Math.abs(wL - wR) / Math.max(wL, wR, 1e-9) * 100;
        return { wL: wL, wR: wR, diff: diff };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* start：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(start) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            /* level 目前關卡；cleared 已過幾關 */
            var level = start || 1, cleared = level - 1, newRec = false;

            /* 建立畫面元素：資訊、麵包區、控制列（◀ 切下去 ▶） */
            var info = h('div', { 'class': 'bk-info' });
            var zone = h('div', { 'class': 'bk-zone' });
            var ctrl = h('div', { 'class': 'bk-ctrl' });
            var btnL = h('button', { 'class': 'btn btn--line bk-nudge', text: '◀' });
            var btnCut = h('button', { 'class': 'btn btn--primary bk-cut', text: '切下去' });
            var btnR = h('button', { 'class': 'btn btn--line bk-nudge', text: '▶' });
            ctrl.appendChild(btnL); ctrl.appendChild(btnCut); ctrl.appendChild(btnR);
            root.appendChild(info);
            root.appendChild(zone);
            root.appendChild(ctrl);

            /* 整個場景畫在一個 SVG：上面麵包、下面兩個電子秤 */
            /* 整個場景畫在一個 SVG：上面麵包、下面兩個秤 */
            var SW = 468, SH = 560;
            var svg = kit.svg('svg', { 'class': 'bk-svg', viewBox: '0 0 ' + SW + ' ' + SH, preserveAspectRatio: 'xMidYMid meet' }, zone);
            /* 麵包左上角在 SVG 裡的位置（水平置中） */
            var OX = (SW - W) / 2;                       /* 麵包左上角在 SVG 的位置 */
            var gBread = kit.svg('g', { transform: 'translate(' + OX + ' ' + BREAD_Y + ')' }, svg);
            var PLAT_W = 200, PLAT_Y = 400, SCALE_CX = [SW * 0.25, SW * 0.75];
            /* 畫兩個電子秤（底座、螢幕、克數文字、秤盤） */
            var scaleEls = SCALE_CX.map(function (cx) {
                var g = kit.svg('g', {}, svg);
                kit.svg('rect', { 'class': 'bk-sbase', x: cx - 105, y: PLAT_Y + 14, width: 210, height: 96, rx: 14 }, g);
                kit.svg('rect', { 'class': 'bk-slcd', x: cx - 80, y: PLAT_Y + 34, width: 160, height: 56, rx: 8 }, g);
                var txt = kit.svg('text', { 'class': 'bk-sgram', x: cx, y: PLAT_Y + 74, 'text-anchor': 'middle' }, g);
                txt.textContent = '0.0 g';
                var plat = kit.svg('rect', { 'class': 'bk-splat', x: cx - PLAT_W / 2, y: PLAT_Y, width: PLAT_W, height: 14, rx: 6 }, g);
                return { cx: cx, txt: txt, plat: plat };
            });

            /* B 這關的麵包；grams 總重；knife 刀的 x 位置；state 目前階段（aim 瞄準/cut 切下去/verdict 揭曉） */
            var B = null, grams = 0, knife = 0, state = 'idle';
            var gKnife = null, pieces = [];

            function setInfo() {
                info.textContent = '第 ' + level + ' 關　兩邊重量差距要在 ' + thrFor(level).toFixed(2) + '% 以內';
                ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));
            }

            /* 畫新的一塊麵包與刀（刀一開始放在隨機位置） */
            function drawBread() {
                gBread.innerHTML = '';
                pieces = [];
                B = makeBread(level);
                grams = Math.round(kit.randFloat(G_MIN, G_MAX) * 10) / 10;
                scaleEls.forEach(function (s) { s.txt.textContent = '0.0 g'; s.txt.classList.remove('bk-sgram--on'); s.plat.setAttribute('y', PLAT_Y); });
                var poly = kit.svg('polygon', { 'class': 'bk-bread', points: B.pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') }, gBread);
                /* 麵包上的紋路，單純裝飾 */
                gKnife = kit.svg('g', { 'class': 'bk-knife' }, gBread);
                kit.svg('line', { 'class': 'bk-knife__line', x1: 0, y1: -30, x2: 0, y2: HB + 30 }, gKnife);
                kit.svg('polygon', { 'class': 'bk-knife__grip', points: '-14,-30 14,-30 0,-8' }, gKnife);
                var bx = B.pts.map(function (p) { return p[0]; });
                knife = kit.randFloat(W * 0.2, W * 0.8);
                moveKnife(knife);
                state = 'aim';
                setInfo();
                /* 主控台印出這關的形狀、總重、標準、剛好對半的位置，方便驗證 */
                try {
                    var bal = balanceX(B.pts);
                    console.info('[秤麵包重量] 第 ' + level + ' 關 形狀 ' + ({ rect: '長方形', trap: '梯形', tri: '三角形' })[B.type] + '，總重 ' + grams + ' g，標準 ' + thrFor(level).toFixed(2) + '%，' +
                        '剛好對半的切點在寬度 ' + (bal / W * 100).toFixed(2) + '% 處，目前刀在 ' + (knife / W * 100).toFixed(2) + '%');
                } catch (e) { }
            }
            /* 移動刀：clamp 限制在麵包範圍內（0～W） */
            function moveKnife(x) {
                knife = kit.clamp(x, 0, W);
                gKnife.setAttribute('transform', 'translate(' + knife.toFixed(2) + ' 0)');
            }

            /* 操作：拖曳（速度打折）＋ ◀ ▶ 微調 */
            /* ─── 操作：拖曳（速度打折）＋ ◀ ▶ 微調 ─── */
            var drag = null;
            /* 把手指螢幕座標轉成 SVG 座標 */
            function svgX(e) {
                var r = svg.getBoundingClientRect();
                var s = Math.min(r.width / SW, r.height / SH);
                var left = r.left + (r.width - SW * s) / 2;
                return (e.clientX - left) / s - OX;
            }
            /* 手指按下：刀先跳到手指位置（粗調） */
            zone.addEventListener('pointerdown', function (e) {
                if (state !== 'aim' || drag) return;
                e.preventDefault();
                try { zone.setPointerCapture(e.pointerId); } catch (err) { }
                drag = { id: e.pointerId, x: svgX(e), t: performance.now() };
                moveKnife(drag.x);                 /* 粗調：刀先跳到手指下面 */
            });
            /* 手指移動：移動量依手指速度打折（慢速精細、快速粗略） */
            zone.addEventListener('pointermove', function (e) {
                if (state !== 'aim' || !drag || e.pointerId !== drag.id) return;
                var x = svgX(e), now = performance.now();
                var dx = x - drag.x, dt = Math.max(1, now - drag.t);
                var speed = Math.abs(dx) / dt;                              /* px/ms */
                var gain = GAIN_MIN + (GAIN_MAX - GAIN_MIN) * Math.min(1, speed / SPEED_FULL);
                moveKnife(knife + dx * gain);
                drag.x = x; drag.t = now;
            });
            function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
            zone.addEventListener('pointerup', endDrag);
            zone.addEventListener('pointercancel', endDrag);

            /* ◀ ▶ 按鈕：按一下移動一次，按住會連續（先等 350ms 三次、之後每 60ms 一次） */
            function nudgeBtn(btn, dir) {
                var rep = null;
                function step() { if (state === 'aim') moveKnife(knife + dir * NUDGE); }
                btn.addEventListener('pointerdown', function (e) {
                    e.preventDefault();
                    step();
                    var n = 0;
                    function again() { rep = my.after(n++ < 3 ? 350 : 60, function () { step(); again(); }); }
                    again();
                });
                function stop() { if (rep != null) { my.cancel(rep); rep = null; } }
                btn.addEventListener('pointerup', stop);
                btn.addEventListener('pointerleave', stop);
                btn.addEventListener('pointercancel', stop);
            }
            nudgeBtn(btnL, -1); nudgeBtn(btnR, 1);
            btnCut.addEventListener('pointerdown', function (e) { e.preventDefault(); cut(); });

            /* 切、掉落、秤重 */
            /* ─── 切、掉落、秤重 ─── */
            /* 切下去：算出左右兩塊，播放掉到秤上的動畫，再顯示重量 */
            function cut() {
                if (state !== 'aim') return;
                state = 'cut';
                Sfx.play('pop');
                var c = knife;
                /* 裁切出左半與右半 */
                var left = clipV(B.pts, c, true), right = clipV(B.pts, c, false);
                var wc = weighCut(B.pts, c, grams);
                var bal = balanceX(B.pts);
                gBread.innerHTML = '';
                var parts = [{ pts: left, side: 0 }, { pts: right, side: 1 }];
                parts.forEach(function (pt) {
                    var g = kit.svg('g', {}, gBread);
                    kit.svg('polygon', { 'class': 'bk-bread', points: pt.pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') }, g);
                    var xs = pt.pts.map(function (p) { return p[0]; }), ys = pt.pts.map(function (p) { return p[1]; });
                    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), maxY = Math.max.apply(null, ys);
                    /* 目標：piece 的底邊貼在秤盤上方，水平置中在秤盤上（座標換到 gBread 的座標系） */
                    var tx = SCALE_CX[pt.side] - OX - (minX + maxX) / 2;
                    var ty = PLAT_Y - BREAD_Y - maxY;
                    pt.g = g; pt.tx = tx; pt.ty = ty; pt.dir = pt.side ? 1 : -1;
                });
                var plat = scaleEls;
                /* 掉落動畫：先往兩側分開（水平緩動），同時重力下墜（垂直 e² 加速） */
                my.tween(FALL_MS, function (e) {
                    /* 先往兩側分開一點，同時重力下墜（ease-in） */
                    parts.forEach(function (pt) {
                        var ex = kit.easeInOutCubic(Math.min(1, e * 1.4));
                        pt.g.setAttribute('transform', 'translate(' + (pt.tx * ex).toFixed(2) + ' ' + (pt.ty * e * e).toFixed(2) + ')');
                    });
                }, kit.linear).then(function () {
                    if (my.dead) return;
                    Sfx.play('flip');
                    scaleEls.forEach(function (s) { s.plat.setAttribute('y', PLAT_Y + 4); });
                    /* 秤上的數字從 0 跳到實際重量 */
                    var targets = [wc.wL, wc.wR];
                    /* 秤上的數字從 0 逐漸跳到實際重量 */
                    return my.tween(600, function (e) {
                        scaleEls.forEach(function (s, i) {
                            s.txt.textContent = (targets[i] * e).toFixed(1) + ' g';
                            s.txt.classList.add('bk-sgram--on');
                        });
                    }, kit.easeOutCubic);
                }).then(function () {
                    if (my.dead) return;
                    verdict(c, bal, wc);
                });
            }

            /* 判定：差距在標準內就過關，否則結算並顯示你切在哪裡、剛好對半在哪裡 */
            function verdict(c, bal, wc) {
                state = 'verdict';
                var thr = thrFor(level), pass = wc.diff <= thr;
                var heavier = wc.wL > wc.wR ? '左邊' : (wc.wL < wc.wR ? '右邊' : '');
                var balPct = bal / W * 100, myPct = c / W * 100;
                if (pass) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));
                    info.textContent = '差距 ' + wc.diff.toFixed(2) + '%（標準 ' + thr.toFixed(2) + '%）過關！';
                    info.classList.add('bk-info--ok');
                    Sfx.play('win');
                    my.after(G.dev.next || NEXT_MS, function () { info.classList.remove('bk-info--ok'); level++; drawBread(); });
                } else {
                    info.textContent = '差距 ' + wc.diff.toFixed(2) + '%，超過標準 ' + thr.toFixed(2) + '%';
                    info.classList.add('bk-info--bad');
                    var back = kit.resumeFrom(level);
                    my.after(1600, function () {
                        info.classList.remove('bk-info--bad');
                        kit.result(root, {
                            num: cleared + ' 關', label: '差太多了',
                            lines: [
                                '第 ' + level + ' 關：左 ' + wc.wL.toFixed(1) + ' g、右 ' + wc.wR.toFixed(1) + ' g' + (heavier ? '（' + heavier + '比較重）' : ''),
                                '差距 ' + wc.diff.toFixed(2) + '%，標準是 ' + thr.toFixed(2) + '%',
                                '你切在寬度 ' + myPct.toFixed(1) + '% 處，剛好對半是 ' + balPct.toFixed(1) + '% 處'
                            ],
                            isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail',
                            onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                }
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, state: state, knife: knife, cleared: cleared, type: B && B.type, grams: grams }; },
                bread: function () { return B; },
                balance: function () { return balanceX(B.pts); },
                setKnife: moveKnife,
                cut: cut,
                jump: function (n) { if (state === 'aim' || state === 'verdict') { level = n; drawBread(); } },
                weigh: function (x) { return weighCut(B.pts, x == null ? knife : x, grams); }
            };
            /* 開場就畫第一塊麵包 */
            drawBread();
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '秤麵包重量',
        rule: '把麵包切成左右兩半，兩半會掉到左右兩個電子秤上秤重。拖曳手指決定刀的位置（慢慢移動可以微調，也可以按 ◀ ▶），按「切下去」就切。兩邊重量差距要在標準以內才能過關：第 1 關 10%，每關少 1%，第 2 關開始麵包會變成斜邊的梯形，越來越斜，後面還有三角形，不能再切正中間！',
        mount: mount,
        /* dev 是開發用設定 */
        dev: { next: null },          /* 開發驗證用：延長過關畫面停留時間，正式遊戲不會設定 */
        /* test 匯出純函式給 Node 自動測試 */
        test: { TRAP_START: TRAP_START, TRAP_STEP: TRAP_STEP, thrFor: thrFor, makeBread: makeBread, polyArea: polyArea, clipV: clipV, areaLeft: areaLeft, balanceX: balanceX, weighCut: weighCut, W: W, HB: HB }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
