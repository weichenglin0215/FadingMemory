/* ═══════════════════════════════════════════════════════════════════
   reaction_tissue.js — 秒反應・抽光衛生紙（原名「抽光它」）
   手指在螢幕上一直往下滑，把一整捲衛生紙拉出來；要抽滿 50 個螢幕高度，比誰最快。
   · 慣性滑落：手指放開時如果還在往下滑，紙會帶著放開前的速度繼續滑一段，再慢慢停下來
     （INERTIA 參數控制，預設 0.8，見下面「可以自己調的參數」）。
   ───────────────────────────────────────────────────────────────────
   · 全螢幕都是操作區（touch-action:none，避免瀏覽器的下拉重新整理）。
   · 計時從「第一次有效往下滑動」開始（不是從按鈕開始，避免反應時間混進來）；
     抽光那一刻停表。累加距離與「抽光」判定全部寫在 pointermove 裡，不依賴 rAF；
     rAF 只負責畫面。
   · 防手抖灌水：不是「只要 dy>0 就累加」（手指停著的微抖會被灌水）。每一筆往下滑
     只計入「這一筆目前到達的最遠點」的增量（strokeMaxY）；往上反向超過
     REVERSAL_PX 才算新的一筆。所以「往下刷、抬起、回頂端再刷」都合法，
     原地抖動不算。
   · 紙捲半徑隨抽出的長度縮小：紙長 ∝ 面積，所以 R = sqrt(核² + (滿² − 核²)×(1−p))，
     是平方根縮小，不是線性；同時依 pulled／R 轉動（越小越轉得快）。
   · 單指（只認 isPrimary）；ALLOW_MULTI=true 時兩指各自累加。滑鼠：按住拖曳或滾輪。
   · 數字一律 4 位小數：計時與抽出的進度是真實數字；抽光那一刻才用 Leaderboard.fake4() 產生
     最終成績（秒，第 3、4 位不為 0，只產生一次），畫面、最佳紀錄用同一個數字。
     最佳紀錄存的單位是「秒」（舊版存毫秒，第一次進來會自動換算）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'tissue';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 tissue 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 秒', label: '時間', min: 1.5, max: 600 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 要抽幾個螢幕高度的紙 */
    var TARGET_SCREENS = 50;   /* 要抽幾個螢幕高度的紙 */
    var GAIN = 1.0;             /* 手指移動 1px 抽出幾 px 的紙（覺得太久就調高） */
    /* 往上反向超過 6px 才算新的一筆（避免手指微抖被重複計算） */
    var REVERSAL_PX = 6;        /* 往上反向超過幾 px 才算新的一筆 */
    var SHEET_H = 170;          /* 一張衛生紙的長度（撕裂虛線的間距） */
    var PAPER_W = 300;          /* 紙的寬度 */
    /* 紙捲滿的時候與只剩紙筒時的半徑 */
    var R_FULL = 108, R_CORE = 30;      /* 紙捲滿的半徑／只剩紙筒的半徑 */
    var ROLL_CY = 118;          /* 紙捲圓心離畫面上緣 */
    var WHEEL_CAP = 200;        /* 滑鼠滾輪每次事件最多算幾 px */
    var HAPTIC = true;          /* 每抽過一屏輕震一下（手機） */
    var ALLOW_MULTI = false;    /* true：兩指各自累加 */
    var SWIPE_MIN_PX = 120;     /* 一筆至少滑多長才算「一下」（統計滑動次數用） */
    /* ── 慣性滑落（V1.21.0）──
       INERTIA：放手之後，紙「每過 100 毫秒還保留幾成速度」。0＝沒有慣性（放手就停）；
       0.8＝每 0.1 秒剩 80%，會再滑一小段（預設）；越接近 1 滑得越遠、越久。
       INERTIA_MIN_V：速度掉到這個值（px／毫秒）以下就停；INERTIA_WINDOW_MS：用放手前最後幾毫秒的移動量算放手速度。 */
    var INERTIA = 0.8;
    var INERTIA_MIN_V = 0.12;
    var INERTIA_WINDOW_MS = 90;

    /* 最佳紀錄文字（v 是「秒」，已經是最終成績，直接格式化到 4 位小數） */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v.toFixed(4) + ' 秒'; }

    /* 紙面圖樣：用 SVG 字串畫一張紙的斜紋壓花與撕裂虛線，轉成 data URI 當背景圖，CSS 可以重複鋪滿，不用建立一堆元素 */
    /* 紙面圖樣（一張紙：斜紋壓花＋底部撕裂虛線），做成可重複鋪的 SVG 背景 */
    function paperTile() {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + PAPER_W + '" height="' + SHEET_H + '">' +
            '<rect width="100%" height="100%" fill="#FFFEF8"/>' +
            '<g stroke="#EFE6CC" stroke-width="1.2">' + diag() + '</g>' +
            '<line x1="0" y1="' + (SHEET_H - 1.5) + '" x2="' + PAPER_W + '" y2="' + (SHEET_H - 1.5) + '" stroke="#B9A878" stroke-width="2.4" stroke-dasharray="10 7"/>' +
            '</svg>';
        return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
        function diag() {
            var out = '';
            for (var x = -SHEET_H; x < PAPER_W + SHEET_H; x += 14) out += '<line x1="' + x + '" y1="0" x2="' + (x + SHEET_H) + '" y2="' + SHEET_H + '"/>';
            return out;
        }
    }

    /* 紙捲半徑：紙長與面積成正比，所以半徑是平方根縮小（不是線性） */
    /* 紙捲半徑：紙長 ∝ 面積（純函式，也給 Node 測試用） */
    function rollRadius(p) {
        p = Math.min(1, Math.max(0, p));
        return Math.sqrt(R_CORE * R_CORE + (R_FULL * R_FULL - R_CORE * R_CORE) * (1 - p));
    }

    /* 「抽出長度」計算器（純邏輯不碰畫面，方便測試）：feed(y) 傳入手指目前的 y，回傳這次新增的紙長 */
    /* 一筆一筆累加的「抽出長度」計算器（純邏輯，不碰 DOM，方便測試）：
       feed(y) 傳入手指目前的 y（邏輯 px），回傳這次新增的紙長（已乘 GAIN） */
    function makePuller(opts) {
        opts = opts || {};
        var reversal = opts.reversal == null ? REVERSAL_PX : opts.reversal;
        var gain = opts.gain == null ? GAIN : opts.gain;
        /* s 狀態：maxY 這一筆到過的最遠點；strokeLen 這一筆累積長度；strokes 一共滑了幾下 */
        var s = { maxY: null, strokeLen: 0, strokes: 0, last: null };
        return {
            start: function (y) { s.maxY = y; s.strokeLen = 0; },
            feed: function (y) {
                /* 只計入「超過這一筆最遠點」的部分，手指停在原地微抖不會灌水 */
                if (s.maxY == null) { s.maxY = y; return 0; }
                if (y > s.maxY) {
                    var inc = (y - s.maxY);
                    s.maxY = y;
                    s.strokeLen += inc;
                    return inc * gain;
                }
                /* 往上反向超過 reversal 才算新的一筆開始 */
                if (s.maxY - y >= reversal) {         /* 往上反向夠多：新的一筆開始 */
                    if (s.strokeLen >= SWIPE_MIN_PX) s.strokes++;
                    s.strokeLen = 0;
                    s.maxY = y;
                }
                return 0;
            },
            end: function () {
                if (s.strokeLen >= SWIPE_MIN_PX) s.strokes++;
                s.strokeLen = 0; s.maxY = null;
            },
            strokes: function () { return s.strokes; }
        };
    }

    /* 放手速度（px／毫秒，往下為正）：samples 是 [{t, y}…]（時間由舊到新）；只看放手前最後 windowMs 毫秒，
       只有一個樣本或時間差太短就當作 0（手指是停著放開的，不要滑）。純函式，也給 Node 測試用。 */
    function releaseSpeed(samples, windowMs) {
        if (!samples || samples.length < 2) return 0;
        var last = samples[samples.length - 1], first = last;
        for (var i = samples.length - 2; i >= 0; i--) {
            if (last.t - samples[i].t > (windowMs || INERTIA_WINDOW_MS)) break;
            first = samples[i];
        }
        var dt = last.t - first.t;
        if (dt < 8) return 0;
        return Math.max(0, (last.y - first.y) / dt);
    }
    /* 慣性衰減：過了 dtMs 毫秒，速度 v 變成多少（每 100 毫秒剩 inertia 倍）；與影格率無關。純函式。 */
    function glideSpeed(v, dtMs, inertia) {
        var k = inertia == null ? INERTIA : inertia;
        return v * Math.pow(Math.max(0, Math.min(0.999, k)), dtMs / 100);
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版最佳紀錄存的是「毫秒」；現在存「秒、4 位小數、第 3／4 位不為 0」。第一次進來換算一次 */
        Reaction.migrateBest(ID, function (ms) { return Leaderboard.fake4(ms / 1000); });
        var R = null;

        /* round：開一局 */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            /* 替整個畫面加上暖米色背景 class（樣式在 css/reaction.css 的 .ts-bg） */
            root.classList.add('ts-bg');
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            /* 畫面寬 500，高度用 Stage.H（850） */
            var W = 500;          /* 畫面（#screen）是滿版 500 寬 */
            var H = Stage.H;
            var TARGET_PX = TARGET_SCREENS * H;

            /* 紙：重複鋪的背景圖，高度由 JS 設定 */
            /* 紙 */
            var paper = h('div', { 'class': 'ts-paper' });
            paper.style.width = PAPER_W + 'px';
            paper.style.backgroundImage = paperTile();
            root.appendChild(paper);

            /* 紙捲：SVG 圓，半徑隨抽出的長度縮小；三條記號隨轉動 */
            /* 紙捲（SVG，圓心固定，半徑隨抽出的長度縮小） */
            var svg = kit.svg('svg', { 'class': 'ts-roll', viewBox: '0 0 ' + W + ' 260', preserveAspectRatio: 'xMidYMin meet' });
            var cx = W / 2;
            var bodyC = kit.svg('circle', { 'class': 'ts-roll__body', cx: cx, cy: ROLL_CY, r: R_FULL }, svg);
            var spin = kit.svg('g', {}, svg);
            [0, 120, 240].forEach(function (a) {
                kit.svg('path', { 'class': 'ts-roll__mark', 'vector-effect': 'non-scaling-stroke', d: 'M0 -0.5 L0 -0.84', transform: 'rotate(' + a + ')' }, spin);
            });
            var coreC = kit.svg('circle', { 'class': 'ts-roll__core', cx: cx, cy: ROLL_CY, r: R_CORE }, svg);
            kit.svg('circle', { 'class': 'ts-roll__hole', cx: cx, cy: ROLL_CY, r: R_CORE * 0.55 }, svg);
            root.appendChild(svg);

            /* 抬頭顯示：計時、進度、進度條、提示 */
            /* 抬頭顯示 */
            var timeEl = h('div', { 'class': 'ts-time', text: '0.0000 秒' });
            var progText = h('div', { 'class': 'ts-prog', text: '0.0000／' + TARGET_SCREENS + ' 屏' });
            var bar = h('div', { 'class': 'ts-bar' }, [h('div', { 'class': 'ts-bar__fill' })]);
            var prompt = h('div', { 'class': 'ts-prompt', text: '往下滑開始' });
            root.appendChild(timeEl);
            root.appendChild(progText);
            root.appendChild(bar);
            root.appendChild(prompt);
            var barFill = bar.firstChild;

            /* 狀態 */
            /* ─── 狀態 ─── */
            /* pulled 已抽出的紙長（px）；tStart／tEnd 開始與結束的時間；phase ready/pulling/done */
            var pulled = 0;                 /* 已抽出的紙長（邏輯 px） */
            var tStart = null, tEnd = null;
            var phase = 'ready';            /* ready／pulling／done */
            var activeId = null;
            var puller = makePuller();
            /* samples 每次的時間與已抽長度，結算算「最快 1 秒」用 */
            var samples = [];               /* [時間ms, pulled]，算「最快 1 秒」用 */
            var splits = [];                /* 每 10 屏的經過時間 */
            var lastScreenInt = 0, lastSheet = 0;
            /* 抽光後的「最終成績」（秒，已偽造尾數）；有值之後計時顯示就固定顯示它，不再顯示即時的真實時間 */
            var finalSec = null;

            /* 重畫：紙捲半徑、轉動角度、紙的位置、進度條與文字 */
            function render() {
                var p = pulled / TARGET_PX;
                var rr = rollRadius(p);
                bodyC.setAttribute('r', rr.toFixed(2));
                var deg = (pulled / Math.max(rr, 18)) * 180 / Math.PI;
                /* spin 裡的記號是用單位圓（半徑 1，圓心在原點）畫的：先縮放到目前半徑、轉動、再平移到紙捲圓心 */
                spin.setAttribute('transform', 'translate(' + cx + ' ' + ROLL_CY + ') rotate(' + deg.toFixed(1) + ') scale(' + rr.toFixed(2) + ')');
                var top = ROLL_CY + rr;
                paper.style.top = top.toFixed(1) + 'px';
                paper.style.backgroundPositionY = (pulled % SHEET_H).toFixed(1) + 'px';
                barFill.style.height = (p * 100).toFixed(2) + '%';
                progText.textContent = (pulled / H).toFixed(4) + '／' + TARGET_SCREENS + ' 屏';
            }
            /* 更新計時顯示 */
            function renderTime() {
                if (tStart == null) return;
                if (finalSec != null) { timeEl.textContent = finalSec.toFixed(4) + ' 秒'; return; }
                var t = (tEnd == null ? performance.now() : tEnd) - tStart;
                timeEl.textContent = kit.sec(t) + ' 秒';
            }

            /* 一個位置樣本進來（pointermove 或滾輪都走這裡）：第一次有效往下滑才開始計時 */
            /* 一個位置樣本進來（pointermove／wheel 都走這裡）；t＝事件時間 */
            function addSample(y, t) {
                if (phase === 'done') return;
                var inc = puller.feed(y);
                if (inc <= 0) return;
                applyInc(inc, t);
            }
            /* 紙又被抽出 inc（px）：手指拖出來的、慣性滑出來的，都走這裡 */
            function applyInc(inc, t) {
                if (phase === 'done') return;
                if (phase === 'ready') {
                    phase = 'pulling';
                    tStart = t;
                    prompt.style.display = 'none';
                    samples.push([t, 0]);
                }
                pulled = Math.min(TARGET_PX, pulled + inc);
                samples.push([t, pulled]);

                /* 每抽過一屏、每 10 屏的進度記錄 */
                var scr = Math.floor(pulled / H);
                if (scr > lastScreenInt) {
                    /* 每抽過一屏手機輕震一下（navigator.vibrate） */
                    if (HAPTIC && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(4); } catch (e) { } }
                    if (scr % 10 === 0) { splits.push(t - tStart); Sfx.play('flip'); }
                    lastScreenInt = scr;
                }
                if (pulled >= TARGET_PX) finish(t);
            }

            /* 抽光了：停表、存紀錄、統計平均速度／最快 1 秒／滑動次數／每 10 屏用時 */
            function finish(t) {
                phase = 'done';
                tEnd = t;
                puller.end();
                /* 最終成績（秒）：先產生（第 3、4 位不為 0，只做這一次），再更新畫面，計時顯示、最佳紀錄、結算畫面都用它 */
                var total = tEnd - tStart;
                finalSec = Leaderboard.fake4(total / 1000);
                console.log('抽光衛生紙：實際 ' + (total / 1000).toFixed(6) + ' 秒 → 成績 ' + finalSec.toFixed(4) + ' 秒');
                render();
                renderTime();
                activeId = null;
                paper.classList.add('ts-paper--gone');
                var isNew = Reaction.setBest(ID, finalSec, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));

                /* 統計：平均速度、最快 1 秒、滑動次數、每 10 屏用時。
                   平均速度＝總屏數 ÷ 畫面上顯示的成績（秒），玩家自己除一次也會得到同樣的數字，所以用真實的除法結果；
                   最快 1 秒是獨立量到的另一個數字，照規則偽造尾數 */
                var avg = TARGET_SCREENS / finalSec;
                var best1 = 0;
                /* 滑動視窗：找出最快的連續 1 秒抽了多少 */
                for (var i = 0, j = 0; i < samples.length; i++) {
                    while (samples[i][0] - samples[j][0] > 1000) j++;
                    var d = (samples[i][1] - samples[j][1]) / H;
                    if (d > best1) best1 = d;
                }
                var chunk = [];
                for (var k = 0; k < splits.length; k++) chunk.push(splits[k] - (k ? splits[k - 1] : 0));
                var maxChunk = Math.max.apply(null, chunk.concat([1]));
                var chart = h('div', { 'class': 'ts-chart' }, chunk.map(function (c) {
                    var b = h('div', { 'class': 'ts-chart__bar' });
                    b.style.height = Math.max(6, c / maxChunk * 100) + '%';
                    return b;
                }));
                best1 = Leaderboard.fake4(best1);
                Sfx.play('perfect');
                my.after(900, function () {
                    kit.result(root, {
                        score: finalSec,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: finalSec.toFixed(4) + ' 秒', label: '抽光了！', isNew: isNew, sfx: 'win',
                        lines: ['平均速度 ' + avg.toFixed(4) + ' 屏／秒', '最快的 1 秒抽了 ' + best1.toFixed(4) + ' 屏', '滑了 ' + puller.strokes() + ' 下'],
                        extra: [h('div', { 'class': 'hint', text: '每 10 屏用時（越矮越快）' }), chart],
                        onAgain: round
                    });
                });
            }

            /* 輸入處理 */
            /* ─── 輸入 ─── */
            /* getCoalescedEvents：取回被瀏覽器合併掉的中間點，快速滑動也不會漏掉 */
            function pointerSamples(e) {
                var list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
                return list.length ? list : [e];
            }
            /* 慣性滑落：放手時還在往下滑，紙就帶著放開前的速度繼續滑，速度每 100 毫秒剩 INERTIA 倍，低於 INERTIA_MIN_V 就停。
               手指再按下去（接住紙）、抽光、或這一局結束都會停掉。 */
            var vel = [];            /* 最近的手指位置樣本 {t, y}，算放手速度用 */
            var glideLoop = null;
            function stopGlide() { if (glideLoop) { glideLoop.stop(); glideLoop = null; } }
            function startGlide(v0) {
                stopGlide();
                var v = v0, last = performance.now();
                glideLoop = my.loop(function (now) {
                    if (phase === 'done') return false;
                    var dt = Math.max(1, now - last);
                    last = now;
                    v = glideSpeed(v, dt);
                    if (v < INERTIA_MIN_V) { glideLoop = null; return false; }
                    applyInc(v * dt * GAIN, now);
                    if (phase === 'done') return false;
                });
            }
            my.onDispose(stopGlide);
            /* 手指按下：只認主要手指（isPrimary），避免多指干擾 */
            function onDown(e) {
                if (phase === 'done') return;
                if (e.target && e.target.closest && e.target.closest('button')) return;
                if (!ALLOW_MULTI && !e.isPrimary) return;
                if (activeId != null && !ALLOW_MULTI) return;
                e.preventDefault();
                stopGlide();
                vel = [];
                activeId = e.pointerId;
                try { root.setPointerCapture(e.pointerId); } catch (err) { }
                puller.start(kit.pt(e).y);
            }
            /* 手指移動：每個樣本都餵給計算器 */
            function onMove(e) {
                if (phase === 'done' || e.pointerId !== activeId) return;
                var list = pointerSamples(e);
                for (var i = 0; i < list.length; i++) {
                    var py = kit.pt(list[i]).y, pt = kit.evT(list[i]);
                    vel.push({ t: pt, y: py });
                    addSample(py, pt);
                }
                if (vel.length > 40) vel = vel.slice(-40);
            }
            function onUp(e) {
                if (e.pointerId !== activeId) return;
                activeId = null;
                puller.end();
                /* 放手還在往下滑 → 慣性滑落 */
                var v = releaseSpeed(vel, INERTIA_WINDOW_MS);
                vel = [];
                if (INERTIA > 0 && phase === 'pulling' && v * GAIN > INERTIA_MIN_V) startGlide(v);
            }
            /* 滑鼠滾輪也可以抽 */
            function onWheel(e) {
                if (phase === 'done') return;
                e.preventDefault();
                var dy = Math.min(WHEEL_CAP, Math.max(0, e.deltaY));
                if (dy > 0) { puller.start(0); puller.feed(0); addSample(dy, kit.evT(e)); puller.end(); }
            }
            /* 綁定手指與滾輪事件；{ passive: false } 讓 preventDefault 生效 */
            root.addEventListener('pointerdown', onDown);
            root.addEventListener('pointermove', onMove);
            root.addEventListener('pointerup', onUp);
            root.addEventListener('pointercancel', onUp);
            /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從紙捲下緣（紙的起點）往下滑 */
            if (Reaction.kit.once('tissue.hint')) Reaction.kit.hintOn(root, null, { mode: 'drag', x: 250, y: ROLL_CY + R_FULL + 40, dx: 0, dy: 260, text: '請往上下拖曳' });
            root.addEventListener('wheel', onWheel, { passive: false });
            /* 這一局結束時把事件監聽拿掉 */
            my.onDispose(function () {
                root.removeEventListener('pointerdown', onDown);
                root.removeEventListener('pointermove', onMove);
                root.removeEventListener('pointerup', onUp);
                root.removeEventListener('pointercancel', onUp);
                root.removeEventListener('wheel', onWheel);
                root.classList.remove('ts-bg');
            });

            render();
            /* 計時顯示每個畫面更新（只是畫面；成績一律用事件時間） */
            /* 計時顯示（畫面用；成績一律用事件時間，不受這裡影響） */
            var drawn = -1;
            my.loop(function () {
                if (pulled !== drawn) { drawn = pulled; render(); }
                renderTime();
            });

            /* 測試／除錯：直接餵 y 位置，走跟真的手指一樣的路徑 */
            /* 測試／除錯：直接餵 y 位置，走跟真的手指一樣的路徑 */
            G.debug = {
                state: function () { return { pulled: pulled, phase: phase, strokes: puller.strokes(), tStart: tStart, tEnd: tEnd, TARGET_PX: TARGET_PX }; },
                down: function (y) { puller.start(y); activeId = 'dbg'; },
                move: function (y, t) { addSample(y, t == null ? performance.now() : t); },
                up: function () { activeId = null; puller.end(); },
                /* 模擬「放手時還有速度 v（px／毫秒）」：走跟真的手指一樣的慣性滑落 */
                fling: function (v) { startGlide(v); }
            };
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '抽光衛生紙',
        rule: '把整捲衛生紙抽光！**手指在螢幕上一直往下滑**，紙就一路被拉出來；放手時如果還在往下滑，紙會帶著慣性繼續滑一小段。**要抽滿 50 個螢幕高度**，看你多快。從第一次往下滑才開始計時。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { rollRadius: rollRadius, makePuller: makePuller, releaseSpeed: releaseSpeed, glideSpeed: glideSpeed, INERTIA: INERTIA, INERTIA_MIN_V: INERTIA_MIN_V }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
