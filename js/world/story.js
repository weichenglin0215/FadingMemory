/* ═══════════════════════════════════════════════════════════════════
   story.js — 正式模式的流程
   開場說明 → 紙條（看完燒掉）→ 下午 5:00 打鐘：下班／加班
   → 依紙條一段一段辦事 → 平安到家
   · 每進一個場景就存一個「檢查點」；做錯事 → 從這一段重來（紙條不會再出現）
   · 選「加班」→ 任務失敗，回到辦公室 5:00 重新打鐘
   · 測試用網址：world.html?scene=ubike&inv=gift,cake  直接跳到某一段
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var FM = global.FM = global.FM || {};

    var NOTE = [
        '一個男人下班回家，',
        '要搭 236 號公車，在衡陽路下車，',
        '去遠東百貨的三樓，買翡翠手鐲給老婆當生日禮物；',
        '再去搭 758 號公車，去蘭陽蛋糕店拿巧克力蛋糕；',
        '再騎 UBIKE，在開封街右轉，在漢口街左轉；',
        '在博愛路搭 52 號公車，在西藏路下車；',
        '第三個巷子右轉，過兩個巷子左轉，',
        '右手第三間、12 號，就是男人的家。'
    ];

    var ITEM_ICON = { gift: 'gift', cake: 'cake' };

    var st = {
        inv: [],
        cp: { id: 'office', params: {}, inv: [] },
        fails: 0,
        started: 0,
        clock: 17 * 3600,
        clockOn: false,
        failing: false,
        voice: UI.store.get('fm.voice', true)
    };

    /* ─── 音效（WebAudio 合成，不需音檔）─── */
    var ac = null;
    function audio() {
        if (!ac) {
            try { ac = new (global.AudioContext || global.webkitAudioContext)(); } catch (e) { ac = null; }
        }
        if (ac && ac.state === 'suspended') ac.resume();
        return ac;
    }
    function tone(freq, at, dur, type, vol) {
        var a = audio();
        if (!a) return;
        var t0 = a.currentTime + at;
        var o = a.createOscillator();
        var g = a.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(a.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
    }
    function sfx(name) {
        try {
            if (name === 'bell') { tone(659, 0, 0.9); tone(523, 0.55, 1.1); tone(659, 1.3, 0.9); tone(523, 1.85, 1.3); }
            else if (name === 'ding') { tone(880, 0, 0.5); tone(1175, 0.12, 0.6, 'sine', 0.12); }
            else if (name === 'bus') { tone(220, 0, 0.35, 'triangle', 0.14); tone(277, 0, 0.35, 'triangle', 0.1); }
            else if (name === 'door') { tone(440, 0, 0.18, 'triangle', 0.1); tone(330, 0.1, 0.25, 'triangle', 0.1); }
            else if (name === 'good') { tone(523, 0, 0.25); tone(659, 0.1, 0.25); tone(784, 0.2, 0.45); }
            else if (name === 'bad') { tone(392, 0, 0.3, 'triangle', 0.14); tone(311, 0.2, 0.5, 'triangle', 0.14); }
            else if (name === 'win') { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, i * 0.13, 0.4); }); }
        } catch (e) { }
    }

    /* ─── 語音廣播（瀏覽器有中文語音才會念）─── */
    function speak(text) {
        if (!st.voice || !global.speechSynthesis) return;
        try {
            speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(text);
            u.lang = 'zh-TW';
            u.rate = 0.9;
            var voices = speechSynthesis.getVoices();
            var v = voices.filter(function (x) { return /zh[-_]TW/i.test(x.lang); })[0] ||
                voices.filter(function (x) { return /^zh/i.test(x.lang); })[0];
            if (v) u.voice = v;
            speechSynthesis.speak(u);
        } catch (e) { }
    }

    /* ─── 時鐘：真實 1 秒 = 遊戲 10 秒 ─── */
    function clockText() {
        var m = Math.floor(st.clock / 60);
        var hh = Math.floor(m / 60) % 24;
        var mm = m % 60;
        return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }
    var lastClock = '';
    function tickClock(dt) {
        if (st.clockOn && !FM.core.frozen && !FM.core.busy && !HUD.isModal()) st.clock += dt * 10;
        var t = clockText();
        if (t !== lastClock) { lastClock = t; HUD.setTime(t); }
    }

    /* ─── 物品 ─── */
    function setInv(list) {
        st.inv = list.slice();
        HUD.setInventory(st.inv.map(function (k) { return ITEM_ICON[k] || 'star'; }));
    }

    /* ─── 凍結（演出時玩家不能動、隱藏搖桿）─── */
    function freeze(on) {
        FM.core.frozen = !!on;
        var ctx = FM.core.ctx;
        HUD.controls(!on && !!ctx && ctx.mode !== 'none');
    }

    /* ─── 換場景 ─── */
    async function go(id, params, opts) {
        opts = opts || {};
        if (FM.core.busy) return;
        FM.core.busy = true;
        FM.core.frozen = true;
        HUD.banner(null);
        HUD.controls(false);
        if (global.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { }
        await HUD.fade(true, opts.text || '');
        FM.core.load(id, params || {}, api);
        HUD.setPlace(FM.core.ctx.place);
        if (opts.checkpoint !== false) st.cp = { id: id, params: params || {}, inv: st.inv.slice() };
        await UI.wait(opts.text ? 450 : 150);
        await HUD.fade(false);
        FM.core.busy = false;
        if (!opts.hold) freeze(false);
        var def = FM.scenes[id];
        if (def.enter && !opts.noEnter) def.enter(FM.core.ctx, api, params || {});
    }

    /* ─── 做錯：從這一段重來 ─── */
    async function fail(reason) {
        if (st.failing || FM.core.busy) return;
        st.failing = true;
        freeze(true);
        HUD.banner(null);
        st.fails++;
        sfx('bad');
        await HUD.ask({
            title: '哎呀！', tone: 'bad', center: true,
            text: reason + '\n別擔心，從這一段重新開始。',
            choices: [{ label: '從這一段重來', value: 1, kind: 'primary', icon: 'refresh' }]
        });
        st.failing = false;
        restart();
    }

    function restart() {
        var cp = st.cp;
        setInv(cp.inv);
        if (cp.id === 'office') {
            go('office', {}, { text: '回到辦公室…', hold: true }).then(function () { officeBell(false); });
        } else {
            go(cp.id, cp.params, { checkpoint: false, text: '重新開始這一段' });
        }
    }

    /* ─── 開場：辦公室 5:00 打鐘 ─── */
    async function officeBell(first) {
        freeze(true);
        st.clock = 17 * 3600;
        st.clockOn = false;
        if (first) {
            await HUD.note(NOTE);
            await UI.wait(300);
        }
        sfx('bell');
        HUD.toast('噹～噹～下午五點了！', 2600);
        await UI.wait(1400);
        var a = await HUD.ask({
            title: '下午 5:00', art: 'sun', center: true, text: '下班時間到了，你要？', big: true,
            choices: [{ label: '下班', value: 'go', kind: 'go' }, { label: '加班', value: 'stay', kind: 'line' }]
        });
        if (a === 'stay') {
            fail('你選擇了加班……\n今天回不了家了！');
            return;
        }
        if (!st.started) st.started = performance.now();
        st.clockOn = true;
        freeze(false);
        HUD.toast('收拾好了！找到辦公室的出口，搭電梯下樓吧。', 4200);
    }

    /* ─── 到家 ─── */
    async function win() {
        freeze(true);
        st.clockOn = false;
        var ctx = FM.core.ctx;
        var wife = ctx.data.wife;
        if (wife) {
            var door = ctx.data.homeDoor;
            if (door) FM.core.tween(0.7, function (t) { door.position.x = -1.3 * t; });
            wife.visible = true;
            ctx.tick(function (dt, t) { FM.kit.animPerson(wife, 0, 0, 'wave', t); });
            FM.kit.confetti(ctx, 52.5, 3, -66.5, 70);
            FM.core.camTo(new THREE.Vector3(49.6, 3.0, -61.2), new THREE.Vector3(53.6, 1.5, -66.8), 2);
        }
        sfx('win');
        var secs = st.started ? Math.round((performance.now() - st.started) / 1000) : 0;
        var mm = Math.floor(secs / 60);
        var ss = secs % 60;
        var best = UI.store.get('fm.world.best', null);
        var isBest = best == null || secs < best;
        if (isBest) UI.store.set('fm.world.best', secs);
        await UI.wait(2600);
        var a = await HUD.ask({
            title: '平安到家了！', tone: 'ok', art: 'home', center: true,
            text: '老婆：「生日禮物和巧克力蛋糕都拿到了，謝謝你！」\n' +
                '花了 ' + mm + ' 分 ' + ss + ' 秒・重來 ' + st.fails + ' 次' + (isBest ? '\n刷新最佳紀錄！' : ''),
            choices: [{ label: '再玩一次', value: 'again', kind: 'primary', icon: 'refresh' }, { label: '回主選單', value: 'menu', kind: 'line', icon: 'home' }]
        });
        if (a === 'again') location.href = 'world.html';
        else location.href = 'index.html';
    }

    /* ─── 選單 ─── */
    async function menu() {
        if (FM.core.busy || st.failing) return;
        var wasFrozen = FM.core.frozen;
        freeze(true);
        var a = await HUD.ask({
            title: '暫停', center: true,
            choices: [
                { label: '繼續', value: 'resume', kind: 'go', icon: 'play' },
                { label: '重來這一段', value: 'retry', kind: 'sky', icon: 'refresh' },
                { label: '語音廣播：' + (st.voice ? '開' : '關'), value: 'voice', kind: 'line', icon: st.voice ? 'volume' : 'mute' },
                { label: '回主選單', value: 'home', kind: 'line', icon: 'home' }
            ]
        });
        if (a === 'retry') { restart(); return; }
        if (a === 'home') { location.href = 'index.html'; return; }
        if (a === 'voice') {
            st.voice = !st.voice;
            UI.store.set('fm.voice', st.voice);
            HUD.toast('語音廣播已' + (st.voice ? '開啟' : '關閉'));
        }
        freeze(wasFrozen);
    }

    /* ─── 給場景用的 API ─── */
    var api = {
        ask: function (o) { return HUD.ask(o); },
        say: function (o) { return HUD.say(o); },
        toast: function (t, ms) { HUD.toast(t, ms); },
        banner: function (t) { HUD.banner(t); },
        place: function (t) { HUD.setPlace(t); },
        freeze: freeze,
        give: function (k) { if (st.inv.indexOf(k) < 0) setInv(st.inv.concat([k])); },
        has: function (k) { return st.inv.indexOf(k) >= 0; },
        go: go,
        fail: fail,
        win: win,
        sfx: sfx,
        speak: speak
    };
    FM.api = api;

    /* ─── 驗證／除錯用 ─── */
    FM.debug = {
        info: function () {
            var i = FM.core.info();
            i.inv = st.inv.slice();
            i.cp = st.cp.id;
            i.fails = st.fails;
            i.clock = clockText();
            return i;
        },
        go: function (id, params, inv) {
            if (inv) setInv(inv);
            return go(id, params || {}, {});
        },
        tp: function (x, z, yaw) { FM.core.teleport(x, z, yaw); },
        hold: function (x, y, ms) { return HUD.simulate(x, y, ms); },
        /* 用固定時間步長推搖桿 sec 秒（不受瀏覽器降頻影響） */
        walk: function (x, y, sec) {
            HUD.simulate(x, y, 1e9);
            FM.core.step(sec);
            HUD.simulate(0, 0, 0);
            FM.core.step(0.1);
            return FM.debug.info();
        },
        step: function (sec) { FM.core.step(sec); return FM.debug.info(); },
        act: function () { FM.core.use(FM.core.near); },
        pick: function (text) {
            var b = Array.prototype.filter.call(document.querySelectorAll('.dlg button'), function (x) {
                return x.textContent.indexOf(text) >= 0;
            })[0];
            if (b) b.click();
            return !!b;
        },
        dialog: function () {
            var d = document.querySelector('.dlg');
            return d ? d.textContent : null;
        }
    };

    /* ─── 啟動 ─── */
    document.addEventListener('DOMContentLoaded', async function () {
        Stage.init();
        HUD.init(document.getElementById('hud'));
        if (!global.THREE || !FM.core || !FM.core.init) {
            HUD.loading('無法載入 3D 引擎。\n請確認網路連線後重新整理。');
            return;
        }
        HUD.loading('準備中…');
        HUD.controls(false);
        HUD.onMenu(menu);
        FM.core.init(document.getElementById('world'));
        FM.core.onFrame(tickClock);
        await UI.fonts(['900 40px "Noto Sans TC"', '700 30px "Noto Sans TC"', '700 34px "Noto Serif TC"'], NOTE.join('') + '下午下班加班正式模式', 3500);

        var q = global.location.search;
        var sm = /[?&]scene=([a-z0-9_]+)/.exec(q);
        var im = /[?&]inv=([a-z,]+)/.exec(q);
        if (sm && FM.scenes[sm[1]]) {
            /* 測試捷徑：直接跳到某一段（不顯示紙條） */
            setInv(im ? im[1].split(',').filter(Boolean) : []);
            st.started = performance.now();
            st.clockOn = true;
            HUD.loading(null);
            var params = {};
            if (sm[1] === 'bus') params = FM.ROUTES[(/[?&]route=(r\d+)/.exec(q) || [])[1] || 'r236'];
            go(sm[1], params, {});
            return;
        }

        FM.core.load('office', {}, api);
        HUD.setPlace(FM.core.ctx.place);
        FM.core.frozen = true;
        HUD.loading(null);
        audio();
        await HUD.ask({
            title: '回家的路', art: 'home', center: true,
            text: '等一下會給你一張紙條，看完就會燒掉。\n請憑記憶，把紙條上的事一件一件辦好，平安回家！\n\n左下搖桿：往上走、往下退、左右轉彎。\n靠近東西時，點它或按右下的「互動」。',
            choices: [{ label: '開始', value: 1, kind: 'primary', icon: 'play' }]
        });
        audio();
        officeBell(true);
    });
})(window);
