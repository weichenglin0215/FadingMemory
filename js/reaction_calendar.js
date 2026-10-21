/* ═══════════════════════════════════════════════════════════════════
   reaction_calendar.js — 秒反應・記行事曆（企劃 318）
   一個月的月曆，上面貼了幾個小圖示（牙醫、生日蛋糕、回診、繳費單…），3 秒後圖示消失。**問：「牙醫是哪一天？」點月曆上的日期**。
   ───────────────────────────────────────────────────────────────────
   · 月曆是真的：用真正的曆法排（monthLayout：這個月第一天是星期幾、有幾天、要幾列），每一關換不同的年月，所以「第一天是星期幾」每次不一樣。
   · 圖示（ICONS）有長得像的：牙醫的「牙齒」vs 回診的「醫院」、生日蛋糕 vs 喜餅……出題時，越後面越常把「長得像的一對」同時貼在月曆上（PAIR_P）。
   · 難度（線性）：圖示 2 → 8 個（ICONS_N）、看的時間 3 → 2 秒（VIEW_S）、問的題數 1 題（第 TWO_FROM 關起 2 題：「先點牙醫、再點繳費」）、
     每題作答 12 → 6 秒（RESP_S）。
   · 答錯時圖示全部回來，你點的那一天打紅圈、正確的那天打綠圈。
   · V1.36.0 玩家意見（圖示一消失問題就出現，兩者連在一起，太容易）：圖示消失之後，**先在下方的問題列上讓圖示持續出現、交錯在隨機位置、持續閃爍 DISTRACT_S 秒（故意干擾）**，
     才出現問題。干擾的圖示就是這一關貼在月曆上的那些（每個出現 NOISE_COPIES 次、位置每 MOVE_MS 毫秒重新亂排、各自用不同的速度閃爍），
     所以腦中剛記住的「哪個圖示在哪一天」會被一堆閃爍的同樣圖案沖淡；問題出現之後才開始算作答時間。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'calendar';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var ICONS_N = [2, 8];                       /* 月曆上貼幾個圖示：第 1 關 → 到頂 */
    var VIEW_S = [3, 2];                        /* 看月曆的時間（秒）：第 1 關 → 到頂 */
    var RESP_S = [12, 6];                       /* 每一題作答的時間（秒）：第 1 關 → 到頂 */
    var TWO_FROM = 6;                           /* 第幾關起問兩題（先點 A、再點 B） */
    var PAIR_P = [0.2, 0.9];                    /* 把「長得像的一對」同時貼上去的機率：第 1 關 → 到頂 */
    var YEARS = [2025, 2031];
    var DISTRACT_S = 2;                         /* 圖示消失之後、問題出現之前，下方問題列上的干擾圖示閃爍幾秒 */
    var NOISE_COPIES = 2;                       /* 每個圖示在干擾裡出現幾個 */
    var NOISE_SIZE = 46;                        /* 干擾圖示的大小（px） */
    var NOISE_H = 96;                           /* 干擾區（問題列）的高度（px） */
    var MOVE_MS = 380;                          /* 干擾圖示每隔多久重新亂排一次位置（毫秒） */
    var BLINK_MS = [150, 420];                  /* 每個干擾圖示一明一暗的週期（毫秒，各自隨機） */
    var MAX_LEVEL = 90;
    var ICONS = [                               /* 圖示：id、名字、長得像的夥伴 */
        { id: 'tooth', name: '牙醫', pair: 'hospital' }, { id: 'hospital', name: '回診', pair: 'tooth' },
        { id: 'cake', name: '生日蛋糕', pair: 'box' }, { id: 'box', name: '喜餅', pair: 'cake' },
        { id: 'bill', name: '繳費單', pair: null }, { id: 'scissors', name: '剪頭髮', pair: null }, { id: 'briefcase', name: '開會', pair: null },
        { id: 'bowl', name: '聚餐', pair: null }, { id: 'ball', name: '打球', pair: null }, { id: 'plane', name: '旅行', pair: null }
    ];
    var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function iconsFor(level) { return Math.round(ramp(level, ICONS_N)); }
    function viewMs(level) { return Math.round(ramp(level, VIEW_S) * 1000); }
    function respMs(level) { return Math.round(ramp(level, RESP_S) * 1000); }
    function asksFor(level) { return level >= TWO_FROM ? 2 : 1; }
    function pairPFor(level) { return ramp(level, PAIR_P); }
    function iconOf(id) { for (var i = 0; i < ICONS.length; i++) if (ICONS[i].id === id) return ICONS[i]; return null; }
    /* 某年某月（month 是 1～12）的月曆：{ first（1 號是星期幾，日＝0）, days, rows（要排幾列）} */
    function monthLayout(year, month) {
        var first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(), days = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return { first: first, days: days, rows: Math.ceil((first + days) / 7) };
    }
    /* 出一關：{ year, month, first, days, rows, placements（[{ icon, day }]）, asks（要問的圖示 id，依序）, viewMs, respMs, level }
       圖示貼在不同的日子；越後面越常同時貼上「長得像的一對」，而且被問的常常是那一對裡的一個（最容易搞混）。 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var year = kit.randInt(YEARS[0], YEARS[1], rand), month = kit.randInt(1, 12, rand), lay = monthLayout(year, month), n = iconsFor(level);
        var pool = kit.shuffle(ICONS.map(function (ic) { return ic.id; }), rand), chosen = [];
        if (rand() < pairPFor(level)) {                                           /* 先放一對長得像的 */
            var pr = kit.pick([['tooth', 'hospital'], ['cake', 'box']], rand); pr.forEach(function (id) { if (chosen.length < n) chosen.push(id); });
        }
        pool.forEach(function (id) { if (chosen.length < n && chosen.indexOf(id) < 0) chosen.push(id); });
        var days = kit.shuffle(Array.apply(null, { length: lay.days }).map(function (x, i) { return i + 1; }), rand).slice(0, chosen.length);
        var placements = chosen.map(function (id, i) { return { icon: id, day: days[i] }; });
        var cand = chosen.filter(function (id) { var p = iconOf(id).pair; return p && chosen.indexOf(p) >= 0; });                  /* 有夥伴一起出現的圖示（容易混） */
        var asks = [], want = Math.min(asksFor(level), chosen.length);
        if (cand.length && rand() < 0.8) asks.push(kit.pick(cand, rand));
        kit.shuffle(chosen.slice(), rand).forEach(function (id) { if (asks.length < want && asks.indexOf(id) < 0) asks.push(id); });
        return { year: year, month: month, first: lay.first, days: lay.days, rows: lay.rows, placements: placements, asks: asks, viewMs: viewMs(level), respMs: respMs(level), level: level };
    }
    /* 干擾圖示的位置：count 個，每個的左上角落在 width×height 的方框裡（圖示大小 size，不會超出方框）；回傳 [{ x, y }] */
    function noiseSpots(count, width, height, size, rand) {
        rand = rand || Math.random;
        var out = [];
        for (var i = 0; i < count; i++) out.push({ x: kit.randInt(0, Math.max(0, width - size), rand), y: kit.randInt(0, Math.max(0, height - size), rand) });
        return out;
    }
    function dayOf(q, icon) { for (var i = 0; i < q.placements.length; i++) if (q.placements[i].icon === icon) return q.placements[i].day; return -1; }
    function rating(n) {
        if (n >= 15) return '行事曆管家！';
        if (n >= 10) return '記性很好！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '用星期幾和第幾週來幫助記憶！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'cld-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 圖示（手繪貼紙風格，SVG 圖形；viewBox 0 0 48 48） */
    var SHAPES = {
        tooth: [['path', { d: 'M24 12 C16 6 8 10 9 20 C10 28 14 30 14 40 C14 44 18 44 19 38 C20 34 22 32 24 32 C26 32 28 34 29 38 C30 44 34 44 34 40 C34 30 38 28 39 20 C40 10 32 6 24 12 Z' }, 'fill'], ['path', { d: 'M16 16 Q19 13 22 15' }, 'line']],
        hospital: [['rect', { x: 8, y: 8, width: 32, height: 34, rx: 4 }, 'fill'], ['path', { d: 'M21 16 L27 16 L27 21 L32 21 L32 27 L27 27 L27 32 L21 32 L21 27 L16 27 L16 21 L21 21 Z' }, 'red']],
        cake: [['rect', { x: 8, y: 26, width: 32, height: 14, rx: 3 }, 'fill'], ['rect', { x: 12, y: 16, width: 24, height: 12, rx: 3 }, 'fill2'], ['rect', { x: 22.5, y: 6, width: 3, height: 10, rx: 1 }, 'line'], ['path', { d: 'M24 2 Q27 6 24 7 Q21 6 24 2 Z' }, 'red']],
        box: [['rect', { x: 8, y: 20, width: 32, height: 20, rx: 3 }, 'fill'], ['rect', { x: 6, y: 14, width: 36, height: 8, rx: 3 }, 'fill2'], ['path', { d: 'M24 14 L24 40 M8 30 L40 30' }, 'line'], ['path', { d: 'M24 14 Q16 4 14 10 Q14 15 24 14 Q34 15 34 10 Q32 4 24 14 Z' }, 'red']],
        bill: [['path', { d: 'M10 6 L34 6 L40 12 L40 42 L10 42 Z' }, 'fill'], ['path', { d: 'M34 6 L34 12 L40 12' }, 'line'], ['path', { d: 'M16 20 L34 20 M16 27 L34 27 M16 34 L28 34' }, 'line']],
        scissors: [['circle', { cx: 14, cy: 36, r: 6 }, 'fill'], ['circle', { cx: 34, cy: 36, r: 6 }, 'fill'], ['path', { d: 'M18 31 L38 8 M30 31 L10 8' }, 'line']],
        briefcase: [['rect', { x: 6, y: 16, width: 36, height: 24, rx: 4 }, 'fill'], ['path', { d: 'M17 16 L17 11 Q17 8 20 8 L28 8 Q31 8 31 11 L31 16 M6 27 L42 27' }, 'line']],
        bowl: [['path', { d: 'M6 22 L42 22 Q40 40 24 40 Q8 40 6 22 Z' }, 'fill'], ['path', { d: 'M14 16 L30 6 M20 17 L36 7' }, 'line']],
        ball: [['circle', { cx: 24, cy: 24, r: 17 }, 'fill'], ['path', { d: 'M24 7 Q14 24 24 41 M24 7 Q34 24 24 41 M7 24 L41 24' }, 'line']],
        plane: [['path', { d: 'M6 28 L42 18 L40 24 L26 28 L22 40 L18 38 L20 28 L10 31 Z' }, 'fill']]
    };
    function iconSvg(id, size) {
        var s = kit.svg('svg', { 'class': 'cld-icon cld-icon--' + id, viewBox: '0 0 48 48', width: size, height: size });
        (SHAPES[id] || []).forEach(function (sp) { var a = Object.assign({}, sp[1]); a['class'] = 'cld-s cld-s--' + sp[2]; kit.svg(sp[0], a, s); });
        return s;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[記行事曆] 第 ' + level + ' 關：' + q.year + ' 年 ' + q.month + ' 月（1 號是星期' + WEEK[q.first] + '，' + q.days + ' 天）；圖示 ' + q.placements.map(function (p) { return iconOf(p.icon).name + '＠' + p.day; }).join('、') + '；問 ' + q.asks.map(function (a) { return iconOf(a).name; }).join('→') + '；看 ' + q.viewMs + ' 毫秒');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'cld-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note cld-tip', text: '記住貼紙貼在哪一天' });
        field.appendChild(tip);
        /* 月曆：標題（年月）、星期列、日期格 */
        var cw = Math.floor((W - 24) / 7), rh = Math.min(cw + 2, Math.floor((H - 330) / q.rows)), CW = cw * 7;
        var cal = h('div', { 'class': 'cld-cal' });
        cal.style.cssText = 'left:' + Math.round((W - CW) / 2) + 'px;top:60px;width:' + CW + 'px;';
        cal.appendChild(h('div', { 'class': 'cld-title', text: q.year + ' 年 ' + q.month + ' 月' }));
        var head = h('div', { 'class': 'cld-week' }); WEEK.forEach(function (w, i) { head.appendChild(h('div', { 'class': 'cld-wd' + (i === 0 || i === 6 ? ' cld-wd--we' : ''), text: w })); }); cal.appendChild(head);
        var grid = h('div', { 'class': 'cld-grid' }); grid.style.gridTemplateColumns = 'repeat(7, ' + cw + 'px)'; grid.style.gridAutoRows = rh + 'px';
        var cells = {};
        for (var b = 0; b < q.first; b++) grid.appendChild(h('div', { 'class': 'cld-cell cld-cell--blank' }));
        for (var d = 1; d <= q.days; d++) {
            var wd = (q.first + d - 1) % 7, cell = h('div', { 'class': 'cld-cell' + (wd === 0 || wd === 6 ? ' cld-cell--we' : '') });
            cell.appendChild(h('div', { 'class': 'cld-no', text: String(d) })); grid.appendChild(cell); cells[d] = cell;
            (function (day) { kit.onTap(cell, function () { tapDay(day); }); })(d);
        }
        cal.appendChild(grid); field.appendChild(cal);
        var calH = 60 + 48 + 40 + q.rows * rh;
        var ask = h('div', { 'class': 'cld-ask', text: '' }); ask.style.top = (calH + 24) + 'px'; field.appendChild(ask);
        var info = h('div', { 'class': 'qz-note cld-info', text: '' }); info.style.top = (calH + 84) + 'px'; field.appendChild(info);

        /* 貼紙：貼在日期格裡（看的時候顯示，之後收起來；答錯時全部回來） */
        var stickers = q.placements.map(function (p) {
            var s = h('div', { 'class': 'cld-sticker' }); s.style.width = s.style.height = Math.min(cw - 6, rh - 14) + 'px';
            s.appendChild(iconSvg(p.icon, Math.min(cw - 6, rh - 14))); cells[p.day].appendChild(s); return s;
        });
        var phase = 'view', k = 0, done = false;
        info.textContent = '看 ' + Math.round(q.viewMs / 1000) + ' 秒';
        api.timer(q.viewMs, hide);
        function hide() {
            if (api.over) return;
            stickers.forEach(function (s) { s.classList.add('cld-sticker--hide'); });
            phase = 'distract'; tip.textContent = '圖案收起來了，別被閃爍的圖案干擾'; info.textContent = '';
            startNoise();
            api.after(DISTRACT_S * 1000, function () {
                if (api.over) return;
                stopNoise(); phase = 'ask'; tip.textContent = '點出日期'; nextAsk();                    /* 干擾結束，問題才出現（作答時間從這時候才開始算） */
            });
        }
        /* 干擾：問題列上，這一關的圖示（每個 NOISE_COPIES 個）一直閃爍、每 MOVE_MS 毫秒換一批隨機位置 */
        var noise = null, noiseEls = [];
        function startNoise() {
            noise = h('div', { 'class': 'cld-noise' }); noise.style.top = (calH + 24) + 'px'; noise.style.height = NOISE_H + 'px';
            field.appendChild(noise);
            q.placements.forEach(function (p) {
                for (var c = 0; c < NOISE_COPIES; c++) {
                    var el = h('div', { 'class': 'cld-noise__i' }); el.appendChild(iconSvg(p.icon, NOISE_SIZE));
                    el.style.animationDuration = Math.round(kit.randFloat(BLINK_MS[0], BLINK_MS[1], api.rand)) + 'ms';
                    el.style.animationDelay = '-' + Math.round(kit.randFloat(0, BLINK_MS[1], api.rand)) + 'ms';
                    noise.appendChild(el); noiseEls.push(el);
                }
            });
            relocate();
        }
        function relocate() {
            if (phase !== 'distract' || !noise) return;
            var spots = noiseSpots(noiseEls.length, W, NOISE_H, NOISE_SIZE, api.rand);
            noiseEls.forEach(function (el, i) { el.style.left = spots[i].x + 'px'; el.style.top = spots[i].y + 'px'; });
            api.after(MOVE_MS, relocate);
        }
        function stopNoise() { if (noise && noise.parentNode) noise.parentNode.removeChild(noise); noise = null; noiseEls = []; }
        function nextAsk() {
            var ic = iconOf(q.asks[k]);
            ask.innerHTML = ''; ask.appendChild(iconSvg(ic.id, 56)); ask.appendChild(h('span', { 'class': 'cld-ask__t', text: (q.asks.length > 1 ? (k === 0 ? '先點：' : '再點：') : '') + ic.name + '是哪一天？' }));
            api.timer(q.respMs, function () { timeout(); });
            if (level === 1 && k === 0 && kit.once('calendar.hint')) kit.hintOn(stage, cells[dayOf(q, q.asks[0])], { mode: 'tap', delay: 1500, text: '請點出那一天' });
        }
        function revealAll(pickDay) {
            stickers.forEach(function (s) { s.classList.remove('cld-sticker--hide'); });
            var want = dayOf(q, q.asks[k]);
            cells[want].classList.add('cld-cell--ok');
            if (pickDay > 0 && pickDay !== want) cells[pickDay].classList.add('cld-cell--bad');
        }
        function tapDay(day) {
            if (phase !== 'ask' || done || api.over) return;
            var want = dayOf(q, q.asks[k]);
            if (day === want) {
                cells[day].classList.add('cld-cell--ok'); Sfx.play('ok'); k++;
                if (k >= q.asks.length) { done = true; phase = 'end'; stickers.forEach(function (s) { s.classList.remove('cld-sticker--hide'); }); info.textContent = '答對了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1600 }); return; }
                api.stopTimer(); api.after(400, function () { cells[day].classList.remove('cld-cell--ok'); }); nextAsk(); return;
            }
            done = true; phase = 'end'; api.stopTimer();
            revealAll(day);
            var ic = iconOf(q.asks[k]);
            info.textContent = ic.name + '是 ' + want + ' 號（綠圈），你點了 ' + day + ' 號（紅圈）';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3400, lines: [ic.name + '是 ' + q.month + ' 月 ' + want + ' 號（星期' + WEEK[(q.first + want - 1) % 7] + '）', '你點了 ' + day + ' 號'] });
        }
        function timeout() {
            if (done || api.over || phase !== 'ask') return;
            done = true; phase = 'end'; revealAll(-1);
            var ic = iconOf(q.asks[k]), want = dayOf(q, q.asks[k]);
            info.textContent = '時間到！' + ic.name + '是 ' + want + ' 號';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3200, lines: ['時間到！', ic.name + '是 ' + q.month + ' 月 ' + want + ' 號'] });
        }
        api.solve = function () { if (phase === 'ask' && !done) tapDay(dayOf(q, q.asks[k])); };
        api.wrong = function () { if (phase !== 'ask' || done) return; var want = dayOf(q, q.asks[k]); tapDay(want === q.days ? 1 : want + 1); };
    }

    var G = {
        id: ID,
        name: '記行事曆',
        rule: '一個月的月曆，上面貼了幾張小貼紙（牙醫、生日蛋糕、回診、繳費單…）。**3 秒後貼紙會消失**，但下方會有一堆**同樣的圖案亂跳、一直閃爍 2 秒**來干擾你，然後才問你：「**牙醫是哪一天？**」點月曆上的日期。小心：貼紙有長得像的（牙醫的牙齒和回診的醫院、生日蛋糕和喜餅），後面還會**連問兩題**（先點哪個、再點哪個），每個月的第一天是星期幾也不一樣。可以用「星期幾」「第幾週」幫助記憶。答錯或來不及就結束，看你能過幾關。越後面，貼紙越多、看的時間越短！',
        mount: mount,
        score: SCORE,
        test: {
            iconsFor: iconsFor, viewMs: viewMs, respMs: respMs, asksFor: asksFor, pairPFor: pairPFor, iconOf: iconOf, monthLayout: monthLayout, noiseSpots: noiseSpots, makeLevel: makeLevel, dayOf: dayOf, iconSvg: iconSvg, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ICONS_N: ICONS_N, VIEW_S: VIEW_S, RESP_S: RESP_S, TWO_FROM: TWO_FROM, PAIR_P: PAIR_P, YEARS: YEARS, DISTRACT_S: DISTRACT_S, NOISE_COPIES: NOISE_COPIES, NOISE_SIZE: NOISE_SIZE, NOISE_H: NOISE_H, MOVE_MS: MOVE_MS, BLINK_MS: BLINK_MS, ICONS: ICONS, SHAPES: SHAPES, WEEK: WEEK, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
