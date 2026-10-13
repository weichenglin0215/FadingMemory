/* ═══════════════════════════════════════════════════════════════════
   reaction_samelen.js — 秒反應・畫一樣長
   上方是一條垂直的題目線，下方左邊是起點：手指從起點開始往右拖，畫出一條橫線，
   長度要和上面的垂直線一樣長。放開手指就是答案，只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · 這款利用「水平垂直錯覺」：同樣長度的垂直線看起來比水平線長約 10%，所以多數人會畫短。
   · 垂直線長度 L 隨機（LEN_MIN～LEN_MAX），位置左右隨機（避免用螢幕邊界當尺）。
   · 起點旁有手指圖示從左往右來回移動，提醒玩家怎麼操作（第一次碰到起點後消失）。
   · 成績 ＝ |畫出的長度 − L| ÷ L × 100（%，越小越好）。
   · 揭曉：垂直線轉成橫放、與你的橫線對齊左端，兩個右端標出差距。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'samelen';
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '長度差', min: 0, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEN_MIN = 120, LEN_MAX = 380;           /* 題目垂直線的長度範圍（px） */
    var TOP_Y = 50;                             /* 垂直線上端的 y */
    var START = { x: 40, y: 540 };              /* 起點（橫線從這裡往右畫） */
    var MAX_DRAW = 420;                         /* 橫線最長（px） */
    var START_R = 56;                           /* 手指要在起點多近的地方按下才算 */
    var MIN_VALID = 20;                         /* 放開時橫線短於這個長度就當作沒畫（重來，不算一次機會） */
    var X_MIN = 170, X_MAX = 330;               /* 垂直線的 x 範圍 */
    var CAP = 28, CAP_L = 100;                  /* 線兩端黑色記號的半長（線加粗成 24px，記號要比線寬）；CAP_L 只給測試用的預設線長 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function makeRound(rand) {
        rand = rand || Math.random;
        return { L: kit.randFloat(LEN_MIN, LEN_MAX, rand), x: kit.randFloat(X_MIN, X_MAX, rand) };
    }
    /* 手指位置 → 橫線長度（夾在 0～MAX_DRAW） */
    /* 線的方向角 a（弧度，從 x 軸往下量；垂直向下是 π/2、橫放向右是 0）時，上端記號與下端記號的兩個端點 [x1,y1,x2,y2]。
       記號永遠垂直於線：線的方向 (cos a, sin a)，垂直方向 (−sin a, cos a)。上端在原點、下端在 L 處。 */
    function capEnds(a, L) {
        L = L == null ? CAP_L : L;
        var dx = Math.cos(a), dy = Math.sin(a), px = -Math.sin(a), py = Math.cos(a);
        return {
            t: [-CAP * px, -CAP * py, CAP * px, CAP * py],
            b: [L * dx - CAP * px, L * dy - CAP * py, L * dx + CAP * px, L * dy + CAP * py]
        };
    }
    function lenFor(px) { return kit.clamp(px - START.x, 0, MAX_DRAW); }
    function errPct(len, L) { return Math.abs(len - L) / L * 100; }
    function rating(e) {
        if (e < 0.5) return '神準！';
        if (e < 2) return '很準！';
        if (e < 5) return '不錯喔！';
        if (e < 10) return '垂直線看起來比較長喔，再試一次';
        return '再試一次，會更準！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '從起點往右拖，畫出和上面垂直線一樣長的橫線',
            numText: function (v) { return v.toFixed(4) + '%'; },
            rating: rating,
            sfx: function (v) { return v < 2 ? 'perfect' : (v < 6 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), len = 0, drawing = false, locked = false, hint = null, pid = null;
        var sy = Math.min(START.y, H - 60);
        console.log('[畫一樣長] 垂直線長度 ' + cfg.L.toFixed(2) + '，x ' + cfg.x.toFixed(1));

        var svg = kit.svg('svg', { 'class': 'sl-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gGuide = kit.svg('g', {}, svg);
        var ref = kit.svg('g', {}, svg);
        var refLine = kit.svg('line', { x1: 0, y1: 0, x2: 0, y2: cfg.L, 'class': 'sl-ref' }, ref);
        /* 兩端的黑色記號（垂直於線）：線轉成橫放時，兩個記號都要跟著轉成垂直（V1.25：以前左邊那個一直是水平的，是錯的） */
        var capT = kit.svg('line', { x1: -CAP, y1: 0, x2: CAP, y2: 0, 'class': 'sl-cap' }, ref);
        var capB = kit.svg('line', { x1: -CAP, y1: cfg.L, x2: CAP, y2: cfg.L, 'class': 'sl-cap' }, ref);
        ref.setAttribute('transform', 'translate(' + cfg.x.toFixed(2) + ' ' + TOP_Y + ')');
        var mine = kit.svg('line', { x1: START.x, y1: sy, x2: START.x, y2: sy, 'class': 'sl-mine' }, svg);
        kit.svg('line', { x1: START.x, y1: sy - CAP, x2: START.x, y2: sy + CAP, 'class': 'sl-cap' }, svg);
        var endCap = kit.svg('line', { x1: START.x, y1: sy - CAP, x2: START.x, y2: sy + CAP, 'class': 'sl-cap', opacity: 0 }, svg);
        var dot = kit.svg('circle', { cx: START.x, cy: sy, r: 12, 'class': 'sl-start' }, svg);
        var msg = h('div', { 'class': 'sl-msg' });
        stage.appendChild(msg);

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從起點往右移動「參考線一樣長」的距離（第一次的正確答案） */
        if (kit.once('samelen.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: START.x, y: sy, dx: cfg.L, dy: 0, delay: 300 });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }
        function say(t) { msg.textContent = t; msg.classList.toggle('sl-msg--on', !!t); }
        function paint() {
            mine.setAttribute('x2', START.x + len);
            endCap.setAttribute('x1', START.x + len); endCap.setAttribute('x2', START.x + len); endCap.setAttribute('opacity', len > 0 ? 1 : 0);
        }

        stage.addEventListener('pointerdown', function (e) {
            if (locked || drawing) return;
            var p = kit.localPt(e, stage), dx = p.x - START.x, dy = p.y - sy;
            if (Math.sqrt(dx * dx + dy * dy) > START_R) { say('請從左下的起點開始拖'); return; }
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            drawing = true; pid = e.pointerId; hideHint(); say('');
            len = 0; paint();
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drawing || e.pointerId !== pid) return;
            len = lenFor(kit.localPt(e, stage).x); paint();
        });
        function end(e) {
            if (!drawing || e.pointerId !== pid) return;
            drawing = false;
            if (len < MIN_VALID) { say('再往右拖長一點'); len = 0; paint(); Sfx.play('bad'); return; }
            submit();
        }
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);

        function submit() {
            if (locked) return;
            locked = true; hideHint(); dot.setAttribute('opacity', 0);
            Sfx.play('click');
            var real = errPct(len, cfg.L), tgt = sy - 70;
            /* 揭曉：垂直線以上端為軸轉成橫放，移到你的橫線上方 */
            var tx0 = cfg.x, ty0 = TOP_Y;
            my.tween(1000, function (e) {
                var x = tx0 + (START.x - tx0) * e, y = ty0 + (tgt - ty0) * e, a = Math.PI / 2 * (1 - e);
                refLine.setAttribute('x1', 0); refLine.setAttribute('y1', 0);
                refLine.setAttribute('x2', cfg.L * Math.cos(a)); refLine.setAttribute('y2', cfg.L * Math.sin(a));
                var ends = capEnds(a, cfg.L);
                capT.setAttribute('x1', ends.t[0]); capT.setAttribute('y1', ends.t[1]); capT.setAttribute('x2', ends.t[2]); capT.setAttribute('y2', ends.t[3]);
                capB.setAttribute('x1', ends.b[0]); capB.setAttribute('y1', ends.b[1]); capB.setAttribute('x2', ends.b[2]); capB.setAttribute('y2', ends.b[3]);
                ref.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
            }, kit.easeInOutCubic).then(function () {
                /* 兩個右端的對照線 */
                kit.svg('line', { x1: START.x + cfg.L, x2: START.x + cfg.L, y1: tgt - 20, y2: sy + 20, 'class': 'sl-guide sl-guide--ref' }, gGuide);
                kit.svg('line', { x1: START.x + len, x2: START.x + len, y1: tgt - 20, y2: sy + 20, 'class': 'sl-guide sl-guide--mine' }, gGuide);
                var diff = len - cfg.L;
                say((diff < 0 ? '你畫短了 ' : '你畫長了 ') + Math.abs(diff / cfg.L * 100).toFixed(4) + '%');
                my.after(1800, function () {
                    api.finish(real, { lines: [
                        diff < 0 ? '橫線比垂直線短 ' + Math.abs(diff).toFixed(4) + ' 像素' : '橫線比垂直線長 ' + Math.abs(diff).toFixed(4) + ' 像素',
                        '垂直線看起來比同樣長的橫線更長（水平垂直錯覺）',
                        '只有一次機會，想拚更準就再挑戰一次'
                    ] });
                });
            });
        }

        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        function drawLen(L) {
            fire('pointerdown', START.x, sy);
            for (var i = 1; i <= 10; i++) fire('pointermove', START.x + L * i / 10, sy);
            fire('pointerup', START.x + L, sy);
        }
        G.debug = {
            state: function () { return { cfg: cfg, len: len, locked: locked }; },
            drawLen: drawLen,
            solve: function () { drawLen(cfg.L); },
            wrong: function () { drawLen(cfg.L * 0.8); }
        };
    }

    var G = {
        id: ID,
        name: '畫一樣長',
        rule: '上方有一條垂直的線。手指從左下角的起點出發，往右拖出一條橫線，**長度要和垂直線一樣長**。放開手指就是答案，只有一次機會。小心：**垂直線看起來會比同樣長的橫線更長**！',
        mount: mount,
        score: SCORE,
        test: { capEnds: capEnds, CAP: CAP, makeRound: makeRound, lenFor: lenFor, errPct: errPct, rating: rating, LEN_MIN: LEN_MIN, LEN_MAX: LEN_MAX, START: START, MAX_DRAW: MAX_DRAW, X_MIN: X_MIN, X_MAX: X_MAX, TOP_Y: TOP_Y }
    };
    Reaction.register(G);
})();
