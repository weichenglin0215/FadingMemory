/* ═══════════════════════════════════════════════════════════════════
   hud.js — 正式模式的 2D 介面（疊在 3D 上，全部在 500×850 舞台內）
   · 左下虛擬搖桿：往上＝前進、往下＝後退、往左右＝轉彎（鍵盤：方向鍵／WASD）
   · 右下互動鍵：靠近可互動的東西才出現（鍵盤：空白鍵／Enter）
   · 對話框 ask/say、紙條 note（自動分頁＋燒掉）、提示 toast、廣播 banner、轉場 fade
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var h = UI.h;
    var HUD = {};

    var root, chipPlace, chipTime, invEl, toastEl, toastBox, bannerEl;
    var joyEl, knobEl, actEl, actLabel, fadeEl, fadeText, loadingEl, menuBtn;
    var modal = 0;
    var toastTimer = 0;
    var actionHandler = null;
    var menuHandler = null;
    var controlsOn = true;
    var joy = { x: 0, y: 0, id: null };
    var sim = { x: 0, y: 0, until: 0 };
    var keys = {};
    var JOY_TRAVEL = 0.34; /* 搖桿頭可移動半徑 = 底座寬度 × 0.34 */

    /* 語音朗讀：由 story.js 接上 HUD.voice = { say(text, {hold, maxWait}) → tag, drop(tag) }
       對話框、紙條、提示、轉場字都會念；對話框關掉時，它還沒念完的部分就停掉 */
    HUD.voice = null;
    function speak(text, opt) { return HUD.voice && text ? HUD.voice.say(text, opt) : 0; }
    function unspeak(tag) { if (HUD.voice && tag) HUD.voice.drop(tag); }

    HUD.init = function (el) {
        root = el;

        /* 上方列 */
        menuBtn = h('button', {
            'class': 'hud-menu hit', html: UI.icon('menu'), attrs: { 'aria-label': '選單' },
            on: { click: function () { if (!modal && menuHandler) menuHandler(); } }
        });
        chipPlace = h('span', { text: '' });
        chipTime = h('span', { 'class': 'hud-chip__time' });
        invEl = h('div', { 'class': 'hud-inv' });
        root.appendChild(h('div', { 'class': 'hud-top' }, [
            menuBtn,
            h('div', { 'class': 'hud-chip' }, [chipPlace, chipTime]),
            invEl
        ]));

        toastBox = h('div', { 'class': 'hud-toast__box' });
        toastEl = h('div', { 'class': 'hud-toast is-hidden' }, [toastBox]);
        root.appendChild(toastEl);

        bannerEl = h('div', { 'class': 'hud-banner' });
        bannerEl.hidden = true;
        root.appendChild(bannerEl);

        /* 搖桿 */
        var arrows = h('div', {
            'class': 'joy__arrows', html:
                UI.icon('up').replace('class="icon ', 'style="left:80px;top:6px" class="icon ') +
                UI.icon('down').replace('class="icon ', 'style="left:80px;bottom:6px" class="icon ') +
                UI.icon('left').replace('class="icon ', 'style="left:6px;top:80px" class="icon ') +
                UI.icon('right').replace('class="icon ', 'style="right:6px;top:80px" class="icon ')
        });
        knobEl = h('div', { 'class': 'joy__knob' });
        joyEl = h('div', { 'class': 'joy hit', attrs: { 'aria-label': '移動搖桿' } }, [h('div', { 'class': 'joy__base' }), arrows, knobEl]);
        root.appendChild(joyEl);
        bindJoystick();

        /* 互動鍵 */
        actLabel = h('span', { 'class': 'act__label' });
        actEl = h('button', { 'class': 'act hit', html: UI.icon('hand') }, [actLabel]);
        actEl.hidden = true;
        actEl.addEventListener('click', function () {
            if (!modal && actionHandler) actionHandler();
        });
        root.appendChild(actEl);

        /* 轉場 */
        fadeText = h('div', { 'class': 'fade__text' });
        fadeEl = h('div', { 'class': 'fade' }, [fadeText]);
        root.appendChild(fadeEl);

        bindKeys();
    };

    /* ─── 搖桿 ─── */
    function setKnob(x, y) {
        var travel = UI.cssPx('--joy-size', 200) * JOY_TRAVEL;
        knobEl.style.transform = (x || y) ? 'translate(' + (x * travel) + 'px,' + (y * travel) + 'px)' : '';
    }

    function releaseJoy() {
        joy.id = null;
        joy.x = 0;
        joy.y = 0;
        joyEl.classList.remove('is-active');
        setKnob(0, 0);
    }

    function bindJoystick() {
        function move(e) {
            var r = joyEl.getBoundingClientRect();
            var radius = r.width * JOY_TRAVEL;
            var dx = (e.clientX - (r.left + r.width / 2)) / radius;
            var dy = (e.clientY - (r.top + r.height / 2)) / radius;
            var len = Math.sqrt(dx * dx + dy * dy);
            if (len > 1) { dx /= len; dy /= len; }
            joy.x = dx;
            joy.y = dy;
            setKnob(dx, dy);
        }
        joyEl.addEventListener('pointerdown', function (e) {
            if (modal || !controlsOn) return;
            e.preventDefault();
            joy.id = e.pointerId;
            try { joyEl.setPointerCapture(e.pointerId); } catch (err) { }
            joyEl.classList.add('is-active');
            move(e);
        });
        joyEl.addEventListener('pointermove', function (e) {
            if (e.pointerId === joy.id) move(e);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
            joyEl.addEventListener(ev, function (e) {
                if (e.pointerId === joy.id) releaseJoy();
            });
        });
    }

    function bindKeys() {
        var map = {
            ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
            ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r'
        };
        global.addEventListener('keydown', function (e) {
            if (map[e.code]) { keys[map[e.code]] = true; e.preventDefault(); return; }
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
                if (!modal && actionHandler && !actEl.hidden) { actionHandler(); e.preventDefault(); }
            }
            if (e.code === 'Escape' && !modal && menuHandler) menuHandler();
        });
        global.addEventListener('keyup', function (e) {
            if (map[e.code]) keys[map[e.code]] = false;
        });
        global.addEventListener('blur', function () { keys = {}; releaseJoy(); });
    }

    /* 目前的移動輸入 {x, y}：x 右為正，y 下為正（搖桿往上推 = y 負 = 前進） */
    HUD.input = function () {
        if (modal || !controlsOn) return { x: 0, y: 0 };
        if (sim.until > performance.now()) return { x: sim.x, y: sim.y };
        if (joy.id !== null) return { x: joy.x, y: joy.y };
        var x = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
        var y = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
        return { x: x, y: y };
    };

    /* 驗證用：模擬搖桿推 ms 毫秒 */
    HUD.simulate = function (x, y, ms) {
        sim.x = x;
        sim.y = y;
        sim.until = performance.now() + ms;
        setKnob(x, y);
        setTimeout(function () { if (sim.until <= performance.now()) setKnob(0, 0); }, ms + 20);
        return UI.wait(ms);
    };

    HUD.controls = function (on) {
        controlsOn = on;
        joyEl.hidden = !on;
        if (!on) { releaseJoy(); HUD.action(null); }
    };

    HUD.action = function (label) {
        if (!label || !controlsOn) {
            actEl.hidden = true;
            return;
        }
        actEl.hidden = false;
        if (actLabel.textContent !== label) {
            actLabel.textContent = label;
            UI.fit(actLabel, UI.cssPx('--fs-sm', 26), 18);
        }
    };

    HUD.onAction = function (fn) { actionHandler = fn; };
    HUD.onMenu = function (fn) { menuHandler = fn; };
    HUD.isModal = function () { return modal > 0; };

    /* ─── 上方資訊（字太長時自動縮小，不會被切掉）─── */
    function fitChip() {
        var chip = chipPlace.parentNode;
        var max = UI.cssPx('--fs-sm', 26);
        var size = max;
        chip.style.fontSize = size + 'px';
        while (size > 18 && chip.scrollWidth > chip.clientWidth + 1) {
            size -= 1;
            chip.style.fontSize = size + 'px';
        }
    }
    HUD.setPlace = function (text) { chipPlace.textContent = text || ''; fitChip(); };
    HUD.setTime = function (text) { chipTime.innerHTML = text ? UI.icon('clock') + '<span>' + text + '</span>' : ''; fitChip(); };
    HUD.setInventory = function (items) {
        invEl.innerHTML = '';
        items.forEach(function (name) {
            invEl.appendChild(h('div', { 'class': 'hud-inv__item', html: UI.icon(name) }));
        });
        fitChip();
    };

    /* opt.silent：不念出來 */
    HUD.toast = function (text, ms, opt) {
        if (!(opt && opt.silent)) speak(text);
        toastBox.textContent = text;
        toastEl.classList.remove('is-hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.add('is-hidden'); }, ms || 2600);
    };

    HUD.banner = function (text) {
        if (!text) { bannerEl.hidden = true; return; }
        bannerEl.innerHTML = UI.icon('bus') + '<span>' + UI.esc(text) + '</span>';
        bannerEl.hidden = false;
    };

    HUD.fade = function (on, text) {
        if (on && text) speak(text, { maxWait: 6000 });
        fadeText.textContent = text || '';
        fadeEl.classList.toggle('is-on', !!on);
        return UI.wait(380);
    };

    HUD.loading = function (text, art) {
        if (!text) {
            if (loadingEl) { loadingEl.remove(); loadingEl = null; }
            return;
        }
        if (!loadingEl) {
            loadingEl = h('div', { 'class': 'hud-loading hit' });
            root.appendChild(loadingEl);
        }
        loadingEl.innerHTML = UI.art(art || 'home', 'hud-loading__art') + '<div>' + UI.esc(text) + '</div>';
    };

    /* ─── 對話框 ───
       HUD.ask({ title, text, art:'sun'|'rain'|'home', choices:[{label, value, kind:'primary'|'go'|'sky'|'line'}],
                 cols:1|2|3, big:true, center:true,
                 speak: '要念的字' | false（省略＝念標題＋內文） }) → Promise(value) */
    HUD.ask = function (o) {
        return new Promise(function (resolve) {
            modal++;
            releaseJoy();
            HUD.action(null);
            var tag = o.speak === false ? 0 : speak(o.speak || [o.title, o.text].filter(Boolean).join('\n'), { hold: true });
            var layer = h('div', { 'class': 'dlg hit' + (o.center ? ' dlg--center' : '') });
            var card = h('div', { 'class': 'dlg__card' });
            var head = h('div', { 'class': 'dlg__head' });
            if (o.art) head.appendChild(h('div', { 'class': 'dlg__art', html: UI.art(o.art) }));
            if (o.title) head.appendChild(h('div', { 'class': 'dlg__title ' + (o.tone ? 'tone-' + o.tone : ''), text: o.title }));
            if (o.art || o.title) card.appendChild(head);
            if (o.text) card.appendChild(h('div', { 'class': 'dlg__text', text: o.text }));
            if (o.html) card.appendChild(h('div', { 'class': 'dlg__text', html: o.html }));
            var cols = o.cols || (o.choices.length === 2 ? 2 : 1);
            var grid = h('div', { 'class': 'dlg__choices dlg__choices--' + cols });
            o.choices.forEach(function (c) {
                grid.appendChild(h('button', {
                    'class': 'btn btn--' + (c.kind || 'primary') + (o.big ? ' btn--big' : ''),
                    html: (c.icon ? UI.icon(c.icon) : '') + '<span>' + UI.esc(c.label) + '</span>',
                    attrs: { 'data-value': String(c.value) },
                    on: {
                        click: function () {
                            if (layer.dataset.done) return;
                            layer.dataset.done = '1';
                            unspeak(tag);
                            layer.remove();
                            modal = Math.max(0, modal - 1);
                            resolve(c.value);
                        }
                    }
                }));
            });
            card.appendChild(grid);
            layer.appendChild(card);
            root.appendChild(layer);
        });
    };

    HUD.say = function (o) {
        return HUD.ask({
            title: o.title, text: o.text, html: o.html, art: o.art, tone: o.tone, center: o.center, speak: o.speak,
            choices: [{ label: o.ok || '好', value: true, kind: o.kind || 'primary' }]
        });
    };

    /* 紙條：自動分頁，最後一頁按「看完了」就燒掉 → Promise（每翻到一頁就念那一頁） */
    HUD.note = function (paras) {
        return new Promise(function (resolve) {
            modal++;
            releaseJoy();
            HUD.action(null);
            var tag = 0;
            var layer = h('div', { 'class': 'dlg dlg--note dlg--center hit' });
            var note = h('div', { 'class': 'note' });
            var pager = h('div', { 'class': 'hint' });
            var btns = h('div', { 'class': 'row' });
            var card = h('div', { 'class': 'dlg__card' }, [
                h('div', { 'class': 'dlg__head' }, [
                    h('span', { 'class': 'pill pill--yellow', html: UI.icon('clock') + '<span>不限時間・只能看一次</span>' })
                ]),
                note, pager, btns
            ]);
            layer.appendChild(card);
            root.appendChild(layer);

            pager.textContent = '看完就按下方按鈕，紙條會燒掉';
            btns.appendChild(h('button', { 'class': 'btn btn--sky', text: '…' }));
            var pages = [];
            var page = 0;
            var maxFs = UI.cssPx('--fs-note', 34);
            var minFs = UI.cssPx('--fs-note-min', 26);

            function render() {
                var total = pages.length;
                pager.textContent = total > 1 ? '第 ' + (page + 1) + ' / ' + total + ' 頁・看完最後一頁再燒掉' : '看完就按下方按鈕，紙條會燒掉';
                btns.innerHTML = '';
                if (page > 0) {
                    btns.appendChild(h('button', {
                        'class': 'btn btn--line', html: UI.icon('back') + '<span>上一頁</span>',
                        on: { click: function () { page--; render(); } }
                    }));
                }
                if (page < total - 1) {
                    btns.appendChild(h('button', { 'class': 'btn btn--sky', text: '下一頁', on: { click: function () { page++; render(); } } }));
                } else {
                    btns.appendChild(h('button', {
                        'class': 'btn btn--primary', text: page > 0 ? '燒掉紙條' : '看完了，燒掉紙條',
                        on: {
                            click: function () {
                                if (layer.dataset.done) return;
                                layer.dataset.done = '1';
                                unspeak(tag);
                                note.classList.add('is-burning');
                                setTimeout(function () {
                                    layer.remove();
                                    modal = Math.max(0, modal - 1);
                                    resolve();
                                }, 750);
                            }
                        }
                    }));
                }
                UI.renderParas(note, pages[page]);
                UI.fit(note, maxFs, minFs);
                unspeak(tag);
                tag = speak(pages[page].join(''), { hold: true });
            }

            UI.fonts(['700 34px "Noto Serif TC"'], paras.join(''), 2500).then(function () {
                note.style.fontSize = maxFs + 'px';
                pages = UI.paginate(paras, note);
                render();
            });
        });
    };

    global.HUD = HUD;
})(window);
