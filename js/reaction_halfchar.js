/* ═══════════════════════════════════════════════════════════════════
   reaction_halfchar.js — 秒反應・半邊字
   畫面上的字被遮住了一半，從下面四個字裡選出最可能的那一個。
   ───────────────────────────────────────────────────────────────────
   · 題庫 ENTRIES 是**手工審校**的，不做自動產生：每題 { a:答案, side:差異部件在哪一側, d:[3 個干擾字] }。
     side 指的是「答案跟干擾字不一樣的那個部件」在字的哪一側（left／top 取拆解的第 0 個部件，right／bottom 取第 1 個）。
   · 遮法（重點）：**遮住差異處、露出相似處**。四個選項都有的那個部件（相似處，例：湖、河、海、油的「氵」）完整露出，
     差異部件（例：胡、可、每、由）大部分遮住，只從貼著相似處的那一側露出一小段（SLIVER，占差異部件的比例）。
     所以光看露出的部分，四個字都像，要靠露出的那一小段筆畫去分辨；越後面露出的那一小段越少。
   · 題庫規則（checkData 逐題驗證）：3 個干擾字的拆解都含有那個相似部件，而且都不含答案的差異部件。
   · 遮字用 CSS clip-path: inset()，不改字型。每個字有一條「兩個部件的分界線」b（占字寬或字高的比例，
     預設依第一個部件查 BOUNDS 表，也可以在題庫裡寫 b 覆蓋）。
   · 難度（第 1 → LEVEL_RAMP 題線性）：差異部件露出的比例 SLIVER_START → SLIVER_END、每題限時 8 → 3.5 秒。
   · 有 LIVES 次機會，成績＝答對題數（越多越好）。答完把整個字亮出來並說明「相似的是 X，關鍵是 Y」。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'halfchar';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 20;
    var SLIVER_START = 0.55, SLIVER_END = 0.25; /* 差異部件從貼著相似處的那一側露出幾成（第 1 題最多，越後面越少）*/
    var TIME_START = 8, TIME_END = 3.5;
    var LIVES = 3;
    var NEXT_MS = 1300;
    var AVOID_RECENT = 10;                      /* 最近出過的幾題不重複 */

    /* 拆字表：[第一個部件, 第二個部件]；左右結構＝[左, 右]，上下結構＝[上, 下] */
    var DECOMP = {
        '湖': ['氵', '胡'], '河': ['氵', '可'], '海': ['氵', '每'], '油': ['氵', '由'], '清': ['氵', '青'], '洗': ['氵', '先'], '港': ['氵', '巷'], '流': ['氵', '㐬'], '泡': ['氵', '包'], '汀': ['氵', '丁'],
        '請': ['言', '青'], '說': ['言', '兌'], '話': ['言', '舌'], '語': ['言', '吾'], '訂': ['言', '丁'], '詩': ['言', '寺'], '該': ['言', '亥'],
        '情': ['忄', '青'], '快': ['忄', '夬'], '怕': ['忄', '白'], '慢': ['忄', '曼'], '悔': ['忄', '每'],
        '晴': ['日', '青'], '明': ['日', '月'], '昨': ['日', '乍'], '時': ['日', '寺'],
        '媽': ['女', '馬'], '姐': ['女', '且'], '妹': ['女', '未'], '好': ['女', '子'], '嗎': ['口', '馬'], '碼': ['石', '馬'], '螞': ['虫', '馬'],
        '銀': ['金', '艮'], '鐘': ['金', '童'], '銅': ['金', '同'], '針': ['金', '十'], '很': ['彳', '艮'], '眼': ['目', '艮'], '根': ['木', '艮'],
        '持': ['扌', '寺'], '待': ['彳', '寺'],
        '飯': ['食', '反'], '餓': ['食', '我'], '餃': ['食', '交'], '飽': ['食', '包'], '版': ['片', '反'], '坂': ['土', '反'], '板': ['木', '反'],
        '糖': ['米', '唐'], '粉': ['米', '分'], '精': ['米', '青'], '糕': ['米', '羔'],
        '打': ['扌', '丁'], '找': ['扌', '戈'], '拍': ['扌', '白'], '抱': ['扌', '包'], '町': ['田', '丁'],
        '跑': ['足', '包'], '跳': ['足', '兆'], '路': ['足', '各'], '跟': ['足', '艮'],
        '吃': ['口', '乞'], '喝': ['口', '曷'], '叫': ['口', '丩'], '吸': ['口', '及'], '咬': ['口', '交'], '咳': ['口', '亥'],
        '校': ['木', '交'], '樹': ['木', '尌'], '林': ['木', '木'], '桌': ['卓', '木'], '較': ['車', '交'], '狡': ['犭', '交'], '核': ['木', '亥'], '梅': ['木', '每'],
        '你': ['亻', '尔'], '他': ['亻', '也'], '住': ['亻', '主'], '做': ['亻', '故'], '侮': ['亻', '每'],
        '孩': ['子', '亥'], '孫': ['子', '系'], '孔': ['子', '乚'], '孤': ['子', '瓜'],
        '糊': ['米', '胡'], '蝴': ['虫', '胡'], '瑚': ['王', '胡'],
        '草': ['艹', '早'], '花': ['艹', '化'], '苦': ['艹', '古'], '英': ['艹', '央'],
        '家': ['宀', '豕'], '字': ['宀', '子'], '守': ['宀', '寸'], '宅': ['宀', '乇'],
        '想': ['相', '心'], '思': ['田', '心'], '念': ['今', '心'], '息': ['自', '心'],
        '雲': ['雨', '云'], '雪': ['雨', '彐'], '電': ['雨', '电'], '霜': ['雨', '相']
    };
    var SIDE_IDX = { left: 0, top: 0, right: 1, bottom: 1 };
    /* 第一個部件（左或上）占整個字的寬／高幾成＝兩個部件的分界線；用 b 欄位可以逐字覆蓋 */
    var BOUNDS = {
        '氵': 0.32, '言': 0.42, '忄': 0.32, '日': 0.38, '女': 0.36, '金': 0.42, '食': 0.40, '米': 0.50, '扌': 0.36, '足': 0.48, '口': 0.40, '木': 0.40,
        '亻': 0.34, '子': 0.34, '彳': 0.34, '目': 0.44, '片': 0.44, '土': 0.40, '石': 0.46, '虫': 0.44, '車': 0.46, '犭': 0.34, '王': 0.40, '田': 0.56,
        '艹': 0.38, '宀': 0.45, '相': 0.58, '今': 0.54, '自': 0.58, '雨': 0.60, '卓': 0.55
    };
    var ENTRIES = [
        /* 露出右半（干擾字有被遮住的左半部件）*/
        { a: '湖', side: 'right', d: ['河', '海', '油'] }, { a: '清', side: 'right', d: ['洗', '港', '流'] }, { a: '請', side: 'right', d: ['說', '話', '語'] },
        { a: '情', side: 'right', d: ['快', '怕', '慢'] }, { a: '晴', side: 'right', d: ['明', '時', '昨'] }, { a: '媽', side: 'right', d: ['姐', '妹', '好'] },
        { a: '銀', side: 'right', d: ['鐘', '銅', '針'] }, { a: '時', side: 'right', d: ['明', '晴', '昨'] }, { a: '飯', side: 'right', d: ['餓', '餃', '飽'] },
        { a: '糖', side: 'right', d: ['粉', '精', '糕'] }, { a: '打', side: 'right', d: ['找', '拍', '抱'] }, { a: '跑', side: 'right', d: ['跳', '路', '跟'] },
        { a: '跳', side: 'right', d: ['跑', '路', '跟'] }, { a: '吃', side: 'right', d: ['喝', '叫', '吸'] }, { a: '喝', side: 'right', d: ['吃', '叫', '吸'] },
        { a: '校', side: 'right', d: ['樹', '林', '桌'] }, { a: '你', side: 'right', d: ['他', '住', '做'] }, { a: '孩', side: 'right', d: ['孫', '孔', '孤'] },
        { a: '河', side: 'right', d: ['湖', '海', '油'] }, { a: '洗', side: 'right', d: ['河', '海', '油'] }, { a: '他', side: 'right', d: ['你', '住', '做'] },
        /* 露出左半（干擾字有被遮住的右半部件）*/
        { a: '媽', side: 'left', d: ['嗎', '碼', '螞'] }, { a: '請', side: 'left', d: ['情', '清', '晴'] }, { a: '情', side: 'left', d: ['請', '清', '晴'] },
        { a: '清', side: 'left', d: ['請', '情', '晴'] }, { a: '晴', side: 'left', d: ['請', '情', '清'] }, { a: '銀', side: 'left', d: ['很', '眼', '根'] },
        { a: '時', side: 'left', d: ['詩', '持', '待'] }, { a: '飯', side: 'left', d: ['版', '坂', '板'] }, { a: '湖', side: 'left', d: ['糊', '蝴', '瑚'] },
        { a: '海', side: 'left', d: ['悔', '梅', '侮'] }, { a: '校', side: 'left', d: ['較', '咬', '狡'] }, { a: '跑', side: 'left', b: 0.42, d: ['抱', '飽', '泡'] },
        { a: '打', side: 'left', d: ['町', '訂', '汀'] }, { a: '孩', side: 'left', d: ['該', '咳', '核'] },
        /* 上下結構 */
        { a: '草', side: 'bottom', d: ['花', '苦', '英'] }, { a: '花', side: 'bottom', d: ['草', '苦', '英'] }, { a: '苦', side: 'bottom', d: ['草', '花', '英'] },
        { a: '英', side: 'bottom', d: ['草', '花', '苦'] }, { a: '家', side: 'bottom', d: ['字', '守', '宅'] }, { a: '字', side: 'bottom', d: ['家', '守', '宅'] },
        { a: '想', side: 'top', d: ['思', '念', '息'] }, { a: '思', side: 'top', d: ['想', '念', '息'] }, { a: '念', side: 'top', d: ['想', '思', '息'] },
        { a: '息', side: 'top', d: ['想', '思', '念'] }, { a: '雲', side: 'bottom', d: ['雪', '電', '霜'] }, { a: '霜', side: 'bottom', d: ['雲', '雪', '電'] }
    ];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 題'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function boundOf(entry) { return entry.b != null ? entry.b : (BOUNDS[DECOMP[entry.a][0]] != null ? BOUNDS[DECOMP[entry.a][0]] : 0.45); }
    function revealOf(level) { return kit.ramp(level, SLIVER_START, SLIVER_END, LEVEL_RAMP); }
    /* 露出的是哪一側：差異部件的另一側（相似處那一側） */
    function exposedSide(entry) { return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[entry.side]; }
    /* 露出的區間 { from, to }（占字寬或字高的比例，0～1）：相似部件整個露出，加上差異部件貼著分界線的 SLIVER 那一段。
       差異在右／下（相似處在左／上）：[0, b + f·(1−b)]；差異在左／上（相似處在右／下）：[b − f·b, 1] */
    function visRegion(entry, level) {
        var b = boundOf(entry), f = revealOf(level);
        if (entry.side === 'right' || entry.side === 'bottom') return { from: 0, to: b + f * (1 - b) };
        return { from: b - f * b, to: 1 };
    }
    /* clip-path 的 inset(上 右 下 左) */
    function clipFor(side, reg) {
        var lo = (reg.from * 100).toFixed(1) + '%', hi = ((1 - reg.to) * 100).toFixed(1) + '%';
        if (side === 'right') return 'inset(0 0 0 ' + lo + ')';
        if (side === 'left') return 'inset(0 ' + hi + ' 0 0)';
        if (side === 'bottom') return 'inset(' + lo + ' 0 0 0)';
        return 'inset(0 0 ' + hi + ' 0)';
    }
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    /* visiblePart＝相似處（整個露出）；hiddenPart＝差異處（大部分遮住） */
    function visiblePart(entry) { return DECOMP[entry.a][1 - SIDE_IDX[entry.side]]; }
    function hiddenPart(entry) { return DECOMP[entry.a][SIDE_IDX[entry.side]]; }
    /* 題庫檢查：回傳問題清單（空陣列＝全部合格）*/
    function checkData() {
        var bad = [];
        ENTRIES.forEach(function (e, i) {
            var tag = '#' + (i + 1) + e.a + '(' + e.side + ')';
            if (!DECOMP[e.a]) { bad.push(tag + ' 答案沒有拆字'); return; }
            if (SIDE_IDX[e.side] === undefined) bad.push(tag + ' side 不合法');
            if (!e.d || e.d.length !== 3 || new Set(e.d).size !== 3) bad.push(tag + ' 干擾字要 3 個不重複');
            var diff = DECOMP[e.a] && DECOMP[e.a][SIDE_IDX[e.side]], same = DECOMP[e.a] && DECOMP[e.a][1 - SIDE_IDX[e.side]];
            (e.d || []).forEach(function (c) {
                if (c === e.a) bad.push(tag + ' 干擾字等於答案');
                if (!DECOMP[c]) { bad.push(tag + ' 干擾字 ' + c + ' 沒有拆字'); return; }
                if (DECOMP[c][0] === diff || DECOMP[c][1] === diff) bad.push(tag + ' 干擾字 ' + c + ' 也含有答案的差異部件 ' + diff);
                if (DECOMP[c][0] !== same && DECOMP[c][1] !== same) bad.push(tag + ' 干擾字 ' + c + ' 沒有露出的相似部件 ' + same);
            });
        });
        return bad;
    }
    function pickEntry(recent, rand) {
        rand = rand || Math.random;
        for (var t = 0; t < 100; t++) {
            var i = kit.randInt(0, ENTRIES.length - 1, rand);
            if (recent.indexOf(i) < 0) return i;
        }
        return kit.randInt(0, ENTRIES.length - 1, rand);
    }
    /* 四個選項（洗牌），回傳 { options, answer（索引）}*/
    function makeOptions(entry, rand) {
        var opts = kit.shuffle([entry.a].concat(entry.d), rand);
        return { options: opts, answer: opts.indexOf(entry.a) };
    }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var q = (startAt || 1) - 1, right = q, lives = LIVES, newRec = false, state = 'idle', qid = 0, recent = [], cur = null, E = null, O = null;
            var head = h('div', { 'class': 'hc-head' });
            var prompt = h('div', { 'class': 'hc-prompt' });
            var charBox = h('div', { 'class': 'hc-box' });
            var big = h('div', { 'class': 'hc-char' });
            charBox.appendChild(big);
            var tb = kit.timebar();
            var opts = h('div', { 'class': 'hc-opts' });
            var tip = h('div', { 'class': 'hc-tip' });
            [head, prompt, charBox, tb.el, opts, tip].forEach(function (n) { root.appendChild(n); });

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, '機會 ' + lives])); }

            function next() {
                if (my.dead) return;
                q++;
                var id = ++qid;
                var idx = pickEntry(recent);
                recent.push(idx); if (recent.length > AVOID_RECENT) recent.shift();
                E = ENTRIES[idx]; O = makeOptions(E);
                var reg = visRegion(E, q);
                state = 'ask';
                head.textContent = '第 ' + q + ' 題';
                prompt.textContent = '字被遮住一半（相似處露出、差異處遮住），是哪一個？';
                tip.textContent = '';
                big.textContent = E.a;
                big.style.clipPath = clipFor(exposedSide(E), reg);
                big.style.webkitClipPath = big.style.clipPath;
                charBox.className = 'hc-box';
                opts.innerHTML = '';
                O.options.forEach(function (c, i) {
                    var b = h('button', { 'class': 'hc-opt', text: c });
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); judge(i); });
                    opts.appendChild(b);
                });
                big.style.fontSize = '120px';          /* 先縮小，量到的字框高度才不會被大字撐開 */
                big.style.fontSize = Math.floor(Math.min(charBox.clientHeight, charBox.clientWidth) * 0.92) + 'px';
                meta();
                try { console.info('[半邊字] 第 ' + q + ' 題：答案「' + E.a + '」露出' + ({ left: '左', right: '右', top: '上', bottom: '下' })[exposedSide(E)] + '半（相似的「' + visiblePart(E) + '」整個露出，差異的「' + hiddenPart(E) + '」只露出 ' + (revealOf(q) * 100).toFixed(0) + '%，分界線 ' + boundOf(E).toFixed(2) + '）；選項 ' + O.options.join('、') + '；限時 ' + timeFor(q).toFixed(1) + ' 秒'); } catch (e) { }
                var t0 = performance.now(), lim = timeFor(q) * 1000;
                my.loop(function (now) { if (id !== qid || state !== 'ask') return false; tb.set(1 - (now - t0) / lim); });
                my.after(lim, function () { if (id === qid && state === 'ask') judge(-1); });
            }

            function judge(i) {
                if (state !== 'ask') return;
                state = 'reveal';
                tb.set(0);
                big.style.clipPath = 'none'; big.style.webkitClipPath = 'none';        /* 揭曉：整個字亮出來 */
                var ok = i === O.answer;
                [].forEach.call(opts.children, function (b, k) { if (k === O.answer) b.classList.add('hc-opt--ok'); else if (k === i) b.classList.add('hc-opt--bad'); });
                charBox.classList.add(ok ? 'hc-box--ok' : 'hc-box--bad');
                tip.textContent = '大家都有「' + visiblePart(E) + '」，關鍵是「' + hiddenPart(E) + '」，合起來就是「' + E.a + '」';
                if (ok) {
                    right++;
                    Sfx.play('ok');
                    if (Reaction.setBest(ID, right, function (v, b) { return v > b; })) newRec = true;
                    meta();
                    my.after(NEXT_MS, next);
                    return;
                }
                lives--;
                Sfx.play('bad');
                prompt.textContent = i < 0 ? '時間到！' : '選錯了…';
                meta();
                if (lives <= 0) {
                    my.after(1900, function () {
                        var back = kit.resumeFrom(q);
                        kit.result(root, {
                            num: right + ' 題', label: right >= 20 ? '識字高手！' : (right >= 10 ? '眼力不錯！' : '再試一次，會更準！'),
                            lines: ['最後一題：「' + E.a + '」', '大家都有「' + visiblePart(E) + '」，關鍵是「' + hiddenPart(E) + '」'],
                            isNew: newRec, sfx: right >= 10 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else my.after(2000, next);
            }

            G.debug = {
                state: function () { return { q: q, state: state, right: right, lives: lives, E: E, O: O }; },
                answerRight: function () { judge(O.answer); return state; },
                answerWrong: function () { judge((O.answer + 1) % 4); return state; },
                jump: function (n) { q = n - 1; }
            };
            my.after(300, next);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '半邊字',
        rule: '畫面上的字只露出一半，從下面四個字裡選出最可能的那一個。露出的部分會越來越少，每題時間也越來越短！',
        mount: mount,
        test: { exposedSide: exposedSide, SLIVER_START: SLIVER_START, SLIVER_END: SLIVER_END, ENTRIES: ENTRIES, DECOMP: DECOMP, SIDE_IDX: SIDE_IDX, visRegion: visRegion, revealOf: revealOf, boundOf: boundOf, BOUNDS: BOUNDS, clipFor: clipFor, timeFor: timeFor, visiblePart: visiblePart, hiddenPart: hiddenPart, checkData: checkData, pickEntry: pickEntry, makeOptions: makeOptions, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();
