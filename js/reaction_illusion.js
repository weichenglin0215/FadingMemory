/* ═══════════════════════════════════════════════════════════════════
   reaction_illusion.js — 秒反應・錯覺大師
   兩個圖形比一比，哪個比較長／大／亮？眼睛會騙人，看你能不能不被騙。
   ───────────────────────────────────────────────────────────────────
   · 五種經典錯覺，全部用 SVG 依參數畫出（長度、半徑、灰階都是精確的數值，所以
     「真實差距」才準）：
       muller    繆勒－萊爾：兩條線哪條長（箭尾向外的那條看起來比較長）
       ebbinghaus 艾賓豪斯：中間哪個圓大（被小圓圍著的看起來比較大）
       ponzo     龐佐：鐵軌上的兩條橫線哪條長（靠遠處的上面那條看起來比較長）
       vh        垂直水平：倒 T 的兩條線哪條長（垂直那條看起來比較長）
       contrast  同時對比：兩個灰方塊哪個亮（放在深色底上的看起來比較亮）
   · 每題的「錯覺方向」和「真相」有時一致（錯覺幫忙）、有時相反（錯覺陷阱）；陷阱比例隨
     關卡線性提高（TRAP_START → TRAP_END）。真實差距 Δ 也線性縮小。
   · 答完立刻揭曉真相（畫出對齊的輔助線、寫出數字）1 秒多，答錯或超時就結束。
     成績＝連續答對題數（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'illusion';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 illusion 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連對題數', min: 1, max: 500 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 真實差距（相對比例）、錯覺陷阱比例、每題限時，都隨關卡線性變化到第 LEVEL_RAMP 關 */
    var DELTA_START = 0.15, DELTA_END = 0.02;     /* 真實差距（相對比例）：第 1 關 → LEVEL_RAMP 關 */
    var TRAP_START = 0.2, TRAP_END = 0.8;         /* 錯覺陷阱的比例 */
    var TIME_START = 4.0, TIME_END = 2.5;         /* 每題限時（秒） */
    var LEVEL_RAMP = 20;
    var REVEAL_MS = 1500;       /* 答完後揭曉真相停多久 */
    /* 五種錯覺的代號 */
    var KINDS = ['muller', 'ebbinghaus', 'ponzo', 'vh', 'contrast'];

    function fmtBest(v) { return v == null ? '' : '最佳連對 ' + v; }

    /* 出題（純函式，也給 Node 測試用）：決定錯覺種類、真實差距、哪個選項才是對的 */
    /* ═══ 出題（純函式，也給 Node 測試用）═══
       回傳：{ kind, delta, help, big(較大／較亮那個選項的編號 0 或 1), q0, q1(兩個選項的真實數量), ... } */
    function makeQuestion(level, rand, avoidKind, forceKind) {
        rand = rand || Math.random;
        var delta = kit.ramp(level, DELTA_START, DELTA_END, LEVEL_RAMP);
        var trap = kit.ramp(level, TRAP_START, TRAP_END, LEVEL_RAMP);
        /* help＝true 表示「錯覺幫忙」（錯覺方向和真相一致）；false 是「錯覺陷阱」（錯覺方向與真相相反） */
        var help = rand() >= trap;
        /* 連續兩題不出同一種錯覺（avoidKind） */
        var pool = KINDS.filter(function (k) { return k !== avoidKind; });
        var kind = forceKind || pool[Math.floor(rand() * pool.length)];
        var q = { kind: kind, delta: delta, help: help };
        /* big：真實數量比較大的那個選項（0 或 1）。有些錯覺的方向綁定位置（上面／垂直／深色底），所以由 help 決定 */
        /* big：真實數量比較大的那個選項。ponzo／vh／contrast 的錯覺方向跟「位置」綁死
           （上面／垂直／深色底那一個看起來比較大），所以由 help 決定；
           muller／ebbinghaus 的錯覺方向跟「圖案樣式」綁，位置可以隨機。 */
        if (kind === 'ponzo' || kind === 'vh' || kind === 'contrast') q.big = help ? 0 : 1;
        else q.big = rand() < 0.5 ? 0 : 1;
        /* base：較小那個的基準數值（不同錯覺用不同單位） */
        var base = kind === 'ebbinghaus' ? 40 : (kind === 'contrast' ? 120 : 200);
        if (kind === 'ponzo') base = 96;
        if (kind === 'muller') base = 250;
        q.base = base;
        /* 較小的是 base，較大的是 base × (1 + Δ)；灰階題改用灰階差（Δ × 255） */
        /* 較小的是 base，較大的是 base × (1 + Δ)；contrast 用灰階差：Δ × 255 */
        if (kind === 'contrast') {
            var gap = Math.round(delta * 255);
            var lo = Math.round(kit.randFloat(95, 150, rand));
            q.v = [0, 0];
            q.v[q.big] = lo + gap; q.v[1 - q.big] = lo;
        } else {
            q.v = [0, 0];
            q.v[q.big] = base * (1 + delta); q.v[1 - q.big] = base;
        }
        q.time = kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP);
        return q;
    }
    /* 兩個選項真實數量相差幾 % */
    /* 兩個選項真實數量差了多少 %（相對較小的那個） */
    function realPct(q) {
        var a = q.v[q.big], b = q.v[1 - q.big];
        return (a - b) / b * 100;
    }

    /* 畫題目：每種錯覺一個函式，回傳 { hits 兩個選項的點擊範圍, guides 揭曉時畫輔助線的函式 } */
    /* ═══ 畫題目：每一種錯覺一個函式，回傳 { hits:[選項0的點擊區, 選項1的點擊區], guides(g) } ═══ */
    /* DRAW 物件：用錯覺代號當鍵，存放對應的畫圖函式 */
    var DRAW = {};

    /* 點擊範圍：透明的矩形，蓋在圖形上讓手指好點 */
    function hitRect(svg, x, y, w, hh) {
        return kit.svg('rect', { 'class': 'il-hit', x: x, y: y, width: w, height: hh, rx: 18 }, svg);
    }

    /* 繆勒－萊爾：兩條一樣長（或差一點）的線，箭尾向外的看起來比較長 */
    /* 繆勒－萊爾：選項 0＝上面那條、1＝下面那條 */
    DRAW.muller = function (svg, FW, FH, q) {
        var cx = FW / 2, ys = [FH * 0.32, FH * 0.68], hits = [], fin = 36;
        for (var i = 0; i < 2; i++) {
            var L = q.v[i], isBig = i === q.big;
            /* tail＝這條線用「箭尾」（翼向外）還是「箭頭」（翼向內） */
            /* 錯覺幫忙：較長的那條用箭尾（向外，看起來更長）；陷阱：較長的那條用箭頭（向內，看起來更短） */
            var tail = q.help ? isBig : !isBig;
            var x1 = cx - L / 2, x2 = cx + L / 2, y = ys[i];
            kit.svg('line', { 'class': 'il-line', x1: x1, y1: y, x2: x2, y2: y }, svg);
            [[x1, -1], [x2, 1]].forEach(function (e) {
                var dir = tail ? 1 : -1;     /* tail：翼往外；arrow：翼往內 */
                [-1, 1].forEach(function (s) {
                    kit.svg('line', { 'class': 'il-line', x1: e[0], y1: y, x2: e[0] + e[1] * dir * fin, y2: y + s * fin }, svg);
                });
            });
            hits.push(hitRect(svg, cx - L / 2 - fin - 10, y - 62, L + fin * 2 + 20, 124));
        }
        return {
            hits: hits,
            guides: function (g) {
                var small = 1 - q.big, L = q.v[small];
                [cx - L / 2, cx + L / 2].forEach(function (x) { kit.svg('line', { 'class': 'il-guide', x1: x, y1: ys[0] - 50, x2: x, y2: ys[1] + 50 }, g); });
            }
        };
    };

    /* 艾賓豪斯：中間的圓被周圍的小圓圍住，看起來比被大圓圍住的大 */
    /* 艾賓豪斯：選項 0＝左邊、1＝右邊 */
    DRAW.ebbinghaus = function (svg, FW, FH, q) {
        var cy = FH * 0.5, xs = [FW * 0.27, FW * 0.73], hits = [];
        for (var i = 0; i < 2; i++) {
            var r = q.v[i], isBig = i === q.big;
            /* 錯覺幫忙：較大的圓被小圓圍著（看起來更大）；陷阱：較大的圓被大圓圍著 */
            var smallSurround = q.help ? isBig : !isBig;
            var sr = smallSurround ? 9 : 25, d = r + sr + (smallSurround ? 12 : 9);
            for (var k = 0; k < 6; k++) {
                var a = k * Math.PI / 3 + (i ? Math.PI / 6 : 0);
                kit.svg('circle', { 'class': 'il-surround', cx: xs[i] + d * Math.cos(a), cy: cy + d * Math.sin(a), r: sr }, svg);
            }
            kit.svg('circle', { 'class': 'il-center', cx: xs[i], cy: cy, r: r }, svg);
            hits.push(kit.svg('circle', { 'class': 'il-hit', cx: xs[i], cy: cy, r: 105 }, svg));
        }
        return {
            hits: hits,
            guides: function (g) {
                for (var i = 0; i < 2; i++) kit.svg('circle', { 'class': 'il-guide', cx: xs[i], cy: cy, r: q.v[q.big], fill: 'none' }, g);
            }
        };
    };

    /* 龐佐：兩條橫線放在鐵軌（透視）上，靠遠處（上方）的看起來比較長 */
    /* 龐佐：選項 0＝上面那條橫線、1＝下面那條 */
    DRAW.ponzo = function (svg, FW, FH, q) {
        var cx = FW / 2, yTop = FH * 0.1, yBot = FH * 0.92;
        var wTop = 40, wBot = 130;     /* 鐵軌在最上／最下的半寬 */
        [-1, 1].forEach(function (s) {
            kit.svg('line', { 'class': 'il-rail', x1: cx + s * wBot, y1: yBot, x2: cx + s * wTop, y2: yTop }, svg);
        });
        /* 枕木增加透視感 */
        for (var k = 0; k < 7; k++) {      /* 枕木，增加透視感 */
            var t = k / 6, y = yBot - (yBot - yTop) * (0.04 + 0.96 * t);
            var w = wBot - (wBot - wTop) * ((yBot - y) / (yBot - yTop));
            kit.svg('line', { 'class': 'il-tie', x1: cx - w - 14, y1: y, x2: cx + w + 14, y2: y }, svg);
        }
        var ys = [FH * 0.3, FH * 0.7], hits = [];
        for (var i = 0; i < 2; i++) {
            var L = q.v[i];
            kit.svg('line', { 'class': 'il-bar', x1: cx - L / 2, y1: ys[i], x2: cx + L / 2, y2: ys[i] }, svg);
            hits.push(hitRect(svg, cx - 120, ys[i] - 55, 240, 110));
        }
        return {
            hits: hits,
            guides: function (g) {
                var L = q.v[1 - q.big];
                [cx - L / 2, cx + L / 2].forEach(function (x) { kit.svg('line', { 'class': 'il-guide', x1: x, y1: ys[0] - 45, x2: x, y2: ys[1] + 45 }, g); });
            }
        };
    };

    /* 垂直水平：倒 T 形，垂直那條看起來比較長 */
    /* 垂直水平：倒 T。選項 0＝垂直線、1＝水平線 */
    DRAW.vh = function (svg, FW, FH, q) {
        var cx = FW / 2, baseY = FH * 0.74;
        var V = q.v[0], H = q.v[1];
        kit.svg('line', { 'class': 'il-bar', x1: cx - H / 2, y1: baseY, x2: cx + H / 2, y2: baseY }, svg);
        kit.svg('line', { 'class': 'il-bar', x1: cx, y1: baseY, x2: cx, y2: baseY - V }, svg);
        var hits = [hitRect(svg, cx - 34, baseY - V - 20, 68, V + 20 - 38), hitRect(svg, cx - H / 2 - 12, baseY - 34, H + 24, 68)];
        return { hits: hits, guides: function () { } };
    };

    /* 同時對比：兩個灰方塊，放在深色底上的看起來比較亮 */
    /* 同時對比：選項 0＝深色底上的方塊（左）、1＝淺色底上的方塊（右） */
    DRAW.contrast = function (svg, FW, FH, q) {
        var half = FW / 2, side = 120, cy = FH * 0.5, hits = [];
        kit.svg('rect', { x: 0, y: 0, width: half, height: FH, fill: '#2B2B2B' }, svg);
        kit.svg('rect', { x: half, y: 0, width: half, height: FH, fill: '#EDEDED' }, svg);
        for (var i = 0; i < 2; i++) {
            var gv = q.v[i], cxi = half * (i + 0.5);
            kit.svg('rect', { x: cxi - side / 2, y: cy - side / 2, width: side, height: side, fill: 'rgb(' + gv + ',' + gv + ',' + gv + ')' }, svg);
            hits.push(hitRect(svg, cxi - side / 2 - 30, cy - side / 2 - 30, side + 60, side + 60));
        }
        return { hits: hits, guides: function () { } };
    };

    /* 題目文字與選項名稱 */
    var QTEXT = {
        muller: '哪一條線比較長？', ponzo: '哪一條橫線比較長？', vh: '哪一條線比較長？',
        ebbinghaus: '中間哪個圓比較大？', contrast: '哪一個方塊比較亮？'
    };
    var NAMES = {
        muller: ['上面那條', '下面那條'], ponzo: ['上面那條', '下面那條'], vh: ['垂直的那條', '水平的那條'],
        ebbinghaus: ['左邊的圓', '右邊的圓'], contrast: ['左邊的方塊', '右邊的方塊']
    };

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;
        var newRec = false;

        /* round：開一局 */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            newRec = false;
            /* streak 連續答對題數；lastKind 上一題的種類 */
            var streak = 0, lastKind = null;
            /* 時間條 */
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var hint = h('div', { 'class': 'il-q', text: '' });
            var field = h('div', { 'class': 'il-field' });
            root.appendChild(hint);
            root.appendChild(field);
            root.appendChild(bar);
            var FW = field.clientWidth, FH = field.clientHeight;

            function meta() { ctx.setMeta(kit.meta(['連對 ' + streak, fmtBest(Reaction.getBest(ID))])); }
            meta();

            /* 出一題 */
            function ask() {
                if (my.dead) return;
                field.innerHTML = '';
                var level = streak + 1;
                /* G.dev：開發驗證用的強制設定（正式遊戲都是 null） */
                var q = makeQuestion(level, null, lastKind, G.dev.kind);
                if (G.dev.time) q.time = G.dev.time;
                lastKind = q.kind;
                var svg = kit.svg('svg', { 'class': 'il-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);
                var d = DRAW[q.kind](svg, FW, FH, q);
                var gGuides = kit.svg('g', {}, svg);
                hint.textContent = QTEXT[q.kind];
                var answered = false;
                var t0 = performance.now(), limit = q.time * 1000;
                /* my.loop：每個畫面更新一次，更新倒數條 */
                var loop = my.loop(function (now) {
                    if (answered) return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                });
                /* 時間到：answer(-1) */
                var timer = my.after(limit, function () { if (!answered) answer(-1); });

                /* 作答：標示對錯、畫輔助線、揭曉真相；答對繼續，答錯結算 */
                function answer(idx) {
                    if (answered) return;
                    answered = true;
                    my.cancel(timer); loop.stop();
                    fill.style.width = '0%';
                    var ok = idx === q.big;
                    d.hits.forEach(function (el, i) {
                        if (i === q.big) el.classList.add('il-hit--ok');
                        else if (i === idx) el.classList.add('il-hit--bad');
                    });
                    /* 揭曉：畫出對齊的輔助線，讓玩家看見真正的長度／大小 */
                    d.guides(gGuides);
                    var pct = realPct(q);
                    var what = q.kind === 'contrast' ? '亮' : (q.kind === 'ebbinghaus' ? '大' : '長');
                    var truth = (idx === -1 ? '時間到！' : (ok ? '答對了！' : '答錯了…')) + ' 其實是「' + NAMES[q.kind][q.big] + '」比較' + what +
                        (q.kind === 'contrast' ? '（灰階 ' + q.v[q.big] + ' 對 ' + q.v[1 - q.big] + '）' : '（多了 ' + pct.toFixed(4) + '%）') +
                        (q.help ? '' : '　（錯覺陷阱）');
                    hint.textContent = truth;
                    if (ok) {
                        streak++;
                        Sfx.play('ok');
                        if (Reaction.setBest(ID, streak, function (v, b) { return v > b; })) newRec = true;
                        meta();
                        my.after(G.dev.reveal || REVEAL_MS, ask);
                    } else {
                        Sfx.play('bad');
                        my.after(REVEAL_MS + 300, function () {
                            kit.result(root, {
                                score: streak,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                                num: streak + ' 題', label: idx === -1 ? '時間到了' : '被錯覺騙到了',
                                note: truth,
                                isNew: newRec, sfx: streak >= 8 ? 'win' : 'fail', onAgain: round
                            });
                        });
                    }
                }
                /* 替每個選項的點擊範圍綁 pointerdown */
                d.hits.forEach(function (el, i) {
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(i); });
                });
                /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「這題真正比較大（長、亮）的那個」上（第一題的正確答案） */
                if (Reaction.kit.once('illusion.hint')) Reaction.kit.hintOn(root, d.hits[q.big], { mode: 'tap', text: '請點擊' + (q.kind === 'contrast' ? '比較亮' : (q.kind === 'ebbinghaus' ? '比較大' : '比較長')) + '的那個' });
                /* G.debug：測試用後門 */
                G.debug = { q: q, answer: answer, streak: function () { return streak; } };
            }

            /* 開場等 500 毫秒再出第一題 */
            my.after(500, ask);
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '錯覺大師',
        rule: '兩個圖形比一比，哪個比較長、比較大、比較亮？眼睛會騙人！有時候錯覺會幫你，有時候剛好相反，而且真正的差距會越來越小。答完立刻揭曉真相，連對越多越好。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* dev 是開發用設定 */
        dev: { kind: null, time: null, reveal: null },      /* 開發驗證用：強制題型／限時，正式遊戲不會設定 */
        /* test 匯出純函式給 Node 自動測試 */
        test: { makeQuestion: makeQuestion, realPct: realPct, KINDS: KINDS, TRAP_END: TRAP_END }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
