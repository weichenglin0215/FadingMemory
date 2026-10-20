/* ═══════════════════════════════════════════════════════════════════
   reaction_fishbite.js — 秒反應・釣魚提竿（企劃 361）
   浮標在水面上。魚會來輕輕碰（浮標小小地晃一下），**真的咬鉤時浮標會整個沉下去**——那一刻**往上滑提竿**。
   太早提（只是輕碰、或根本還沒咬）魚就跑了；太晚提（沉下去超過窗口時間才提）魚也跑了。每關釣一條。
   ───────────────────────────────────────────────────────────────────
   · 一關的「時間表」（makeLevel）：先有 k 次「輕碰」（假的，浮標只沉下一部分），最後一次才是「咬鉤」（浮標整個沉下去）。
     浮標沉下的深度用「比例」表示：0＝浮在原位、1＝整個沒進水裡。
       輕碰：深度比例是 0.6×hi ～ hi（hi 隨關卡從 0.45 增加到 0.8，永遠到不了 BITE_LINE＝0.9）；
       咬鉤：很快沉到 1.0，**深度 ≥ 0.9 的那段時間（窗口 WINDOW 秒）內提竿才算釣到**，窗口一過浮標又浮上來（魚吐鉤跑了）。
     所以判定只看「提竿的瞬間，浮標是不是沉在 0.9 以下」——不是看「有沒有動」，輕碰再怎麼深（最多 0.8）也不算。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：窗口 0.8 → 0.25 秒；輕碰的深度上限 0.45 → 0.8（越來越像咬鉤）；
     輕碰次數 1 → 4 次；水面波浪（讓浮標一直晃）的振幅 2 → 8 px。
   · 提竿＝手指在畫面任何地方往上滑（拉開 SWIPE_MIN 以上、而且往上的分量夠大）；單純點一下不算。
   · 揭曉：用折線圖畫出「浮標沉下的深度」整段時間表，標出「咬鉤」和「你提竿」的位置，並用 0.5 倍慢動作重播咬鉤的那一段；
     成功就有一條魚（每一關不同種）被提出水面。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fishbite';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var WINDOW_S = [0.8, 0.25];                 /* 咬鉤的窗口（浮標沉在 0.9 以下的時間，秒）：第 1 關 → 到頂 */
    var FAKE_HI = [0.45, 0.8];                  /* 輕碰的深度上限（比例）：第 1 關 → 到頂；必須 < BITE_LINE */
    var FAKES = [1, 4];                         /* 輕碰的次數：第 1 關 → 到頂（四捨五入） */
    var WAVE_PX = [2, 8];                       /* 水面波浪讓浮標上下晃的振幅（px）：第 1 關 → 到頂 */
    var BITE_LINE = 0.9;                        /* 浮標沉到這個比例以下才算「咬鉤」 */
    var FAKE_DUR = [0.28, 0.42];                /* 一次輕碰持續多久（秒） */
    var DESC_S = 0.14;                          /* 咬鉤時浮標從原位沉到最深要多久 */
    var RECOVER_S = 0.35;                       /* 窗口結束後浮標浮回原位要多久 */
    var FIRST_AT = [1.4, 2.4];                  /* 第一次動作（輕碰或咬鉤）的時間範圍（秒） */
    var GAP = [1.1, 2.3];                       /* 兩次動作之間隔多久（秒，從上一次結束算起） */
    var LATE_GRACE = 0.35;                      /* 窗口結束後再等多久還沒提竿就判「太慢」（秒） */
    var SWIPE_MIN = 50;                         /* 往上滑要拉開幾 px */
    var UP_K = 0.8;                             /* 往上的分量要 ≥ 水平分量 × 這個數 */
    var REPLAY_SPEED = 0.5;                     /* 揭曉重播的速度（0.5＝慢動作兩倍） */
    var REPLAY_PRE = 0.6, REPLAY_POST = 0.5;    /* 重播從咬鉤前幾秒開始、窗口結束後多幾秒 */
    var MAX_LEVEL = 60;
    var FISH = ['吳郭魚', '香魚', '鯉魚', '鱸魚', '鯽魚', '草魚'];      /* 每一關釣到的魚（依關卡輪流） */
    var easeOut = kit.easeOutCubic, easeIO = kit.easeInOutCubic;
    /* 浮標往回浮的時候（easeIO 曲線）從 1.0 掉到 BITE_LINE（0.9）要走完回程的多少比例：4u³ ＝ 1 − 0.9 → u ≈ 0.292。
       窗口的結束時間 tEnd 就是「深度剛好掉到 0.9」的那一刻，所以要提早這麼多開始往回浮，畫面上看到的沉沒時間和判定才一致 */
    var U_REC = Math.pow((1 - BITE_LINE) / 4, 1 / 3);

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function windowFor(level) { return Math.round(ramp(level, WINDOW_S) * 1000) / 1000; }
    function fakeHiFor(level) { return Math.round(ramp(level, FAKE_HI) * 1000) / 1000; }
    function fakesFor(level) { return Math.round(ramp(level, FAKES)); }
    function waveFor(level) { return Math.round(ramp(level, WAVE_PX) * 100) / 100; }
    function fishFor(level) { return FISH[(level - 1) % FISH.length]; }
    /* 出一關：{
         level, events（時間表：{ kind:'fake', t, dur, depth } 若干個，最後一個 { kind:'bite', t（開始沉）, t90（沉到 0.9 的時間）, tEnd（浮回 0.9 的時間）, rec（開始往回浮）, window }）,
         bite（咬鉤那一筆）, window, wave（水面波浪參數）, fish（魚的名字）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var k = fakesFor(level), hi = fakeHiFor(level), win = windowFor(level), events = [], t = kit.randFloat(FIRST_AT[0], FIRST_AT[1], rand), i;
        for (i = 0; i < k; i++) {
            var dur = kit.randFloat(FAKE_DUR[0], FAKE_DUR[1], rand);
            events.push({ kind: 'fake', t: Math.round(t * 1000) / 1000, dur: Math.round(dur * 1000) / 1000, depth: Math.round(kit.randFloat(0.6 * hi, hi, rand) * 1000) / 1000 });
            t += dur + kit.randFloat(GAP[0], GAP[1], rand);
        }
        /* 咬鉤：從 t 開始沉；深度到 0.9 的時間點 t90（easeOut 的反函數），窗口＝t90 之後 win 秒 */
        var u90 = 1 - Math.pow(1 - BITE_LINE, 1 / 3), t90 = t + u90 * DESC_S, tEnd = t90 + win, bite = { kind: 'bite', t: t, t90: t90, tEnd: tEnd, rec: tEnd - U_REC * RECOVER_S, window: win };          /* 咬鉤的時間不四捨五入：畫面（depthAt）和判定（judgeSwipe）要用同一組數字 */
        events.push(bite);
        var wave = { A: waveFor(level), f1: kit.randFloat(0.55, 0.85, rand), f2: kit.randFloat(1.3, 1.9, rand), p1: kit.randFloat(0, 6.28, rand), p2: kit.randFloat(0, 6.28, rand) };
        return { level: level, events: events, bite: bite, window: win, wave: wave, fish: fishFor(level), fakes: k };
    }
    /* 第 t 秒浮標沉下的深度比例（0～1；不含波浪） */
    function depthAt(q, t) {
        for (var i = 0; i < q.events.length; i++) {
            var e = q.events[i];
            if (e.kind === 'fake') {
                if (t >= e.t && t <= e.t + e.dur) { var s = Math.sin(Math.PI * (t - e.t) / e.dur); return e.depth * s * s; }
            } else {
                if (t >= e.t && t < e.rec) return easeOut(Math.min(1, (t - e.t) / DESC_S));                      /* 沉下去、停在最深 */
                if (t >= e.rec && t < e.rec + RECOVER_S) return 1 - easeIO((t - e.rec) / RECOVER_S);               /* 往回浮；在 tEnd 剛好掉到 0.9 */
            }
        }
        return 0;
    }
    /* 水面波浪讓浮標上下晃多少 px（往下為正） */
    function waveAt(w, t) { return w.A * (0.65 * Math.sin(6.2832 * w.f1 * t + w.p1) + 0.35 * Math.sin(6.2832 * w.f2 * t + w.p2)); }
    /* 在第 t 秒提竿：'ok'（浮標沉在 0.9 以下、窗口內）｜'early'（太早：輕碰中、還沒咬、或剛開始沉）｜'late'（窗口已經過了） */
    function judgeSwipe(q, t) {
        var b = q.bite;
        if (t >= b.t90 && t <= b.tEnd) return 'ok';
        return t < b.t90 ? 'early' : 'late';
    }
    /* 手指位移 → 是不是「往上滑」（y 向下，所以往上是 dy < 0） */
    function isUpSwipe(dx, dy, minDist) { return -dy >= (minDist == null ? SWIPE_MIN : minDist) && -dy >= Math.abs(dx) * UP_K; }
    /* 揭曉的折線圖：把 [t0, t1] 這段時間的深度取樣成 n 個點，畫在 w×h 的方塊裡（深度 0 在上、1 在下）；回傳 points 字串 */
    function chartPoints(q, t0, t1, w, h, n) {
        var pts = [];
        for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n; pts.push((w * i / n).toFixed(1) + ',' + (h * depthAt(q, t)).toFixed(1)); }
        return pts.join(' ');
    }
    /* 重播的時間範圍：咬鉤前 REPLAY_PRE 秒 到 窗口結束後 REPLAY_POST 秒 */
    function replayRange(q) { return { t0: Math.max(0, q.bite.t - REPLAY_PRE), t1: q.bite.tEnd + RECOVER_S + REPLAY_POST }; }
    function replayMs(q) { var r = replayRange(q); return Math.round((r.t1 - r.t0) / REPLAY_SPEED * 1000); }
    function whyText(kind, q) {
        if (kind === 'early') return '太早提竿了！浮標還沒整個沉下去，魚只是在試探';
        if (kind === 'late') return '太慢了！浮標沉下去超過 ' + q.window.toFixed(4) + ' 秒，魚吐鉤跑了';
        return '釣到了！是一條' + q.fish;
    }
    function rating(n) {
        if (n >= 15) return '釣魚高手！';
        if (n >= 9) return '眼明手快！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '等浮標整個沉下去再提竿！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'fbt-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關（釣到 ' + S.cleared + ' 條魚）']; },
            setup: setup
        });
    }

    /* 魚（SVG）：身體、尾巴、眼睛、花紋；顏色依魚種編號 0～5 用 CSS 變數 */
    function fishSvg(idx, parent) {
        var svg = kit.svg('svg', { 'class': 'fbt-fishsvg', viewBox: '0 0 120 70', width: 150, height: 88 }, parent);
        kit.svg('path', { 'class': 'fbt-tail fbt-fc' + idx, d: 'M96,35 L118,12 Q112,35 118,58 Z' }, svg);
        kit.svg('ellipse', { 'class': 'fbt-body fbt-fc' + idx, cx: 52, cy: 35, rx: 46, ry: 26 }, svg);
        kit.svg('path', { 'class': 'fbt-belly', d: 'M12,38 Q52,66 92,38 Q52,52 12,38 Z' }, svg);
        kit.svg('path', { 'class': 'fbt-stripe', d: 'M40,12 Q46,35 40,58 M58,10 Q64,35 58,60' }, svg);
        kit.svg('circle', { 'class': 'fbt-eye', cx: 20, cy: 29, r: 4 }, svg);
        return svg;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[釣魚提竿] 第 ' + level + ' 關：輕碰 ' + q.fakes + ' 次（深度 ' + q.events.filter(function (e) { return e.kind === 'fake'; }).map(function (e) { return e.depth.toFixed(2); }).join('、') + '）；咬鉤 ' + q.bite.t.toFixed(2) + ' 秒、窗口 ' + q.window.toFixed(2) + ' 秒（' + q.bite.t90.toFixed(2) + '～' + q.bite.tEnd.toFixed(2) + '）');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var waterY = Math.round(H * 0.4), VIS = 84, FW = 36, cx = Math.round(W / 2);
        var field = h('div', { 'class': 'fbt-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note fbt-tip', text: level === 1 ? '浮標整個沉下去，就往上滑提竿！' : '整個沉下去才提竿（往上滑）' });
        field.appendChild(tip);
        /* 水：水面以下的藍色；波紋圈（咬鉤、輕碰時冒一個） */
        var water = h('div', { 'class': 'fbt-water' }); water.style.top = waterY + 'px'; field.appendChild(water);
        var surf = h('div', { 'class': 'fbt-surface' }); surf.style.top = waterY + 'px'; field.appendChild(surf);
        /* 浮標：放在一個「只顯示水面以上」的裁切框裡，沉下去的部分就看不見 */
        var clip = h('div', { 'class': 'fbt-clip' }); clip.style.height = waterY + 'px'; field.appendChild(clip);
        var line = kit.svg('svg', { 'class': 'fbt-lines', width: W, height: waterY }, clip), rod = kit.svg('line', { 'class': 'fbt-rodline', x1: W - 14, y1: -6, x2: cx, y2: waterY - VIS }, line);
        var fl = h('div', { 'class': 'fbt-float' }); fl.style.cssText = 'left:' + (cx - FW / 2) + 'px;top:0;width:' + FW + 'px;height:' + (VIS + 90) + 'px;';
        fl.appendChild(h('div', { 'class': 'fbt-float__ant' })); fl.appendChild(h('div', { 'class': 'fbt-float__top' })); fl.appendChild(h('div', { 'class': 'fbt-float__body' }));
        clip.appendChild(fl);
        var info = h('div', { 'class': 'qz-note fbt-info', text: '' }); info.style.top = (waterY + 16) + 'px'; field.appendChild(info);
        if (level === 1 && kit.once('fishbite.hint')) kit.hintOn(stage, null, { mode: 'drag', x: W / 2, y: H * 0.86, dx: 0, dy: -130, delay: 1200, text: '浮標整個沉下去，就往上滑' });

        var phase = 'wait', t0 = performance.now(), nextRipple = 0, down = null, swipeAt = null, shown = 0;
        function nowS() { return (performance.now() - t0) / 1000; }
        /* 畫浮標：depth（0～1）＋ 波浪（往下 px） */
        function drawFloat(depth, wavePx) {
            var topY = waterY - VIS + depth * VIS + wavePx;
            fl.style.transform = 'translateY(' + topY.toFixed(1) + 'px)';
            rod.setAttribute('y2', (topY + 4).toFixed(1));
        }
        function ripple(strong) {
            var r = h('div', { 'class': 'fbt-ripple' + (strong ? ' fbt-ripple--strong' : '') }); r.style.cssText = 'left:' + (cx - 40) + 'px;top:' + (waterY - 12) + 'px;';
            field.appendChild(r); api.after(900, function () { if (r.parentNode) r.parentNode.removeChild(r); });
        }
        drawFloat(0, waveAt(q.wave, 0));
        api.my.loop(function (now) {
            if (phase !== 'wait' || !stage.isConnected) return false;
            var t = (now - t0) / 1000;
            /* 每個動作開始的時候冒一個波紋（輕碰淡、咬鉤濃——不過兩者都會冒，不是線索） */
            while (nextRipple < q.events.length && t >= q.events[nextRipple].t) { ripple(false); nextRipple++; }
            drawFloat(depthAt(q, t), waveAt(q.wave, t));
        });
        /* 太慢：窗口結束又過了一點時間還沒提竿 → 魚跑了（用計時器，不靠 rAF） */
        api.after(Math.round((q.bite.tEnd + LATE_GRACE) * 1000), function () { if (phase === 'wait') finish('late', null); });

        /* 提竿＝往上滑 */
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'wait' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            var p = kit.localPt(e, field); down = { id: e.pointerId, x: p.x, y: p.y, fired: false };
        });
        function track(e) {
            if (!down || e.pointerId !== down.id || down.fired || phase !== 'wait') return;
            var p = kit.localPt(e, field);
            if (isUpSwipe(p.x - down.x, p.y - down.y)) { down.fired = true; pull(); }
        }
        field.addEventListener('pointermove', track);
        field.addEventListener('pointerup', function (e) { track(e); if (down && e.pointerId === down.id) down = null; });
        field.addEventListener('pointercancel', function (e) { if (down && e.pointerId === down.id) down = null; });

        function pull() {
            if (phase !== 'wait' || api.over) return;
            var t = nowS(), res = judgeSwipe(q, t);
            swipeAt = t; finish(res, t);
        }
        /* 結果：kind＝'ok'｜'early'｜'late' */
        function finish(kind, t) {
            if (phase !== 'wait') return;
            phase = kind === 'ok' ? 'caught' : 'replay';
            api.stopTimer();
            var why = whyText(kind, q);
            info.textContent = why;
            if (kind === 'ok') {
                /* 魚被提出水面：浮標往上跳、魚從水裡飛出來 */
                info.classList.add('fbt-info--ok'); Sfx.play('ok');
                drawFloat(0, 0);
                var fish = h('div', { 'class': 'fbt-fish' }); fish.style.cssText = 'left:' + (cx - 75) + 'px;top:' + (waterY - 40) + 'px;'; fishSvg((level - 1) % FISH.length, fish); field.appendChild(fish);
                api.after(30, function () { fish.classList.add('fbt-fish--jump'); });
                kit.flash(stage, true, api.my);
                api.pass({ delay: 2300 });
                return;
            }
            info.classList.add('fbt-info--bad');
            kit.flash(stage, false, api.my);
            showReplay(kind, t);
            api.fail({ delay: replayMs(q) + 1500, lines: [why, '咬鉤在第 ' + q.bite.t.toFixed(4) + ' 秒，窗口 ' + q.window.toFixed(4) + ' 秒（' + q.bite.t90.toFixed(4) + '～' + q.bite.tEnd.toFixed(4) + '）' + (t != null ? '；你在第 ' + t.toFixed(4) + ' 秒提竿' : '；你沒有提竿')] });
        }
        /* 揭曉：折線圖（深度整段時間表）＋咬鉤區＋你提竿的位置＋慢動作重播咬鉤那一段 */
        function showReplay(kind, t) {
            var CW = W - 24, CH = 150, total = q.bite.tEnd + RECOVER_S + 0.6, box = h('div', { 'class': 'fbt-chart' });
            box.style.cssText = 'left:12px;top:' + (waterY + 124) + 'px;width:' + CW + 'px;height:' + (CH + 56) + 'px;';
            var svg = kit.svg('svg', { 'class': 'fbt-chart__svg', viewBox: '0 0 ' + CW + ' ' + (CH + 56), width: CW, height: CH + 56 }, box), X = function (s) { return (CW - 8) * s / total + 4; }, Y0 = 26;
            kit.svg('rect', { 'class': 'fbt-chart__bg', x: 0, y: Y0 - 6, width: CW, height: CH + 12, rx: 10 }, svg);
            kit.svg('rect', { 'class': 'fbt-chart__bite', x: X(q.bite.t90), y: Y0 - 6, width: Math.max(3, X(q.bite.tEnd) - X(q.bite.t90)), height: CH + 12 }, svg);
            kit.svg('line', { 'class': 'fbt-chart__line90', x1: 4, x2: CW - 4, y1: Y0 + CH * BITE_LINE, y2: Y0 + CH * BITE_LINE }, svg);
            var pl = kit.svg('polyline', { 'class': 'fbt-chart__curve', points: chartPoints(q, 0, total, CW - 8, CH, 240).split(' ').map(function (pp) { var a = pp.split(','); return (+a[0] + 4).toFixed(1) + ',' + (+a[1] + Y0).toFixed(1); }).join(' ') }, svg);
            var lb = kit.svg('text', { 'class': 'fbt-chart__lab fbt-chart__lab--bite', x: Math.min(CW - 70, Math.max(70, X(q.bite.t90))), y: 18 }, svg); lb.textContent = '咬鉤';
            var l9 = kit.svg('text', { 'class': 'fbt-chart__lab fbt-chart__lab--ln', x: 8, y: Y0 + CH * BITE_LINE - 6 }, svg); l9.textContent = '沉到這條線以下才算咬鉤';
            if (t != null) {
                var sx = X(Math.min(t, total)); kit.svg('line', { 'class': 'fbt-chart__you', x1: sx, x2: sx, y1: Y0 - 6, y2: Y0 + CH + 6 }, svg);
                var yl = kit.svg('text', { 'class': 'fbt-chart__lab fbt-chart__lab--you', x: Math.min(CW - 60, Math.max(60, sx)), y: Y0 + CH + 36 }, svg); yl.textContent = '你提竿 ' + t.toFixed(4) + ' 秒';
            }
            var cur = kit.svg('line', { 'class': 'fbt-chart__cur', x1: 0, x2: 0, y1: Y0 - 6, y2: Y0 + CH + 6 }, svg);
            field.appendChild(box);
            /* 慢動作重播：浮標跟著游標一起動 */
            var rg = replayRange(q), ms = replayMs(q), r0 = performance.now();
            api.my.loop(function (now) {
                var p = Math.min(1, (now - r0) / ms), tv = rg.t0 + (rg.t1 - rg.t0) * p;
                drawFloat(depthAt(q, tv), waveAt(q.wave, tv));
                var x = X(Math.min(tv, total)); cur.setAttribute('x1', x); cur.setAttribute('x2', x);
                if (p >= 1) return false;
            });
        }
        /* 驗證用：自己算好時間，在咬鉤窗口裡提竿／在第一次輕碰的最深處（沒有輕碰就在剛開始時）提竿；可以重複呼叫 */
        var armed = false;
        api.solve = function () { if (armed || phase !== 'wait') return; armed = true; api.after(Math.max(0, Math.round((q.bite.t90 + Math.min(0.1, q.window / 2) - nowS()) * 1000)), pull); };
        api.wrong = function () { if (armed || phase !== 'wait') return; armed = true; var e = q.events[0], at = e.kind === 'fake' ? e.t + e.dur / 2 : Math.max(0.1, e.t - 0.5); api.after(Math.max(0, Math.round((at - nowS()) * 1000)), pull); };
    }

    var G = {
        id: ID,
        name: '釣魚提竿',
        rule: '浮標浮在水面上。魚會來輕輕碰（**浮標小小地晃一下，不要提**），**真的咬鉤時浮標會整個沉下去**——那一刻在畫面上**往上滑提竿**！太早提魚就跑了，沉下去太久才提魚也跑了。每關釣一條魚。越後面，輕碰沉得越深（越來越像咬鉤）、咬鉤的時間越短（0.8 → 0.25 秒）、水面的波浪也越大。失敗時會用折線圖和慢動作告訴你魚是什麼時候咬鉤的。',
        mount: mount,
        score: SCORE,
        test: {
            windowFor: windowFor, fakeHiFor: fakeHiFor, fakesFor: fakesFor, waveFor: waveFor, fishFor: fishFor, makeLevel: makeLevel, depthAt: depthAt, waveAt: waveAt, judgeSwipe: judgeSwipe, isUpSwipe: isUpSwipe, chartPoints: chartPoints, replayRange: replayRange, replayMs: replayMs, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, WINDOW_S: WINDOW_S, FAKE_HI: FAKE_HI, FAKES: FAKES, WAVE_PX: WAVE_PX, BITE_LINE: BITE_LINE, FAKE_DUR: FAKE_DUR, U_REC: U_REC, DESC_S: DESC_S, RECOVER_S: RECOVER_S, FIRST_AT: FIRST_AT, GAP: GAP, LATE_GRACE: LATE_GRACE, SWIPE_MIN: SWIPE_MIN, FISH: FISH, MAX_LEVEL: MAX_LEVEL, REPLAY_SPEED: REPLAY_SPEED
        }
    };
    Reaction.register(G);
})();
