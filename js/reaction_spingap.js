/* ═══════════════════════════════════════════════════════════════════
   reaction_spingap.js — 秒反應・穿過旋轉縫（企劃 178，砲台版）
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
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'spingap';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 顆', label: '射出砲彈', min: 1, max: 100 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾發之後難度到頂 */
    var OMEGA_REV = [0.25, 0.75];               /* 圓環轉速（圈／秒）：第 1 發 → 到頂 */
    var GAP_DEG = [80, 36];                     /* 缺口的寬度（度）：第 1 發 → 到頂 */
    var FLIGHT_S = 0.6;                         /* 砲彈從砲口飛到環內緣要幾秒（固定，企劃指定 0.6 秒） */
    var RING_R = 178;                           /* 圓環中心線的半徑（邏輯 px） */
    var RING_W = 24;                            /* 圓環的粗細 */
    var BALL_R = 12;                            /* 砲彈半徑 */
    var CENTER_Y = 232;                         /* 圓環中心的 y（離遊戲區上緣） */
    var MUZZLE_DY = 34;                         /* 砲口比圓環中心低多少（砲台在環內偏下方） */
    var MAX_LEVEL = 100;
    var TOP_DEG = -90;                          /* 「正上方」的角度（從正右方順時針量，上方是 −90 度） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function omegaDeg(level) { return kit.ramp(level, OMEGA_REV[0], OMEGA_REV[1], RAMP_LEVELS) * 360; }       /* 度／秒 */
    function gapFor(level) { return kit.ramp(level, GAP_DEG[0], GAP_DEG[1], RAMP_LEVELS); }
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
        return { pass: Math.abs(diff) <= tol + 1e-9, diff: diff, tol: tol };
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
            '<g class="spg-barrel"><path d="M43 14 H77 L84 94 H36 Z" class="spg-iron"/><rect x="38" y="4" width="44" height="15" rx="6" class="spg-iron-d"/>' +
            '<circle cx="60" cy="96" r="21" class="spg-iron"/><circle cx="60" cy="120" r="7" class="spg-iron-d"/></g>' +
            '<path d="M24 102 H96 L102 128 H18 Z" class="spg-wood"/>' +
            '<g class="spg-wheel"><circle cx="30" cy="126" r="22" class="spg-wood-d"/><circle cx="30" cy="126" r="6" class="spg-iron"/><path d="M30 104 V148 M8 126 H52 M14 110 L46 142 M46 110 L14 142" class="spg-spoke"/></g>' +
            '<g class="spg-wheel"><circle cx="90" cy="126" r="22" class="spg-wood-d"/><circle cx="90" cy="126" r="6" class="spg-iron"/><path d="M90 104 V148 M68 126 H112 M74 110 L106 142 M106 110 L74 142" class="spg-spoke"/></g></svg>';
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, cx = W / 2, cy = CENTER_Y;
        var om = omegaDeg(level), gap = gapFor(level), geom = ballGeom();
        /* 環的起始角度：接著上一發轉（第 1 發隨機） */
        var now0 = performance.now();
        var phi0 = (level === 1 || !carry) ? kit.randFloat(-180, 180, api.rand) : carry.phi + carry.om * (now0 - carry.t) / 1000;
        var tBase = now0;
        function phiNow(tMs) { return gapAt(phi0, om, (tMs - tBase) / 1000); }
        api.info = { omega: om, gap: gap, tol: tolDeg(level), tolMs: tolMs(level) };
        console.log('[穿過旋轉縫] 第 ' + level + ' 發：轉速 ' + om.toFixed(4) + ' 度/秒，缺口 ' + gap.toFixed(4) + ' 度，容許 ±' + tolDeg(level).toFixed(4) + ' 度（±' + tolMs(level).toFixed(1) + ' ms）');

        var svg = kit.svg('svg', { 'class': 'spg-svg', viewBox: '0 0 ' + W + ' 640', width: W, height: 640 }, stage);
        var C = 2 * Math.PI * RING_R;
        var ring = kit.svg('circle', { cx: cx, cy: cy, r: RING_R, 'class': 'spg-ring', 'stroke-width': RING_W,
            'stroke-dasharray': (C * (1 - gap / 360)).toFixed(2) + ' ' + (C * gap / 360).toFixed(2) }, svg);
        /* 正上方的出口記號（一個小三角形） */
        kit.svg('path', { d: 'M' + (cx - 14) + ' ' + (cy - RING_R - RING_W / 2 - 22) + ' L' + (cx + 14) + ' ' + (cy - RING_R - RING_W / 2 - 22) + ' L' + cx + ' ' + (cy - RING_R - RING_W / 2 - 4) + ' Z', 'class': 'spg-mark' }, svg);
        var ball = kit.svg('circle', { cx: cx, cy: geom.y0, r: BALL_R, 'class': 'spg-ball', visibility: 'hidden' }, svg);
        var cannon = h('div', { 'class': 'spg-cannon', html: cannonSvg() });
        cannon.style.left = (cx - 60) + 'px'; cannon.style.top = (geom.y0 - 6) + 'px';
        stage.appendChild(cannon);
        var tip = h('div', { 'class': 'qz-note spg-tip', text: '點擊畫面發射砲彈：缺口要提前轉到上方！' });
        stage.appendChild(tip);
        var msg = h('div', { 'class': 'qz-note spg-msg', text: '已射出 ' + (level - 1) + ' 顆' });
        stage.appendChild(msg);

        var state = 'ready', tFire = 0;
        function paintRing(tMs) { ring.setAttribute('transform', 'rotate(' + (phiNow(tMs) + gap / 2).toFixed(3) + ' ' + cx + ' ' + cy + ')'); }
        paintRing(performance.now());
        var loop = api.my.loop(function () {
            var t = performance.now();
            if (state !== 'blocked') paintRing(t);
            carry = { phi: phiNow(t), om: om, t: t };
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
            Sfx.play('pop');
            ball.setAttribute('visibility', 'visible'); ball.setAttribute('cy', geom.y0);
            cannon.classList.add('spg-cannon--fire'); api.after(160, function () { cannon.classList.remove('spg-cannon--fire'); });
            tip.textContent = '砲彈飛行中…';
            /* 抵達環內緣的那一刻判定 */
            api.after(FLIGHT_S * 1000, function () {
                var phi = phiNow(tFire + FLIGHT_S * 1000), r = judgeShot(level, phi);
                console.log('[穿過旋轉縫] 抵達：缺口中心 ' + norm180(phi).toFixed(4) + ' 度，差 ' + r.diff.toFixed(4) + ' 度，容許 ±' + r.tol.toFixed(4) + ' 度 → ' + (r.pass ? '穿出' : '撞環'));
                var line = '缺口與砲彈差 ' + Math.abs(r.diff).toFixed(4) + ' 度（容許 ±' + r.tol.toFixed(4) + ' 度）';
                if (r.pass) {
                    state = 'passed'; tip.textContent = '穿出去了！' + line; kit.flash(stage, true, api.my);
                    api.pass({ delay: 800 });
                    api.after(780, function () { loop.stop(); ball.setAttribute('visibility', 'hidden'); });       /* 換下一發之前，把這一發的動畫迴圈收掉 */
                } else {
                    state = 'blocked'; ball.setAttribute('cy', geom.yc);
                    ball.classList.add('spg-ball--boom'); tip.textContent = '撞到環了。' + line; kit.flash(stage, false, api.my);
                    api.fail({ delay: 2000, lines: ['第 ' + level + ' 發撞到環了', line] });
                }
            });
        }
        kit.onTap(stage, function () { fire(); });
        if (level === 1 && kit.once('spingap.hint')) kit.hintOn(stage, cannon, { mode: 'tap', delay: 500, text: '請點擊畫面發射砲彈' });

        /* 驗證用：api.solve 在「剛好」的時間發射、api.wrong 在缺口在下方時發射 */
        var scheduled = false;
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

    var G = {
        id: ID,
        name: '穿過旋轉縫',
        rule: '圓環一直在旋轉，環上有一個缺口。點一下螢幕，環裡的砲台會射出砲彈，飛 0.6 秒後抵達環的上緣，那一刻缺口要剛好轉到上方，砲彈才能穿出去。撞到環就結束，看你能射出幾顆。越後面，轉得越快、缺口越小！',
        mount: mount,
        score: SCORE,
        test: {
            omegaDeg: omegaDeg, gapFor: gapFor, norm180: norm180, gapAt: gapAt, ballHalfDeg: ballHalfDeg, tolDeg: tolDeg, tolMs: tolMs, judgeShot: judgeShot, perfectDelay: perfectDelay, ballGeom: ballGeom, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, OMEGA_REV: OMEGA_REV, GAP_DEG: GAP_DEG, FLIGHT_S: FLIGHT_S, RING_R: RING_R, BALL_R: BALL_R, TOP_DEG: TOP_DEG, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
