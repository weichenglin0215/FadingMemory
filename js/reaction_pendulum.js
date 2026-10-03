/* ═══════════════════════════════════════════════════════════════════
   reaction_pendulum.js — 秒反應・六點鐘方向
   鐘擺左右搖動，玩家點一下讓它「停住」，越接近正下方（六點鐘方向）越好。
   結算時鏡頭以「針尖」為固定錨點持續推進，看清楚到底差了幾度（目標 0.00 度）。
   ───────────────────────────────────────────────────────────────────
   · 鐘擺的角度是「時間的純函式」：θ(t) = A·sin(2π·t/T + φ)，不逐格累加。
     點下去那一刻用事件的 e.timeStamp 代進去算停止角度，不用 rAF 當下影格的時間
     ——畫面就算卡了一下，成績也不會失真；rAF 被瀏覽器暫停時，點擊照樣算得出
     正確角度，結算流程全部用 setTimeout／補間保底推進，不會卡住。
   · 關卡制（線性）：第 n 關振幅 A、週期 T 往「更大、更快」線性走，過關門檻
     PASS(n) 線性變嚴；誤差在門檻內自動可以進下一關，超過就結束。
     想要純粹「一擺定勝負」，把 PASS0 調成很大即可。
   · 鏡頭推進（跟「神準落下」「不可能任務」同一套手法）：整個畫面是一個 SVG，
     推進＝補間 viewBox；針尖在螢幕上的位置固定不動（錨點），倍率 ZOOMS＝
     [8, 80, 800]，每一段刻度精細 10 倍（×8 時 1° 一格、×80 時 0.1° 一格、
     ×800 時 0.01° 一格）。放大到「再放大紅線就會跑出畫面」為止。
     細刻度（0.1°、0.01°）本來就畫在那裡，只是放大前太細看不到，鏡頭推進時
     才淡入，像用顯微鏡發現本來就存在的刻度。
   · 成績：主成績＝所有回合裡最小的誤差（越小越好，顯示兩位小數，內部全精度比大小）；
     副成績＝最高關卡（另存 pendulum_lv）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'pendulum';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEN = 360;           /* 擺長：支點到針尖的距離（邏輯 px） */
    var PIVOT_Y = 100;       /* 支點離欄位上緣多遠 */
    var BOB_R = 34;          /* 擺錘半徑 */
    var NEEDLE = 16;         /* 擺錘下方的針長度 */
    var ARC_MAX_DEG = 55;    /* 刻度盤畫到左右各幾度 */
    var A0 = 15, A_STEP = 1.5, A_MAX = 40;        /* 振幅（度） */
    var T0 = 3.0, T_STEP = 0.1, T_MIN = 1.4;      /* 週期（秒） */
    var PASS0 = 5.0, PASS_STEP = 0.25, PASS_MIN = 0.5;   /* 過關門檻（度） */
    var ARM_MS = 400;        /* 每關開始後，前這麼久點了不算（避免上一關的手指殘留） */
    var FREEZE_MS = 500;     /* 點下去後定格多久才開始推進 */
    var ZOOMS = [8, 80, 800];
    var ZOOM_MS = 1100;      /* 每一段推進的時間 */
    var ZOOM_HOLD_MS = 650;  /* 每一段推進完停留的時間 */
    var VIEW_RED_PX = 200;   /* 放大後，紅線離針尖最遠不能超過幾 px（超過就不再放大） */
    var LATENCY_COMP_MS = 0; /* 螢幕顯示約晚 1～2 影格；預設不補償，要補償才調 */
    var PX_PER_DEG = LEN * Math.PI / 180;   /* 1° 對應弧上幾 px（約 6.28） */

    function fmtDeg(v) { return v.toFixed(2); }
    function fmtBest(v) { return v == null ? '' : '最佳 ' + fmtDeg(v) + '°'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function paramsFor(level, rand) {
        rand = rand || Math.random;
        return {
            A: Math.min(A_MAX, A0 + A_STEP * (level - 1)),
            T: Math.max(T_MIN, T0 - T_STEP * (level - 1)),
            phi: rand() * Math.PI * 2
        };
    }
    function passFor(level) { return Math.max(PASS_MIN, PASS0 - PASS_STEP * (level - 1)); }
    /* 角度（度）：正＝往螢幕右邊擺 */
    function thetaAt(p, tSec) { return p.A * Math.sin(2 * Math.PI * tSec / p.T + p.phi); }

    /* 要推進到哪些倍率：ZOOMS 裡「紅線仍在畫面內（≤ VIEW_RED_PX）」的最大一段為止；
       連 ×8 都放不下（誤差太大）就只放大到剛好放得下的倍率（至少 1，不放大）。 */
    function zoomPlan(errDeg) {
        var distAt1 = Math.abs(errDeg) * PX_PER_DEG;      /* 紅線距針尖（倍率 1 時的 px） */
        var stages = [];
        for (var i = 0; i < ZOOMS.length; i++) {
            if (distAt1 * ZOOMS[i] <= VIEW_RED_PX) stages.push(ZOOMS[i]);
            else break;
        }
        if (!stages.length) {
            var z = VIEW_RED_PX / Math.max(distAt1, 1e-9);
            if (z > 1.15) stages.push(Math.min(z, ZOOMS[0]));
        }
        return stages;
    }

    /* 評語 */
    function rating(err) {
        if (err < 0.05) return '神乎其技！';
        if (err < 0.2) return '高手！';
        if (err < 0.5) return '很準！';
        if (err < 1) return '不錯喔！';
        return '再試一次，會更準！';
    }

    function mount(root, ctx) {
        var R = null;            /* 這一關的生命週期物件（kit.round） */
        var level = 1;
        var bestErr = Reaction.getBest(ID);
        var runBest = null;      /* 這一輪（從第 1 關開始）最小誤差 */
        var state = 'idle';

        function updateMeta() {
            ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));
        }

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            state = 'swing';
            updateMeta();

            var hint = h('div', { 'class': 'hint', text: '點一下，讓鐘擺停在六點鐘方向' });
            var field = h('div', { 'class': 'pend-field' });
            root.appendChild(hint);
            root.appendChild(field);

            var FW = field.clientWidth, FH = field.clientHeight;
            var Px = FW / 2, Py = PIVOT_Y;
            var svg = kit.svg('svg', { 'class': 'pend-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);
            var full = { vx: 0, vy: 0, vw: FW, vh: FH };

            function polar(deg, r) {
                var a = deg * Math.PI / 180;
                return { x: Px + r * Math.sin(a), y: Py + r * Math.cos(a) };
            }

            /* ─── 刻度盤（第一層：1° 一格，5° 一條長刻度；0° 是紅線）───
               刻度「以針尖所在的半徑為中心」上下對稱畫（不是畫在弧外面一段距離）：
               鏡頭放大 800 倍時，哪怕只差 0.1 個世界座標單位也會變成 80 px，
               刻度離針尖太遠就會直接掉出畫面，看不到。 */
            var gArc = kit.svg('g', {}, svg);
            var a0 = polar(-ARC_MAX_DEG, LEN), a1 = polar(ARC_MAX_DEG, LEN);
            kit.svg('path', {
                'class': 'pend-arc', fill: 'none', 'vector-effect': 'non-scaling-stroke',
                d: 'M' + a0.x + ' ' + a0.y + ' A' + LEN + ' ' + LEN + ' 0 0 0 ' + a1.x + ' ' + a1.y
            }, gArc);
            function tickLine(g, cls, deg, half) {
                var q0 = polar(deg, LEN - half), q1 = polar(deg, LEN + half);
                return kit.svg('line', { 'class': cls, 'vector-effect': 'non-scaling-stroke', x1: q0.x, y1: q0.y, x2: q1.x, y2: q1.y }, g);
            }
            for (var d = -ARC_MAX_DEG; d <= ARC_MAX_DEG; d++) {
                if (d !== 0) tickLine(gArc, 'pend-tick', d, d % 5 === 0 ? 7 : 4);
            }
            /* 時鐘數字：±30° 是 5 點與 7 點（5 在右、7 在左），正下方 0° 是 6 點 */
            [[30, '5'], [0, '6'], [-30, '7']].forEach(function (n) {
                var tp = polar(n[0], LEN + 40);
                var t = kit.svg('text', {
                    'class': 'pend-num' + (n[0] === 0 ? ' pend-num--zero' : ''),
                    x: tp.x, y: tp.y, 'text-anchor': 'middle', 'dominant-baseline': 'central'
                }, gArc);
                t.textContent = n[1];
            });
            tickLine(gArc, 'pend-zero', 0, 14);

            /* ─── 細刻度層（停下來之後才依落點生出來，鏡頭推進時淡入）─── */
            var gFine2 = kit.svg('g', { opacity: 0 }, svg);
            var gFine3 = kit.svg('g', { opacity: 0 }, svg);

            /* ─── 鐘擺本體（整組繞支點旋轉）─── */
            var gPend = kit.svg('g', {}, svg);
            var bobCy = Py + LEN - NEEDLE - BOB_R;
            var rod = kit.svg('line', { 'class': 'pend-rod', 'vector-effect': 'non-scaling-stroke', x1: Px, y1: Py, x2: Px, y2: bobCy - BOB_R }, gPend);
            var bob = kit.svg('circle', { 'class': 'pend-bob', cx: Px, cy: bobCy, r: BOB_R }, gPend);
            kit.svg('line', { 'class': 'pend-needle', 'vector-effect': 'non-scaling-stroke', x1: Px, y1: bobCy + BOB_R, x2: Px, y2: Py + LEN }, gPend);
            var pivot = kit.svg('circle', { 'class': 'pend-pivot', cx: Px, cy: Py, r: 8 }, svg);

            function setAngle(deg) {
                gPend.setAttribute('transform', 'rotate(' + (-deg) + ' ' + Px + ' ' + Py + ')');
            }

            var p = paramsFor(level);
            var thr = passFor(level);
            var t0 = performance.now();
            setAngle(thetaAt(p, 0));
            var swing = my.loop(function (now) { setAngle(thetaAt(p, (now - t0) / 1000)); });

            /* ─── 點下去：定格 ─── */
            var onDown = function (e) {
                if (state !== 'swing' || my.dead) return;
                if (e.target && e.target.closest && e.target.closest('button')) return;
                if (performance.now() - t0 < ARM_MS) return;
                e.preventDefault();
                stopAt(kit.evT(e) - t0 - LATENCY_COMP_MS);
            };
            root.addEventListener('pointerdown', onDown);
            my.onDispose(function () { root.removeEventListener('pointerdown', onDown); });

            /* 測試用：在指定時間（距離這一關開始幾毫秒）直接停擺，繞過 ARM_MS */
            G.debug.stopAt = function (tMs) {
                if (state !== 'swing') return false;
                stopAt(tMs);
                return true;
            };
            G.debug.params = p;

            /* tMs：從這關開始算起的毫秒數（debug.stopAt 也走這裡） */
            function stopAt(tMs) {
                if (state !== 'swing') return;
                state = 'freeze';
                swing.stop();      /* 定格：停掉擺動迴圈，不然下一影格又會把角度改回去 */
                var theta = thetaAt(p, tMs / 1000);
                var err = Math.abs(theta);
                setAngle(theta);
                Sfx.play('click');
                hint.style.visibility = 'hidden';
                G.debug.last = { theta: theta, err: err, level: level };

                /* 針尖停下來的位置（世界座標）＝鏡頭推進的固定錨點 */
                var tip = polar(theta, LEN);
                var plan = zoomPlan(err);
                buildFine(theta, plan);

                var chain = my.wait(FREEZE_MS);
                var cur = full;
                plan.forEach(function (z) {
                    chain = chain.then(function () {
                        Sfx.play('zoom');
                        var to = boxFor(tip, z);
                        return kit.tweenViewBox(my, svg, cur, to, ZOOM_MS, kit.easeInOutCubic, onZoomFrame).then(function () {
                            cur = to;
                            return my.wait(ZOOM_HOLD_MS);
                        });
                    });
                });
                chain.then(function () { verdict(theta, err); });
            }

            /* 讓針尖在螢幕上的位置固定：針尖在完整畫面裡的相對位置 (tx/FW, ty/FH)，
               放大後的框裡要維持一模一樣 */
            function boxFor(tip, z) {
                var vw = FW / z, vh = FH / z;
                return { vx: tip.x - (tip.x / FW) * vw, vy: tip.y - (tip.y / FH) * vh, vw: vw, vh: vh };
            }

            function onZoomFrame(b) {
                var z = FW / b.vw;
                /* 放大到 ×20 以上，擺錘／擺桿／支點都早就掉出畫面了；但它們放大 800 倍會變成半徑
                   數萬 px 的巨大圖形，瀏覽器光是光柵化這些看不到的東西就會卡到截圖逾時，
                   所以直接隱藏。 */
                var far = z > 20 ? 'none' : '';
                bob.style.display = far; rod.style.display = far; pivot.style.display = far;
                gFine2.setAttribute('opacity', kit.clamp((z - 6) / 30, 0, 1).toFixed(3));
                gFine3.setAttribute('opacity', kit.clamp((z - 60) / 300, 0, 1).toFixed(3));
            }

            /* 細刻度：只畫會被看到的那一小段（0° 到落點附近），數量很少 */
            function buildFine(theta, plan) {
                var lo = Math.min(0, theta), hi = Math.max(0, theta);
                function layer(g, step, half, from, to) {
                    var k0 = Math.floor(from / step), k1 = Math.ceil(to / step);
                    if (k1 - k0 > 240) return;
                    for (var k = k0; k <= k1; k++) {
                        var deg = k * step;
                        if (Math.abs(deg - Math.round(deg)) < step * 0.01) continue;   /* 整數度已有上一層刻度 */
                        tickLine(g, 'pend-tick pend-tick--fine', deg, half);
                    }
                }
                if (plan.length >= 2) layer(gFine2, 0.1, 0.4, lo - 0.6, hi + 0.6);
                if (plan.length >= 3) layer(gFine3, 0.01, 0.04, lo - 0.06, hi + 0.06);
            }

            /* ─── 結算 ─── */
            function verdict(theta, err) {
                state = 'verdict';
                var pass = err <= thr;
                var side = Math.abs(theta) < 0.005 ? '' : (theta < 0 ? '偏左' : '偏右');
                var isNewErr = Reaction.setBest(ID, err, function (v, b) { return v < b; });
                if (runBest == null || err < runBest) runBest = err;
                var passed = pass ? level : level - 1;
                var isNewLv = passed > 0 && Reaction.setBest(ID + '_lv', passed, function (v, b) { return v > b; });
                updateMeta();

                var perfect = err < 0.05;
                var sfx = pass ? (perfect ? 'perfect' : 'win') : 'fail';
                var lines = [
                    side ? '針尖在紅線' + (theta < 0 ? '左' : '右') + '邊（' + side + '）' : '針尖正好壓在紅線上',
                    '第 ' + level + ' 關門檻 ' + fmtDeg(thr) + ' 度：' + (pass ? '通過！' : '沒通過')
                ];
                var kids = [
                    h('div', { 'class': 'rx-result__label', text: err < 0.005 ? '差了 0.00 度・分毫不差！' : '差了 ' + fmtDeg(err) + ' 度' }),
                    h('div', { 'class': 'rx-result__num pend-verdict__num', text: rating(err) })
                ];
                lines.forEach(function (t) { kids.push(h('div', { 'class': 'hint rx-result__line', text: t })); });
                if (isNewErr) kids.push(h('div', { 'class': 'hint hint--ok', text: '新紀錄！最小誤差' }));
                if (!pass) kids.push(h('div', { 'class': 'hint rx-result__note', text: '這一輪闖到第 ' + Math.max(0, level - 1) + ' 關通過' + (isNewLv ? '（新紀錄！）' : '') }));
                kids.push(h('button', {
                    'class': 'btn btn--primary', text: pass ? '下一關' : '再玩一次',
                    on: {
                        click: function () {
                            Sfx.play('click');
                            if (pass) { level++; } else { level = 1; runBest = null; }
                            round();
                        }
                    }
                }));
                var attrs = { 'data-sfx': sfx };
                if (pass) attrs['data-bgm'] = '0';      /* 過關只播短旋律，不接結算背景音樂 */
                field.appendChild(h('div', { 'class': 'pend-verdict', attrs: attrs }, kids));
            }
        }

        G.debug = { last: null };
        round();
    }

    var G = {
        id: ID,
        name: '六點鐘方向',
        rule: '鐘擺左右搖動，點一下讓它停住，越接近正下方（六點鐘方向）越好。過關門檻會越來越嚴；停住後鏡頭會放大，告訴你差了幾度，目標是 0.00 度！',
        mount: mount,
        test: { paramsFor: paramsFor, passFor: passFor, thetaAt: thetaAt, zoomPlan: zoomPlan, rating: rating, PX_PER_DEG: PX_PER_DEG }
    };
    Reaction.register(G);
})();
