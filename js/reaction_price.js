/* ═══════════════════════════════════════════════════════════════════
   reaction_price.js — 秒反應・價格陷阱
   上下兩張價格標籤，原價用中文數字寫（例如「三千八百元」），再加上一到三個優惠
   （打八五折、現折三百元、每滿一千減一百、折價券、會員再打八折 …），
   在時間內點出「實際要付的錢比較少」的那一張。
   ───────────────────────────────────────────────────────────────────
   · 一張標籤 ＝ 原價 ＋ 依序套用的優惠 steps（每一步都對「目前的價錢」計算，每一步的結果都必須是整數）：
        fold    打 N 折                       price × N/10
        off     現折 X 元                     price − X
        step    每滿 E 元減 M 元（累計）      price − floor(price/E) × M
        thresh  滿 T 元折 X 元（只折一次）    price ≥ T 才 − X
        coupon  折價券折 X 元                 price − X
        member  會員再享 N 折（兩張都有且完全相同，永遠排在最後；因為是最後一步的同比例打折，
                不會改變兩張的大小順序，是刻意的「混淆優惠」，玩家不用去算）
   · 難度（第 1 → LEVEL_RAMP 題）：
        優惠種類逐題解鎖：1–2 題只有打折；3 題加現折；4 題起可以「先打折再折」；5 題加「每滿 E 減 M」；
        6 題加「滿額折」；7 題加「折價券」；8 題起兩張都會出現「會員再享 N 折」的混淆優惠；
        每張標籤的優惠數：1 → 最多 3 個（有會員優惠時最多 2 個＋會員）。
        兩張實付金額的差距（元）：第 1 題約 400、第 10 題約 90、第 20 題起約 10（分段線性）；實際差距一定落在
        目標的 0.5～1 倍之間，例如第 20 題起差 5～10 元。
        限時 TIME_START → TIME_END 秒；中文大寫（參仟捌佰）的機率 0 → FORMAL_END。
   · 兩張標籤的規則（makeQuestion 保證）：
        ① 原價不同；② 所有「會變的優惠」兩張都不一樣（種類相同也要數值不同，例如八折 vs 八五折）；
        ③ 「原價較低的那張」折扣比例比較小（也就是原價高的那張折得比較兇），所以「挑原價低的」「挑折得多的」
           兩種直覺會指向不同張，玩家必須兩個都算；便宜的是哪一張則是隨機的。
   · 答完：兩張邊框一綠（便宜）一紅（貴），被點的那張加粗；每張列出算式。答錯或超時就結束。
   · 失敗之後可以從「失敗題數 − 5」繼續（kit.resumeFrom）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'price';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 price 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '答對題數', min: 1, max: 500 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度推到最難的題數 */
    var LEVEL_RAMP = 10;                       /* 難度推到最難的題數（優惠種類、限時、中文大寫）*/
    var TIME_START = 14, TIME_END = 7;
    var FORMAL_END = 0.5;
    /* 實付金額差距的目標（元）：[題號, 差距] 之間用線性內插，過了最後一個錨點就固定 */
    var GAP_ANCHORS = [[1, 400], [10, 90], [20, 10]];       /* 實付差距（元）：[題數, 目標差距] 之間線性內插，之後固定 */
    var GAP_LOW = 0.5;                         /* 實際差距 ≥ 目標 × GAP_LOW */
    var MIN_PAY = 50;
    var REVEAL_MS = 2400;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 題'; }

    /* 中文數字（純函式，也給 Node 測試用） */
    /* ═══ 中文數字（純函式，也給 Node 測試用）═══ */
    /* 一般寫法與財務大寫（壹貳參…）的數字、單位對照表 */
    var PLAIN = { d: ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'], u: ['', '十', '百', '千'], big: '萬', yuan: '元' };
    var FORMAL = { d: ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'], u: ['', '拾', '佰', '仟'], big: '萬', yuan: '元' };
    /* 0～9999 的中文：從千位數開始逐位處理，連續的 0 只唸一個「零」 */
    /* 0~9999 的中文（不含單位「萬」「元」） */
    function chunk(n, S) {
        var out = '', zero = false, started = false;
        for (var p = 3; p >= 0; p--) {
            var d = Math.floor(n / Math.pow(10, p)) % 10;
            if (d === 0) { if (started) zero = true; continue; }
            if (zero) { out += S.d[0]; zero = false; }
            out += S.d[d] + S.u[p];
            started = true;
        }
        return out;
    }
    /* 1～99999 轉成中文（formal＝財務大寫） */
    /* 1~99999 → 中文。formal＝財務大寫 */
    function toChinese(n, formal) {
        var S = formal ? FORMAL : PLAIN;
        var hi = Math.floor(n / 10000), lo = n % 10000, s = '';
        if (hi > 0) {
            s = chunk(hi, S) + S.big;
            if (lo > 0 && lo < 1000) s += S.d[0];          /* 一萬零五百 */
        }
        if (lo > 0) s += chunk(lo, S);
        /* 一般寫法：10~19 寫成「十二」不寫「一十二」（只在整個數字開頭時） */
        if (!formal && hi === 0 && n >= 10 && n < 20) s = s.replace(/^一十/, '十');
        return s;
    }
    function priceText(n, formal) { return toChinese(n, formal) + '元'; }
    /* 折數的中文：8 → 八折、8.5 → 八五折 */
    /* 折數的中文：8 → 八折、8.5 → 八五折 */
    function foldText(f) {
        var d = PLAIN.d;
        if (Math.abs(f - Math.round(f)) < 1e-9) return d[Math.round(f)] + '折';
        return d[Math.floor(f)] + d[Math.round((f - Math.floor(f)) * 10)] + '折';
    }

    /* 優惠步驟與金額 */
    /* ═══ 優惠步驟與金額 ═══ */
    /* 套用一步優惠：每一步都對「目前價錢」計算；結果不是整數就回傳 null（題目必須算得出整數） */
    /* 套用一步；回傳新價錢，不是整數就回傳 null */
    function applyStep(price, st) {
        var v;
        /* switch：依優惠種類選擇計算方式（fold 打折、off 現折、step 每滿減、thresh 滿額折、coupon 折價券、member 會員折） */
        switch (st.k) {
            case 'fold': case 'member': v = price * st.fold / 10; break;
            case 'off': case 'coupon': v = price - st.amt; break;
            case 'step': v = price - Math.floor(price / st.every) * st.minus; break;
            case 'thresh': v = price >= st.min ? price - st.amt : price; break;
            default: v = price;
        }
        v = Math.round(v * 1e6) / 1e6;
        return (v === Math.round(v)) ? v : null;
    }
    /* 一張標籤的實付：依序套用每個優惠，任何一步不是整數或低於最低金額就回傳 null；trail 記下每一步後的價錢 */
    /* 一張標籤的實付：{ final, trail:[原價, 第 1 步後, …] }，任何一步不是整數或 < MIN_PAY 就回傳 null */
    function payOf(card) {
        var p = card.orig, trail = [p];
        for (var i = 0; i < card.steps.length; i++) {
            p = applyStep(p, card.steps[i]);
            if (p === null || p < MIN_PAY) return null;
            trail.push(p);
        }
        return { final: p, trail: trail };
    }
    /* 標籤上每一行優惠文字 */
    /* 螢幕上每一行優惠文字 */
    function stepText(st, formal, first) {
        var pre = first ? '' : '再';
        switch (st.k) {
            case 'fold': return pre + '打' + foldText(st.fold);
            case 'off': return pre + '現折' + priceText(st.amt, formal);
            case 'step': return pre + '每滿' + priceText(st.every, formal) + '減' + priceText(st.minus, formal);
            case 'thresh': return pre + '滿' + priceText(st.min, formal) + '折' + priceText(st.amt, formal);
            case 'coupon': return pre + '折價券折' + priceText(st.amt, formal);
            case 'member': return '會員再享' + foldText(st.fold) + '優惠';
        }
        return '';
    }
    function discLines(card) { return card.steps.map(function (st, i) { return stepText(st, card.formal, i === 0); }); }
    function calcText(card) { var r = payOf(card); return r.trail.join(' → ') + ' 元'; }
    function stepKey(st) { return st.k + ':' + [st.fold, st.amt, st.every, st.minus, st.min].join(','); }
    function rateOf(card) { return 1 - payOf(card).final / card.orig; }

    /* 難度參數 */
    /* ═══ 難度參數 ═══ */
    /* 這一題的目標差距（元）：在 GAP_ANCHORS 錨點之間線性內插 */
    function gapFor(level) {
        var a = GAP_ANCHORS;
        if (level <= a[0][0]) return a[0][1];
        for (var i = 1; i < a.length; i++) {
            if (level <= a[i][0]) return kit.lerp(a[i - 1][1], a[i][1], (level - a[i - 1][0]) / (a[i][0] - a[i - 1][0]));
        }
        return a[a.length - 1][1];
    }
    /* 這一題的各項參數：差距範圍、限時、中文大寫機率、價格單位、原價上限、有沒有會員優惠 */
    function paramsFor(level) {
        var gap = gapFor(level);
        return {
            gap: gap, gapLow: gap * GAP_LOW,
            time: kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP),
            formalP: kit.ramp(level, 0, FORMAL_END, LEVEL_RAMP),
            unit: level <= 3 ? 100 : (level <= 6 ? 50 : 10),
            maxOrig: Math.round(kit.ramp(level, 3000, 9000, LEVEL_RAMP) / 100) * 100,
            member: level >= 8
        };
    }
    /* 這一題可以用的優惠種類（隨題號逐步解鎖） */
    /* 這一題可以用的優惠種類（不含 member） */
    function kindsFor(level) {
        var t = ['fold'];
        if (level >= 3) t.push('off');
        if (level >= 5) t.push('step');
        if (level >= 6) t.push('thresh');
        if (level >= 7) t.push('coupon');
        return t;
    }
    /* 每張標籤最多幾個優惠 */
    function maxSteps(level) { return level <= 3 ? 1 : (level <= 6 ? 2 : 3); }
    /* 各種優惠的數值候選清單 */
    var FOLDS_INT = [5, 6, 7, 8, 9], FOLDS_ALL = [5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5];
    var OFFS = [100, 200, 300, 400, 500, 600, 800];
    var COUPONS = [50, 100, 150, 200, 300];
    var STEPS = [[500, 50], [1000, 100], [1000, 150], [1500, 200], [2000, 300], [2000, 400]];
    var THRESH = [[1000, 100], [1500, 150], [2000, 300], [3000, 500], [5000, 800]];
    /* 隨機產生一個優惠步驟 */
    function randStep(level, kind, rand) {
        switch (kind) {
            case 'fold': return { k: 'fold', fold: kit.pick(level >= 4 ? FOLDS_ALL : FOLDS_INT, rand) };
            case 'off': return { k: 'off', amt: kit.pick(OFFS, rand) };
            case 'coupon': return { k: 'coupon', amt: kit.pick(COUPONS, rand) };
            case 'step': { var s = kit.pick(STEPS, rand); return { k: 'step', every: s[0], minus: s[1] }; }
            default: { var t = kit.pick(THRESH, rand); return { k: 'thresh', min: t[0], amt: t[1] }; }
        }
    }
    /* 一張標籤的優惠清單（種類不重複；折價券排最後、打折優先排前面） */
    /* 一張標籤的優惠清單（種類不重複；coupon 排在最後；fold 優先排前面）*/
    function randSteps(level, withMember, rand) {
        var kinds = kindsFor(level), n = Math.min(maxSteps(level) - (withMember && maxSteps(level) > 2 ? 1 : 0), kinds.length);
        var want = 1 + (n > 1 && rand() < kit.ramp(level, 0.15, 0.8, LEVEL_RAMP) ? 1 : 0);
        if (n > 2 && want === 2 && rand() < kit.ramp(level, 0, 0.6, LEVEL_RAMP)) want = 3;
        var picked = kit.shuffle(kinds.slice(), rand).slice(0, want);
        var order = { fold: 0, step: 1, thresh: 2, off: 3, coupon: 4 };
        picked.sort(function (a, b) { return order[a] - order[b]; });
        return picked.map(function (k) { return randStep(level, k, rand); });
    }

    /* 出題：兩張標籤的原價不同、優惠都不同；實付差距落在目標範圍；而且「原價低的那張折扣比例比較小」，讓「挑原價低的」與「挑折得多的」兩種直覺指向不同張 */
    /* 出題：{ tags:[上, 下], lowIdx, gap(實際差距), params }；每張 tag：{orig, steps, formal, final, trail} */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        /* member：兩張都有的「會員再享 N 折」混淆優惠，不用算 */
        var P = paramsFor(level), memberStep = P.member && rand() < 0.65 ? { k: 'member', fold: kit.pick([8, 9], rand) } : null;
        /* 最多嘗試 600 次產生符合條件的題目 */
        for (var tries = 0; tries < 600; tries++) {
            var A = { orig: P.unit * kit.randInt(Math.ceil(300 / P.unit), Math.floor(P.maxOrig / P.unit), rand), steps: randSteps(level, !!memberStep, rand), formal: rand() < P.formalP };
            if (memberStep) A.steps.push(memberStep);
            var ra = payOf(A); if (!ra) continue;
            A.final = ra.final; A.trail = ra.trail;
            var B = { steps: randSteps(level, !!memberStep, rand), formal: rand() < P.formalP };
            if (memberStep) B.steps.push(memberStep);
            /* 兩張的優惠不能有任何一個相同（會員優惠除外） */
            /* 兩張的優惠不能有任何一個相同（member 除外）*/
            var keysA = A.steps.filter(function (s) { return s.k !== 'member'; }).map(stepKey);
            if (B.steps.some(function (s) { return s.k !== 'member' && keysA.indexOf(stepKey(s)) >= 0; })) continue;
            /* 掃描 B 的原價，找出所有「實付差距合格、原價不同、折扣比例條件成立」的候選 */
            /* 掃描 B 的原價：實付差距落在 [gapLow, gap]，原價不同，而且「原價低的那張折扣比例比較小」*/
            var cands = [], bCheaper = rand() < 0.5;           /* 先決定 B 要比 A 便宜還是貴，這樣「便宜的是原價低的那張」只佔一半 */
            for (var o = P.unit * Math.ceil(300 / P.unit); o <= P.maxOrig * 1.3; o += P.unit) {
                if (o === A.orig) continue;
                B.orig = o;
                var rb = payOf(B); if (!rb) continue;
                var d = Math.abs(rb.final - A.final);
                if (d < P.gapLow - 1e-9 || d > P.gap + 1e-9) continue;
                if ((rb.final < A.final) !== bCheaper) continue;
                B.final = rb.final;
                var lowIsA = A.orig < o, rateA = 1 - A.final / A.orig, rateB = 1 - rb.final / o;
                if (lowIsA ? !(rateA < rateB) : !(rateB < rateA)) continue;
                cands.push(o);
            }
            if (!cands.length) continue;
            B.orig = kit.pick(cands, rand);
            var rbf = payOf(B); B.final = rbf.final; B.trail = rbf.trail;
            var tags = rand() < 0.5 ? [A, B] : [B, A];
            return { tags: tags, lowIdx: tags[0].final < tags[1].final ? 0 : 1, gap: Math.abs(A.final - B.final), params: P, tries: tries };
        }
        /* 保底：測試保證不會用到 */
        /* 保底（測試保證不會用到）*/
        var X = { orig: 3000, steps: [{ k: 'fold', fold: 8 }], formal: false }, Y = { orig: 3400, steps: [{ k: 'fold', fold: 7 }], formal: false };
        [X, Y].forEach(function (c) { var r = payOf(c); c.final = r.final; c.trail = r.trail; });
        return { tags: [X, Y], lowIdx: Y.final < X.final ? 1 : 0, gap: Math.abs(X.final - Y.final), params: P, tries: -1 };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* start：從第幾題開始（失敗後可從前 5 題繼續）*/
        /* round：開一局（失敗後可從失敗題數前 5 題繼續） */
        function round(start) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            /* level 目前題號；right 答對數；state 目前階段；Q 這一題 */
            var level = start || 1, right = level - 1, newRec = false, state = 'idle', Q = null;

            /* 建立畫面元素：標題、時間條、兩張價格標籤 */
            var head = h('div', { 'class': 'pr-head' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var wrap = h('div', { 'class': 'pr-wrap' });
            root.appendChild(head);
            root.appendChild(bar);
            root.appendChild(wrap);
            var tagEls = [];

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, fmtBest(Reaction.getBest(ID))])); }

            /* 出下一題 */
            function next() {
                if (my.dead) return;
                Q = makeQuestion(level);
                state = 'ask';
                head.textContent = '第 ' + level + ' 題　實際付的錢比較少的是哪一張？';
                meta();
                wrap.innerHTML = '';
                /* 建立兩張標籤（吊牌造型的按鈕）：原價、優惠行、算式（答完才顯示） */
                tagEls = Q.tags.map(function (tg, i) {
                    var ot = priceText(tg.orig, tg.formal);
                    var el = h('button', { 'class': 'pr-tag' }, [
                        h('span', { 'class': 'pr-tag__hole' }),
                        h('span', { 'class': 'pr-tag__lbl', text: '原價' }),
                        h('span', { 'class': 'pr-tag__orig', text: ot, attrs: { 'data-n': String(ot.length) } }),
                        h('span', { 'class': 'pr-tag__disc' }, discLines(tg).map(function (t, k) { return h('span', { 'class': 'pr-tag__line' + (tg.steps[k].k === 'member' ? ' pr-tag__line--member' : ''), text: t }); })),
                        h('span', { 'class': 'pr-tag__calc', text: '' })
                    ]);
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(i); });
                    wrap.appendChild(el);
                    return el;
                });
                /* 主控台印出這題兩張標籤與算式、答案，方便驗證 */
                try {
                    console.info('[價格陷阱] 第 ' + level + ' 題 目標差距 ' + Q.params.gapLow.toFixed(0) + '～' + Q.params.gap.toFixed(0) + ' 元，實際差 ' + Q.gap + ' 元：' +
                        Q.tags.map(function (tg, i) { return (i ? '下' : '上') + '：' + priceText(tg.orig, tg.formal) + ' ' + discLines(tg).join('／') + ' → ' + calcText(tg); }).join('；') +
                        ' ⇒ 答案是' + (Q.lowIdx ? '下' : '上') + '面那張');
                } catch (e) { }
                /* 倒數時間條 */
                var t0 = performance.now(), limit = Q.params.time * 1000;
                var lp = my.loop(function (now) {
                    if (state !== 'ask') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                });
                Q.timer = my.after(limit, function () { if (state === 'ask') answer(-1); });
                Q.lp = lp;
            }

            /* 作答：揭曉兩張的實際算式，便宜的標綠、貴的標紅，被點的加粗 */
            function answer(i) {
                if (state !== 'ask') return;
                state = 'rev';
                my.cancel(Q.timer); Q.lp.stop();
                fill.style.width = '0%';
                var ok = i === Q.lowIdx;
                tagEls.forEach(function (el, k) {
                    el.querySelector('.pr-tag__calc').textContent = calcText(Q.tags[k]);
                    el.classList.add(k === Q.lowIdx ? 'pr-tag--low' : 'pr-tag--high');
                });
                if (i >= 0) tagEls[i].classList.add('pr-tag--pick');
                head.textContent = (i < 0 ? '時間到！' : (ok ? '答對了！' : '答錯了…')) + ' 比較便宜的是' + (Q.lowIdx ? '下' : '上') + '面那張（差 ' + Q.gap + ' 元）';
                if (ok) {
                    right++;
                    Sfx.play('ok');
                    if (Reaction.setBest(ID, right, function (a, b) { return a > b; })) newRec = true;
                    meta();
                    level++;
                    my.after(REVEAL_MS, next);
                } else {
                    Sfx.play('bad');
                    state = 'over';
                    var failLevel = level, back = kit.resumeFrom(failLevel);
                    my.after(REVEAL_MS + 400, function () {
                        kit.result(root, {
                            score: right,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: right + ' 題', label: i < 0 ? '來不及算' : '被折扣騙到了',
                            lines: ['便宜的是 ' + calcText(Q.tags[Q.lowIdx]), '貴的是 ' + calcText(Q.tags[1 - Q.lowIdx])],
                            isNew: newRec, sfx: right >= 8 ? 'win' : 'fail',
                            onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                }
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, right: right, state: state, Q: Q }; },
                answerRight: function () { answer(Q.lowIdx); },
                answerWrong: function () { answer(1 - Q.lowIdx); }
            };
            /* 開場等 300 毫秒再出第一題 */
            my.after(300, next);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '價格陷阱',
        rule: '上下兩張價格標籤，原價用中文數字寫，再加上各種優惠（打折、現折、每滿減、滿額折、折價券）。算一算實際要付多少錢，點出比較便宜的那一張。兩邊都有的「會員再打幾折」不用算！越後面兩張價錢差越少，時間也越短。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { toChinese: toChinese, priceText: priceText, foldText: foldText, applyStep: applyStep, payOf: payOf, discLines: discLines, calcText: calcText, stepKey: stepKey, rateOf: rateOf, gapFor: gapFor, paramsFor: paramsFor, kindsFor: kindsFor, maxSteps: maxSteps, makeQuestion: makeQuestion, GAP_LOW: GAP_LOW, LEVEL_RAMP: LEVEL_RAMP }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
