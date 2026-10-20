/* ═══════════════════════════════════════════════════════════════════
   reaction_kinetic.js — 秒反應・動態視力（企劃 333）
   一列台鐵區間車從右往左開過去，**其中一節車廂的窗戶貼著一張黃底黑字的號碼**。火車開走之後，**從下面 4 個選項點出那個號碼**。
   ───────────────────────────────────────────────────────────────────
   · 難度（線性，到 RAMP_LEVELS 關到頂）：
       ① 每節車廂「整節在畫面上」的時間 VIEW_S：2.5 秒 → 0.5 秒（第 30 關只看得到 0.5 秒）；火車的速度由它算出來：
          速度 v ＝（畫面寬 ＋ 車廂寬）÷ VIEW_S；整列火車再多走 TAIL_PAD 才算開出畫面；
       ② 號碼的位數 DIGITS：2 → 4 位；③ 車廂數 CARS：4 → 8 節（車廂越多，窗戶裡的干擾越多）；
       ④ 干擾貼紙 DECOY_STICKERS：0 → 3 張（別的車窗上也貼黃底黑字，但是是英文字母，不是號碼）；
       ⑤ 選項越來越像 SIM_P：0 → 1。第 1 關的錯誤選項跟答案有 2 個位數不同、而且換成「長得不像」的數字；
          到頂的時候，錯誤選項只差 1 個位數、而且換成「長得像」的數字（0↔8、3↔8、1↔7、6↔5 …，見 SIM 表）。
   · 窗戶裡的干擾：乘客剪影、便當、報紙、窗簾、空窗，每節隨機。
   · 揭曉：火車「倒車」回來，停在貼著號碼的那一節，號碼貼紙放大；選項的正確答案變綠色、你選錯的變紅色。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'kinetic';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（使用者企劃：第 30 關只在畫面上 0.5 秒） */
    var VIEW_S = [0.7, 0.25];                    /* 一節車廂從進畫面到出畫面的時間（秒）：第 1 關 → 到頂 */
    var DIGITS = [2, 5];                        /* 號碼位數：第 1 關 → 到頂（四捨五入） */
    var CARS = [4, 10];                          /* 車廂數：第 1 關 → 到頂（四捨五入） */
    var DECOY_STICKERS = [1, 5];                /* 干擾貼紙（英文字母）張數：第 1 關 → 到頂（四捨五入） */
    var SIM_P = [0, 1];                         /* 錯誤選項「長得像」的程度：第 1 關 → 到頂 */
    var ANSWER_S = 30;                           /* 火車開走之後，選號碼的時間（秒） */
    var LEAD_MS = 600;                          /* 進場後等多久火車才開始進來（讓玩家先看提示） */
    var CAR_GAP = 10;                           /* 車廂之間的距離（px，中間有連結器） */
    var TAIL_PAD = 24;                          /* 火車開出畫面時，最後一節車廂的右端再多走這麼遠（連結器和車身邊框才不會留在畫面邊緣） */
    var CAR_W_RATIO = 0.49, CAR_ASPECT = 170 / 230;   /* 車廂寬度占畫面寬度的比例、高÷寬 */
    var REVERSE_MS = 1200;                      /* 揭曉時火車倒車回來要多久 */
    var ZOOM_MS = 500;                          /* 號碼貼紙放大的時間 */
    var MAX_LEVEL = 60;
    /* 長得像的數字（黑體字裡容易看錯的）：一個數字可以被換成它後面列的數字 */
    var SIM = { 0: [8, 6, 9], 1: [7, 4], 2: [7, 3], 3: [8, 5, 2], 4: [9, 1], 5: [6, 3, 8], 6: [8, 5, 0, 9], 7: [1, 2], 8: [3, 6, 9, 0, 5], 9: [8, 4, 0, 6] };
    var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'K', 'M', 'R', 'S', 'X', 'Z'];     /* 干擾貼紙上的字（不是數字） */
    var WINDOWS = ['pax', 'pax2', 'bento', 'news', 'curtain', 'empty'];            /* 窗戶裡的東西 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function viewSFor(level) { return Math.round(ramp(level, VIEW_S) * 1000) / 1000; }
    function digitsFor(level) { return Math.round(ramp(level, DIGITS)); }
    function carsFor(level) { return Math.round(ramp(level, CARS)); }
    function decoysFor(level) { return Math.round(ramp(level, DECOY_STICKERS)); }
    function simPFor(level) { return Math.round(ramp(level, SIM_P) * 1000) / 1000; }
    /* 版面尺寸：stage 寬 W → 車廂寬、高、整列火車的寬 */
    function trainSize(W, cars) {
        var cw = Math.round(W * CAR_W_RATIO), ch = Math.round(cw * CAR_ASPECT);
        return { cw: cw, ch: ch, total: cars * cw + (cars - 1) * CAR_GAP };
    }
    /* 火車的速度（px／秒）：一節車廂（寬 cw）從右邊緣出現到左邊緣消失，要走 W ＋ cw 的距離，花 viewS 秒 */
    function speedFor(W, cw, viewS) { return (W + cw) / viewS; }
    /* 火車從出現到整列開出畫面的總秒數（火車左端從 W 走到 −total） */
    function passSeconds(W, total, v) { return (W + total) / v; }
    /* 火車（左端）在開始後 t 秒的 x 座標：從 W 往左 */
    function trainX(t, W, v) { return W - v * t; }
    /* 第 i 節車廂左端離火車左端多遠 */
    function carOffset(i, cw) { return i * (cw + CAR_GAP); }
    /* 揭曉時火車停的位置：讓第 i 節車廂正好在畫面正中央（火車左端的 x） */
    function revealX(W, cw, i) { return Math.round(W / 2 - carOffset(i, cw) - cw / 2); }
    /* 兩個號碼字串有幾個位數不同；以及這些不同的位數是不是都換成「長得像」的數字 */
    function diffPositions(a, b) { var r = []; for (var i = 0; i < a.length; i++) if (a.charAt(i) !== b.charAt(i)) r.push(i); return r; }
    function allSimilar(a, b) { return diffPositions(a, b).every(function (i) { return SIM[+a.charAt(i)].indexOf(+b.charAt(i)) >= 0; }); }
    /* 隨機一個 d 位數的號碼字串（第一位不是 0，也不是每一位都一樣） */
    function randomNumber(d, rand) {
        for (var tr = 0; tr < 50; tr++) {
            var s = String(kit.randInt(1, 9, rand));
            for (var i = 1; i < d; i++) s += kit.randInt(0, 9, rand);
            if (!/^(\d)\1+$/.test(s)) return s;
        }
        return '1234'.slice(0, d);
    }
    /* 把號碼 truth 的某一位換成別的數字：simp＝是否換成「長得像」的；回傳新字串。第一位不能換成 0 */
    function swapDigit(truth, pos, simp, rand) {
        var cur = +truth.charAt(pos), pool;
        if (simp) pool = SIM[cur].slice();
        else pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(function (x) { return x !== cur && SIM[cur].indexOf(x) < 0; });
        if (pos === 0) pool = pool.filter(function (x) { return x !== 0; });
        if (!pool.length) pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(function (x) { return x !== cur && (pos > 0 || x !== 0); });
        return truth.slice(0, pos) + kit.pick(pool, rand) + truth.slice(pos + 1);
    }
    /* 做一個錯誤選項：位數 ≥ 2 時，「不像」的機率是 1 − simP 會同時換 2 位、否則換 1 位；每個換掉的位數也各自依 simP 決定要不要換成長得像的 */
    function makeDecoy(truth, simP, rand) {
        var d = truth.length, n = (d >= 2 && rand() >= simP) ? 2 : 1, pos = kit.shuffle(truth.split('').map(function (c, i) { return i; }), rand).slice(0, n), s = truth;
        pos.forEach(function (p) { s = swapDigit(s, p, rand() < simP, rand); });
        return s;
    }
    /* 出一關：{
         level, number（號碼字串）, digits, options（4 個選項，已洗牌）, answerIdx, cars（車廂數）, target（貼號碼的車廂，從 0 算起）,
         windows（每節車廂窗戶裡的東西）, stickers（{車廂編號: 字母}，干擾貼紙）, viewS, simP } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var d = digitsFor(level), cars = carsFor(level), simP = simPFor(level), number = randomNumber(d, rand);
        var opts = [number], guard = 0;
        while (opts.length < 4 && guard++ < 400) { var c = makeDecoy(number, simP, rand); if (opts.indexOf(c) < 0) opts.push(c); }
        while (opts.length < 4) { var f = swapDigit(number, d - 1, false, rand); if (opts.indexOf(f) < 0) opts.push(f); }       /* 保底（極少用到） */
        opts = kit.shuffle(opts, rand);
        var target = kit.randInt(0, cars - 1, rand), windows = [], i;
        for (i = 0; i < cars; i++) windows.push(kit.pick(WINDOWS, rand));
        var others = []; for (i = 0; i < cars; i++) if (i !== target) others.push(i);
        var stickers = {}; kit.shuffle(others, rand).slice(0, Math.min(decoysFor(level), others.length)).forEach(function (ci) { stickers[ci] = kit.pick(LETTERS, rand); });
        return { level: level, number: number, digits: d, options: opts, answerIdx: opts.indexOf(number), cars: cars, target: target, windows: windows, stickers: stickers, viewS: viewSFor(level), simP: simP };
    }
    function rating(n) {
        if (n >= 25) return '老鷹眼！';
        if (n >= 15) return '眼力驚人！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '盯著黃色的貼紙！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'knt-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 畫一節車廂的窗戶裡的東西（座標以窗戶左上角為原點，窗戶 160×80） */
    function drawWindow(g, kind, rand) {
        var s = function (tag, attrs) { return kit.svg(tag, attrs, g); };
        function person(cx, tone) {
            s('path', { 'class': 'knt-pax knt-pax--' + tone, d: 'M' + (cx - 30) + ',84 Q' + (cx - 30) + ',54 ' + cx + ',52 Q' + (cx + 30) + ',54 ' + (cx + 30) + ',84 Z' });
            s('circle', { 'class': 'knt-head', cx: cx, cy: 36, r: 16 });
            s('path', { 'class': 'knt-hair', d: 'M' + (cx - 16) + ',34 Q' + cx + ',12 ' + (cx + 16) + ',34 Q' + cx + ',26 ' + (cx - 16) + ',34 Z' });
        }
        if (kind === 'pax') person(kit.randInt(55, 105, rand), kit.randInt(0, 2, rand));
        else if (kind === 'pax2') { person(42, kit.randInt(0, 2, rand)); person(118, kit.randInt(0, 2, rand)); }
        else if (kind === 'bento') {
            s('rect', { 'class': 'knt-bento', x: 36, y: 34, width: 88, height: 42, rx: 6 });
            s('rect', { 'class': 'knt-rice', x: 42, y: 40, width: 38, height: 30, rx: 4 });
            s('circle', { 'class': 'knt-egg', cx: 98, cy: 50, r: 9 }); s('rect', { 'class': 'knt-veg', x: 88, y: 58, width: 30, height: 10, rx: 4 });
        }
        else if (kind === 'news') {
            s('rect', { 'class': 'knt-paper', x: 34, y: 6, width: 92, height: 72, rx: 3 });
            s('rect', { 'class': 'knt-line', x: 42, y: 14, width: 76, height: 8 }); s('rect', { 'class': 'knt-line', x: 42, y: 30, width: 34, height: 4 }); s('rect', { 'class': 'knt-line', x: 82, y: 30, width: 36, height: 4 });
            s('rect', { 'class': 'knt-line', x: 42, y: 40, width: 34, height: 4 }); s('rect', { 'class': 'knt-line', x: 82, y: 40, width: 36, height: 4 }); s('rect', { 'class': 'knt-line', x: 42, y: 52, width: 76, height: 4 });
        }
        else if (kind === 'curtain') {
            s('rect', { 'class': 'knt-curtain', x: 0, y: 0, width: 58, height: 80 });
            s('path', { 'class': 'knt-fold', d: 'M19,0 L19,80 M38,0 L38,80' });
        }
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[動態視力] 第 ' + level + ' 關：號碼 ' + q.number + '（選項 ' + q.options.join('、') + '）；' + q.cars + ' 節車廂，貼在第 ' + (q.target + 1) + ' 節；每節在畫面上 ' + q.viewS + ' 秒；干擾貼紙 ' + Object.keys(q.stickers).length + ' 張');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var T = trainSize(W, q.cars), v = speedFor(W, T.cw, q.viewS), endX = -(T.total + TAIL_PAD), passS = passSeconds(W, T.total + TAIL_PAD, v);
        var field = h('div', { 'class': 'knt-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note knt-tip', text: level === 1 ? '看清楚窗戶上的黃色號碼！' : '看清楚黃色的號碼貼紙' });
        field.appendChild(tip);
        var trainTop = 100;
        /* 鐵軌（在車廂底下） */
        var rail = h('div', { 'class': 'knt-rail' }); rail.style.top = (trainTop + T.ch + 2) + 'px'; field.appendChild(rail);
        /* 整列火車：一個很寬的條，每一節車廂排在裡面；整個條用 translateX 移動 */
        var strip = h('div', { 'class': 'knt-train' });
        strip.style.cssText = 'top:' + trainTop + 'px;width:' + T.total + 'px;height:' + T.ch + 'px;transform:translate3d(' + W + 'px,0,0);';
        field.appendChild(strip);
        var stickerEl = null;
        for (var i = 0; i < q.cars; i++) {
            var car = h('div', { 'class': 'knt-car' });
            car.style.cssText = 'left:' + carOffset(i, T.cw) + 'px;width:' + T.cw + 'px;height:' + T.ch + 'px;';
            var svg = kit.svg('svg', { 'class': 'knt-svg', viewBox: '0 0 230 170', width: T.cw, height: T.ch }, car);
            if (i < q.cars - 1) kit.svg('rect', { 'class': 'knt-link', x: 226, y: 118, width: 18, height: 9, rx: 3 }, svg);          /* 連結器：最後一節後面沒有車廂，不畫 */
            kit.svg('rect', { 'class': 'knt-roof', x: 6, y: 0, width: 218, height: 14, rx: 7 }, svg);
            kit.svg('rect', { 'class': 'knt-body', x: 0, y: 8, width: 230, height: 142, rx: 14 }, svg);
            kit.svg('rect', { 'class': 'knt-band', x: 0, y: 112, width: 230, height: 30 }, svg);
            kit.svg('rect', { 'class': 'knt-glass', x: 35, y: 26, width: 160, height: 80, rx: 8 }, svg);
            var wg = kit.svg('g', { transform: 'translate(35,26)', 'clip-path': 'url(#knt-clip)' }, svg);
            drawWindow(wg, q.windows[i], api.rand);
            kit.svg('rect', { 'class': 'knt-frame', x: 10, y: 150, width: 210, height: 8, rx: 3 }, svg);
            kit.svg('circle', { 'class': 'knt-wheel', cx: 52, cy: 162, r: 9 }, svg); kit.svg('circle', { 'class': 'knt-wheel', cx: 178, cy: 162, r: 9 }, svg);
            var txt = i === q.target ? q.number : q.stickers[i];
            if (txt != null) {
                var st = h('div', { 'class': 'knt-sticker' + (i === q.target ? ' knt-sticker--num' : ''), text: txt });
                st.style.left = '50%'; st.style.top = Math.round(66 / 170 * T.ch) + 'px';
                car.appendChild(st);
                if (i === q.target) stickerEl = st;
            }
            strip.appendChild(car);
        }
        /* 窗戶的裁切範圍（讓窗內的東西不會超出玻璃）：放一個隱藏的 svg 定義 */
        var defs = kit.svg('svg', { 'class': 'knt-defs', width: 0, height: 0 }, field);
        var cp = kit.svg('clipPath', { id: 'knt-clip' }, kit.svg('defs', {}, defs)); kit.svg('rect', { x: 0, y: 0, width: 160, height: 80, rx: 8 }, cp);
        var info = h('div', { 'class': 'qz-note knt-info', text: '' }); info.style.top = (trainTop + T.ch + 34) + 'px'; field.appendChild(info);

        var phase = 'run', done = false, grid = null, x0 = W;
        function setX(x) { x0 = x; strip.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)'; }
        api.after(LEAD_MS, function () {
            var t0 = performance.now();
            api.my.loop(function (now) {
                if (!strip.isConnected || phase !== 'run') return false;
                var t = (now - t0) / 1000;
                if (t >= passS) { setX(endX); ask(); return false; }
                setX(trainX(t, W, v));
            });
            /* 保底：rAF 被暫停（背景分頁）時，時間到了直接跳到下一階段 */
            api.after(Math.round(passS * 1000) + 500, function () { if (phase === 'run') { setX(endX); ask(); } });
        });
        function ask() {
            if (phase !== 'run') return;
            phase = 'ask'; tip.textContent = '剛才窗戶上的號碼是？';
            grid = kit.btnGrid(field, q.options.map(function (o, k) { return { text: o, kind: 'line', cls: 'knt-opt', onTap: function () { judge(k); } }; }), { cols: 2, h: 92, gap: 10, bottom: 8 });
            if (level === 1 && kit.once('kinetic.hint')) kit.hintOn(stage, grid.btns[q.answerIdx], { mode: 'tap', delay: 900, text: '請點剛才看到的號碼' });
            api.timer(ANSWER_S * 1000, function () { judge(-1); });
        }
        function judge(k) {
            if (done || api.over || phase !== 'ask') return;
            done = true; phase = 'end'; api.stopTimer();
            var ok = k === q.answerIdx;
            grid.btns[q.answerIdx].classList.add('knt-ok'); if (k >= 0 && !ok) grid.btns[k].classList.add('knt-bad');
            tip.textContent = '火車倒車回來看看';
            /* 揭曉：火車倒車，停在貼號碼的那一節（正中央），號碼貼紙放大 */
            var from = x0, to = revealX(W, T.cw, q.target);
            api.my.tween(REVERSE_MS, function (p) { setX(from + (to - from) * p); }, kit.easeOutCubic).then(function () {
                if (!stickerEl || !stickerEl.isConnected) return;
                stickerEl.classList.add('knt-sticker--zoom');
                info.textContent = ok ? '答對了！號碼是 ' + q.number : (k >= 0 ? '正確是 ' + q.number + '，你選了 ' + q.options[k] : '時間到！號碼是 ' + q.number);
                info.classList.add(ok ? 'knt-info--ok' : 'knt-info--bad');
            });
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: REVERSE_MS + ZOOM_MS + 1500 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: REVERSE_MS + ZOOM_MS + 2600, lines: ['正確的號碼是 ' + q.number + (k >= 0 ? '，你選了 ' + q.options[k] : '（時間到）'), '選項：' + q.options.join('、')] });
        }
        api.solve = function () { if (phase === 'ask') judge(q.answerIdx); };
        api.wrong = function () { if (phase === 'ask') judge((q.answerIdx + 1) % 4); };
    }

    var G = {
        id: ID,
        name: '動態視力',
        rule: '一列火車從右往左開過去，**其中一節車廂的窗戶貼著黃底黑字的號碼**。火車開走之後，從下面 **4 個選項**點出那個號碼。別的窗戶裡有乘客、便當、報紙，後面還會貼**英文字母**的假貼紙來干擾你。越後面，火車開得越快（第 30 關每節車廂只在畫面上 **0.5 秒**）、號碼越長、錯的選項越像（0 和 8、3 和 8、1 和 7……）。點錯或時間到就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            viewSFor: viewSFor, digitsFor: digitsFor, carsFor: carsFor, decoysFor: decoysFor, simPFor: simPFor, trainSize: trainSize, speedFor: speedFor, passSeconds: passSeconds, trainX: trainX, carOffset: carOffset, revealX: revealX,
            diffPositions: diffPositions, allSimilar: allSimilar, randomNumber: randomNumber, swapDigit: swapDigit, makeDecoy: makeDecoy, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, VIEW_S: VIEW_S, DIGITS: DIGITS, CARS: CARS, DECOY_STICKERS: DECOY_STICKERS, SIM_P: SIM_P, ANSWER_S: ANSWER_S, CAR_GAP: CAR_GAP, SIM: SIM, LETTERS: LETTERS, WINDOWS: WINDOWS, MAX_LEVEL: MAX_LEVEL, REVERSE_MS: REVERSE_MS, ZOOM_MS: ZOOM_MS
        }
    };
    Reaction.register(G);
})();
