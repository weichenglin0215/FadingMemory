/* ═══════════════════════════════════════════════════════════════════
   reaction_mergechar.js — 秒反應・左右合字（企劃 201）
   左邊一欄、右邊一欄，各有一些「偏旁」。先點左邊的一塊、再點右邊的一塊，把它們連成一條線：
   能合成一個字（例如 氵＋工＝江）就連出一條「綠線」並合成那個字；不能合成就連出一條「紅線」（扣一條命）。
   連出五條綠線就過關，進下一關。關卡制，有 3 條命，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 字庫 COMBO_TEXT：約 200 組「左偏旁＋右偏旁＝字」，全部是常用字、左右結構。每組三個字：左、右、合成的字。
   · 出題（規範 Q1、Q2：答案唯一）：先挑 5 組「要連的」（左偏旁各不相同、右偏旁各不相同），再加上幾塊「干擾的偏旁」
     （前期沒有，後期每欄多 1～3 塊），然後把畫面上「所有左×右的組合」都用字庫檢查一遍：
     只有那 5 組能合成字，其他全部不能 → 所以每一條綠線都是對的，不會有「連對了卻卡死」的情況。
     （字庫以外的冷僻字，不算能合成：這是字庫的限制，字庫已盡量收齊常用偏旁的組合。）
   · 難度線性：每欄的偏旁數 5 → 8 塊（第 1～3 關 5 塊、第 4 關起 6 塊、第 10 關起 7 塊、第 20 關起 8 塊）；
     每關限時 45 秒 → 26 秒（RAMP_LEVELS 關走到頂）。
   · 連線：先點左（或先點右）選取，再點另一邊就連線；選了又想換，點同一邊的另一塊即可改選。
   · 揭曉：失敗時，還沒連的那幾組用灰線連出來並標出合成的字。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'mergechar';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var NEED = 5;                               /* 要連出幾條綠線才過關（企劃指定 5 條） */
    var COL_STEPS = [[1, 5], [4, 6], [10, 7], [20, 8]];     /* [從第幾關起, 每欄有幾塊偏旁] */
    var LIVES = 3;                              /* 命（連出紅線扣一條） */
    var TIME_S = [45, 26];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var MAX_LEVEL = 60;
    /* 字庫：每組三個字「左偏旁、右偏旁、合成的字」，用空白隔開 */
    var COMBO_TEXT = [
        '氵工江 氵可河 氵每海 氵羊洋 氵青清 氵胡湖 氵皮波 氵永泳 氵同洞 氵包泡 氵主注 氵由油 氵舌活 氵良浪 氵先洗 氵昆混 氵合洽 氵曷渴 氵木沐 氵立泣 氵少沙 氵古沽 氵也池 氵十汁 氵白泊 氵中沖 氵各洛',
        '亻木休 亻言信 亻也他 亻門們 亻可何 亻主住 亻乍作 亻十什 亻中仲 亻古估 亻士仕 亻固個 亻象像 亻呆保 亻立位 亻半伴 亻火伙 亻方仿 亻白伯 亻青倩 亻每侮 亻子仔',
        '扌丁打 扌巴把 扌包抱 扌由抽 扌非排 扌合拾 扌是提 扌白拍 扌安按 扌隹推 扌空控 扌爰援 扌舌括 扌立拉 扌采採 扌巨拒 扌辰振 扌旨指 扌斤折 扌爪抓 扌末抹 扌皮披 扌主拄 扌工扛',
        '口巴吧 口馬嗎 口乞吃 口昌唱 口未味 口及吸 口加咖 口非啡 口牙呀 口合哈 口尼呢 口包咆 口可呵 口各咯 口古咕 口十叶 口少吵',
        '日月明 日青晴 日寺時 日央映',
        '女子好 女馬媽 女也她 女未妹 女市姊 女台始 女某媒 女良娘 女且姐 女家嫁 女昏婚 女少妙 女古姑 女方妨',
        '火考烤 火共烘 火登燈 火息熄 火勺灼 火包炮 火主炷',
        '金艮銀 金同銅 金十針 金昔錯 金易錫 金少鈔',
        '言吾語 言者諸 言射謝 言十計 言青請 言舌話 言周調 言果課 言兌說 言永詠 言志誌 言己記 言午許 言司詞 言方訪 言丁訂 言斥訴',
        '糸工紅 糸合給 糸田細 糸文紋 糸氏紙 糸己紀 糸及級 糸屯純 糸責績 糸宗綜 糸泉線 糸勺約 糸吉結 糸會繪',
        '月半胖 月土肚 月要腰 月包胞 月各胳 月旨脂 月复腹 月匈胸 月方肪',
        '土也地 土成城 土者堵 土方坊 土平坪 土皮坡 土亢坑 土立垃',
        '石皮破 石馬碼 石卑碑 石更硬 石少砂 石包砲',
        '禾火秋 禾斗科 禾重種 禾多移 禾少秒 禾口和',
        '木木林 木目相 木寸村 木交校 木兆桃 木反板 木公松 木每梅 木亥核 木卯柳 木主柱 木古枯 木白柏 木各格 木土杜 木吾梧 木婁樓 木東棟 木艮根 木可柯 木同桐',
        '王里理 王求球 王見現 王皮玻 王離璃',
        '忄青情 忄夬快 忄亡忙 忄白怕 忄曼慢 忄鬼愧 忄中忡',
        '彳艮很 彳走徒 彳主往 彳皮彼',
        '礻申神 礻且祖 礻兄祝',
        '衤皮被 衤君裙',
        '目艮眼 目青睛 目民眠 目垂睡',
        '貝才財 貝占貼 貝者賭 貝共貢',
        '食反飯 食官館 食包飽 食我餓 食余餘 食交餃',
        '車交較 車專轉 車巠輕 車俞輸',
        '足艮跟 足包跑 足各路 足易踢 足夸跨 足皮跛',
        '魚羊鮮 魚包鮑',
        '馬各駱 馬主駐 馬交駁 馬也馳',
        '子系孫 子亥孩',
        '山支岐',
        '弓長張 弓單彈',
        '犭苗貓 犭句狗 犭良狼 犭且狙',
        '米分粉 米青精 米且粗 米胡糊 米立粒 米唐糖',
        '酉己配'
    ].join(' ').split(/\s+/).filter(function (s) { return s; });
    var COMBOS = COMBO_TEXT.map(function (t) { return { l: t[0], r: t[1], ch: t[2] }; });
    var BY_PAIR = {};
    COMBOS.forEach(function (c) { BY_PAIR[c.l + c.r] = c.ch; });
    var LEFTS = [];
    COMBOS.forEach(function (c) { if (LEFTS.indexOf(c.l) < 0) LEFTS.push(c.l); });
    var RIGHTS = [];
    COMBOS.forEach(function (c) { if (RIGHTS.indexOf(c.r) < 0) RIGHTS.push(c.r); });

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function colsFor(level) { var c = COL_STEPS[0][1]; COL_STEPS.forEach(function (s) { if (level >= s[0]) c = s[1]; }); return c; }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    /* 左偏旁 l 加右偏旁 r 能合成什麼字？不能就回傳 null */
    function merge(l, r) { return BY_PAIR[l + r] || null; }
    /* 畫面上這些左、右偏旁之間，所有能合成字的組合（驗證用） */
    function edgesOf(L, R) {
        var out = [];
        L.forEach(function (l) { R.forEach(function (r) { var ch = merge(l, r); if (ch) out.push({ l: l, r: r, ch: ch }); }); });
        return out;
    }
    /* 出一關：{ L（左欄由上到下的偏旁）, R（右欄）, pairs（要連的 5 組 {l,r,ch}）, decoyL, decoyR } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = colsFor(level), extra = n - NEED;
        for (var tr = 0; tr < 600; tr++) {
            var lefts = kit.sample(LEFTS, n, rand), used = {};
            lefts.forEach(function (l) { used[l] = true; });
            var pairs = [], usedR = {}, ok = true;
            for (var i = 0; i < NEED && ok; i++) {
                var l = lefts[i];
                var opts = COMBOS.filter(function (c) { return c.l === l && !usedR[c.r] && !used[c.r]; });
                if (!opts.length) { ok = false; break; }
                var c = kit.pick(opts, rand);
                usedR[c.r] = true; pairs.push(c);
            }
            if (!ok) continue;
            var decoyL = lefts.slice(NEED), rights = pairs.map(function (p) { return p.r; });
            var pool = RIGHTS.filter(function (r) { return !usedR[r] && !used[r]; });
            var decoyR = kit.sample(pool, extra, rand);
            var R = rights.concat(decoyR), L = lefts;
            var edges = edgesOf(L, R);
            if (edges.length !== NEED) continue;
            if (!pairs.every(function (p) { return edges.some(function (e) { return e.l === p.l && e.r === p.r; }); })) continue;
            return { L: kit.shuffle(L, rand), R: kit.shuffle(R, rand), pairs: pairs, decoyL: decoyL, decoyR: decoyR };
        }
        var fb = [{ l: '氵', r: '工', ch: '江' }, { l: '亻', r: '言', ch: '信' }, { l: '扌', r: '丁', ch: '打' }, { l: '口', r: '巴', ch: '吧' }, { l: '日', r: '月', ch: '明' }];
        return { L: fb.map(function (p) { return p.l; }), R: fb.map(function (p) { return p.r; }), pairs: fb, decoyL: [], decoyR: [] };
    }
    function rating(n) {
        if (n >= 25) return '造字大師！';
        if (n >= 15) return '偏旁高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多想想偏旁能組成什麼字，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, lives: LIVES,
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
        console.log('[左右合字] 第 ' + level + ' 關：左 ' + q.L.join('') + '，右 ' + q.R.join('') + '；要連的：' + q.pairs.map(function (p) { return p.l + '＋' + p.r + '＝' + p.ch; }).join('、') + '；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var n = q.L.length, top = 66, gap = 8, bottom = 16;
        var ph = Math.min(88, Math.floor((H - top - bottom - (n - 1) * gap) / n)), pw = 124;
        var svg = kit.svg('svg', { 'class': 'mgc-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gLines = kit.svg('g', {}, svg);
        var tip = h('div', { 'class': 'qz-note mgc-tip', text: '先點左邊一塊，再點右邊一塊' });
        var prog = h('div', { 'class': 'mgc-prog', text: '已連對 0／' + NEED });
        stage.appendChild(tip); stage.appendChild(prog);
        function mk(side, text, i) {
            var b = h('button', { 'class': 'mgc-piece mgc-piece--' + side, text: text });
            b.style.width = pw + 'px'; b.style.height = ph + 'px';
            b.style.fontSize = Math.min(58, Math.floor(ph * 0.68)) + 'px'; b.style.lineHeight = '1';         /* 欄越擠、字越小，字才不會超出方塊 */
            b.style.left = (side === 'L' ? 8 : W - pw - 8) + 'px'; b.style.top = (top + i * (ph + gap)) + 'px';
            kit.onTap(b, function () { tapPiece(side, i); });
            stage.appendChild(b);
            return b;
        }
        var LP = q.L.map(function (t, i) { return mk('L', t, i); }), RP = q.R.map(function (t, i) { return mk('R', t, i); });
        function center(side, i) { return { x: side === 'L' ? 8 + pw : W - pw - 8, y: top + i * (ph + gap) + ph / 2 }; }
        var sel = null, done = 0, locked = {}, busy = false;
        function setSel(s) {
            if (sel) (sel.side === 'L' ? LP : RP)[sel.i].classList.remove('mgc-piece--sel');
            sel = s;
            if (sel) (sel.side === 'L' ? LP : RP)[sel.i].classList.add('mgc-piece--sel');
        }
        function line(li, ri, cls) {
            var a = center('L', li), b = center('R', ri);
            return kit.svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'mgc-line ' + cls }, gLines);
        }
        function badge(li, ri, ch, cls) {
            var a = center('L', li), b = center('R', ri);
            var t = h('div', { 'class': 'mgc-badge ' + cls, text: ch });
            t.style.left = ((a.x + b.x) / 2 - 36) + 'px'; t.style.top = ((a.y + b.y) / 2 - 36) + 'px';
            stage.appendChild(t);
            return t;
        }
        function tapPiece(side, i) {
            if (api.over || busy || locked[side + i]) return;
            Sfx.play('click');
            if (!sel || sel.side === side) { setSel(sel && sel.side === side && sel.i === i ? null : { side: side, i: i }); return; }
            var li = side === 'L' ? i : sel.i, ri = side === 'R' ? i : sel.i;
            setSel(null);
            connect(li, ri);
        }
        function connect(li, ri) {
            var ch = merge(q.L[li], q.R[ri]);
            if (ch) {
                locked['L' + li] = locked['R' + ri] = true;
                LP[li].classList.add('mgc-piece--done'); RP[ri].classList.add('mgc-piece--done');
                line(li, ri, 'mgc-line--ok'); badge(li, ri, ch, 'mgc-badge--ok');
                Sfx.play('ok');
                done++; prog.textContent = '已連對 ' + done + '／' + NEED;
                if (done >= NEED) { kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); }
            } else {
                busy = true;
                var ln = line(li, ri, 'mgc-line--bad');
                LP[li].classList.add('mgc-piece--bad'); RP[ri].classList.add('mgc-piece--bad');
                kit.flash(stage, false, api.my);
                var left = api.lose({ lines: ['「' + q.L[li] + '」和「' + q.R[ri] + '」不能合成字', '要連的是：' + q.pairs.map(function (p) { return p.l + '＋' + p.r + '＝' + p.ch; }).join('　')] });
                if (left <= 0) { showAll(); return; }
                api.after(700, function () { ln.remove(); LP[li].classList.remove('mgc-piece--bad'); RP[ri].classList.remove('mgc-piece--bad'); busy = false; });
            }
        }
        /* 揭曉：還沒連的組用灰線連出來並標出合成的字 */
        function showAll() {
            q.pairs.forEach(function (p) {
                var li = q.L.indexOf(p.l), ri = q.R.indexOf(p.r);
                if (locked['L' + li]) return;
                line(li, ri, 'mgc-line--show'); badge(li, ri, p.ch, 'mgc-badge--show');
            });
        }
        api.timer(timeMs(level), function () {
            if (api.over) return;
            showAll();
            api.fail({ delay: 2600, lines: ['時間到！', '要連的是：' + q.pairs.map(function (p) { return p.l + '＋' + p.r + '＝' + p.ch; }).join('　')] });
        });
        if (level === 1 && kit.once('mergechar.hint')) kit.hintOn(stage, LP[q.L.indexOf(q.pairs[0].l)], { mode: 'tap', delay: 700, text: '請依序點擊左右兩塊偏旁' });
        api.solve = function () {
            if (busy) return;
            q.pairs.forEach(function (p) {
                var li = q.L.indexOf(p.l), ri = q.R.indexOf(p.r);
                if (!locked['L' + li] && !api.over) connect(li, ri);
            });
        };
        api.wrong = function () {
            if (busy) return;
            /* 故意連一組不能合成的：左邊第一塊（要連的）配右邊「別組的」偏旁；一次就用掉所有命，直接進結算 */
            var p0 = q.pairs[0], p1 = q.pairs[1];
            var li = q.L.indexOf(p0.l), ri = q.R.indexOf(p1.r);
            for (var k = 0; k < LIVES + 1 && !api.over; k++) { busy = false; connect(li, ri); }
        };
    }

    var G = {
        id: ID,
        name: '左右合字',
        rule: '左右兩欄各有一些偏旁。先點左邊一塊、再點右邊一塊，把它們連起來：**能合成字就連出綠線，不能就連出紅線**（扣一條命，共 3 條命）。**連出五條綠線就過關**。越後面，偏旁越多、限時越短！',
        mount: mount,
        score: SCORE,
        test: {
            COMBOS: COMBOS, BY_PAIR: BY_PAIR, LEFTS: LEFTS, RIGHTS: RIGHTS, colsFor: colsFor, timeMs: timeMs, merge: merge, edgesOf: edgesOf, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, NEED: NEED, LIVES: LIVES, MAX_LEVEL: MAX_LEVEL, TIME_S: TIME_S
        }
    };
    Reaction.register(G);
})();
