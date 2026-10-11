/* ═══════════════════════════════════════════════════════════════════
   reaction_watchoff.js — 秒反應・哪支錶不準
   三支錶一起走（秒針每秒跳一格），看 15 秒，其中一支走得比較快或比較慢，找出它。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 兩支準的錶每次跳動間隔 1.0000 秒；不準的那支間隔 ＝ 1 ÷ (1 ＋ e)，e 是誤差率（快或慢隨機），
     e 由 ERR[0]（8%）線性降到 ERR[1]（0.5%）：15 秒累積差 1.2000 秒 → 0.0750 秒。
   · 三支錶的跳動相位各自隨機（0～1 秒），秒針起始角度、錶面朝向也不同，不能比較位置，
     要比較的是「跳動的節奏有沒有慢慢滑開」。
   · 秒針位置是時間的純函式：6 度 × floor((t ＋ 相位) ÷ 間隔)，不逐格累加，rAF 暫停也不會錯位。
   · 錶面三種：羅馬數字、無刻度、數字，隨機分配給三支錶。
   · 觀察 OBS_S 秒（按鈕灰色），之後作答限時 ANS_S 10→5 秒。
   · 揭曉：每支錶 15 秒內「秒針走了幾秒」：15.0000／15.0000／15.7500，不準的標紅。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'watchoff';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂（也是最後一關） */
    var ERR = [0.08, 0.005];                    /* 誤差率：第 1 關 → 到頂 */
    var OBS_S = 15;                             /* 觀察秒數 */
    var ANS_S = [10, 5];                        /* 作答限時（秒） */
    var STYLES = ['roman', 'none', 'digits'];
    var NAMES = ['A', 'B', 'C'];
    var SIZE = 140;                             /* 錶面直徑（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function errAt(level) { return kit.ramp(level, ERR[0], ERR[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 出題：回傳 { periods[3], phases[3], odd, e（帶正負：正＝快）, styles[3], rots[3] } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var odd = kit.randInt(0, 2, rand), e = errAt(level) * (rand() < 0.5 ? 1 : -1), periods = [1, 1, 1];
        periods[odd] = 1 / (1 + e);
        return {
            periods: periods, phases: [rand(), rand(), rand()], odd: odd, e: e,
            styles: kit.shuffle(STYLES, rand), rots: [rand() * 360, rand() * 360, rand() * 360]
        };
    }
    /* 秒針角度（度）：t 是經過的秒數；每過一個 period 跳 6 度 */
    function handDeg(period, phase, t) { return (6 * Math.floor((t + phase) / period)) % 360; }
    /* 這支錶在 sec 秒內，秒針走了幾秒（每跳一格算 1 秒） */
    function dialSeconds(period, sec) { return sec / period; }
    function rating(n) {
        if (n >= 20) return '時間感神人！全部通關！';
        if (n >= 14) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '盯著秒針跳動的節奏看，再來一次！';
    }
    /* 錶面 SVG（秒針是 <line id="hand">，由 JS 旋轉） */
    function faceSvg(style) {
        var s = '<svg viewBox="0 0 140 140" width="' + SIZE + '" height="' + SIZE + '" xmlns="http://www.w3.org/2000/svg"><circle cx="70" cy="70" r="66" fill="#FFFDF3" stroke="#4A3B1E" stroke-width="5"/>';
        var i;
        if (style !== 'none') for (i = 0; i < 12; i++) {
            var a = i * 30 * Math.PI / 180, r1 = i % 3 === 0 ? 52 : 57, r2 = 62;
            s += '<line x1="' + (70 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (70 - r1 * Math.cos(a)).toFixed(1) + '" x2="' + (70 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (70 - r2 * Math.cos(a)).toFixed(1) + '" stroke="#4A3B1E" stroke-width="' + (i % 3 === 0 ? 4 : 2) + '"/>';
        }
        var nums = style === 'roman' ? ['XII', 'III', 'VI', 'IX'] : (style === 'digits' ? ['12', '3', '6', '9'] : []);
        var pos = [[70, 36], [104, 76], [70, 116], [36, 76]];
        nums.forEach(function (t, k) { s += '<text x="' + pos[k][0] + '" y="' + pos[k][1] + '" text-anchor="middle" font-size="16" font-weight="900" fill="#4A3B1E" font-family="Noto Serif TC, serif">' + t + '</text>'; });
        s += '<line x1="70" y1="70" x2="70" y2="12" stroke="#D46F3C" stroke-width="3.5" stroke-linecap="round" class="wo-hand"/><circle cx="70" cy="70" r="5" fill="#4A3B1E"/></svg>';
        return s;
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: RAMP_LEVELS, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, W = stage.clientWidth || 472;
        var q = makeLevel(level, api.rand), t0 = performance.now(), canAnswer = false, done = false;
        api.info = q;
        console.log('[哪支錶不準] 第 ' + level + ' 關：不準的是錶 ' + NAMES[q.odd] + '（誤差 ' + (q.e * 100).toFixed(3) + '%，' + (q.e > 0 ? '偏快' : '偏慢') + '）；錶面 ' + q.styles.join('/') + '；作答限時 ' + ansMs(level) + ' ms');

        var tip = h('div', { 'class': 'wo-tip', text: '三支錶一起走，其中一支走得比較快或比較慢' });
        var obs = h('div', { 'class': 'wo-obs', text: '觀察中 0 / ' + OBS_S + ' 秒' });
        var info = h('div', { 'class': 'wo-info' });
        stage.appendChild(tip); stage.appendChild(obs);
        var gap = Math.floor((W - 3 * SIZE) / 4);
        var faces = q.styles.map(function (st, i) {
            var el = h('div', { 'class': 'wo-face' }, [h('div', { 'class': 'wo-dial', html: faceSvg(st) }), h('div', { 'class': 'wo-name', text: NAMES[i] })]);
            el.style.left = (gap + i * (SIZE + gap)) + 'px';
            el.firstChild.style.transform = 'rotate(' + q.rots[i].toFixed(1) + 'deg)';
            stage.appendChild(el);
            return el;
        });
        var hands = faces.map(function (f) { return f.querySelector('.wo-hand'); });
        stage.appendChild(info);
        function frame() {
            var sec = (performance.now() - t0) / 1000;
            hands.forEach(function (hd, i) { hd.setAttribute('transform', 'rotate(' + handDeg(q.periods[i], q.phases[i], sec).toFixed(1) + ' 70 70)'); });
            if (!canAnswer && !done) obs.textContent = '觀察中 ' + Math.min(OBS_S, Math.floor(sec)) + ' / ' + OBS_S + ' 秒';
        }
        frame();
        api.my.loop(function () { if (api.over) return false; frame(); });
        var btns = NAMES.map(function (n, i) {
            var b = h('button', { 'class': 'btn btn--line', text: '選 ' + n });
            b.disabled = true;
            kit.onTap(b, function () { if (canAnswer) choose(i); });
            return b;
        });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, btns));
        api.after(OBS_S * 1000, function () {
            canAnswer = true; obs.textContent = '哪一支走得不準？';
            btns.forEach(function (b) { b.disabled = false; });
            api.timer(ansMs(level), function () { choose(-1); });
            Sfx.play('go');
        });

        function choose(i) {
            if (api.over || done) return;
            done = true;
            var sec = Math.max(OBS_S, (performance.now() - t0) / 1000), lines = [];
            faces.forEach(function (f, k) {
                var ds = dialSeconds(q.periods[k], OBS_S);
                f.classList.toggle('wo-face--odd', k === q.odd);
                if (k === i && k !== q.odd) f.classList.add('wo-face--bad');
                f.appendChild(h('div', { 'class': 'wo-sec', text: ds.toFixed(4) + ' 秒' }));
                lines.push('錶 ' + NAMES[k] + '：' + OBS_S + ' 秒內秒針走了 ' + ds.toFixed(4) + ' 秒' + (k === q.odd ? '（' + (q.e > 0 ? '偏快' : '偏慢') + ' ' + Math.abs(q.e * 100).toFixed(4) + '%）' : ''));
            });
            info.textContent = '不準的是錶 ' + NAMES[q.odd] + '，' + (q.e > 0 ? '偏快' : '偏慢') + ' ' + Math.abs(q.e * 100).toFixed(4) + '%';
            if (i === q.odd) api.pass({ delay: 1700 });
            else api.fail({ delay: 2400, lines: [(i < 0 ? '時間到！' : '選錯了！') + '不準的是錶 ' + NAMES[q.odd]].concat(lines) });
        }
        api.solve = function () { choose(q.odd); };
        api.wrong = function () { choose((q.odd + 1) % 3); };
    }

    var G = {
        id: ID,
        name: '哪支錶不準',
        rule: '三支錶一起走，秒針每秒跳一格。看 15 秒，其中一支走得比較快或比較慢，看完後**選出不準的那一支**。三支錶的秒針位置和錶面朝向都不一樣，要看的是**跳動的節奏有沒有慢慢滑開**。答錯或來不及就結束。',
        mount: mount,
        score: SCORE,
        test: { errAt: errAt, ansMs: ansMs, makeLevel: makeLevel, handDeg: handDeg, dialSeconds: dialSeconds, faceSvg: faceSvg, rating: rating, RAMP_LEVELS: RAMP_LEVELS, ERR: ERR, OBS_S: OBS_S, STYLES: STYLES }
    };
    Reaction.register(G);
})();
