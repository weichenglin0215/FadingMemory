/* ═══════════════════════════════════════════════════════════════════
   reaction_price.js — 秒反應・價格陷阱
   上下兩張價格標籤，原價用中文數字寫（例如「三千八百元」），再加上折扣（打八五折、現折三百元 …），
   在時間內點出「實際要付的錢比較少」的那一張。
   ───────────────────────────────────────────────────────────────────
   · 折扣類型（隨關卡增加）：
        fold  打 N 折（N 是 5~9，之後有 N.5，例如「八五折」＝ ×0.85）
        off   現折 X 元
        both  先打 N 折，再折 X 元（第 BOTH_FROM 關起才出現）
   · 兩張標籤的實付金額差距（相對較小的那張）從 DIFF_START(30%) 線性縮小到 DIFF_END(3%)；
     出題方式：先隨機生出 A，再依目標差距反推 B 的原價（取整到 STEP 的倍數），
     差距落在目標的 0.75~1.3 倍之間才收，所以兩張的差距是「大約」不是精確。
   · 中文數字：第 1 關全部用一般寫法（三千八百），之後「財務大寫」（參仟捌佰）出現的機率
     從 0 線性增加到 FORMAL_END。toChinese 對 1~99999 都有測試（用反向解析驗證）。
   · 每題限時從 TIME_START 線性縮短到 TIME_END；答錯或超時就結束，成績＝答對幾題。答完會列出算式。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'price';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 20;
    var DIFF_START = 0.30, DIFF_END = 0.03;
    var TIME_START = 14, TIME_END = 7;
    var FORMAL_END = 0.5;
    var HALF_FROM = 4, OFF_FROM = 4, BOTH_FROM = 9;
    var REVEAL_MS = 2200;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 題'; }

    /* ═══ 中文數字（純函式，也給 Node 測試用）═══ */
    var PLAIN = { d: ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'], u: ['', '十', '百', '千'], big: '萬', yuan: '元' };
    var FORMAL = { d: ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'], u: ['', '拾', '佰', '仟'], big: '萬', yuan: '元' };
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
    function foldText(f) {
        var d = PLAIN.d;
        if (Math.abs(f - Math.round(f)) < 1e-9) return d[Math.round(f)] + '折';
        return d[Math.floor(f)] + d[Math.round((f - Math.floor(f)) * 10)] + '折';
    }

    /* ═══ 折扣與金額 ═══ */
    function finalOf(tag) {
        var d = tag.disc;
        if (d.type === 'fold') return tag.orig * d.fold / 10;
        if (d.type === 'off') return tag.orig - d.amt;
        return tag.orig * d.fold / 10 - d.amt;
    }
    function discText(d, formal) {
        if (d.type === 'fold') return '打' + foldText(d.fold);
        if (d.type === 'off') return '現折' + priceText(d.amt, formal);
        return '先打' + foldText(d.fold) + '，再折' + priceText(d.amt, formal);
    }
    function formulaText(tag) {
        var d = tag.disc, f = finalOf(tag);
        if (d.type === 'fold') return tag.orig + ' × ' + (d.fold / 10) + ' = ' + f;
        if (d.type === 'off') return tag.orig + ' − ' + d.amt + ' = ' + f;
        return tag.orig + ' × ' + (d.fold / 10) + ' − ' + d.amt + ' = ' + f;
    }
    function paramsFor(level) {
        return {
            diff: kit.ramp(level, DIFF_START, DIFF_END, LEVEL_RAMP),
            time: kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP),
            formalP: kit.ramp(level, 0, FORMAL_END, LEVEL_RAMP),
            step: level <= 6 ? 100 : (level <= 12 ? 50 : 10)
        };
    }
    /* 這一關可以出現的折扣種類 */
    function typesFor(level) {
        var t = ['fold'];
        if (level >= OFF_FROM) t.push('off');
        if (level >= BOTH_FROM) t.push('both');
        return t;
    }
    function randDisc(level, type, rand) {
        var folds = level >= HALF_FROM ? [5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5] : [5, 6, 7, 8, 9];
        var d = { type: type };
        if (type !== 'off') d.fold = kit.pick(folds, rand);
        if (type !== 'fold') d.amt = kit.pick([100, 200, 300, 400, 500, 600, 800], rand);
        return d;
    }
    /* 讓 orig 取整到 step 的倍數 */
    function snap(v, step) { return Math.max(step, Math.round(v / step) * step); }

    /* 出題：回傳 { tags:[A,B], lowIdx(0/1), diff, params }；每張 tag：{orig, disc, final, formal} */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var P = paramsFor(level), types = typesFor(level);
        for (var tries = 0; tries < 3000; tries++) {
            var oa = snap(kit.randInt(300, 9000, rand), P.step);
            var A = { orig: oa, disc: randDisc(level, kit.pick(types, rand), rand), formal: rand() < P.formalP };
            A.final = finalOf(A);
            if (A.final < 50 || !(A.final === Math.round(A.final))) continue;
            var s = rand() < 0.5 ? -1 : 1;
            var targetB = A.final * (1 + s * P.diff);
            var B = { disc: randDisc(level, kit.pick(types, rand), rand), formal: rand() < P.formalP };
            var d = B.disc, mult = d.type === 'off' ? 1 : d.fold / 10, amt = d.type === 'fold' ? 0 : d.amt;
            B.orig = snap((targetB + amt) / mult, P.step);
            B.final = finalOf(B);
            if (B.orig > 99999 || B.final < 50 || B.final !== Math.round(B.final)) continue;
            var rel = Math.abs(B.final - A.final) / Math.min(A.final, B.final);
            if (rel < P.diff * 0.75 || rel > P.diff * 1.3 || B.final === A.final) continue;
            if (A.orig === B.orig && A.disc.type === B.disc.type && A.disc.fold === B.disc.fold && A.disc.amt === B.disc.amt) continue;
            var tags = rand() < 0.5 ? [A, B] : [B, A];
            return { tags: tags, lowIdx: tags[0].final < tags[1].final ? 0 : 1, rel: rel, params: P };
        }
        /* 保底 */
        var X = { orig: 3000, disc: { type: 'fold', fold: 8 }, formal: false }, Y = { orig: 2800, disc: { type: 'fold', fold: 9 }, formal: false };
        X.final = finalOf(X); Y.final = finalOf(Y);
        return { tags: [X, Y], lowIdx: Y.final < X.final ? 1 : 0, rel: Math.abs(X.final - Y.final) / Math.min(X.final, Y.final), params: P };
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            var level = 1, right = 0, newRec = false, state = 'idle', Q = null;

            var head = h('div', { 'class': 'pr-head' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var wrap = h('div', { 'class': 'pr-wrap' });
            root.appendChild(head);
            root.appendChild(bar);
            root.appendChild(wrap);
            var tagEls = [];

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, fmtBest(Reaction.getBest(ID))])); }

            function next() {
                if (my.dead) return;
                Q = makeQuestion(level);
                state = 'ask';
                head.textContent = '第 ' + level + ' 題　實際付的錢比較少的是哪一張？';
                meta();
                wrap.innerHTML = '';
                tagEls = Q.tags.map(function (tg, i) {
                    var el = h('button', { 'class': 'pr-tag' }, [
                        h('span', { 'class': 'pr-tag__hole' }),
                        h('span', { 'class': 'pr-tag__lbl', text: '原價' }),
                        h('span', { 'class': 'pr-tag__orig', text: priceText(tg.orig, tg.formal), attrs: { 'data-n': String(priceText(tg.orig, tg.formal).length) } }),
                        h('span', { 'class': 'pr-tag__disc', text: discText(tg.disc, tg.formal) }),
                        h('span', { 'class': 'pr-tag__calc', text: '' })
                    ]);
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(i); });
                    wrap.appendChild(el);
                    return el;
                });
                try {
                    console.info('[價格陷阱] 第 ' + level + ' 題 目標差距約 ' + (Q.params.diff * 100).toFixed(1) + '%，實際差距 ' + (Q.rel * 100).toFixed(1) + '%：' +
                        Q.tags.map(function (tg, i) { return (i ? '下' : '上') + '：' + priceText(tg.orig, tg.formal) + ' ' + discText(tg.disc, tg.formal) + ' → ' + formulaText(tg); }).join('；') +
                        ' ⇒ 答案是' + (Q.lowIdx ? '下' : '上') + '面那張');
                } catch (e) { }
                var t0 = performance.now(), limit = Q.params.time * 1000;
                var lp = my.loop(function (now) {
                    if (state !== 'ask') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                });
                Q.timer = my.after(limit, function () { if (state === 'ask') answer(-1); });
                Q.lp = lp;
            }

            function answer(i) {
                if (state !== 'ask') return;
                state = 'rev';
                my.cancel(Q.timer); Q.lp.stop();
                fill.style.width = '0%';
                var ok = i === Q.lowIdx;
                tagEls.forEach(function (el, k) {
                    el.querySelector('.pr-tag__calc').textContent = formulaText(Q.tags[k]) + ' 元';
                    el.classList.add(k === Q.lowIdx ? 'pr-tag--low' : 'pr-tag--high');
                });
                if (!ok && i >= 0) tagEls[i].classList.add('pr-tag--bad');
                head.textContent = (i < 0 ? '時間到！' : (ok ? '答對了！' : '答錯了…')) + ' 比較便宜的是' + (Q.lowIdx ? '下' : '上') + '面那張（差 ' + (Q.rel * 100).toFixed(1) + '%）';
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
                    my.after(REVEAL_MS + 400, function () {
                        kit.result(root, {
                            num: right + ' 題', label: i < 0 ? '來不及算' : '被折扣騙到了',
                            lines: ['便宜的是 ' + formulaText(Q.tags[Q.lowIdx]) + ' 元', '貴的是 ' + formulaText(Q.tags[1 - Q.lowIdx]) + ' 元'],
                            isNew: newRec, sfx: right >= 8 ? 'win' : 'fail', onAgain: round
                        });
                    });
                }
            }

            G.debug = {
                state: function () { return { level: level, right: right, state: state, Q: Q }; },
                answerRight: function () { answer(Q.lowIdx); },
                answerWrong: function () { answer(1 - Q.lowIdx); }
            };
            my.after(300, next);
        }

        round();
    }

    var G = {
        id: ID,
        name: '價格陷阱',
        rule: '上下兩張價格標籤，原價用中文數字寫，再加上折扣（打折、現折，後面還有兩種一起算）。算一算實際要付多少錢，點出比較便宜的那一張。越後面兩張價錢差越少，時間也越短！',
        mount: mount,
        test: { toChinese: toChinese, priceText: priceText, foldText: foldText, finalOf: finalOf, discText: discText, formulaText: formulaText, paramsFor: paramsFor, makeQuestion: makeQuestion, typesFor: typesFor }
    };
    Reaction.register(G);
})();
