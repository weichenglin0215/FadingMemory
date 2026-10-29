/* ═══════════════════════════════════════════════════════════════════
   reaction_groupphoto.js — 秒反應・大合照（企劃 360）
   一群人排排站拍大合照，大家會各自隨機眨眼。**等到「所有人都睜著眼睛」的那一瞬間，按下快門**。
   按下去之後照片洗出來：有人閉眼＝失敗（閉眼的人會被紅圈圈起來）；全員睜眼＝照片掛上牆。限時 10 秒，沒按也算失敗。
   ───────────────────────────────────────────────────────────────────
   · 眨眼的時間表（makeLevel）：每個人有自己的眨眼節奏——兩次眨眼之間隔多久（gap）、每次閉眼多久（d）都不一樣。
     為了讓「亂按也會過」不要太容易，用「某個瞬間全部人都睜眼的機率 P_OPEN」反推每個人閉眼的比例 c：
         每個人睜眼的機率 q ＝ P_OPEN 的 n 次方根，閉眼比例 c ＝ 1 − q，平均間隔 gap ＝ d × (1/c − 1)。
     時間表是事先排好的（一個人一串 [開始, 結束] 的閉眼區間），畫面和判定都從同一份時間表算（closedAt），不會有「看到睜眼、判成閉眼」。
   · 保證有解：時間表排好之後，會在 2.0 秒到「限時 − 窗口長度 − 1.5 秒」之間挑一個時間點，
     把所有人在 [s, s + OPEN_WIN] 之間的眨眼拿掉，確保**一定有一段至少 OPEN_WIN 秒長的「全員睜眼」**（再用 openWindows 驗證）。
   · 「低頭看手機」的人（PHONE）：眼睛畫成往下看的弧線（看起來像閉眼），手上拿著手機——**不算閉眼**，也不會眨眼。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：人數 3 → 15、全員睜眼的最短窗口 2.0 → 0.6 秒、
     隨機一個瞬間全員睜眼的機率 0.45 → 0.10、低頭看手機的人 0 → 3 個。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'groupphoto';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var PEOPLE = [3, 15];                       /* 人數：第 1 關 → 到頂（四捨五入） */
    var OPEN_WIN = [2.0, 0.6];                  /* 一定存在的「全員睜眼」窗口最短幾秒：第 1 關 → 到頂 */
    var P_OPEN = [0.45, 0.10];                  /* 隨機一個瞬間所有人都睜眼的機率（目標值）：第 1 關 → 到頂 */
    var PHONE = [0, 3];                         /* 低頭看手機的人數：第 1 關 → 到頂（四捨五入） */
    var TIME_S = 10;                            /* 每關限時（秒） */
    var BLINK_D = [0.16, 0.28];                 /* 每個人每次閉眼多久（秒）的範圍（每人一個固定值） */
    var GAP_JITTER = [0.7, 1.3];                /* 每次間隔的隨機倍率（再乘上這個人的平均間隔） */
    var WIN_FROM = 2.0;                         /* 保證的窗口最早從第幾秒開始（讓玩家先看一下） */
    var WIN_TAIL = 1.5;                         /* 保證的窗口結束後至少還留幾秒 */
    var MAX_LEVEL = 90;
    var HAIR = ['hair0', 'hair1', 'hair2', 'hair3'];       /* 髮色的 class（顏色在 theme.css） */
    var SKIN = ['skin0', 'skin1', 'skin2'];
    var SHIRT = ['shirt0', 'shirt1', 'shirt2', 'shirt3', 'shirt4'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function peopleFor(level) { return Math.round(ramp(level, PEOPLE)); }
    function winFor(level) { return Math.round(ramp(level, OPEN_WIN) * 1000) / 1000; }
    function pOpenFor(level) { return Math.round(ramp(level, P_OPEN) * 1000) / 1000; }
    function phoneFor(level) { return Math.round(ramp(level, PHONE)); }
    function timeMs() { return TIME_S * 1000; }
    /* 要讓「n 個人同時睜眼」的機率是 pOpen，每個人閉眼的比例 c */
    function closedFraction(n, pOpen) { return 1 - Math.pow(pOpen, 1 / Math.max(1, n)); }
    /* 一個人的閉眼區間表（秒）：從一個隨機的起點開始，一段睜眼（gap）、一段閉眼（d）…直到超過 T 秒 */
    function makeBlinks(d, gapMean, T, rand) {
        var out = [], t = kit.randFloat(0, gapMean, rand);
        while (t < T) {
            out.push([t, t + d]);
            t += d + gapMean * kit.randFloat(GAP_JITTER[0], GAP_JITTER[1], rand);
        }
        return out;
    }
    /* 時間表：把 [a, b] 之間所有「有碰到」的眨眼都拿掉，保證這段時間大家都睜眼 */
    function clearWindow(blinks, a, b) { return blinks.filter(function (iv) { return iv[1] <= a || iv[0] >= b; }); }
    /* 出一關：{
         level, n, phone（低頭看手機的人編號）, people（每人 { d, gapMean, blinks, hair, skin, shirt }）,
         win（保證的窗口長度）, winAt（保證的窗口從第幾秒開始）, timeS, pOpen } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = peopleFor(level), np = Math.min(phoneFor(level), n - 1), pOpen = pOpenFor(level), win = winFor(level), T = TIME_S;
        var order = kit.shuffle(Array.apply(null, Array(n)).map(function (x, i) { return i; }), rand), phone = order.slice(0, np).sort(function (a, b) { return a - b; });
        var c = closedFraction(n - np, pOpen), winAt = kit.randFloat(WIN_FROM, Math.max(WIN_FROM, T - win - WIN_TAIL), rand), people = [];
        for (var i = 0; i < n; i++) {
            var d = kit.randFloat(BLINK_D[0], BLINK_D[1], rand), gapMean = d * (1 / c - 1);
            var blinks = phone.indexOf(i) >= 0 ? [] : clearWindow(makeBlinks(d, gapMean, T + 1, rand), winAt, winAt + win);
            people.push({ d: d, gapMean: gapMean, blinks: blinks, hair: kit.pick(HAIR, rand), skin: kit.pick(SKIN, rand), shirt: kit.pick(SHIRT, rand) });
        }
        return { level: level, n: n, phone: phone, people: people, win: win, winAt: winAt, timeS: T, pOpen: pOpen };
    }
    /* 第 t 秒時閉著眼的人（編號；低頭看手機的人不算） */
    function closedAt(q, t) {
        var out = [];
        q.people.forEach(function (p, i) { for (var k = 0; k < p.blinks.length; k++) { if (t >= p.blinks[k][0] && t < p.blinks[k][1]) { out.push(i); break; } } });
        return out;
    }
    /* 全員睜眼的窗口（在 [0, T] 之內）：[{ start, end }]，把所有人的閉眼區間合併後取空隙 */
    function openWindows(q, T) {
        T = T == null ? q.timeS : T;
        var ivs = []; q.people.forEach(function (p) { p.blinks.forEach(function (iv) { if (iv[0] < T) ivs.push([iv[0], Math.min(iv[1], T)]); }); });
        ivs.sort(function (a, b) { return a[0] - b[0]; });
        var out = [], cur = 0;
        ivs.forEach(function (iv) { if (iv[0] > cur) out.push({ start: cur, end: iv[0] }); cur = Math.max(cur, iv[1]); });
        if (cur < T) out.push({ start: cur, end: T });
        return out;
    }
    /* 排版：n 個人排成幾排幾列、每個人的位置與臉的大小（相片區 pw×ph） */
    function layout(n, pw, ph) {
        var cols = n <= 3 ? n : (n <= 8 ? Math.ceil(n / 2) : Math.ceil(n / 3)), rows = Math.ceil(n / cols), cw = pw / cols, chh = ph / rows;
        var fw = Math.floor(Math.min(cw * 0.92, chh * 0.92 * 100 / 120)), fh = Math.round(fw * 1.2), pos = [];
        for (var i = 0; i < n; i++) {
            var r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), c = i - r * cols, rowW = inRow * cw, x0 = (pw - rowW) / 2;        /* 最後一排人少，置中 */
            pos.push({ x: Math.round(x0 + c * cw + (cw - fw) / 2), y: Math.round(r * chh + (chh - fh) / 2), w: fw, h: fh });
        }
        return { cols: cols, rows: rows, faces: pos, fw: fw, fh: fh };
    }
    function rating(n) {
        if (n >= 16) return '最佳攝影師！';
        if (n >= 10) return '快門神手！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '要等大家都睜眼！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'gph-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一個人（SVG，viewBox 100×120）：肩膀、頭、頭髮、眼睛（睜眼／閉眼兩套，用 class 切換）、嘴；低頭看手機的人手上有手機 */
    function faceSvg(p, phone) {
        var svg = kit.svg('svg', { 'class': 'gph-face', viewBox: '0 0 100 120' });
        kit.svg('path', { 'class': 'gph-shirt gph-' + p.shirt, d: 'M6,120 Q8,86 50,82 Q92,86 94,120 Z' }, svg);
        kit.svg('rect', { 'class': 'gph-neck gph-' + p.skin, x: 41, y: 70, width: 18, height: 16, rx: 6 }, svg);
        kit.svg('circle', { 'class': 'gph-head gph-' + p.skin, cx: 50, cy: 46, r: 30 }, svg);
        kit.svg('path', { 'class': 'gph-hair gph-' + p.hair, d: 'M18,48 Q16,12 50,12 Q84,12 82,48 Q74,30 50,28 Q26,30 18,48 Z' }, svg);
        [34, 66].forEach(function (ex) {
            var g = kit.svg('g', { 'class': 'gph-eye' }, svg);
            kit.svg('ellipse', { 'class': 'gph-eye-open gph-eye-w', cx: ex, cy: 48, rx: 8, ry: 9 }, g);
            kit.svg('circle', { 'class': 'gph-eye-open gph-pupil', cx: ex, cy: 49, r: 4 }, g);
            kit.svg('path', { 'class': 'gph-lid', d: 'M' + (ex - 9) + ',48 Q' + ex + ',58 ' + (ex + 9) + ',48' }, g);
        });
        kit.svg('path', { 'class': 'gph-mouth', d: 'M38,62 Q50,72 62,62' }, svg);
        if (phone) {
            kit.svg('rect', { 'class': 'gph-phone', x: 36, y: 90, width: 28, height: 28, rx: 5 }, svg);
            kit.svg('rect', { 'class': 'gph-phone-screen', x: 40, y: 94, width: 20, height: 20, rx: 3 }, svg);
        }
        return svg;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        var wins = openWindows(q);
        console.log('[大合照] 第 ' + level + ' 關：' + q.n + ' 人（低頭看手機 ' + q.phone.length + '）；保證的全員睜眼窗口 ' + q.winAt.toFixed(2) + '～' + (q.winAt + q.win).toFixed(2) + ' 秒（至少 ' + q.win + ' 秒）；全部窗口 ' + wins.filter(function (w) { return w.end - w.start >= 0.2; }).map(function (w) { return w.start.toFixed(1) + '-' + w.end.toFixed(1); }).join('、'));

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'gph-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note gph-tip', text: level === 1 ? '等大家都睜眼的瞬間，按快門！' : '全員睜眼的瞬間按快門' });
        field.appendChild(tip);
        /* 相片區（取景框）：左右各留 12px；高度在「上方提示」和「下方快門鈕」之間 */
        var pw = W - 24, ph = Math.min(400, H - 56 - 150), photo = h('div', { 'class': 'gph-photo' });
        photo.style.cssText = 'left:12px;top:52px;width:' + pw + 'px;height:' + ph + 'px;';
        field.appendChild(photo);
        var L = layout(q.n, pw, ph), faces = q.people.map(function (p, i) {
            var f = L.faces[i], isPhone = q.phone.indexOf(i) >= 0, el = h('div', { 'class': 'gph-person' + (isPhone ? ' gph-person--phone' : '') });
            el.style.cssText = 'left:' + f.x + 'px;top:' + f.y + 'px;width:' + f.w + 'px;height:' + f.h + 'px;';
            var svg = faceSvg(p, isPhone); svg.setAttribute('width', f.w); svg.setAttribute('height', f.h); el.appendChild(svg); photo.appendChild(el);
            return el;
        });
        ['tl', 'tr', 'bl', 'br'].forEach(function (c) { photo.appendChild(h('div', { 'class': 'gph-corner gph-corner--' + c })); });
        var flashEl = h('div', { 'class': 'gph-flash' }); photo.appendChild(flashEl);
        var info = h('div', { 'class': 'qz-note gph-info', text: '' }); info.style.top = (52 + ph + 6) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '按快門', kind: 'primary', cls: 'gph-shutter', onTap: function () { press(); } }], { cols: 1, h: 96, bottom: 12 });
        if (level === 1 && kit.once('groupphoto.hint')) kit.hintOn(stage, btn.btns[0], { mode: 'tap', delay: 1400, text: '全員睜眼時按' });

        var phase = 'run', shown = {}, t0 = performance.now(), tNow = 0;
        function paint(t) {
            var closed = closedAt(q, t), set = {}; closed.forEach(function (i) { set[i] = 1; });
            faces.forEach(function (el, i) { var on = !!set[i]; if (on !== !!shown[i]) { el.classList.toggle('gph-person--closed', on); shown[i] = on; } });
            return closed;
        }
        paint(0);
        api.my.loop(function (now) {
            if (phase !== 'run' || !stage.isConnected) return false;
            tNow = (now - t0) / 1000; paint(tNow);
        });
        api.timer(timeMs(), function () { timeout(); });

        /* 按快門：拿「按下去的那一瞬間畫面上的狀態」來判定 */
        function press() {
            if (phase !== 'run' || api.over) return;
            phase = 'shot'; api.stopTimer();
            var t = (performance.now() - t0) / 1000, closed = paint(t);
            flashEl.classList.add('gph-flash--go'); Sfx.play('click');
            if (!closed.length) {
                tip.textContent = '洗出來了…';
                api.after(500, function () { photo.classList.add('gph-photo--wall'); info.textContent = '全員睜眼！這張照片掛上牆壁'; info.classList.add('gph-info--ok'); });
                kit.flash(stage, true, api.my);
                api.pass({ delay: 2300 });
                return;
            }
            tip.textContent = '洗出來了…';
            api.after(500, function () {
                /* 紅圈：圈住閉眼的人的頭（頭的圓心在臉的 (50, 46)／(100, 120) 處，半徑 30） */
                closed.forEach(function (i) {
                    var f = L.faces[i], d = Math.round(f.w * 0.78), ring = h('div', { 'class': 'gph-ring' });
                    ring.style.cssText = 'left:' + Math.round(f.x + f.w / 2 - d / 2) + 'px;top:' + Math.round(f.y + f.h * 46 / 120 - d / 2) + 'px;width:' + d + 'px;height:' + d + 'px;';
                    photo.appendChild(ring);
                });
                info.textContent = '有 ' + closed.length + ' 個人閉眼了（紅圈）'; info.classList.add('gph-info--bad');
            });
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3800, lines: ['按下快門的時候，有 ' + closed.length + ' 個人閉著眼睛', '（低頭看手機的不算閉眼）'] });
        }
        function timeout() {
            if (phase !== 'run' || api.over) return;
            phase = 'shot'; info.textContent = '時間到！沒有按快門'; info.classList.add('gph-info--bad');
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: ['時間到！沒有按快門', '全員睜眼的瞬間要把握住'] });
        }
        /* 驗證用：現在全員睜眼才按（不然等下一次呼叫）／現在有人閉眼才按 */
        api.solve = function () { if (phase === 'run' && !closedAt(q, (performance.now() - t0) / 1000).length) press(); };
        api.wrong = function () { if (phase === 'run' && closedAt(q, (performance.now() - t0) / 1000).length) press(); };
    }

    var G = {
        id: ID,
        name: '大合照',
        rule: '一群人排排站拍大合照，大家會各自隨機眨眼。**等到所有人都睜著眼睛的那一瞬間**，按下快門！照片洗出來，只要有人閉眼就失敗（閉眼的人會被紅圈圈起來）。注意：**低頭看手機的人**眼睛看起來像閉著，但**不算閉眼**。限時 10 秒，沒按也算失敗。越後面，人越多、全員睜眼的時間越短！',
        mount: mount,
        score: SCORE,
        test: {
            peopleFor: peopleFor, winFor: winFor, pOpenFor: pOpenFor, phoneFor: phoneFor, timeMs: timeMs, closedFraction: closedFraction, makeBlinks: makeBlinks, clearWindow: clearWindow, makeLevel: makeLevel, closedAt: closedAt, openWindows: openWindows, layout: layout, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, PEOPLE: PEOPLE, OPEN_WIN: OPEN_WIN, P_OPEN: P_OPEN, PHONE: PHONE, TIME_S: TIME_S, BLINK_D: BLINK_D, WIN_FROM: WIN_FROM, WIN_TAIL: WIN_TAIL, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
