/* ═══════════════════════════════════════════════════════════════════
   quiz.js — 測試模式（純 2D）
   畫面：選關卡 → 紙條（自動分頁，看完燒掉）→ 答題 → 結果（混淆類型分析）→ 錯題回顧
   · 題目由 quiz_gen.js 產生：從主選單進來就是新的一局，一局之內重玩同一關題目不變。
   · 答對：自動跳下一題。答錯：標出正確答案＋一句「為什麼會錯」，按「下一題」繼續。
   · 每個畫面都設計成「不用上下捲動」：題目與選項會依空間自動縮字。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var LEVELS = [];
    var THEME = '';
    var KINDS = window.QuizGen.KINDS;
    var h = UI.h;

    var S = {
        lv: 0,
        qi: 0,
        answers: [],
        pages: [],
        page: 0,
        locked: false,
        wrong: [],
        rev: 0
    };

    var screen, barTitle, barMeta, barBack, barProgress, confirmEl;
    var backAction = null;

    /* ─── 共用 ─── */
    function px(name, fallback) { return UI.cssPx(name, fallback); }

    function setBar(title, meta, progress, back) {
        barTitle.textContent = title;
        barMeta.textContent = meta || '';
        barProgress.style.width = progress == null ? '0' : (progress * 100) + '%';
        backAction = back;
        barBack.innerHTML = UI.icon('back') + '<span>返回</span>';
    }

    function clear() {
        screen.innerHTML = '';
        screen.scrollTop = 0;
        screen.classList.remove('is-feedback');
    }

    function bestKey(id) { return 'fm.quiz.best.' + id; }

    function askConfirm(text, yesLabel, noLabel) {
        return new Promise(function (resolve) {
            confirmEl.innerHTML = '';
            var card = h('div', { 'class': 'confirm__card' }, [
                h('div', { 'class': 'confirm__text', text: text }),
                h('div', { 'class': 'row' }, [
                    h('button', { 'class': 'btn btn--line', text: noLabel, on: { click: function () { done(false); } } }),
                    h('button', { 'class': 'btn btn--primary', text: yesLabel, on: { click: function () { done(true); } } })
                ])
            ]);
            confirmEl.appendChild(card);
            confirmEl.hidden = false;
            function done(v) {
                confirmEl.hidden = true;
                resolve(v);
            }
        });
    }

    /* ═══ ① 選關卡（← 回主選單＝這一局結束，下次進來換新題目）═══ */
    function showLevels() {
        setBar('明明還記得...', THEME ? '主題：' + THEME : '共 8 關', null, function () { location.href = 'index.html'; });
        clear();
        var list = h('div', { 'class': 'lv-list' });
        LEVELS.forEach(function (lv, idx) {
            var best = UI.store.get(bestKey(lv.id), null);
            list.appendChild(h('button', { 'class': 'lv', on: { click: function () { startLevel(idx); } } }, [
                h('span', { 'class': 'lv__num', text: String(lv.id) }),
                h('span', { 'class': 'lv__main' }, [
                    h('span', { 'class': 'lv__name', text: lv.name }),
                    h('span', { 'class': 'lv__tag', text: lv.tag })
                ]),
                h('span', { 'class': 'lv__side' }, [
                    h('span', { 'class': 'lv__count', text: lv.qs.length + ' 題' }),
                    best == null ? null : h('span', { 'class': 'lv__best', text: '最佳 ' + best + '%' })
                ])
            ]));
        });
        screen.appendChild(list);
    }

    /* ═══ ② 紙條：自動分頁，可以翻回上一頁，看完燒掉 ═══ */
    function startLevel(idx) {
        S.lv = idx;
        S.qi = 0;
        S.answers = [];
        S.page = 0;
        S.locked = false;
        var lv = LEVELS[idx];

        setBar('第 ' + lv.id + ' 關・紙條', '', null, showLevels);
        clear();

        var head = h('div', { 'class': 'note-head' }, [
            h('span', { 'class': 'pill pill--yellow', html: UI.icon('clock') + '<span>不限時間・只能看一次</span>' })
        ]);
        var note = h('div', { 'class': 'note note--page' });
        var pager = h('div', { 'class': 'hint' });
        var btns = h('div', { 'class': 'row' });
        screen.appendChild(head);
        screen.appendChild(note);
        screen.appendChild(pager);
        screen.appendChild(btns);

        /* 先把提示與按鈕列放好，紙條框的高度才是最終高度，分頁才量得準 */
        pager.textContent = '看完就按下方按鈕，紙條會燒掉';
        btns.appendChild(h('button', { 'class': 'btn btn--sky', text: '…' }));

        UI.fonts(['700 34px "Noto Serif TC"'], lv.note.join(''), 2500).then(function () {
            note.style.fontSize = px('--fs-note', 34) + 'px';
            S.pages = UI.paginate(lv.note, note);
            renderNotePage(note, pager, btns);
        });
    }

    function renderNotePage(note, pager, btns) {
        var total = S.pages.length;

        barMeta.textContent = total > 1 ? (S.page + 1) + ' / ' + total + ' 頁' : '';
        pager.textContent = total > 1 ? '紙條共 ' + total + ' 頁，看完最後一頁再燒掉' : '看完就按下方按鈕，紙條會燒掉';

        btns.innerHTML = '';
        if (S.page > 0) {
            btns.appendChild(h('button', {
                'class': 'btn btn--line', html: UI.icon('back') + '<span>上一頁</span>',
                on: { click: function () { S.page--; renderNotePage(note, pager, btns); } }
            }));
        }
        if (S.page < total - 1) {
            btns.appendChild(h('button', {
                'class': 'btn btn--sky', text: '下一頁',
                on: { click: function () { S.page++; renderNotePage(note, pager, btns); } }
            }));
        } else {
            btns.appendChild(h('button', {
                'class': 'btn btn--primary', text: total > 1 ? '看完了，燒掉' : '看完了，燒掉紙條',
                on: {
                    click: function () {
                        if (S.locked) return;
                        /* 燒掉紙條後直接進入第一題（1.6.x 的 5→1 水流倒數已取消；js/waterflow.js 保留備用） */
                        showQuestion();
                    }
                }
            }));
        }

        /* 按鈕列放好後才放紙條內容；單一段落長到一頁放不下時，縮字到下限 */
        UI.renderParas(note, S.pages[S.page]);
        UI.fit(note, px('--fs-note', 34), px('--fs-note-min', 26));
    }

    /* ═══ ③ 答題 ═══ */
    function showQuestion() {
        var lv = LEVELS[S.lv];
        var q = lv.qs[S.qi];
        var total = lv.qs.length;
        setBar('第 ' + lv.id + ' 關', (S.qi + 1) + ' / ' + total, S.qi / total, leaveLevel);
        clear();
        S.locked = false;

        /* 跨關回想題：明白標出「第 X 關的回想題」，不藏著考玩家 */
        var side = h('span', { 'class': 'hint', text: q.from ? '想想第 ' + q.from + ' 關的紙條' : lv.name });
        var head = h('div', { 'class': 'q-head' }, [
            q.from ? h('span', { 'class': 'pill pill--orange pill--blink', text: '第 ' + q.from + ' 關的回想題' }) : h('span', { 'class': 'pill pill--blue', text: q.t }),
            side
        ]);
        var inner = h('div', { 'class': 'q-text__inner', text: q.q });
        var box = h('div', { 'class': 'q-text' }, [inner]);
        var opts = h('div', { 'class': 'q-opts' });
        var letters = ['A', 'B', 'C', 'D'];
        var pairs = [];
        q.o.forEach(function (label, i) {
            var t = h('span', { 'class': 'opt__text', text: label });
            var b = h('button', { 'class': 'opt' }, [h('span', { 'class': 'opt__badge', text: letters[i] }), t]);
            pairs.push([t, b]);
            b.addEventListener('click', function () { answer(q, i, { opts: opts, box: box, side: side, pairs: pairs }); });
            opts.appendChild(b);
        });

        screen.appendChild(head);
        screen.appendChild(box);
        screen.appendChild(opts);

        UI.fit(inner, px('--fs-question', 40), px('--fs-question-min', 26), box);
        fitOptions(pairs);
    }

    function fitOptions(pairs) {
        pairs.forEach(function (p) { UI.fit(p[0], px('--fs-option', 34), px('--fs-option-min', 24), p[1]); });
    }

    function nextQuestion() {
        S.qi++;
        if (S.qi >= LEVELS[S.lv].qs.length) showResult();
        else showQuestion();
    }

    function answer(q, i, ui) {
        if (S.locked) return;
        S.locked = true;
        var ok = i === q.c;
        S.answers.push({
            q: q.q, t: q.from ? '第 ' + q.from + ' 關的回想題' : q.t, chosen: q.o[i], correct: q.o[q.c], ok: ok,
            kind: q.k[i], why: q.w[i], kinds: q.k.filter(function (k) { return k; })
        });
        Array.prototype.forEach.call(ui.opts.children, function (b, idx) {
            b.disabled = true;
            if (idx === q.c) b.classList.add('is-ok');
            else if (idx === i) b.classList.add('is-bad');
        });
        if (ok) {
            setTimeout(nextQuestion, 650);
            return;
        }
        showFeedback(q, i, ui);
    }

    /* 答錯：題目區改成「正確答案＋為什麼會錯」，選項變矮一點，下方多一顆「下一題」 */
    function showFeedback(q, i, ui) {
        screen.classList.add('is-feedback');
        ui.side.replaceWith(h('span', { 'class': 'pill pill--' + (q.from ? 'yellow' : 'orange'), text: q.k[i] }));
        ui.box.innerHTML = '';
        var fb = h('div', { 'class': 'fb' }, [
            h('div', { 'class': 'fb__q', text: q.q }),
            h('div', { 'class': 'fb__ans', html: UI.icon('check') + '<span>' + UI.esc(q.o[q.c]) + '</span>' }),
            h('div', { 'class': 'fb__why', text: q.w[i] })
        ]);
        ui.box.appendChild(fb);
        screen.appendChild(h('button', { 'class': 'btn btn--primary', html: '<span>下一題</span>', on: { click: nextQuestion } }));
        fitOptions(ui.pairs);
        UI.fit(fb, px('--fs-md', 30), 20, ui.box);
    }

    function leaveLevel() {
        askConfirm('要離開這一關嗎？\n作答進度不會保留。', '離開', '繼續作答').then(function (yes) {
            if (yes) showLevels();
        });
    }

    /* ═══ ④ 結果：答對率＋「最容易被哪一種混淆騙到」═══ */
    function confusionStats() {
        var st = {};
        S.answers.forEach(function (a) {
            a.kinds.filter(function (k, i, arr) { return arr.indexOf(k) === i; }).forEach(function (k) {
                st[k] = st[k] || { seen: 0, hit: 0 };
                st[k].seen++;
            });
            if (!a.ok && a.kind) st[a.kind].hit++;
        });
        return Object.keys(st).filter(function (k) { return st[k].hit > 0; }).sort(function (a, b) {
            return st[b].hit - st[a].hit || st[b].hit / st[b].seen - st[a].hit / st[a].seen;
        }).slice(0, 3).map(function (k) { return { k: k, hit: st[k].hit, seen: st[k].seen }; });
    }

    function showResult() {
        var lv = LEVELS[S.lv];
        var total = S.answers.length;
        var okCount = S.answers.filter(function (a) { return a.ok; }).length;
        var pct = Math.round(okCount / total * 100);
        var best = UI.store.get(bestKey(lv.id), null);
        if (best == null || pct > best) UI.store.set(bestKey(lv.id), pct);
        S.wrong = S.answers.filter(function (a) { return !a.ok; });

        setBar('第 ' + lv.id + ' 關・結果', okCount + ' / ' + total, 1, showLevels);
        clear();

        var stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
        var msg = pct >= 90 ? '太厲害了！' : pct >= 70 ? '很不錯喔！' : pct >= 40 ? '再接再厲！' : '慢慢來！';

        var R = 76;
        var C = 2 * Math.PI * R;
        var ring = h('div', {
            'class': 'ring', html:
                '<svg viewBox="0 0 176 176">' +
                '<circle cx="88" cy="88" r="' + R + '" fill="none" style="stroke:var(--c-yellow-soft)" stroke-width="16"/>' +
                '<circle cx="88" cy="88" r="' + R + '" fill="none" style="stroke:var(--c-green)" stroke-width="16" stroke-linecap="round"' +
                ' stroke-dasharray="' + (C * pct / 100) + ' ' + C + '"/></svg>' +
                '<div class="ring__num"><span class="ring__pct">' + pct + '%</span>' +
                '<span class="ring__frac">答對 ' + okCount + '/' + total + '</span></div>'
        });
        var starHtml = '';
        for (var s = 0; s < 3; s++) starHtml += UI.icon('star', s < stars ? '' : 'off');
        screen.appendChild(h('div', { 'class': 'res-top' }, [
            ring,
            h('div', { 'class': 'res-msg' }, [
                h('div', { 'class': 'res-msg__title', text: msg }),
                h('div', { 'class': 'res-msg__stars', html: starHtml }),
                h('div', { 'class': 'hint', style: { 'text-align': 'left' }, text: best != null && pct > best ? '刷新最佳紀錄！' : (best != null ? '最佳紀錄 ' + Math.max(best, pct) + '%' : '第一次挑戰') })
            ])
        ]));

        /* 混淆類型：被騙到的次數／遇到這一類誘答的題數 */
        var top = confusionStats();
        var panel = h('div', { 'class': 'conf' }, [
            h('div', { 'class': 'conf__head' }, [
                h('span', { 'class': 'conf__title', text: top.length ? '最容易被哪一種騙到' : '混淆分析' }),
                S.wrong.length ? h('button', {
                    'class': 'conf__more', text: '看錯題 (' + S.wrong.length + ')',
                    on: { click: function () { S.rev = 0; showReview(); } }
                }) : null
            ])
        ]);
        if (!top.length) {
            panel.appendChild(h('div', { 'class': 'conf__none', text: '這一關沒有被任何混淆騙到！' }));
        } else {
            top.forEach(function (c) {
                panel.appendChild(h('div', { 'class': 'conf__row' }, [
                    h('div', { 'class': 'conf__line' }, [
                        h('span', { 'class': 'conf__name', text: c.k }),
                        h('span', { 'class': 'conf__frac', text: '騙到 ' + c.hit + '／' + c.seen + ' 次' })
                    ]),
                    h('div', { 'class': 'conf__desc', text: KINDS[c.k] || '' })
                ]));
            });
        }
        screen.appendChild(panel);

        var last = S.lv >= LEVELS.length - 1;
        screen.appendChild(h('div', { 'class': 'row' }, [
            h('button', { 'class': 'btn btn--line', html: UI.icon('refresh') + '<span>再玩一次</span>', on: { click: function () { startLevel(S.lv); } } }),
            last
                ? h('button', { 'class': 'btn btn--primary', html: UI.icon('home') + '<span>回主選單</span>', on: { click: function () { location.href = 'index.html'; } } })
                : h('button', { 'class': 'btn btn--primary', html: '<span>下一關</span>', on: { click: function () { startLevel(S.lv + 1); } } })
        ]));
        screen.appendChild(h('button', { 'class': 'btn btn--sky btn--sm', text: '選其他關卡', on: { click: showLevels } }));
    }

    /* ═══ ⑤ 錯題回顧（一題一頁）═══ */
    function showReview() {
        var a = S.wrong[S.rev];
        var n = S.wrong.length;
        setBar('錯題回顧', (S.rev + 1) + ' / ' + n, (S.rev + 1) / n, showResult);
        clear();

        var inner = h('div', { 'class': 'rev__q-inner', text: a.q });
        var qbox = h('div', { 'class': 'rev__q' }, [inner]);
        var card = h('div', { 'class': 'card rev' }, [
            h('div', { 'class': 'rev__tags' }, [
                h('span', { 'class': 'pill pill--blue', text: a.t }),
                a.kind ? h('span', { 'class': 'pill pill--orange', text: a.kind }) : null
            ]),
            qbox,
            h('div', { 'class': 'rev__line rev__line--bad', html: UI.icon('cross') + '<span class="rev__label">你的答案</span>' }, [h('span', { 'class': 'rev__value', text: a.chosen })]),
            h('div', { 'class': 'rev__line rev__line--ok', html: UI.icon('check') + '<span class="rev__label">正確答案</span>' }, [h('span', { 'class': 'rev__value', text: a.correct })]),
            a.why ? h('div', { 'class': 'rev__why', text: a.why }) : null
        ]);
        screen.appendChild(card);

        var prev = h('button', { 'class': 'btn btn--line', html: UI.icon('back') + '<span>上一題</span>', on: { click: function () { S.rev--; showReview(); } } });
        var next = h('button', { 'class': 'btn btn--sky', text: '下一題', on: { click: function () { S.rev++; showReview(); } } });
        if (S.rev === 0) prev.disabled = true;
        if (S.rev >= n - 1) next.disabled = true;
        screen.appendChild(h('div', { 'class': 'row' }, [prev, next]));
        screen.appendChild(h('button', { 'class': 'btn btn--primary btn--sm', text: '回到結果', on: { click: showResult } }));

        UI.fit(inner, px('--fs-question', 40), px('--fs-question-min', 26), qbox);
    }

    /* ─── 驗證用：進來就把這一局 8 關的紙條、題目、選項與正解印在主控台（F12 開）─── */
    var LETTERS = ['A', 'B', 'C', 'D'];
    function logSession(sess) {
        if (!window.console || !console.group) return;
        console.group('明明還記得... 本局內容（主題：' + (sess.themeName || '') + '，種子 ' + sess.seed + '）');
        sess.levels.forEach(function (lv) {
            console.group('第 ' + lv.id + ' 關・' + lv.name + '（' + lv.tag + '・' + lv.date + '・共 ' + lv.qs.length + ' 題）');
            console.log('紙條：\n' + lv.note.join('\n'));
            console.table(lv.qs.map(function (q, i) {
                return {
                    題號: i + 1,
                    題目: q.q,
                    A: q.o[0], B: q.o[1], C: q.o[2], D: q.o[3],
                    正解: LETTERS[q.c] + '．' + q.o[q.c],
                    回想題: q.from ? '第 ' + q.from + ' 關' : ''
                };
            }));
            console.groupEnd();
        });
        console.groupEnd();
    }

    /* ─── 驗證用（主控台）：FMQuiz.question(關卡索引, 題目索引)、FMQuiz.pick(選項索引) ─── */
    window.FMQuiz = {
        levels: function () { return LEVELS; },
        question: function (lv, qi) { S.lv = lv; S.qi = qi; S.answers = []; showQuestion(); },
        pick: function (i) { var b = screen.querySelectorAll('.opt')[i]; if (b) b.click(); return !!b; },
        result: function (lv, answers) { S.lv = lv; S.answers = answers; showResult(); }
    };

    /* ─── 啟動 ─── */
    UI.ready(function () {
        Stage.init();
        screen = document.getElementById('screen');
        barTitle = document.getElementById('bar-title');
        barMeta = document.getElementById('bar-meta');
        barBack = document.getElementById('bar-back');
        barProgress = document.getElementById('bar-progress');
        confirmEl = document.getElementById('confirm');
        barBack.addEventListener('click', function () { if (backAction) backAction(); });

        try {
            var sess = window.QuizGen.session();
            LEVELS = sess.levels;
            THEME = sess.themeName || '';
            logSession(sess);
        } catch (e) {
            setBar('明明還記得...', '', null, function () { location.href = 'index.html'; });
            screen.appendChild(h('div', { 'class': 'conf__none', text: '題目產生失敗，請回主選單再進來一次。' }));
            if (window.console) console.error(e);
            return;
        }
        UI.fonts(['900 30px "Noto Sans TC"', '700 30px "Noto Sans TC"'], '明明還記得...選關卡新手暖身', 1500).then(showLevels);

        /* 給驗證用：?level=3 直接進某關；?seed=數字 重現某一局 */
        var m = /[?&]level=(\d+)/.exec(location.search);
        if (m) setTimeout(function () { startLevel(Math.max(0, Math.min(LEVELS.length - 1, +m[1] - 1))); }, 1600);
    });
})();
