/* ═══════════════════════════════════════════════════════════════════
   reaction_passersby.js — 秒反應・路人走過
   幾個人不等間距地從畫面「右邊」走進來、從「左邊」走出去；有顏色變化的衣物（帽子、衣服、褲子、鞋子）都是七種顏色
   （紅橙黃綠藍紫粉紅）之一。人都走完之後出現題目：「第 X 個人的〔衣服〕是什麼顏色？」，
   從 7 個色塊（附文字名稱）選一個。關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · V1.28（玩家意見）：人改成從右邊走進來、左邊走出去；人物尺寸 150%（寬 105、高 240）；揭曉的畫面停 3 秒（REVEAL_MS）才跳結算；
     難度慢慢增加：第 1 關只有 2 個人、身上只有 2 件衣物的顏色有變化（其餘衣物大家都是同一種灰色），
     之後每隔 3 關多 1 個人（peopleAt）、每隔 2 關多 1 件有顏色變化的衣物（partsFor，最多 4 件）。
   · 同一個人身上有變化的衣物顏色互不相同；不同人之間可以重複（增加混淆）。
   · 走路速度 SPEED 150→400 px/秒、平均進場間隔 GAP 1.4→0.5 秒（每個間隔再乘 0.6～1.4 的隨機倍率）、
     作答限時 ANS 8→4 秒（線性，RAMP_LEVELS 關走完）。
   · 問的部位：只會問「有顏色變化」的衣物（衣服、帽子、褲子、鞋子，依這個順序加入）。
   · 兩個人之間至少隔 MIN_SPACE px，不會重疊。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'passersby';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 15;                       /* 幾關之後難度到頂（也是最後一關） */
    var SPEED = [150, 400];                     /* 走路速度（px／秒） */
    var GAP = [1.4, 0.5];                       /* 平均進場間隔（秒） */
    var ANS_S = [8, 4];                         /* 作答限時（秒） */
    var JITTER = [0.6, 1.4];                    /* 間隔的隨機倍率 */
    var PW = 105, PH = 240, MIN_SPACE = 120;    /* 人的寬度、高度（px；V1.27 放大成 150%）、兩人最小距離 */
    var PEOPLE0 = 2, PEOPLE_STEP = 3, PEOPLE_MAX = 8;     /* 第 1 關的人數、每隔幾關多 1 個人、最多幾個人 */
    var PARTS0 = 2, PARTS_STEP = 2;             /* 第 1 關有顏色變化的衣物件數、每隔幾關多 1 件 */
    var REVEAL_MS = 3000;                       /* 答錯時，揭曉畫面停多久才跳結算（讓玩家看清楚） */
    var NEUTRAL = '#B8B2A3';                    /* 沒有顏色變化的衣物，大家都是這個灰色 */
    var COLORS = [
        { name: '紅', hex: '#D9423A' }, { name: '橙', hex: '#F0892B' }, { name: '黃', hex: '#EAC12B' }, { name: '綠', hex: '#4C9A5B' },
        { name: '藍', hex: '#3E86C4' }, { name: '紫', hex: '#8A5CC4' }, { name: '粉紅', hex: '#EE86B4' }
    ];
    var PARTS = ['hat', 'shirt', 'pants', 'shoes'];
    var VARY_ORDER = ['shirt', 'hat', 'pants', 'shoes'];      /* 有顏色變化的衣物，依這個順序加入 */
    var PART_NAME = { hat: '帽子', shirt: '衣服', pants: '褲子', shoes: '鞋子' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function speedAt(level) { return kit.ramp(level, SPEED[0], SPEED[1], RAMP_LEVELS); }
    function gapAt(level) { return kit.ramp(level, GAP[0], GAP[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 第 level 關有幾個人：第 1 關 2 人，每隔 3 關多 1 人 */
    function peopleAt(level) { return Math.min(PEOPLE_MAX, PEOPLE0 + Math.floor((level - 1) / PEOPLE_STEP)); }
    /* 第 level 關有顏色變化（也是會被問到）的衣物：第 1 關 2 件，每隔 2 關多 1 件，最多 4 件 */
    function partsFor(level) { return VARY_ORDER.slice(0, Math.min(PARTS.length, PARTS0 + Math.floor((level - 1) / PARTS_STEP))); }
    /* 出題：回傳 { people: [{hat, shirt, pants, shoes（顏色索引；沒有顏色變化的衣物是 −1＝灰色）, t（進場時間，秒）}], who（1～人數）, part, answer（顏色索引）, duration（全部走完的秒數）, W } */
    function makeLevel(level, rand, W) {
        rand = rand || Math.random; W = W || 472;
        var sp = speedAt(level), gap = gapAt(level), people = [], t = 0, n = peopleAt(level), vary = partsFor(level);
        for (var i = 0; i < n; i++) {
            var cols = kit.shuffle([0, 1, 2, 3, 4, 5, 6], rand), p = { hat: -1, shirt: -1, pants: -1, shoes: -1, t: 0 };
            vary.forEach(function (k, j) { p[k] = cols[j]; });
            if (i > 0) t += Math.max(MIN_SPACE / sp, gap * kit.randFloat(JITTER[0], JITTER[1], rand));
            p.t = t; people.push(p);
        }
        var who = kit.randInt(1, n, rand), part = kit.pick(vary, rand);
        return { people: people, who: who, part: part, answer: people[who - 1][part], duration: people[n - 1].t + (W + PW) / sp, speed: sp, W: W };
    }
    /* 第 i 個人在時刻 sec（秒）的 x 座標（左緣）：從畫面右邊外面（x ＝ W）走進來，往左走，走到 x ＝ −PW 就完全離開畫面 */
    function xAt(q, i, sec) { return q.W - q.speed * (sec - q.people[i].t); }
    function question(q) { return '第 ' + q.who + ' 個人的' + PART_NAME[q.part] + '是什麼顏色？'; }
    function rating(n) {
        if (n >= 15) return '過目不忘！全部通關！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看仔細一點，再來一次！';
    }
    /* 一個小人的 SVG（70×160）：帽子、頭、衣服、褲子、鞋子各一種顏色 */
    function personSvg(p, hi) {
        var c = function (k) { return p[k] < 0 ? NEUTRAL : COLORS[p[k]].hex; };
        var ring = function (k) { return hi === k ? ' stroke="#4A3B1E" stroke-width="5" stroke-dasharray="6 4"' : ' stroke="#4A3B1E" stroke-width="2.5"'; };
        return '<svg viewBox="0 0 70 160" width="' + PW + '" height="' + PH + '" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="16" y="6" width="38" height="16" rx="6" fill="' + c('hat') + '"' + ring('hat') + '/><rect x="10" y="20" width="50" height="6" rx="3" fill="' + c('hat') + '"' + ring('hat') + '/>' +
            '<circle cx="35" cy="38" r="13" fill="#F2D3B0" stroke="#4A3B1E" stroke-width="2.5"/>' +
            '<rect x="14" y="54" width="42" height="46" rx="10" fill="' + c('shirt') + '"' + ring('shirt') + '/>' +
            '<rect x="16" y="98" width="17" height="42" rx="5" fill="' + c('pants') + '"' + ring('pants') + '/><rect x="37" y="98" width="17" height="42" rx="5" fill="' + c('pants') + '"' + ring('pants') + '/>' +
            '<ellipse cx="24" cy="146" rx="12" ry="7" fill="' + c('shoes') + '"' + ring('shoes') + '/><ellipse cx="46" cy="146" rx="12" ry="7" fill="' + c('shoes') + '"' + ring('shoes') + '/></svg>';
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
        var q = makeLevel(level, api.rand, W), phase = 'walk', t0 = performance.now();
        api.info = q;
        console.log('[路人走過] 第 ' + level + ' 關：' + question(q) + ' 答案 ' + COLORS[q.answer].name + '；速度 ' + q.speed.toFixed(1) + ' px/秒；走完 ' + q.duration.toFixed(2) + ' 秒；' + q.people.length + ' 人：' + q.people.map(function (p) { return PARTS.map(function (k) { return p[k] < 0 ? '灰' : COLORS[p[k]].name; }).join('/'); }).join(' | '));

        var tip = h('div', { 'class': 'psb-tip', text: '看清楚每個人的穿著，有幾件衣物顏色不一樣' });
        stage.appendChild(tip);
        var els = q.people.map(function (p) {
            var el = h('div', { 'class': 'psb-person', html: personSvg(p) });
            el.style.transform = 'translateX(' + (W + 10) + 'px)';                 /* 一開始都在畫面右邊外面 */
            stage.appendChild(el);
            return el;
        });
        var loop = api.my.loop(function () {
            if (phase !== 'walk' || api.over) return false;
            var sec = (performance.now() - t0) / 1000;
            els.forEach(function (el, i) { el.style.transform = 'translateX(' + xAt(q, i, sec).toFixed(1) + 'px)'; });
        });
        api.after(Math.round(q.duration * 1000) + 120, ask);

        var btns = [];
        function ask() {
            if (phase !== 'walk') return;
            phase = 'ask'; loop.stop();
            els.forEach(function (el) { el.style.display = 'none'; });
            tip.textContent = question(q); tip.classList.add('psb-tip--ask');
            btns = COLORS.map(function (c, i) {
                var b = h('button', { 'class': 'btn btn--line psb-opt' }, [h('span', { 'class': 'psb-sw' }), h('span', { text: c.name })]);
                b.firstChild.style.background = c.hex;
                kit.onTap(b, function () { judge(i); });
                return b;
            });
            var row1 = h('div', { 'class': 'psb-row' }, btns.slice(0, 4)), row2 = h('div', { 'class': 'psb-row' }, btns.slice(4));
            stage.appendChild(h('div', { 'class': 'psb-opts' }, [row1, row2]));
            api.timer(ansMs(level), function () { judge(-1); });
            Sfx.play('go');
        }
        function judge(i) {
            if (api.over || phase !== 'ask') return;
            phase = 'done';
            btns.forEach(function (b, k) { if (k === q.answer) b.classList.add('psb-opt--ok'); else if (k === i) b.classList.add('psb-opt--bad'); });
            /* 揭曉：5 個人站成一排，被問的那一件用虛線框起來 */
            var lineup = h('div', { 'class': 'psb-lineup' });
            q.people.forEach(function (p, k) {
                var cell = h('div', { 'class': 'psb-cell' + (k === q.who - 1 ? ' psb-cell--ask' : ''), html: personSvg(p, k === q.who - 1 ? q.part : null) });
                cell.appendChild(h('div', { 'class': 'psb-no', text: String(k + 1) }));
                lineup.appendChild(cell);
            });
            stage.appendChild(lineup);
            tip.textContent = '第 ' + q.who + ' 個人的' + PART_NAME[q.part] + '是' + COLORS[q.answer].name + '色';
            if (i === q.answer) api.pass({ delay: 1300 });
            else api.fail({ delay: REVEAL_MS, lines: [
                (i < 0 ? '時間到！' : '答錯了：你選「' + COLORS[i].name + '」，') + '第 ' + q.who + ' 個人的' + PART_NAME[q.part] + '是「' + COLORS[q.answer].name + '」',
                q.people.length + ' 個人（先進場的在前）的' + PART_NAME[q.part] + '：' + q.people.map(function (p) { return COLORS[p[q.part]].name; }).join('、')
            ] });
        }
        api.solve = function () { if (phase === 'walk') ask(); judge(q.answer); };
        api.wrong = function () { if (phase === 'walk') ask(); judge((q.answer + 1) % COLORS.length); };
    }

    var G = {
        id: ID,
        name: '路人走過',
        rule: '幾個人會從畫面右邊走進來、左邊走出去，**他們身上有幾件衣物的顏色不一樣**，其他衣物都是灰色。他們走完之後，會問你**「第幾個人的哪一件是什麼顏色」**。答錯或來不及就結束，看你能過幾關。越後面人越多、顏色不一樣的衣物越多、走得越快！',
        mount: mount,
        score: SCORE,
        test: { peopleAt: peopleAt, PEOPLE0: PEOPLE0, PEOPLE_STEP: PEOPLE_STEP, PARTS0: PARTS0, PARTS_STEP: PARTS_STEP, REVEAL_MS: REVEAL_MS, PH: PH, NEUTRAL: NEUTRAL, VARY_ORDER: VARY_ORDER, speedAt: speedAt, gapAt: gapAt, ansMs: ansMs, partsFor: partsFor, makeLevel: makeLevel, xAt: xAt, question: question, personSvg: personSvg, rating: rating, COLORS: COLORS, PARTS: PARTS, PW: PW, MIN_SPACE: MIN_SPACE, RAMP_LEVELS: RAMP_LEVELS, SPEED: SPEED, GAP: GAP, ANS_S: ANS_S, JITTER: JITTER }
    };
    Reaction.register(G);
})();
