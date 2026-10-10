/* ═══════════════════════════════════════════════════════════════════
   reaction_alignchar.js — 秒反應・對準才看得到（企劃 219 的改版）
   一個中文字被切成許多「直條」，每一條都在上下方向循環移動（有的往上、有的往下，快慢各不相同），
   所以大部分時間看起來是一團破碎的線條；只有每隔一段時間，所有直條「剛好對準」的那一瞬間，
   整個字才會完整浮現。看出它是哪個字，點下面的選項。關卡制：選錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 動作是時間的純函式（規範 T3）：第 i 條在第 t 秒往下偏移  off_i(t) ＝ (k_i × (t − tA) ÷ CYCLE × P) 對 P 取餘數，
     P 是圖案的高度（循環一圈），k_i 是不為 0 的整數（正＝往下、負＝往上，絕對值越大越快）。
     因為 k_i 都是整數，所以在 t ＝ tA ＋ m × CYCLE（m 是整數）的每一個時刻，所有直條的偏移量同時是 0——整個字完整浮現。
   · 出題：k_i 在 ±1～±3 之間隨機，一定同時有往上和往下的直條、至少有兩種速度；第一次對準時刻 tA 隨機在 0.6～1.0 個週期之間，
     所以不能「一開始就盯著看」。選項會挑「長得像」的字（日目自白百、未末朱束…），選項個數 4 → 6。
   · 難度線性（RAMP_LEVELS 關走到頂）：直條數 5 → 12 條（越細越難拼）；週期 CYCLE 5 → 2.8 秒（越短，對準的瞬間越短）；
     作答限時 14 → 9 秒。
   · 揭曉：所有直條停在對準的位置，整個字完整顯示，標出正確的選項。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'alignchar';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var STRIPS = [5, 12];                       /* 切成幾條直條：第 1 關 → 到頂 */
    var OPTIONS = [4, 6];                       /* 有幾個選項：第 1 關 → 到頂 */
    var CYCLE_S = [5, 2.8];                     /* 對準的週期（秒）：第 1 關 → 到頂 */
    var TIME_S = [14, 9];                       /* 作答限時（秒）：第 1 關 → 到頂 */
    var KMAX = 3;                               /* 直條的速度倍數最大是幾（±1～±KMAX） */
    var ALIGN_AT = [0.6, 1.0];                  /* 第一次對準的時刻 ＝ 週期 × 這個範圍的隨機數 */
    var PIC = { w: 280, h: 300 };               /* 圖案方框的大小（邏輯 px），h 同時是直條循環的一圈長度 P */
    var MAX_LEVEL = 60;
    /* 「長得像」的字群組：選項優先從同一群挑 */
    var GROUPS = [
        ['日', '目', '自', '白', '百', '旦'], ['未', '末', '朱', '束', '宋'], ['土', '士', '工', '干', '王'], ['天', '夫', '太', '大', '犬', '失'],
        ['木', '本', '禾', '米', '朱'], ['己', '已', '巳', '包'], ['人', '入', '八', '大'], ['刀', '力', '九', '分'], ['千', '干', '于', '午'], ['午', '牛', '生', '手'],
        ['玉', '主', '王', '五', '丑'], ['問', '間', '聞', '閃', '開', '關'], ['河', '湖', '洞', '海', '漢', '清'], ['晴', '睛', '請', '情', '清', '精'], ['田', '由', '甲', '申', '電'],
        ['國', '圍', '園', '圓', '團'], ['買', '賣', '員', '貝', '見'], ['休', '林', '杯', '材', '株'], ['明', '朋', '期', '朝', '胡'], ['鳥', '馬', '烏', '鳴', '島']
    ];
    var CHARS = [];
    GROUPS.forEach(function (g) { g.forEach(function (c) { if (CHARS.indexOf(c) < 0) CHARS.push(c); }); });

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stripsFor(level) { return kit.clamp(Math.round(kit.ramp(level, STRIPS[0], STRIPS[1], RAMP_LEVELS)), STRIPS[0], STRIPS[1]); }
    function optionsFor(level) { return kit.clamp(Math.round(kit.ramp(level, OPTIONS[0], OPTIONS[1], RAMP_LEVELS)), OPTIONS[0], OPTIONS[1]); }
    function cycleFor(level) { return kit.ramp(level, CYCLE_S[0], CYCLE_S[1], RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    /* 第 t 秒，速度倍數 k 的直條往下偏移多少（0～P） */
    function offsetAt(k, t, tAlign, cycle, P) {
        var x = (k * (t - tAlign) / cycle * P) % P;
        return x < 0 ? x + P : x;
    }
    /* 這一刻，所有直條「離完全對準」最遠的是多少（像素，0＝完全對準；偏移 P − x 也算 x，因為循環） */
    function misalign(ks, t, tAlign, cycle, P) {
        var m = 0;
        ks.forEach(function (k) { var o = offsetAt(k, t, tAlign, cycle, P); m = Math.max(m, Math.min(o, P - o)); });
        return m;
    }
    /* 選項：同群的字優先，不夠再從別的群補 */
    function makeOptions(target, count, rand) {
        rand = rand || Math.random;
        var groups = GROUPS.filter(function (g) { return g.indexOf(target) >= 0; });
        var near = [];
        groups.forEach(function (g) { g.forEach(function (c) { if (c !== target && near.indexOf(c) < 0) near.push(c); }); });
        var opts = kit.shuffle(near, rand).slice(0, count - 1);
        if (opts.length < count - 1) {
            var rest = kit.shuffle(CHARS.filter(function (c) { return c !== target && opts.indexOf(c) < 0; }), rand);
            while (opts.length < count - 1) opts.push(rest.shift());
        }
        return kit.shuffle([target].concat(opts), rand);
    }
    /* 出一關：{ ch, options, answer（答案是第幾個選項）, n, ks（每一條的速度倍數）, cycle, tAlign } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = stripsFor(level), ks = [], i;
        for (var tr = 0; tr < 200; tr++) {
            ks = [];
            for (i = 0; i < n; i++) ks.push(kit.randInt(1, KMAX, rand) * (rand() < 0.5 ? -1 : 1));
            var pos = ks.filter(function (k) { return k > 0; }).length, speeds = {};
            ks.forEach(function (k) { speeds[Math.abs(k)] = 1; });
            if (pos > 0 && pos < n && Object.keys(speeds).length >= 2) break;
        }
        var ch = kit.pick(CHARS, rand), options = makeOptions(ch, optionsFor(level), rand), cycle = cycleFor(level);
        return { ch: ch, options: options, answer: options.indexOf(ch), n: n, ks: ks, cycle: cycle, tAlign: cycle * kit.randFloat(ALIGN_AT[0], ALIGN_AT[1], rand) };
    }
    function rating(n) {
        if (n >= 20) return '一眼看穿！';
        if (n >= 12) return '眼力超強！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '等字對準的那一瞬間，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[對準才看得到] 第 ' + level + ' 關：字「' + q.ch + '」，' + q.n + ' 條，速度 ' + q.ks.join(',') + '；週期 ' + q.cycle.toFixed(3) + ' 秒，第一次對準 ' + q.tAlign.toFixed(3) + ' 秒；選項 ' + q.options.join('') + '；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, DPR = 2, cw = PIC.w, ch = PIC.h;
        var cv = h('canvas', { 'class': 'alc-canvas' });
        cv.width = cw * DPR; cv.height = ch * DPR; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
        cv.style.left = Math.round((W - cw) / 2) + 'px'; cv.style.top = '30px';
        stage.appendChild(cv);
        var tip = h('div', { 'class': 'qz-note alc-tip', text: '直條都在上下移動，對準的瞬間字會浮現' });
        stage.appendChild(tip);
        /* 先把整個字畫在看不見的畫布上，之後每一格都從這張「底圖」切直條 */
        var gl = document.createElement('canvas');
        gl.width = cw * DPR; gl.height = ch * DPR;
        var g = gl.getContext('2d');
        g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-ink').trim() || '#4A3B1E';
        g.font = '900 ' + Math.round(ch * 0.84 * DPR) + 'px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(q.ch, gl.width / 2, gl.height / 2 + ch * 0.04 * DPR);
        var ctx = cv.getContext('2d');
        var sw = cw / q.n;
        function draw(t, aligned) {
            ctx.clearRect(0, 0, cv.width, cv.height);
            for (var i = 0; i < q.n; i++) {
                var off = aligned ? 0 : offsetAt(q.ks[i], t, q.tAlign, q.cycle, ch);
                var sx = Math.round(i * sw * DPR), sW = Math.round((i + 1) * sw * DPR) - sx;
                ctx.drawImage(gl, sx, 0, sW, gl.height, sx, Math.round(off * DPR), sW, gl.height);
                ctx.drawImage(gl, sx, 0, sW, gl.height, sx, Math.round((off - ch) * DPR), sW, gl.height);
            }
        }
        var t0 = performance.now();
        draw(0, false);
        var loop = api.my.loop(function () { if (api.over) return false; draw((performance.now() - t0) / 1000, false); });
        var cols = q.options.length <= 5 ? q.options.length : 3;
        var grid = kit.btnGrid(stage, q.options.map(function (c, i) { return { text: c, kind: 'line', cls: 'alc-opt', onTap: function () { judge(i); } }; }), { cols: cols, h: 84, gap: 8 });
        api.timer(timeMs(level), function () { judge(null); });
        if (level === 1 && kit.once('alignchar.hint')) kit.hintOn(stage, grid.btns[q.answer], { mode: 'tap', delay: 800, text: '請點擊你看到的字' });

        function judge(i) {
            if (api.over) return;
            loop.stop(); draw(0, true);
            var ok = i === q.answer;
            grid.btns[q.answer].classList.add('alc-opt--right');
            if (i != null && !ok) grid.btns[i].classList.add('alc-opt--wrong');
            tip.textContent = '這個字是「' + q.ch + '」';
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1300 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2300, lines: [(i == null ? '時間到！' : '選錯了') + '，答案是「' + q.ch + '」', '直條每 ' + q.cycle.toFixed(4) + ' 秒對準一次'] });
        }
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge((q.answer + 1) % q.options.length); };
    }

    var G = {
        id: ID,
        name: '對準才看得到',
        rule: '一個中文字被切成許多直條，每一條都在上下循環移動，速度各不相同。只有在所有直條剛好對準的那一瞬間，整個字才會完整浮現。看出它是哪個字，點下面的選項。選錯或來不及就結束，看你能過幾關。越後面，直條越細、對準得越快！',
        mount: mount,
        score: SCORE,
        test: {
            stripsFor: stripsFor, optionsFor: optionsFor, cycleFor: cycleFor, timeMs: timeMs, offsetAt: offsetAt, misalign: misalign, makeOptions: makeOptions, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, STRIPS: STRIPS, OPTIONS: OPTIONS, CYCLE_S: CYCLE_S, KMAX: KMAX, PIC: PIC, GROUPS: GROUPS, CHARS: CHARS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
