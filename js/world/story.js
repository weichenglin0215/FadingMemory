/* ═══════════════════════════════════════════════════════════════════
   story.js — 正式模式的流程
   開場說明 → 紙條（看完燒掉）→ 下午 5:00 打鐘：下班／加班
   → 依紙條一段一段辦事 → 平安到家
   · 每進一個場景就存一個「檢查點」；做錯事 → 從這一段重來（紙條不會再出現）
   · 選「加班」→ 任務失敗，回到辦公室 5:00 重新打鐘
   · 測試用網址：world.html?scene=ubike&inv=gift,cake  直接跳到某一段
   ───────────────────────────────────────────────────────────────────
   這個檔案是「劇情總指揮」：決定現在玩到哪一段、手上有什麼物品、進了哪個
   場景、失敗了要退回哪個檢查點——這些「進度」狀態都存在下面的 st 物件裡。
   實際畫面長怎樣（場景裡有什麼）是 js/world/scenes.js 的事，story.js 透過
   傳給每個場景的 api 物件（ask/say/go/win/fail...）跟場景互動，自己不直接
   碰 Three.js 的 3D 物件。cp（checkpoint，檢查點）是「存檔」機制：每進一個
   新場景就把目前的場景 id／參數／物品欄存成 cp，玩家在任何一個場景做錯事
   導致任務失敗，不是整局重來，而是退回最近一次的 cp 重新開始那一小段。 */

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
        pausedMs: 0,     /* 暫停的時間不算進「花了幾分鐘」 */
        pauseAt: 0,
        clock: 17 * 3600,
        clockOn: false,
        failing: false,
        voiceHeld: false,
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

    /* ─── 語音朗讀（瀏覽器有中文語音才會念）───
       · 排隊一句一句念；長段落切成短句（有些瀏覽器一次念太長會被截斷）
       · hold：跟著畫面（對話框、紙條）——畫面關掉就停，不會過期
       · 其他（廣播、提示、轉場字）排超過 maxWait 毫秒還輪不到就跳過，免得念的時候已經過站
       · 暫停時停住，繼續時從被打斷的那一句重念
       · 瀏覽器規定：頁面被點過一下之後才能發出語音，所以開場先有一張「開始」標題卡 */
    var Voice = (function () {
        var synth = global.speechSynthesis || null;
        var queue = [];
        var cur = null;
        var gen = 0;
        var seq = 0;
        var paused = false;
        var pausedAt = 0;
        var hushAt = 0;
        var voice = null;

        function pickVoice() {
            try {
                var vs = synth.getVoices();
                voice = vs.filter(function (x) { return /zh[-_]TW/i.test(x.lang); })[0] ||
                    vs.filter(function (x) { return /^(zh|cmn)/i.test(x.lang); })[0] || null;
            } catch (e) { voice = null; }
        }
        if (synth) {
            pickVoice();
            try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) { }
        }

        /* 畫面上的寫法 → 念起來順的寫法 */
        function clean(t) {
            return String(t)
                .replace(/(\d{1,2}):(\d{2})/g, function (m, hh, mm) { return hh + '點' + (mm === '00' ? '' : mm + '分'); })
                .replace(/\bB(\d+)\b/g, '地下$1樓')
                .replace(/(\d+)F\b/g, '$1樓')
                .replace(/UBIKE/gi, 'U bike')
                .replace(/[～~]/g, '，')
                .replace(/…+|\.{3,}/g, '。')
                .replace(/[・‧→]/g, '，')
                .replace(/\s*\n+\s*/g, '。')
                .replace(/([，。！？、；：])[，。]+/g, '$1')
                .replace(/^[，。\s]+/, '')
                .trim();
        }

        /* 切成短句；太短的併到前一句 */
        function chunks(t) {
            var out = [];
            (t.match(/[^。！？；]+[。！？；」』]*/g) || []).forEach(function (p) {
                p = p.trim();
                while (p.length > 40) {
                    var cut = p.lastIndexOf('，', 40);
                    cut = cut < 8 ? 40 : cut + 1;
                    out.push(p.slice(0, cut));
                    p = p.slice(cut);
                }
                if (p) out.push(p);
            });
            var merged = [];
            out.forEach(function (p) {
                var n = merged.length;
                if (n && merged[n - 1].length + p.length <= 24) merged[n - 1] += p;
                else merged.push(p);
            });
            return merged;
        }

        function hush() {
            gen++;
            cur = null;
            hushAt = performance.now();
            try { synth.cancel(); } catch (e) { }
        }

        function next() {
            if (cur || paused || !synth || !st.voice) return;
            var now = performance.now();
            /* cancel() 之後馬上 speak()，有些瀏覽器會把新的一句吃掉：稍等一下 */
            if (now - hushAt < 80) { setTimeout(next, 90); return; }
            while (queue.length && queue[0].until && queue[0].until < now) queue.shift();
            var item = queue.shift();
            if (!item) return;
            cur = item;
            var my = ++gen;
            var u = new SpeechSynthesisUtterance(item.text);
            u.lang = 'zh-TW';
            u.rate = 0.9;
            if (voice) u.voice = voice;
            u.onend = u.onerror = function () {
                if (my !== gen) return;
                cur = null;
                next();
            };
            item.u = u; /* 留著參照：utterance 被回收的話，有些瀏覽器就不會觸發 onend */
            try { synth.speak(u); } catch (e) { cur = null; }
        }

        return {
            /* 念一段話 → 回傳 tag（給 drop 用） */
            say: function (text, o) {
                o = o || {};
                if (!synth || !st.voice || !text) return 0;
                var tag = ++seq;
                var until = o.hold ? 0 : performance.now() + (o.maxWait || 3500);
                chunks(clean(text)).forEach(function (c) { queue.push({ text: c, tag: tag, until: until }); });
                next();
                return tag;
            },
            /* 某個畫面關掉了：它還沒念完的部分不念了 */
            drop: function (tag) {
                if (!tag) return;
                queue = queue.filter(function (x) { return x.tag !== tag; });
                if (cur && cur.tag === tag) { hush(); next(); }
            },
            stop: function () { queue = []; hush(); },
            pause: function () {
                if (paused) return;
                paused = true;
                pausedAt = performance.now();
                if (cur) { cur.until = 0; queue.unshift(cur); }
                hush();
            },
            resume: function () {
                if (!paused) return;
                paused = false;
                var d = performance.now() - pausedAt;
                queue.forEach(function (x) { if (x.until) x.until += d; });
                next();
            }
        };
    })();
    HUD.voice = Voice;

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

    /* ─── 暫停：整個遊戲停住（3D 世界、補間、等待、時鐘、語音、音效）───
       和 freeze 分開：暫停不動 frozen／搖桿，繼續時原樣接回去 */
    var resumeWaiters = [];
    function setPaused(on) {
        on = !!on;
        if (FM.core.paused === on) return;
        FM.core.paused = on;
        if (on) {
            st.pauseAt = performance.now();
            Voice.pause();
            if (ac && ac.state === 'running') try { ac.suspend(); } catch (e) { }
        } else {
            if (st.started) st.pausedMs += performance.now() - st.pauseAt;
            if (ac && ac.state === 'suspended') try { ac.resume(); } catch (e) { }
            Voice.resume();
            var ws = resumeWaiters;
            resumeWaiters = [];
            ws.forEach(function (r) { r(); });
        }
    }
    /* 暫停中不開新的對話框：等繼續之後才出現 */
    function whenRunning(fn) {
        if (!FM.core.paused) return fn();
        return new Promise(function (r) { resumeWaiters.push(r); }).then(fn);
    }
    function canPause() {
        return !!FM.core.ctx && !FM.core.busy && !FM.core.paused && !st.failing && !HUD.isModal();
    }
    function playSeconds() {
        return st.started ? Math.round((performance.now() - st.started - st.pausedMs) / 1000) : 0;
    }

    /* ─── 換場景 ─── */
    async function go(id, params, opts) {
        opts = opts || {};
        if (FM.core.busy) return;
        FM.core.busy = true;
        FM.core.frozen = true;
        HUD.banner(null);
        HUD.controls(false);
        Voice.stop();
        await HUD.fade(true, opts.text || '');
        FM.core.load(id, params || {}, api);
        /* 從暫停選單按「重來這一段」：舊場景的劇情已隨換場景作廢，這時才解除暫停 */
        if (FM.core.paused) setPaused(false);
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
            await FM.core.wait(300);
        }
        sfx('bell');
        HUD.toast('噹～噹～下午五點了！', 2600);
        await FM.core.wait(1400);
        var a = await api.ask({
            title: '下午 5:00', art: 'sun', center: true, text: '下班時間到了，你要？', big: true,
            speak: '下午五點，下班時間到了。你要下班，還是加班？',
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
        var secs = playSeconds();
        var mm = Math.floor(secs / 60);
        var ss = secs % 60;
        var best = UI.store.get('fm.world.best', null);
        var isBest = best == null || secs < best;
        if (isBest) UI.store.set('fm.world.best', secs);
        await FM.core.wait(2600);
        var a = await api.ask({
            title: '平安到家了！', tone: 'ok', art: 'home', center: true,
            text: '老婆：「生日禮物和巧克力蛋糕都拿到了，謝謝你！」\n' +
                '花了 ' + mm + ' 分 ' + ss + ' 秒・重來 ' + st.fails + ' 次' + (isBest ? '\n刷新最佳紀錄！' : ''),
            choices: [{ label: '再玩一次', value: 'again', kind: 'primary', icon: 'refresh' }, { label: '回主選單', value: 'menu', kind: 'line', icon: 'home' }]
        });
        if (a === 'again') location.href = 'world.html';
        else location.href = 'index.html';
    }

    /* ─── 暫停選單：一打開就先暫停，按「繼續」才接著玩 ─── */
    async function menu() {
        if (!canPause()) return;
        setPaused(true);
        for (; ;) {
            var a = await HUD.ask({
                title: '暫停', center: true, speak: false,
                text: '遊戲停住了，時間也不會走。',
                choices: [
                    { label: '繼續', value: 'resume', kind: 'go', icon: 'play' },
                    { label: '重來這一段', value: 'retry', kind: 'sky', icon: 'refresh' },
                    { label: '語音：' + (st.voice ? '開' : '關'), value: 'voice', kind: 'line', icon: st.voice ? 'volume' : 'mute' },
                    { label: '回主選單', value: 'home', kind: 'line', icon: 'home' }
                ]
            });
            if (a === 'voice') {
                /* 切換後留在暫停選單，按鈕上的字會跟著變 */
                st.voice = !st.voice;
                UI.store.set('fm.voice', st.voice);
                if (!st.voice) Voice.stop();
                continue;
            }
            if (a === 'home') { location.href = 'index.html'; return; }
            if (a === 'retry') { Voice.stop(); restart(); return; } /* 換好場景才解除暫停（見 go） */
            setPaused(false);
            return;
        }
    }

    /* 手機切到別的 App、螢幕關掉：自動打開暫停選單，回來時先停著，按「繼續」再玩 */
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (canPause()) menu();
            else if (!FM.core.paused) { Voice.pause(); st.voiceHeld = true; }
        } else if (st.voiceHeld) {
            st.voiceHeld = false;
            if (!FM.core.paused) Voice.resume();
        }
    });

    /* ─── 給場景用的 API ─── */
    var api = {
        ask: function (o) { return whenRunning(function () { return HUD.ask(o); }); },
        say: function (o) { return whenRunning(function () { return HUD.say(o); }); },
        toast: function (t, ms, o) { HUD.toast(t, ms, o); },
        banner: function (t) { HUD.banner(t); },
        place: function (t) { HUD.setPlace(t); },
        freeze: freeze,
        give: function (k) { if (st.inv.indexOf(k) < 0) setInv(st.inv.concat([k])); },
        has: function (k) { return st.inv.indexOf(k) >= 0; },
        go: go,
        fail: fail,
        win: win,
        sfx: sfx,
        /* 即時廣播（到站等）：排太久輪不到就跳過 */
        speak: function (t) { Voice.say(t); }
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
        menu: function () { menu(); return FM.core.paused; },
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
    UI.ready(async function () {
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
        /* 標題卡：瀏覽器要先被點一下才准發出聲音，所以說明放在下一張、才念得出來 */
        await HUD.ask({
            title: '回家的路', art: 'home', center: true, speak: false,
            text: '記憶模糊・出去走走',
            choices: [{ label: '開始', value: 1, kind: 'primary', icon: 'play' }]
        });
        audio();
        await HUD.ask({
            title: '怎麼玩', center: true,
            text: '等一下會給你一張紙條，看完就會燒掉。\n請憑記憶，把紙條上的事一件一件辦好，平安回家！\n\n左下搖桿：往上走、往下退、左右轉彎。\n面對東西走近，右下會出現按鈕，例如「開門」。',
            choices: [{ label: '我知道了', value: 1, kind: 'go', icon: 'check' }]
        });
        officeBell(true);
    });
})(window);
