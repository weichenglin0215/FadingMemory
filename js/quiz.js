/* ═══════════════════════════════════════════════════════════════════
   quiz.js — 測試模式（純 2D）
   畫面：選關卡 → 紙條（自動分頁，只能看一次）→ 答題 → 結果 → 錯題回顧
   每個畫面都設計成「不用上下捲動」：題目與選項會依空間自動縮字。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var LEVELS = window.QUIZ_LEVELS;
    var DOMAINS = window.QUIZ_DOMAINS;
    var h = UI.h;

    var S = {
        lv: 0,
        qi: 0,
        answers: [],
        weather: 'clear',
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
    }

    function bestKey(id) { return 'fm.quiz.best.' + id; }

    function domainOf(tag) {
        for (var i = 0; i < DOMAINS.length; i++) {
            if (DOMAINS[i].tags.indexOf(tag) >= 0) return DOMAINS[i];
        }
        return DOMAINS[0];
    }

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

    /* ═══ ① 選關卡 ═══ */
    function showLevels() {
        setBar('測試模式', '共 8 關', null, function () { location.href = 'index.html'; });
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

    /* ═══ ② 紙條：自動分頁，看完燒掉 ═══ */
    function startLevel(idx) {
        S.lv = idx;
        S.qi = 0;
        S.answers = [];
        S.weather = Math.random() < 0.5 ? 'rain' : 'clear';
        S.eventShown = false;
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
        var lv = LEVELS[S.lv];
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
                        S.locked = true;
                        note.classList.add('is-burning');
                        setTimeout(function () { S.locked = false; showQuestion(); }, 720);
                    }
                }
            }));
        }

        /* 按鈕列放好後才放紙條內容；單一段落長到一頁放不下時，縮字到下限 */
        UI.renderParas(note, S.pages[S.page]);
        UI.fit(note, px('--fs-note', 34), px('--fs-note-min', 26));
        void lv;
    }

    /* ═══ ③ 答題 ═══ */
    function resolveQ(raw) {
        if (!raw.dyn) return raw;
        var rain = S.weather === 'rain';
        if (raw.dyn === 'weather') return { q: '現在的天氣如何？', o: ['晴天', '下雨'], c: rain ? 1 : 0, t: '條件判斷' };
        if (raw.dyn === 'first') return { q: '照規則，現在先做什麼？', o: ['買傘', '去銀行', '買便當', '回家'], c: rain ? 0 : 1, t: '條件判斷' };
        return { q: '今天一共要辦幾件事？', o: ['2 件', '3 件', '4 件', '5 件'], c: rain ? 2 : 1, t: '條件判斷' };
    }

    function showQuestion() {
        var lv = LEVELS[S.lv];
        var raw = lv.qs[S.qi];
        var total = lv.qs.length;
        setBar('第 ' + lv.id + ' 關', (S.qi + 1) + ' / ' + total, S.qi / total, leaveLevel);

        if (raw.dyn === 'weather' && !S.eventShown) {
            showEvent();
            return;
        }

        var q = resolveQ(raw);
        clear();
        S.locked = false;

        var head = h('div', { 'class': 'q-head' }, [
            h('span', { 'class': 'pill pill--blue', text: q.t }),
            h('span', { 'class': 'hint', text: lv.name })
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
            b.addEventListener('click', function () { answer(q, i, opts); });
            opts.appendChild(b);
        });

        screen.appendChild(head);
        screen.appendChild(box);
        screen.appendChild(opts);

        UI.fit(inner, px('--fs-question', 40), px('--fs-question-min', 26), box);
        pairs.forEach(function (p) { UI.fit(p[0], px('--fs-option', 34), px('--fs-option-min', 24), p[1]); });
    }

    function showEvent() {
        S.eventShown = true;
        var rain = S.weather === 'rain';
        clear();
        screen.appendChild(h('div', { 'class': 'event' }, [
            h('div', { 'class': 'event__art', html: UI.art(rain ? 'rain' : 'sun', 'event__art') }),
            h('div', { 'class': 'event__title', text: '情境更新' }),
            h('div', { 'class': 'event__text', text: rain ? '你走出辦公室，今天下雨了。' : '你走出辦公室，今天是晴天。' })
        ]));
        screen.appendChild(h('button', {
            'class': 'btn btn--primary', text: '知道了，繼續',
            on: { click: showQuestion }
        }));
    }

    function answer(q, i, opts) {
        if (S.locked) return;
        S.locked = true;
        var ok = i === q.c;
        S.answers.push({ q: q.q, t: q.t, chosen: q.o[i], correct: q.o[q.c], ok: ok });
        Array.prototype.forEach.call(opts.children, function (b, idx) {
            b.disabled = true;
            if (idx === q.c) b.classList.add('is-ok');
            else if (idx === i) b.classList.add('is-bad');
        });
        setTimeout(function () {
            S.qi++;
            if (S.qi >= LEVELS[S.lv].qs.length) showResult();
            else showQuestion();
        }, ok ? 650 : 1100);
    }

    function leaveLevel() {
        askConfirm('要離開這一關嗎？\n作答進度不會保留。', '離開', '繼續作答').then(function (yes) {
            if (yes) showLevels();
        });
    }

    /* ═══ ④ 結果：依記憶類型統計 ═══ */
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

        /* 各記憶類型的答對率 */
        var grid = h('div', { 'class': 'res-grid' });
        DOMAINS.forEach(function (d) {
            var list = S.answers.filter(function (a) { return d.tags.indexOf(a.t) >= 0; });
            if (!list.length) return;
            var ok = list.filter(function (a) { return a.ok; }).length;
            var ratio = ok / list.length;
            grid.appendChild(h('div', { 'class': 'dom' + (ratio < 0.6 ? ' is-weak' : '') }, [
                h('div', { 'class': 'dom__row' }, [
                    h('span', { text: d.name }),
                    h('span', { 'class': 'dom__frac', text: ok + '/' + list.length })
                ]),
                h('div', { 'class': 'dom__bar' }, [h('div', { 'class': 'dom__fill', style: { width: (ratio * 100) + '%' } })])
            ]));
        });
        screen.appendChild(grid);

        var wrongBtn = h('button', {
            'class': 'btn btn--line', text: S.wrong.length ? '看錯題 (' + S.wrong.length + ')' : '全部答對',
            on: { click: function () { S.rev = 0; showReview(); } }
        });
        if (!S.wrong.length) wrongBtn.disabled = true;
        screen.appendChild(h('div', { 'class': 'row' }, [
            wrongBtn,
            h('button', { 'class': 'btn btn--primary', text: '再玩一次', on: { click: function () { startLevel(S.lv); } } })
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
            h('span', { 'class': 'pill pill--blue', style: { 'align-self': 'flex-start' }, text: a.t }),
            qbox,
            h('div', { 'class': 'rev__line rev__line--bad', html: UI.icon('cross') + '<span class="rev__label">你的答案</span>' }, [h('span', { 'class': 'rev__value', text: a.chosen })]),
            h('div', { 'class': 'rev__line rev__line--ok', html: UI.icon('check') + '<span class="rev__label">正確答案</span>' }, [h('span', { 'class': 'rev__value', text: a.correct })])
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

    /* ─── 啟動 ─── */
    document.addEventListener('DOMContentLoaded', function () {
        Stage.init();
        screen = document.getElementById('screen');
        barTitle = document.getElementById('bar-title');
        barMeta = document.getElementById('bar-meta');
        barBack = document.getElementById('bar-back');
        barProgress = document.getElementById('bar-progress');
        confirmEl = document.getElementById('confirm');
        barBack.addEventListener('click', function () { if (backAction) backAction(); });
        UI.fonts(['900 30px "Noto Sans TC"', '700 30px "Noto Sans TC"'], '測試模式選關卡新手暖身', 1500).then(showLevels);

        /* 給驗證用：?level=3 直接進某關 */
        var m = /[?&]level=(\d+)/.exec(location.search);
        if (m) setTimeout(function () { startLevel(Math.max(0, Math.min(LEVELS.length - 1, +m[1] - 1))); }, 1600);
    });
})();
