/* ═══════════════════════════════════════════════════════════════════
   reaction_balloon.js — 秒反應・吹氣球
   按住畫面充氣，放手就結算氣球的「容量」。氣球撐不住會爆，爆了就是 0 分。每局只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · 沒有任何數字：充氣時畫面上不顯示分數、時間、進度，玩家只能看氣球、聽聲音，自己決定什麼時候放手。
   · 容量（分數）用簡單的累積加法：每一幀（固定 60 幀／秒，用時間換算，所以跟裝置幀率無關）
     累加 1、2、3 …，也就是 n 幀後的容量 = 1 + 2 + … + n = n(n+1)/2。
     （不是真的算氣球體積。）
   · 每一局的「灌氣速度」s 不一樣（隨機 SPEED_MIN ~ SPEED_MAX 倍）：按住 t 秒相當於灌了 s×t 秒的氣，
     容量 ＝ capacityAt(s×t)。但氣球的「總容量」每局幾乎相同（TAU_BURST 秒的容量，正負 CAP_TOL＝2%），
     所以爆破的時間 Tb ＝ 總容量對應的虛擬時間 ÷ s：灌得快的氣球早爆、灌得慢的晚爆，
     玩家不能背「幾秒會爆」。放手拿到的分數仍是放手那一刻的容量，大家的分數可以直接比。
   · 線索（刻意有雜訊，不能全信）：氣球大小與吹氣聲音只跟「按住幾秒」有關（看不出速度）；
     氣球顏色會愈來愈淡，淡的程度 ＝ 實際進度（容量比例，也就是 t／Tb）＋ 隨機雜訊。
   · 干擾：充氣時氣球以每影格的高頻率微微晃動（位置、大小隨機抖動），不看大小的精準變化。
   · 結算：爆了 → 「砰」＋0 分；沒爆 → 容量數字從 0 數上來；兩種情況都會告訴你這顆氣球其實撐到幾秒、
     最多能拿多少分，讓你知道自己離極限多近。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'balloon';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var SPEED_MIN = 0.8, SPEED_MAX = 1.2;        /* 每局灌氣速度的範圍（倍）*/
    var TAU_BURST = 8.0;                         /* 標準速度（×1）時，氣球撐到爆需要的秒數；總容量 ＝ 這段時間的容量 */
    var CAP_TOL = 0.02;                          /* 每局總容量的誤差 ±2% */
    var FPS = 60;                              /* 容量累加用的固定幀率 */
    var R0 = 46, R1 = 330, T_FULL = 10.5;      /* 氣球半徑：0 秒＝R0，T_FULL 秒＝R1，線性增加（要比最慢的爆破時間長）*/
    var JIT_MIN = 1.5, JIT_MAX = 6;            /* 晃動幅度（px），隨氣球變大而增加 */
    var CUE_NOISE = 0.18;                      /* 顏色線索的雜訊大小（占進度的比例） */

    function fmtNum(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function fmtBest(v) { return v == null ? '' : '最高 ' + fmtNum(v); }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 灌了 tau 秒（標準速度）的容量 */
    function capacityAt(tau) { var n = Math.floor(Math.max(0, tau) * FPS); return n * (n + 1) / 2; }
    function capOfFrames(n) { return n * (n + 1) / 2; }
    function radiusAt(t) { return R0 + (R1 - R0) * Math.min(1, Math.max(0, t) / T_FULL); }
    function jitterAmp(t) { return JIT_MIN + (JIT_MAX - JIT_MIN) * Math.min(1, Math.max(0, t) / T_FULL); }
    /* 一局的氣球：灌氣速度 speed、總容量 capBurst（±CAP_TOL）、爆破要按住的真實秒數 burstT */
    function makeBurst(rand) {
        var speed = kit.randFloat(SPEED_MIN, SPEED_MAX, rand);
        var delta = kit.randFloat(-CAP_TOL, CAP_TOL, rand);
        var n0 = TAU_BURST * FPS, nB = (-1 + Math.sqrt(1 + 8 * capOfFrames(n0) * (1 + delta))) / 2;     /* 解 n(n+1)/2 = 總容量 */
        var tauB = nB / FPS;
        return { speed: speed, delta: delta, capBurst: capOfFrames(nB), tauB: tauB, burstT: tauB / speed };
    }
    function rating(frac) {
        if (frac >= 0.95) return '膽量爆表！';
        if (frac >= 0.8) return '很敢吹！';
        if (frac >= 0.55) return '穩穩的';
        return '太保守了';
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var BB = makeBurst(), burstT = BB.burstT, speed = BB.speed;
            var state = 'ready';           /* ready／blow／result */
            var tDown = 0, tHeld = 0;
            var cueNoise = 0, lastNoiseAt = 0;
            try { console.info('[吹氣球] 這局灌氣速度 ×' + speed.toFixed(3) + '，總容量 ' + fmtNum(BB.capBurst) + '（標準 ' + fmtNum(capacityAt(TAU_BURST)) + '，誤差 ' + (BB.delta * 100).toFixed(2) + '%），會在按住 ' + burstT.toFixed(2) + ' 秒時爆。玩家看不到這些數字。'); } catch (e) { }
            ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));

            var hint = h('div', { 'class': 'hint', text: '按住畫面充氣，覺得夠了就放手（爆了就 0 分）' });
            var field = h('div', { 'class': 'bl-field' });
            root.appendChild(hint);
            root.appendChild(field);
            var svg = kit.svg('svg', { 'class': 'bl-svg', viewBox: '0 0 400 600', preserveAspectRatio: 'xMidYMid meet' }, field);
            var CX = 200, BASE_Y = 330;                        /* 氣球中心 */
            var gBalloon = kit.svg('g', {}, svg);
            var string = kit.svg('path', { 'class': 'bl-string' }, svg);
            var body = kit.svg('ellipse', { 'class': 'bl-body' }, gBalloon);
            var shine = kit.svg('ellipse', { 'class': 'bl-shine' }, gBalloon);
            var knot = kit.svg('polygon', { 'class': 'bl-knot' }, gBalloon);
            var pieces = kit.svg('g', {}, svg);

            function color(lightPct) { return 'hsl(4, 82%, ' + lightPct.toFixed(1) + '%)'; }

            /* 畫氣球：r 半徑，jx/jy/js 晃動，cue 顏色線索 0~1 */
            function drawBalloon(r, jx, jy, js, cue) {
                var rx = r * js, ry = r * 1.15 * js;
                var cy = BASE_Y - ry * 0.25;
                body.setAttribute('cx', CX + jx); body.setAttribute('cy', cy + jy);
                body.setAttribute('rx', rx.toFixed(2)); body.setAttribute('ry', ry.toFixed(2));
                body.setAttribute('fill', color(52 + 22 * cue));
                shine.setAttribute('cx', CX + jx - rx * 0.38); shine.setAttribute('cy', cy + jy - ry * 0.42);
                shine.setAttribute('rx', (rx * 0.2).toFixed(2)); shine.setAttribute('ry', (ry * 0.12).toFixed(2));
                var ky = cy + jy + ry;
                knot.setAttribute('points', (CX + jx - 9) + ',' + (ky + 12) + ' ' + (CX + jx + 9) + ',' + (ky + 12) + ' ' + (CX + jx) + ',' + (ky - 2));
                string.setAttribute('d', 'M ' + (CX + jx) + ' ' + (ky + 12) + ' q -14 40 8 70 t -4 90');
            }
            drawBalloon(R0, 0, 0, 1, 0);

            /* ─── 每影格：位置晃動、顏色線索 ─── */
            function frame(now) {
                if (state !== 'blow') return false;
                var t = (now - tDown) / 1000;
                var amp = jitterAmp(t);
                var jx = (Math.random() - 0.5) * 2 * amp, jy = (Math.random() - 0.5) * 2 * amp;
                var js = 1 + (Math.random() - 0.5) * 0.02 * (1 + t / T_FULL * 2);
                if (now - lastNoiseAt > 220) { cueNoise = (Math.random() - 0.5) * 2 * CUE_NOISE; lastNoiseAt = now; }
                var cue = kit.clamp(t / burstT + cueNoise, 0, 1);
                drawBalloon(radiusAt(t), jx, jy, js, cue);
            }

            var holder = kit.hold(field, {
                enabled: function () { return state === 'ready'; },
                down: function (e) {
                    state = 'blow';
                    tDown = kit.evT(e) || performance.now();
                    hint.textContent = '';
                    Sfx.inflateStart();
                    my.loop(frame);
                    /* 保底：用 setTimeout 準時爆，不靠 rAF */
                    R.burstTimer = my.after(burstT * 1000, function () { if (state === 'blow') finish(burstT, true); });
                    /* rAF 被暫停時也要有東西在動：每 50ms 補畫一次 */
                    (function again() { my.after(50, function () { if (state === 'blow') { frame(performance.now()); again(); } }); })();
                },
                up: function (e, reason) {
                    if (state !== 'blow') return;
                    var now = e ? kit.evT(e) : performance.now();
                    finish((now - tDown) / 1000, false);
                }
            });
            my.onDispose(function () { holder.destroy(); Sfx.inflateStop(); });

            function finish(t, burst) {
                if (state !== 'blow') return;
                state = 'result';
                my.cancel(R.burstTimer);
                Sfx.inflateStop();
                tHeld = burst ? burstT : Math.max(0, t);
                var burstNow = burst || tHeld >= burstT;
                if (burstNow) {
                    Sfx.play('pop');
                    explode();
                    my.after(1100, function () { showResult(0, true); });
                } else {
                    var cap = capacityAt(tHeld * speed);
                    drawBalloon(radiusAt(tHeld), 0, 0, 1, kit.clamp(tHeld / burstT, 0, 1));
                    hint.textContent = '放手了！看看容量…';
                    my.after(500, function () { showResult(cap, false); });
                }
                G.debug.last = { held: tHeld, burst: burstNow, burstT: burstT, speed: speed, cap: burstNow ? 0 : capacityAt(tHeld * speed) };
            }

            function explode() {
                gBalloon.style.display = 'none';
                string.style.display = 'none';
                var r = radiusAt(burstT), cy = BASE_Y - r * 1.15 * 0.25;
                for (var i = 0; i < 14; i++) {
                    var a = (i / 14) * Math.PI * 2 + Math.random() * 0.4, d = r * (0.8 + Math.random() * 1.2);
                    var p = kit.svg('polygon', { 'class': 'bl-piece', points: '0,-14 12,10 -10,12' }, pieces);
                    p.style.transformOrigin = '0 0';
                    p.setAttribute('transform', 'translate(' + CX + ' ' + cy + ')');
                    p.style.transition = 'transform 0.8s cubic-bezier(.1,.7,.3,1), opacity 0.8s ease';
                    (function (p, a, d) { setTimeout(function () { p.setAttribute('transform', 'translate(' + (CX + Math.cos(a) * d) + ' ' + (cy + Math.sin(a) * d) + ') rotate(' + (Math.random() * 360) + ')'); p.style.opacity = '0.1'; }, 20); })(p, a, d);
                }
            }

            function showResult(cap, burst) {
                var maxCap = BB.capBurst;
                var isNew = !burst && Reaction.setBest(ID, cap, function (v, b) { return v > b; });
                ctx.setMeta(kit.meta([fmtBest(Reaction.getBest(ID))]));
                var frac = burst ? 0 : cap / maxCap;
                var lines = [
                    burst ? '按太久了，氣球在 ' + burstT.toFixed(2) + ' 秒爆掉' : '你撐了 ' + tHeld.toFixed(2) + ' 秒',
                    '這局灌氣比標準' + (speed >= 1 ? '快 ' : '慢 ') + (Math.abs(speed - 1) * 100).toFixed(0) + '%，最多撐到 ' + burstT.toFixed(2) + ' 秒，總容量 ' + fmtNum(maxCap)
                ];
                if (!burst) lines.push('拿到極限的 ' + (frac * 100).toFixed(1) + '%');
                state = 'result';
                var res = kit.result(root, {
                    num: '0', label: burst ? '砰！氣球爆了' : rating(frac),
                    lines: lines, isNew: isNew, sfx: burst ? 'fail' : (frac >= 0.8 ? 'perfect' : 'win'), onAgain: round
                });
                /* 數字從 0 數上來 */
                var numEl = res.querySelector('.rx-result__num');
                if (!burst && numEl) {
                    var t0 = performance.now(), dur = 900;
                    my.tween(dur, function (e) { numEl.textContent = fmtNum(cap * e); }, kit.easeOutCubic);
                }
            }

            G.debug = {
                burstT: burstT,
                speed: speed,
                capBurst: BB.capBurst,
                last: null,
                state: function () { return { state: state, burstT: burstT, speed: speed, capBurst: BB.capBurst }; },
                /* 模擬按住 sec 秒後放手（用 setTimeout，不真的按） */
                hold: function (sec) {
                    if (state !== 'ready') return state;
                    state = 'blow'; tDown = performance.now(); hint.textContent = '';
                    my.loop(frame);
                    R.burstTimer = my.after(burstT * 1000, function () { if (state === 'blow') finish(burstT, true); });
                    my.after(sec * 1000, function () { if (state === 'blow') finish((performance.now() - tDown) / 1000, false); });
                    return 'blow';
                }
            };
        }

        round();
    }

    var G = {
        id: ID,
        name: '吹氣球',
        rule: '按住畫面開始充氣，放手就結算氣球的「容量」。畫面上不會顯示任何數字，氣球還會一直晃動干擾你，而且每一局灌氣的快慢都不一樣，只能憑感覺決定什麼時候放手。吹太久氣球會爆，爆了就是 0 分。每局只有一次機會！',
        mount: mount,
        test: { capacityAt: capacityAt, capOfFrames: capOfFrames, radiusAt: radiusAt, jitterAmp: jitterAmp, makeBurst: makeBurst, rating: rating, SPEED_MIN: SPEED_MIN, SPEED_MAX: SPEED_MAX, TAU_BURST: TAU_BURST, CAP_TOL: CAP_TOL, T_FULL: T_FULL, FPS: FPS }
    };
    Reaction.register(G);
})();
