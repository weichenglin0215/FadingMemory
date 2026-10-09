/* ═══════════════════════════════════════════════════════════════════
   reaction_bridge.js — 秒反應・搭一座橋（原企劃「007 搭一座橋」的復活版）
   上方有一塊寬度隨機的橫板，下方左右各有一塊高度相同的方塊，會一起往中間靠攏、再往兩邊分開
   （不會碰在一起）。看準時機按「放下」，橫板會筆直落下，要讓橫板的兩端都穩穩落在兩塊方塊上；
   只有一邊碰到方塊，橫板就會傾斜滑落＝失敗。
   按下「放下」的那一刻，下面兩塊方塊會「立刻停住」（位置固定），橫板才開始落下（不然太難）。
   關卡制：一關一塊橫板，成績＝過了幾關。
   ───────────────────────────────────────────────────────────────────
   【每一關怎麼出（先保證「一定有一個成功的時機」，再讓它越來越難抓）】
   · 橫板：寬度隨機（PLANK_W 範圍），位置故意偏左或偏右（偏移量隨關卡線性變大）。
   · 兩塊方塊都做簡諧運動（正弦來回），週期相同（所以每一個週期都會再出現一次成功的時機），
     但左右的「振幅」「中心位置」「相位」都不同：振幅不同＝移動速度不同，中心位置不同＝離畫面兩側的距離不同。
   · 先決定「成功時刻」t* 左右兩塊方塊該在哪裡（各自壓住橫板的一端），再反推它們的中心位置，
     所以 t* 一定成功；隨機取樣直到兩塊方塊在整個週期裡都不會互相碰到、也不會跑出畫面。
   · 難度（線性）：移動角速度 ω 變快、左右不對稱程度變大、橫板更偏一邊、容許的重疊變少。
   【判定】橫板的「左端」要落在左邊方塊的頂面上、「右端」要落在右邊方塊的頂面上，而且端點離方塊頂面
   的邊緣至少 END_MARGIN px（「確實」落在方塊上，不能剛好擦邊或掛在外面）。只有一端落在方塊上＝傾斜滑落；
   兩端都沒落在方塊上＝掉到地上。所以成功的時機很短：兩塊方塊都要「剛好」移到橫板兩端的正下方。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'bridge';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 16;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 60;
    var BW = 64, BH = 64;                       /* 下方方塊的寬、高（px） */
    var PLANK_H = 18;                           /* 橫板厚度（px） */
    var PLANK_W = [130, 250];                   /* 橫板寬度範圍（px） */
    var OMEGA = [1.5, 4.0];                     /* 方塊來回運動的角速度（rad／秒）：第 1 關 → 到頂；週期＝2π／ω（約 4.2 秒 → 1.6 秒） */
    var AMP = [40, 72];                         /* 方塊來回的振幅（px）：兩塊靠攏時不能碰在一起，畫面寬度只容得下這麼大 */
    var ASYM = [0.06, 0.30];                    /* 左右振幅差的比例（不對稱程度） */
    var OFFSET = [0.02, 0.22];                  /* 橫板中心偏離畫面中央的比例（×畫面寬） */
    var END_MARGIN = 10;                        /* 橫板的端點離方塊頂面邊緣至少多少 px 才算「確實落在方塊上」 */
    var EDGE_X = 52;                            /* 橫板左右端離畫面邊緣至少多遠（方塊要能移到橫板端點下面） */
    var MIN_GAP = 22;                           /* 兩塊方塊最靠近時，中間至少留多寬（px），不會碰在一起 */
    var MARGIN = 6;                             /* 方塊離畫面邊緣至少多遠 */
    var FALL_MS = 420;                          /* 橫板落下的時間 */
    var TRIES = 400;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function omegaAt(level) { return kit.ramp(level, OMEGA[0], OMEGA[1], RAMP_LEVELS); }
    function asymAt(level) { return kit.ramp(level, ASYM[0], ASYM[1], RAMP_LEVELS); }
    function offsetAt(level) { return kit.ramp(level, OFFSET[0], OFFSET[1], RAMP_LEVELS); }
    /* 兩個區間 [a0,a1]、[b0,b1] 的重疊部分，沒有重疊回傳 null */
    function overlap(a0, a1, b0, b1) { var s = Math.max(a0, b0), e = Math.min(a1, b1); return e > s ? [s, e] : null; }
    /* 第 t 秒兩塊方塊的中心 x */
    function posAt(cfg, t) {
        return { L: cfg.L.c + cfg.L.A * Math.sin(cfg.omega * t + cfg.L.ph), R: cfg.R.c + cfg.R.A * Math.sin(cfg.omega * t + cfg.R.ph) };
    }
    /* 判定：橫板 plank＝{x0, w}，兩塊方塊中心 L、R。
       dL＝橫板左端離左邊方塊「左邊緣」多遠（0～BW 之間＝左端在方塊頂面上）；dR＝橫板右端離右邊方塊「右邊緣」多遠。
       兩端都要落在 [margin, BW − margin] 裡才成功。
       回傳 { ok, reason:'ok'|'none'|'one', dL, dR, side（只有一端落在方塊上時，沒落在方塊上的那一邊 'L'／'R'）, support（撐住的那一端的方塊頂面範圍 [左, 右]） } */
    function judge(plank, L, R, margin) {
        var m = margin == null ? END_MARGIN : margin;
        var dL = plank.x0 - (L - BW / 2), dR = (R + BW / 2) - (plank.x0 + plank.w);
        var okL = dL >= m && dL <= BW - m, okR = dR >= m && dR <= BW - m;
        var out = { ok: okL && okR, dL: dL, dR: dR, okL: okL, okR: okR };
        if (out.ok) { out.reason = 'ok'; return out; }
        if (okL || okR) { out.reason = 'one'; out.side = okL ? 'R' : 'L'; out.support = okL ? [L - BW / 2, L + BW / 2] : [R - BW / 2, R + BW / 2]; return out; }
        out.reason = 'none';
        return out;
    }
    /* 兩塊方塊在一個週期裡最靠近時的間距（px），以及有沒有跑出畫面 */
    function motionStats(cfg, W) {
        var T = 2 * Math.PI / cfg.omega, minGap = Infinity, inside = true;
        for (var i = 0; i <= 240; i++) {
            var p = posAt(cfg, T * i / 240), gap = (p.R - BW / 2) - (p.L + BW / 2);
            if (gap < minGap) minGap = gap;
            if (p.L - BW / 2 < MARGIN || p.R + BW / 2 > W - MARGIN || p.L > p.R) inside = false;
        }
        return { minGap: minGap, inside: inside, T: T };
    }
    /* 出一關：回傳 { plank:{x0,w}, L:{c,A,ph}, R:{c,A,ph}, omega, tStar（成功時刻，秒）, W } */
    function makeLevel(level, W, rand) {
        rand = rand || Math.random;
        var omega = omegaAt(level), T = 2 * Math.PI / omega, asym = asymAt(level), off = offsetAt(level) * W, last = null;
        for (var tr = 0; tr < TRIES; tr++) {
            var pw = kit.randInt(PLANK_W[0], PLANK_W[1], rand), side = rand() < 0.5 ? -1 : 1;
            var cx = W / 2 + side * off * kit.randFloat(0.7, 1, rand);
            var x0 = Math.round(kit.clamp(cx - pw / 2, EDGE_X, W - pw - EDGE_X));
            var plank = { x0: x0, w: pw };
            /* 成功時刻：橫板的兩端各落在方塊頂面上，離邊緣 0.35～0.65 個方塊寬（落在頂面中間一帶） */
            var dL = kit.randFloat(0.35, 0.65, rand) * BW, dR = kit.randFloat(0.35, 0.65, rand) * BW;
            var lStar = x0 + BW / 2 - dL, rStar = x0 + pw - BW / 2 + dR;
            var Amp = kit.ramp(level, AMP[0], AMP[1], RAMP_LEVELS), sgn = rand() < 0.5 ? 1 : -1;
            var AL = Amp * (1 + sgn * asym * kit.randFloat(0.6, 1, rand)), AR = Amp * (1 - sgn * asym * kit.randFloat(0.6, 1, rand));
            var tStar = T * kit.randFloat(0.45, 1.1, rand);
            /* 中心位置：要讓整個來回的範圍不超出畫面，而且 t* 時剛好經過目標位置（所以中心離目標最多一個振幅）。
               相位：t* 時兩塊同時「靠攏中」或同時「分開中」（dir），這樣看起來是一起靠攏、一起分開 */
            var lo1 = BW / 2 + MARGIN + AL, hi1 = W - BW / 2 - MARGIN - AL, lo2 = BW / 2 + MARGIN + AR, hi2 = W - BW / 2 - MARGIN - AR;
            var cL = kit.clamp(lStar + kit.randFloat(-0.85, 0.85, rand) * AL, lo1, hi1), cR = kit.clamp(rStar + kit.randFloat(-0.85, 0.85, rand) * AR, lo2, hi2);
            var sL = (lStar - cL) / AL, sR = (rStar - cR) / AR;
            if (Math.abs(sL) > 0.97 || Math.abs(sR) > 0.97) continue;
            var dir = rand() < 0.5 ? 1 : -1;                              /* 1＝t* 時兩塊正在靠攏，-1＝正在分開 */
            var thL = dir > 0 ? Math.asin(sL) : Math.PI - Math.asin(sL);          /* 左邊方塊往右（cos>0）＝靠攏 */
            var thR = dir > 0 ? Math.PI - Math.asin(sR) : Math.asin(sR);          /* 右邊方塊往左（cos<0）＝靠攏 */
            var phL = thL - omega * tStar, phR = thR - omega * tStar;
            var cfg = { plank: plank, L: { c: cL, A: AL, ph: phL }, R: { c: cR, A: AR, ph: phR }, omega: omega, tStar: tStar, W: W, T: T };
            last = cfg;
            var st = motionStats(cfg, W);
            if (st.inside && st.minGap >= MIN_GAP) return cfg;
        }
        return last;
    }
    /* 這一關「成功時機」佔一個週期的幾成（用細格子掃一遍），越小越難；測試與驗證用 */
    function successShare(cfg) {
        var n = 600, k = 0, T = 2 * Math.PI / cfg.omega;
        for (var i = 0; i < n; i++) { var p = posAt(cfg, T * i / n); if (judge(cfg.plank, p.L, p.R).ok) k++; }
        return k / n;
    }
    function rating(n) {
        if (n >= 20) return '搭橋大師！';
        if (n >= 12) return '眼明手快！';
        if (n >= 7) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '要等兩塊方塊剛好在橫板兩端的正下方再按！';
    }
    var FAIL_TEXT = {
        none: '兩端都沒有落在方塊上，橫板掉到地上了！',
        one: '只有一端落在方塊上，橫板傾斜滑落了！'
    };

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['成功搭起 ' + S.cleared + ' 座橋']; },
            stageClass: 'br-stage',
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeLevel(level, W, api.rand);
        api.info = cfg;
        var ST = motionStats(cfg, W);
        console.log('[搭一座橋] 第 ' + level + ' 關：橫板 x ' + cfg.plank.x0 + '～' + (cfg.plank.x0 + cfg.plank.w) + '（寬 ' + cfg.plank.w + '）；ω ' + cfg.omega.toFixed(2) + '（週期 ' + cfg.T.toFixed(2) + ' 秒）；左 ' + Math.round(cfg.L.c) + '±' + Math.round(cfg.L.A) + '、右 ' +
            Math.round(cfg.R.c) + '±' + Math.round(cfg.R.A) + '；最近間距 ' + ST.minGap.toFixed(1) + 'px；成功時機約佔 ' + (successShare(cfg) * 100).toFixed(1) + '% 的時間（第 ' + cfg.tStar.toFixed(2) + ' 秒一定成功）');

        var BTN_H = 84, SVG_H = H - BTN_H - 16;
        var GROUND = SVG_H - 18, BTOP = GROUND - BH;              /* 地面與方塊頂面的 y（SVG 座標，往下為正） */
        var PLANK_Y0 = 92;                                        /* 橫板一開始的上緣 y（上方留給兩行提示文字） */
        var svg = kit.svg('svg', { 'class': 'br-svg', viewBox: '0 0 ' + W + ' ' + SVG_H, width: W, height: SVG_H }, stage);
        kit.svg('rect', { x: 0, y: GROUND, width: W, height: 40, 'class': 'br-ground' }, svg);
        var bl = kit.svg('rect', { x: 0, y: BTOP, width: BW, height: BH, rx: 6, 'class': 'br-block br-block--l' }, svg);
        var br = kit.svg('rect', { x: 0, y: BTOP, width: BW, height: BH, rx: 6, 'class': 'br-block br-block--r' }, svg);
        var plank = kit.svg('rect', { x: cfg.plank.x0, y: PLANK_Y0, width: cfg.plank.w, height: PLANK_H, rx: 4, 'class': 'br-plank' }, svg);
        var guideL = kit.svg('line', { x1: cfg.plank.x0, x2: cfg.plank.x0, y1: PLANK_Y0 + PLANK_H, y2: BTOP, 'class': 'br-guide' }, svg);
        var guideR = kit.svg('line', { x1: cfg.plank.x0 + cfg.plank.w, x2: cfg.plank.x0 + cfg.plank.w, y1: PLANK_Y0 + PLANK_H, y2: BTOP, 'class': 'br-guide' }, svg);
        var msg = h('div', { 'class': 'br-msg' });
        var okBtn = h('button', { 'class': 'btn btn--go br-ok', text: '放下' });
        stage.appendChild(msg); stage.appendChild(okBtn);
        var tip = h('div', { 'class': 'br-tip', text: '兩塊方塊剛好在橫板兩端的正下方時，按「放下」' });
        stage.appendChild(tip);

        var t0 = performance.now(), frozen = null, locked = false;
        function paint(t) {
            var p = posAt(cfg, t);
            bl.setAttribute('x', (p.L - BW / 2).toFixed(2)); br.setAttribute('x', (p.R - BW / 2).toFixed(2));
            return p;
        }
        paint(0);
        var loop = my.loop(function (now) { if (locked) return false; paint((now - t0) / 1000); });
        /* rAF 被暫停（分頁在背景）時每 50 毫秒補畫一次 */
        (function again() { my.after(50, function () { if (!locked && !api.over) { paint((performance.now() - t0) / 1000); again(); } }); })();

        /* 放下：立刻把兩塊方塊固定在目前的位置，再讓橫板落下 */
        function drop(tOverride) {
            if (locked || api.over) return;
            locked = true;
            if (loop) loop.stop();
            Sfx.play('click');
            var t = tOverride != null ? tOverride : (performance.now() - t0) / 1000;
            var p = paint(t), res = judge(cfg.plank, p.L, p.R);
            tip.style.visibility = 'hidden'; guideL.setAttribute('opacity', 0); guideR.setAttribute('opacity', 0);
            var land = BTOP - PLANK_H, fallTo = res.reason === 'none' ? GROUND - PLANK_H : land;
            my.tween(FALL_MS, function (e) { plank.setAttribute('y', (PLANK_Y0 + (fallTo - PLANK_Y0) * e).toFixed(2)); }, kit.easeInQuad).then(function () {
                if (res.ok) {
                    Sfx.play('ok');
                    msg.textContent = '穩穩的！橋搭好了'; msg.classList.add('br-msg--ok');
                    plank.classList.add('br-plank--ok');
                    api.pass({ gain: 1, delay: 700 });
                    return;
                }
                Sfx.play('bad');
                msg.textContent = FAIL_TEXT[res.reason]; msg.classList.add('br-msg--bad');
                var sign, px, py;
                if (res.reason === 'none') {
                    my.tween(500, function (e) { plank.setAttribute('transform', 'rotate(' + (e * 12).toFixed(1) + ' ' + (cfg.plank.x0 + cfg.plank.w / 2) + ' ' + (GROUND) + ')'); }, kit.easeInQuad).then(function () { api.fail({ delay: 500, lines: [FAIL_TEXT.none] }); });
                    return;
                }
                /* 只有一端落在方塊上：繞著撐住的那一塊的邊緣轉開（沒撐住的那一邊往下掉），再滑掉 */
                var toLeft = res.side === 'L';
                sign = toLeft ? -1 : 1;
                px = toLeft ? res.support[0] : res.support[1]; py = land;
                my.tween(700, function (e) {
                    plank.setAttribute('transform', 'rotate(' + (sign * 34 * e).toFixed(1) + ' ' + px.toFixed(1) + ' ' + py.toFixed(1) + ') translate(0 ' + (e * 50).toFixed(1) + ')');
                }, kit.easeInQuad).then(function () { api.fail({ delay: 500, lines: [FAIL_TEXT[res.reason]] }); });
            });
        }
        kit.onTap(okBtn, function () { drop(); });

        /* 驗證用：solve 在「成功時刻」放下（往後推幾個週期，等於玩家等到那一刻）；wrong 找一個一定失敗的時刻 */
        api.solve = function () { drop(cfg.tStar + 2 * cfg.T); };
        api.wrong = function () {
            var tw = null;
            for (var i = 0; i < 400 && tw == null; i++) { var tt = cfg.T * i / 400, p = posAt(cfg, tt); if (!judge(cfg.plank, p.L, p.R).ok) tw = tt; }
            drop(tw == null ? 0 : tw);
        };
    }

    var G = {
        id: ID,
        name: '搭一座橋',
        rule: '上方有一塊橫板，下方有兩塊方塊會一起往中間靠攏、再往兩邊分開。看準時機按「放下」：兩塊方塊會立刻停住，橫板落下，兩端都要穩穩落在方塊上；只碰到一邊，橫板就會傾斜滑落。每過一關，方塊動得更快、左右更不對稱，橫板也會放得更偏。',
        mount: mount,
        score: SCORE,
        test: {
            omegaAt: omegaAt, asymAt: asymAt, offsetAt: offsetAt, overlap: overlap, posAt: posAt, judge: judge, motionStats: motionStats,
            makeLevel: makeLevel, successShare: successShare, BW: BW, END_MARGIN: END_MARGIN, EDGE_X: EDGE_X, MIN_GAP: MIN_GAP, PLANK_W: PLANK_W, MARGIN: MARGIN
        }
    };
    Reaction.register(G);
})();
