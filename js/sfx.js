/* ═══════════════════════════════════════════════════════════════════
   sfx.js — 秒反應的共用音效模組（全部用 Web Audio 即時合成，不用任何音檔）
   ───────────────────────────────────────────────────────────────────
   · 風格：歡樂的 8-bit 電子遊戲音（方波＋三角波＋雜訊），靈感來自老任天堂風格，
     但每一個音效、每一段音樂都是這裡自己編的，不是任何現成曲子。
   · 所有遊戲用同一組音效，所以「答對／答錯／過關／失敗」聽起來永遠一致：
       Sfx.play('ok')       答對、點到正確目標（清脆的兩音「叮」）
       Sfx.play('bad')      答錯、點錯（低沉往下滑的「咚」）
       Sfx.play('tick')     倒數、節拍的短滴聲
       Sfx.play('go')       倒數結束、開始（高音「嗶」）
       Sfx.play('click')    一般按鍵的輕觸聲
       Sfx.play('win')      過關（往上的琶音）
       Sfx.play('perfect')  超級好成績（長一點的歡呼）
       Sfx.play('fail')     挑戰失敗（往下掉的短旋律）
       Sfx.play('pop')      爆破（氣球、泡泡）
       Sfx.play('whoosh')   揮過、滑過
       Sfx.play('zoom')     鏡頭推進（往上掃的音）
       Sfx.play('flip')     翻牌、換字
       Sfx.play('noteL'/'noteC'/'noteR')  三個位置的短音（C5／E5／G5），Sfx.play('kick') 底鼓
   · 結算背景音樂：Sfx.bgm('result') 開始循環、Sfx.stopBgm() 停止（重複呼叫不會重頭播）。
     js/reaction.js 會自己偵測結算畫面（有 data-sfx 或 .rx-result__num 的卡片）
     自動播「過關／失敗」短旋律，接著接上背景音樂；卡片被移除就停。
   · 長音：Sfx.inflateStart()／Sfx.inflateStop()（吹氣球按住時音高一路往上）、
     Sfx.pourStart()／Sfx.pourStop()（倒水的嘩啦聲）。
   · 靜音：Sfx.setMuted(true)／Sfx.toggle()，設定記在 localStorage（fm.sfx.muted），
     右上角的喇叭按鈕就是用這個。
   · 瀏覽器規定：要有「使用者手勢」之後 AudioContext 才會真的出聲，所以
     reaction.js 在整個頁面的 pointerdown／pointerup／click／keydown 都會呼叫
     Sfx.unlock()；沒有出聲只會是安靜，不會報錯，也不會卡住遊戲。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var KEY_MUTED = 'fm.sfx.muted';
    var ctx = null;          /* AudioContext，第一次需要時才建立 */
    var master = null;       /* 總音量 */
    var noiseBuf = null;     /* 一段白噪音，爆破／刷過的聲音共用 */
    var muted = false;
    try { muted = global.localStorage.getItem(KEY_MUTED) === '1'; } catch (e) { }

    var MASTER_VOL = 0.5;

    function ensure() {
        if (ctx) return ctx;
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try {
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = muted ? 0 : MASTER_VOL;
            master.connect(ctx.destination);
        } catch (e) { ctx = null; }
        return ctx;
    }

    /* 音名 → 頻率：midi 69＝A4＝440Hz */
    function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

    /* 一個音：type 波形、vol 音量、slideTo 結尾音高（做滑音）、attack／release 淡入淡出 */
    function tone(freq, t0, dur, o) {
        var c = ensure();
        if (!c) return null;
        o = o || {};
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = o.type || 'square';
        osc.frequency.setValueAtTime(freq, t0);
        if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + dur);
        var vol = o.vol == null ? 0.18 : o.vol;
        var atk = o.attack == null ? 0.004 : o.attack;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(o.output || master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
        return osc;
    }

    function noise(t0, dur, o) {
        var c = ensure();
        if (!c) return;
        o = o || {};
        if (!noiseBuf) {
            noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
            var d = noiseBuf.getChannelData(0);
            for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        var src = c.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        var f = c.createBiquadFilter();
        f.type = o.filter || 'bandpass';
        f.frequency.setValueAtTime(o.freq || 2000, t0);
        if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t0 + dur);
        f.Q.value = o.q == null ? 0.8 : o.q;
        var g = c.createGain();
        var vol = o.vol == null ? 0.2 : o.vol;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f);
        f.connect(g);
        g.connect(o.output || master);
        src.start(t0);
        src.stop(t0 + dur + 0.03);
    }

    /* 一串音：notes＝[midi 或 null(休止)]，每個音 step 秒 */
    function seq(notes, t0, step, o) {
        for (var i = 0; i < notes.length; i++) {
            if (notes[i] != null) tone(hz(notes[i]), t0 + i * step, step * (o && o.len ? o.len : 0.95), o);
        }
    }

    /* ═══ 音效表 ═══ */
    var SFX = {
        /* 答對：兩個高音的「叮」（B5→E6），金幣聲的感覺 */
        ok: function (t) {
            tone(hz(83), t, 0.07, { vol: 0.16 });
            tone(hz(88), t + 0.07, 0.32, { vol: 0.16 });
        },
        /* 答錯：往下滑的低音「咚」 */
        bad: function (t) {
            tone(220, t, 0.14, { type: 'sawtooth', vol: 0.16, slideTo: 130 });
            tone(131, t + 0.12, 0.28, { type: 'triangle', vol: 0.22, slideTo: 70 });
        },
        tick: function (t) { tone(1000, t, 0.045, { vol: 0.1 }); },
        /* 心跳複製：三個位置各一個短音（C5／E5／G5），打對時發出，湊起來像小旋律；kick 是每一拍的底鼓 */
        noteL: function (t) { tone(hz(72), t, 0.12, { vol: 0.16, type: 'triangle' }); },
        noteC: function (t) { tone(hz(76), t, 0.12, { vol: 0.16, type: 'triangle' }); },
        noteR: function (t) { tone(hz(79), t, 0.12, { vol: 0.16, type: 'triangle' }); },
        kick: function (t) { tone(150, t, 0.1, { vol: 0.2, type: 'sine', slideTo: 55 }); },
        go: function (t) { tone(hz(84), t, 0.22, { vol: 0.16 }); },
        click: function (t) { tone(hz(79), t, 0.05, { vol: 0.1, type: 'triangle' }); },
        flip: function (t) { tone(hz(72), t, 0.04, { vol: 0.09 }); tone(hz(76), t + 0.04, 0.05, { vol: 0.09 }); },
        /* 過關：C 大調往上的琶音 */
        win: function (t) {
            seq([72, 76, 79, 84, 88], t, 0.075, { vol: 0.15 });
            tone(hz(91), t + 0.375, 0.3, { vol: 0.14 });
        },
        /* 超級好：更長的歡呼＋和弦 */
        perfect: function (t) {
            seq([67, 72, 76, 79, 84, 79, 84, 88], t, 0.085, { vol: 0.15 });
            [72, 76, 79, 84].forEach(function (m) { tone(hz(m), t + 0.7, 0.7, { vol: 0.09, type: 'triangle' }); });
            tone(hz(96), t + 0.7, 0.55, { vol: 0.1 });
        },
        /* 失敗：往下掉的短旋律（最後一個音拖長下滑） */
        fail: function (t) {
            seq([67, 66, 65], t, 0.16, { vol: 0.15, type: 'square' });
            tone(hz(64), t + 0.48, 0.6, { vol: 0.17, type: 'triangle', slideTo: hz(58) });
        },
        pop: function (t) {
            noise(t, 0.16, { freq: 1800, q: 0.6, vol: 0.4 });
            tone(180, t, 0.1, { type: 'triangle', vol: 0.2, slideTo: 60 });
        },
        whoosh: function (t) { noise(t, 0.28, { freq: 500, freqTo: 4000, q: 1.2, vol: 0.12 }); },
        zoom: function (t) { tone(300, t, 0.6, { type: 'sine', vol: 0.12, slideTo: 1500, attack: 0.05 }); },
        /* 結算前的「完成」短音（不知道輸贏時用） */
        done: function (t) { seq([72, 79, 84], t, 0.09, { vol: 0.13 }); }
    };

    /* ═══ 結算背景音樂：自己編的 4 小節歡樂循環（C - Am - F - G），160 BPM ═══ */
    var STEP = 60 / 160 / 2;       /* 八分音符的長度（秒） */
    var LEAD = [
        [76, 79, 84, 79, 76, 79, 84, 88],     /* C  */
        [76, 81, 84, 81, 76, 81, 84, 81],     /* Am */
        [77, 81, 84, 81, 77, 81, 84, 89],     /* F  */
        [74, 79, 83, 79, 74, 83, 79, 83]      /* G  */
    ];
    var BASS = [48, 45, 41, 43];                /* 各小節的根音 */
    var bgmTimer = null, bgmName = null, bgmNext = 0, bgmBar = 0, bgmGain = null;

    function bgmSchedule() {
        var c = ctx;
        if (!c || !bgmName || !bgmGain) return;
        while (bgmNext < c.currentTime + 0.25) {
            var bar = bgmBar % 4;
            for (var i = 0; i < 8; i++) {
                var t = bgmNext + i * STEP;
                tone(hz(LEAD[bar][i]), t, STEP * 0.85, { vol: 0.045, output: bgmGain });
                if (i % 2 === 0) tone(hz(BASS[bar]), t, STEP * 1.7, { type: 'triangle', vol: 0.09, output: bgmGain });
                if (i % 2 === 1) noise(t, 0.03, { filter: 'highpass', freq: 7000, vol: 0.025, output: bgmGain });
            }
            bgmNext += 8 * STEP;
            bgmBar++;
        }
    }

    var Sfx = {
        unlock: function () {
            var c = ensure();
            if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) { } }
        },
        play: function (name) {
            if (muted) return;
            var c = ensure();
            if (!c || !SFX[name]) return;
            try { SFX[name](c.currentTime + 0.005); } catch (e) { }
        },
        bgm: function (name) {
            if (muted) return;
            var c = ensure();
            if (!c || bgmName === name) return;
            Sfx.stopBgm();
            bgmName = name;
            bgmBar = 0;
            bgmNext = c.currentTime + 0.05;
            /* 背景音樂專用的音量節點：結束時整個淡出，不會突然截斷 */
            bgmGain = c.createGain();
            bgmGain.gain.value = 1;
            bgmGain.connect(master);
            bgmTimer = global.setInterval(bgmSchedule, 80);
            bgmSchedule();
        },
        stopBgm: function () {
            bgmName = null;
            if (bgmTimer) { global.clearInterval(bgmTimer); bgmTimer = null; }
            if (bgmGain && ctx) {
                var g = bgmGain;
                bgmGain = null;
                try {
                    g.gain.cancelScheduledValues(ctx.currentTime);
                    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
                    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
                } catch (e) { }
                global.setTimeout(function () { try { g.disconnect(); } catch (e) { } }, 600);
            }
        },
        isBgmPlaying: function () { return !!bgmName; },

        /* 吹氣球的長音：按住時音高一路往上，放開停止 */
        inflateStart: function () {
            if (muted) return;
            var c = ensure();
            if (!c || Sfx._inf) return;
            var osc = c.createOscillator();
            var g = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, c.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 10);
            g.gain.setValueAtTime(0.0001, c.currentTime);
            g.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.05);
            osc.connect(g);
            g.connect(master);
            osc.start();
            Sfx._inf = { osc: osc, g: g };
        },
        inflateStop: function () {
            var inf = Sfx._inf;
            if (!inf || !ctx) return;
            Sfx._inf = null;
            try {
                inf.g.gain.cancelScheduledValues(ctx.currentTime);
                inf.g.gain.setValueAtTime(inf.g.gain.value, ctx.currentTime);
                inf.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
                inf.osc.stop(ctx.currentTime + 0.1);
            } catch (e) { }
        },

        /* 倒水的長音：帶通雜訊（水流嘩啦聲），按住時持續，放開淡出。音高固定，不透露水位 */
        pourStart: function () {
            if (muted) return;
            var c = ensure();
            if (!c || Sfx._pour) return;
            if (!noiseBuf) { noise(c.currentTime, 0.01, { vol: 0.0001 }); }
            var src = c.createBufferSource();
            src.buffer = noiseBuf;
            src.loop = true;
            var f = c.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = 1500;
            f.Q.value = 0.9;
            var lfo = c.createOscillator();      /* 水聲忽大忽小的起伏 */
            var lg = c.createGain();
            lfo.frequency.value = 9;
            lg.gain.value = 500;
            lfo.connect(lg);
            lg.connect(f.frequency);
            var g = c.createGain();
            g.gain.setValueAtTime(0.0001, c.currentTime);
            g.gain.linearRampToValueAtTime(0.16, c.currentTime + 0.06);
            src.connect(f);
            f.connect(g);
            g.connect(master);
            src.start();
            lfo.start();
            Sfx._pour = { src: src, lfo: lfo, g: g };
        },
        pourStop: function () {
            var p = Sfx._pour;
            if (!p || !ctx) return;
            Sfx._pour = null;
            try {
                p.g.gain.cancelScheduledValues(ctx.currentTime);
                p.g.gain.setValueAtTime(p.g.gain.value, ctx.currentTime);
                p.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
                p.src.stop(ctx.currentTime + 0.15);
                p.lfo.stop(ctx.currentTime + 0.15);
            } catch (e) { }
        },

        isMuted: function () { return muted; },
        setMuted: function (m) {
            muted = !!m;
            try { global.localStorage.setItem(KEY_MUTED, muted ? '1' : '0'); } catch (e) { }
            if (master) master.gain.value = muted ? 0 : MASTER_VOL;
            if (muted) { Sfx.stopBgm(); Sfx.inflateStop(); Sfx.pourStop(); }
            return muted;
        },
        toggle: function () { return Sfx.setMuted(!muted); },

        /* 測試／除錯用：目前 AudioContext 的狀態，沒有 Web Audio 就是 'none' */
        state: function () { return ctx ? ctx.state : 'none'; }
    };

    global.Sfx = Sfx;
})(window);
