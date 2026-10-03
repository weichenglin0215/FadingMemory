/* ═══════════════════════════════════════════════════════════════════
   reaction_pour.js — 秒反應・倒到八分滿
   按住畫面把水倒進杯子，放手時水位剛好是杯子高度的 80%（八分滿）。只有一回合。
   ───────────────────────────────────────────────────────────────────
   · 杯子沒有任何刻度，水面是一條「持續抖動的波形線」（幾條不同頻率的正弦波疊加＋
     隨機雜訊＋整體上下晃），所以看不出精準的高度，只能憑感覺放手。
   · 水位不是等速上升：流量 = r0 × (1 + a·sin(ω·t + φ))，a、ω、φ、總時間每局隨機，
     所以「在心裡數 3.6 秒」這種作弊法不管用，一定要用眼睛看水位。
   · 水位完全由 L(t) 這個純函式算出（用 pointerdown／pointerup 的時間戳記），
     動畫掉格、rAF 被暫停都不影響結果。
   · 結算：水面先平靜下來，再 ZOOM IN——鏡頭對準「目標線與水面中間」，放大倍率由誤差決定
     （誤差越小放得越大），最後畫出刻度尺讓玩家看到差了幾 %。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'pour';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var TARGET = 0.8;                     /* 目標水位（杯高的比例） */
    var FILL_MIN = 4.0, FILL_MAX = 5.5;   /* 從空到滿大約要幾秒（每局隨機） */
    var W = 400, H = 560;                 /* SVG 座標 */
    var GX0 = 105, GX1 = 295;             /* 杯子內側左右 */
    var GB = 510, GH = 330;               /* 杯底 y、杯內高度（杯口 y＝GB−GH＝100% 水位） */
    var RIM = GB - GH;
    var AMP = 7;                          /* 倒水時水面波動的振幅（SVG 單位，約杯高 2%） */
    var SETTLE_MS = 900;                  /* 放手後水面平靜下來的時間 */
    var ZOOM_MS = 2200;
    var ANCHOR_Y = 0.3;                   /* 結算鏡頭：目標線與水面中點放在畫面由上往下 30% 處（下方留給結算橫幅） */
    var MIN_WIN = 6;                      /* 鏡頭視窗最小高度（SVG 單位）＝放大約 93 倍 */
    var STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];   /* 刻度尺的間距（%） */

    var yOf = function (L) { return GB - L * GH; };
    var YT = yOf(TARGET);

    function fmtPct(v) { return v.toFixed(2) + '%'; }
    function fmtBest(v) { return v == null ? '' : '最佳誤差 ' + fmtPct(v); }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 每局的流量曲線參數 */
    function makeProfile(rand) {
        rand = rand || Math.random;
        return {
            fill: kit.randFloat(FILL_MIN, FILL_MAX, rand),     /* 平均從空到滿的秒數 */
            a: kit.randFloat(0.30, 0.55, rand),                /* 流量起伏幅度（0.55＝±55%） */
            w: kit.randFloat(2.0, 3.5, rand),                  /* 起伏角頻率（弧度／秒） */
            phi: kit.randFloat(0, Math.PI * 2, rand)
        };
    }
    /* 倒了 t 秒後的水位（0~1，超過 1 就是滿出來）。流量永遠為正，所以水位單調上升 */
    function levelAt(p, t) {
        if (t <= 0) return 0;
        var r0 = 1 / p.fill;
        return r0 * (t + (p.a / p.w) * (Math.cos(p.phi) - Math.cos(p.w * t + p.phi)));
    }
    /* 倒多久會滿（水位到 1.0 的秒數），二分搜尋 */
    function timeToFull(p) {
        var lo = 0, hi = p.fill * 3;
        for (var i = 0; i < 60; i++) {
            var mid = (lo + hi) / 2;
            if (levelAt(p, mid) < 1) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }
    /* 目前流量（相對平均流量，用來決定水柱粗細） */
    function flowAt(p, t) { return 1 + p.a * Math.sin(p.w * t + p.phi); }
    /* 結算鏡頭視窗的高度（SVG 單位）：誤差的 3.2 倍，最小 MIN_WIN，最大整張圖 */
    function zoomWindow(errPct) {
        return Math.min(H, Math.max(MIN_WIN, Math.abs(errPct) / 100 * GH * 3.2));
    }
    /* 刻度尺間距：視窗內最多約 10 條刻度 */
    function stepFor(win) {
        for (var i = 0; i < STEPS.length; i++) if (win / (STEPS[i] / 100 * GH) <= 10) return STEPS[i];
        return STEPS[STEPS.length - 1];
    }
    function rating(err) {
        if (err < 0.1) return '神之手！';
        if (err < 0.5) return '職人級！';
        if (err < 1.5) return '很準了！';
        if (err < 4) return '還不錯';
        if (err < 10) return '再接再厲';
        return '倒歪了…';
    }

    /* 水面波形：沿著 x 的高度偏移（SVG 單位），amp 是目前振幅 */
    function waveY(x, t, ph, amp) {
        var s = 0.5 * Math.sin(0.09 * x + 7.0 * t + ph[0]) +
            0.3 * Math.sin(0.21 * x - 11.0 * t + ph[1]) +
            0.2 * Math.sin(0.05 * x + 4.3 * t + ph[2]);
        return amp * s;
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var prof = makeProfile();
            var tFull = timeToFull(prof);
            var state = 'ready';               /* ready／pour／settle／zoom／verdict */
            var tDown = 0, tUp = 0;
            var level = 0;                     /* 放手時的水位 */
            var overflow = false;
            var ph = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28];
            var angle = 0;                     /* 水壺傾斜角（度），平滑追蹤目標角 */
            var fullTimer = null;

            ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
            var hint = h('div', { 'class': 'hint', text: '按住倒水，倒到杯子的「八分滿」就放手' });
            var field = h('div', { 'class': 'pour-field' });
            root.appendChild(hint);
            root.appendChild(field);

            var svg = kit.svg('svg', { 'class': 'pour-svg', viewBox: '0 0 ' + W + ' ' + H }, field);
            var gWater = kit.svg('g', {}, svg);
            var water = kit.svg('path', { 'class': 'pour-water' }, gWater);
            var surf = kit.svg('path', { 'class': 'pour-surface' }, gWater);
            var gGlass = kit.svg('g', { 'class': 'pour-glass-g' }, svg);
            kit.svg('path', { 'class': 'pour-glass', d: 'M ' + (GX0 - 7) + ' ' + (RIM - 10) + ' V ' + (GB + 7) + ' H ' + (GX1 + 7) + ' V ' + (RIM - 10) }, gGlass);
            kit.svg('path', { 'class': 'pour-glass-shine', d: 'M ' + (GX0 + 12) + ' ' + (RIM + 30) + ' V ' + (RIM + 200) }, gGlass);
            var gTarget = kit.svg('g', { 'class': 'pour-target' }, svg);       /* 結算才顯示 */
            var tline = kit.svg('line', { 'class': 'pour-target__line', x1: 0, x2: W, y1: YT, y2: YT }, gTarget);
            var view = { x: 0, y: 0, w: W, h: H };          /* 目前鏡頭範圍；結算放大時水體只畫到鏡頭附近，免得超大圖形讓瀏覽器算圖超時 */
            var gRuler = kit.svg('g', { 'class': 'pour-ruler' }, svg);
            /* 水壺＋水柱 */
            var gStream = kit.svg('g', {}, svg);
            var stream = kit.svg('path', { 'class': 'pour-stream' }, gStream);
            var splash = [];
            for (var i = 0; i < 4; i++) splash.push(kit.svg('circle', { 'class': 'pour-splash', r: 3 }, gStream));
            var pitcher = kit.svg('g', { 'class': 'pour-pitcher' }, svg);
            kit.svg('path', { 'class': 'pour-pitcher__body', d: 'M 0 0 L 14 -6 L 112 -6 L 112 88 Q 112 106 94 106 L 30 106 Q 14 106 14 90 L 14 16 Z' }, pitcher);
            kit.svg('path', { 'class': 'pour-pitcher__handle', d: 'M 112 14 Q 150 22 144 56 Q 140 80 112 84' }, pitcher);
            kit.svg('path', { 'class': 'pour-pitcher__shine', d: 'M 30 22 V 80' }, pitcher);
            var SPOUT_X = (GX0 + GX1) / 2, SPOUT_Y0 = 30, SPOUT_Y1 = 84;     /* 水壺壺嘴：待機位置／倒水位置 */

            /* 結算放大時：水面、水體、目標線只畫到「鏡頭範圍左右各多一個寬度、往下兩個高度」 */
            function fitWide(ys) {
                var x0 = view.x - view.w, x1 = view.x + view.w * 2, yb = Math.min(GB, view.y + view.h * 2);
                surf.setAttribute('d', 'M ' + x0 + ' ' + ys + ' L ' + x1 + ' ' + ys);
                water.setAttribute('d', 'M ' + x0 + ' ' + yb + ' L ' + x0 + ' ' + ys + ' L ' + x1 + ' ' + ys + ' L ' + x1 + ' ' + yb + ' Z');
                tline.setAttribute('x1', x0); tline.setAttribute('x2', x1);
            }

            /* ─── 水位／水面的繪製（每影格；結果不靠它）─── */
            function curL(now) {
                if (state === 'pour') return Math.min(1, levelAt(prof, (now - tDown) / 1000));
                if (state === 'ready') return 0;
                return level;
            }
            function draw(now) {
                var L = curL(now);
                var amp = 0;
                if (state === 'pour') amp = AMP;
                else if (state === 'settle') amp = AMP * Math.exp(-(now - tUp) / 170);
                var t = now / 1000;
                var ys = yOf(L);
                var wide = state === 'zoom' || state === 'verdict';       /* 結算鏡頭放大後，水體要鋪滿整個鏡頭 */
                if (L <= 0) { water.setAttribute('d', ''); surf.setAttribute('d', ''); }
                else if (wide) {
                    fitWide(ys);
                } else {
                    var pts = [];
                    /* 整體上下晃一點點＋每個點的高頻雜訊，故意讓水面看起來「抖」 */
                    var bob = amp * 0.45 * Math.sin(t * 31);
                    for (var x = GX0; x <= GX1 + 0.1; x += 5) {
                        var jit = amp ? (Math.random() - 0.5) * amp * 0.5 : 0;
                        pts.push([x, ys + bob + waveY(x, t, ph, amp) + jit]);
                    }
                    var line = pts.map(function (p, i) { return (i ? 'L ' : 'M ') + p[0].toFixed(1) + ' ' + p[1].toFixed(2); }).join(' ');
                    surf.setAttribute('d', line);
                    /* 水體：水面線往下封到杯底，左右拉很寬，鏡頭放大後不會看到邊 */
                    water.setAttribute('d', 'M ' + GX0 + ' ' + GB + ' L ' + GX0 + ' ' + pts[0][1].toFixed(2) + ' L ' + line.substring(2) +
                        ' L ' + GX1 + ' ' + GB + ' Z');
                }
                /* 水壺與水柱 */
                var targetAng = state === 'pour' ? -38 : 0;
                angle += (targetAng - angle) * 0.25;
                var k = Math.min(1, Math.max(0, angle / -38));
                var SPOUT_Y = SPOUT_Y0 + (SPOUT_Y1 - SPOUT_Y0) * k;
                pitcher.setAttribute('transform', 'translate(' + SPOUT_X + ' ' + SPOUT_Y.toFixed(1) + ') rotate(' + angle.toFixed(1) + ')');
                if (state === 'pour' && angle < -20) {
                    var tt = (now - tDown) / 1000;
                    var wob = Math.sin(tt * 40) * 1.2;
                    var wdt = 6 + 4 * flowAt(prof, tt);
                    stream.setAttribute('d', 'M ' + (SPOUT_X + 2) + ' ' + (SPOUT_Y + 6) + ' Q ' + (SPOUT_X + wob) + ' ' + ((SPOUT_Y + ys) / 2) + ' ' + SPOUT_X + ' ' + ys);
                    stream.setAttribute('stroke-width', wdt.toFixed(1));
                    stream.style.display = '';
                    splash.forEach(function (c, i) {
                        var a = Math.random() * 6.28, d = 8 + Math.random() * 16;
                        c.setAttribute('cx', (SPOUT_X + Math.cos(a) * d).toFixed(1));
                        c.setAttribute('cy', (ys - Math.abs(Math.sin(a)) * d * 0.9).toFixed(1));
                        c.style.display = L > 0 ? '' : 'none';
                    });
                } else {
                    stream.style.display = 'none';
                    splash.forEach(function (c) { c.style.display = 'none'; });
                }
            }
            my.loop(function (now) { draw(now); if (state === 'zoom' || state === 'verdict') return false; });
            draw(performance.now());

            /* ─── 按住倒水／放手 ─── */
            var holder = kit.hold(field, {
                enabled: function () { return state === 'ready'; },
                down: function (e) {
                    state = 'pour';
                    tDown = kit.evT(e) || performance.now();
                    hint.textContent = '倒到八分滿，放手！';
                    Sfx.pourStart();
                    /* 保底：水滿了自動停（溢出），用 setTimeout，不靠 rAF */
                    fullTimer = my.after(tFull * 1000 + 30, function () { if (state === 'pour') stop(performance.now(), true); });
                },
                up: function (e) { if (state === 'pour') stop(e ? kit.evT(e) : performance.now(), false); }
            });
            my.onDispose(function () { holder.destroy(); Sfx.pourStop(); });

            function stop(t, full) {
                if (state !== 'pour') return;
                my.cancel(fullTimer);
                tUp = performance.now();
                var sec = Math.max(0, (t - tDown) / 1000);
                level = full ? 1 : Math.min(1, levelAt(prof, sec));
                overflow = full || level >= 1;
                state = 'settle';
                Sfx.pourStop();
                hint.textContent = overflow ? '滿出來了！' : '水面慢慢平靜下來…';
                my.after(SETTLE_MS, startZoom);
                G.debug.last = { sec: sec, level: level, err: (level - TARGET) * 100 };
            }

            /* ─── 結算：先亮出目標線，再 ZOOM IN ─── */
            function startZoom() {
                if (state !== 'settle') return;
                state = 'zoom';
                draw(performance.now());
                var errPct = (level - TARGET) * 100;
                var err = Math.abs(errPct);
                var win = zoomWindow(errPct);
                var ys = yOf(level);
                var cy = (ys + YT) / 2;
                gTarget.classList.add('pour-target--on');
                pitcher.style.display = 'none';
                hint.textContent = '放大看看差多少…';
                Sfx.play('zoom');
                var zlabel = h('div', { 'class': 'pour-zoomlabel', text: '放大 ×1' });
                field.appendChild(zlabel);
                var from = { vh: H, cy: H / 2 }, to = { vh: win, cy: cy };
                var aspect = W / H;
                function setBox(vh, cyy, e) {
                    var vw = vh * aspect;
                    var frac = 0.5 + (ANCHOR_Y - 0.5) * e;
                    view = { x: W / 2 - vw / 2, y: cyy - vh * frac, w: vw, h: vh };
                    svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
                    fitWide(ys);
                    zlabel.textContent = '放大 ×' + (H / vh < 10 ? (H / vh).toFixed(1) : Math.round(H / vh));
                    /* 放大到杯壁已經在鏡頭外時就不畫（省下超大圖形的算圖）；字也跟著縮 */
                    gGlass.style.display = vh < H * 0.5 ? 'none' : '';
                }
                my.tween(ZOOM_MS, function (e) {
                    /* 倍率用指數內插，放大感覺比較均勻 */
                    var vh = Math.exp(Math.log(from.vh) + (Math.log(to.vh) - Math.log(from.vh)) * e);
                    setBox(vh, from.cy + (to.cy - from.cy) * e, e);
                }, kit.easeInOutCubic).then(function () {
                    setBox(to.vh, to.cy, 1);
                    drawRuler(win, YT, ys);
                    my.after(500, function () { verdict(errPct, err); });
                });
            }

            /* 刻度尺：以目標線為 0%，往上是「多」(+)、往下是「少」(−) */
            function drawRuler(win, yTarget, ySurf) {
                var step = stepFor(win);
                var stepU = step / 100 * GH;
                var vw = win * (W / H), cy = (yTarget + ySurf) / 2;
                var top = cy - win * ANCHOR_Y;                      /* 鏡頭最上緣的 y */
                var x0 = W / 2 - vw / 2;
                var sc = Math.min(field.clientWidth / view.w, field.clientHeight / view.h);      /* SVG 單位 → 螢幕 px */
                var offX = (field.clientWidth - view.w * sc) / 2, offY = (field.clientHeight - view.h * sc) / 2;     /* SVG 置中留白（meet） */
                var labels = h('div', { 'class': 'pour-labels' });
                field.appendChild(labels);
                /* 刻度 k 的 y = yTarget - k·stepU；只畫落在鏡頭內的 */
                var kMin = Math.ceil((yTarget - (top + win)) / stepU);
                var kMax = Math.floor((yTarget - top) / stepU);
                for (var k = kMin; k <= kMax; k++) {
                    var y = yTarget - k * stepU;
                    var major = k === 0;
                    kit.svg('line', { 'class': 'pour-tick' + (major ? ' pour-tick--zero' : ''), x1: x0 + vw * 0.02, x2: x0 + vw * (major ? 0.14 : 0.09), y1: y, y2: y }, gRuler);
                    /* 刻度文字用 HTML 疊上去（SVG 文字在 ×77 的放大下，瀏覽器會算圖超時） */
                    var v = k * step;
                    var lb = h('div', {
                        'class': 'pour-ticklabel' + (major ? ' pour-ticklabel--zero' : ''),
                        text: major ? '目標 80%' : ((v > 0 ? '+' : '−') + Math.abs(v).toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0)) + '%')
                    });
                    lb.style.left = (offX + (x0 + vw * 0.16 - view.x) * sc).toFixed(1) + 'px';
                    lb.style.top = (offY + (y - view.y) * sc).toFixed(1) + 'px';
                    labels.appendChild(lb);
                }
                gRuler.classList.add('pour-ruler--on');
            }

            /* ─── 結算橫幅 ─── */
            function verdict(errPct, err) {
                state = 'verdict';
                var isNew = Reaction.setBest(ID, err, function (v, b) { return v < b; });
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                hint.textContent = '';
                var sfx = err < 0.5 ? 'perfect' : (err < 4 ? 'win' : 'fail');
                var kids = [];
                kids.push(h('div', { 'class': 'rx-result__num pour-verdict__num', text: rating(err) }));
                kids.push(h('div', { 'class': 'rx-result__label', text: overflow ? '水滿出來了，水位 100%' : (err < 0.005 ? '分毫不差！' : (errPct > 0 ? '多倒了 ' : '少倒了 ') + fmtPct(err)) }));
                kids.push(h('div', { 'class': 'hint rx-result__line', text: '水位 ' + fmtPct(level * 100) + '，目標 80%' }));
                if (isNew) kids.push(h('div', { 'class': 'hint hint--ok', text: '新紀錄！最小誤差' }));
                kids.push(h('button', { 'class': 'btn btn--primary', text: '再倒一次', on: { click: function () { Sfx.play('click'); round(); } } }));
                field.appendChild(h('div', { 'class': 'pour-verdict', attrs: { 'data-sfx': sfx } }, kids));
            }

            G.debug = {
                last: null,
                prof: prof,
                tFull: tFull,
                state: function () { return { state: state, level: level, overflow: overflow }; },
                /* 模擬按住 ms 毫秒後放手 */
                pour: function (ms) {
                    if (state !== 'ready') return state;
                    state = 'pour'; tDown = performance.now(); Sfx.pourStart();
                    hint.textContent = '倒到八分滿，放手！';
                    fullTimer = my.after(tFull * 1000 + 30, function () { if (state === 'pour') stop(performance.now(), true); });
                    my.after(ms, function () { if (state === 'pour') stop(performance.now(), false); });
                    return 'pour';
                },
                /* 要按多久，水位才會剛好是 pct（%） */
                msFor: function (pct) {
                    var lo = 0, hi = tFull * 1000;
                    for (var i = 0; i < 50; i++) { var m = (lo + hi) / 2; if (levelAt(prof, m / 1000) < pct / 100) lo = m; else hi = m; }
                    return (lo + hi) / 2;
                }
            };
        }

        round();
    }

    var G = {
        id: ID,
        name: '倒到八分滿',
        rule: '按住畫面把水倒進杯子，倒到杯子的「八分滿」（高度的 80%）就放手。杯子沒有刻度，水面也一直在抖，只能靠感覺！只有一次機會，放手後會 ZOOM IN 放大看你差了幾 %。',
        mount: mount,
        test: { makeProfile: makeProfile, levelAt: levelAt, timeToFull: timeToFull, flowAt: flowAt, zoomWindow: zoomWindow, stepFor: stepFor, rating: rating, TARGET: TARGET }
    };
    Reaction.register(G);
})();
