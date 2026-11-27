/* 合成頁面裡執行的程式。「什麼時候出現什麼」由 compose.mjs 算好，這裡只負責畫。 */
(function () {
    var cv = document.getElementById('c'), g = cv.getContext('2d');
    var FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
    var cache = new Map();

    async function bitmap(src) {
        if (cache.has(src)) return cache.get(src);
        var res = await fetch(src);
        if (!res.ok) throw new Error('讀不到原始畫面 ' + src);
        var img = await createImageBitmap(await res.blob());
        cache.set(src, img);
        if (cache.size > 6) cache.delete(cache.keys().next().value);
        return img;
    }
    var clamp = function (x) { return Math.max(0, Math.min(1, x)); };
    /* 彈出效果：從 0.6 倍放大、稍微超過、再回到 1 倍 */
    function popScale(p) { p = clamp(p); return p < 0.6 ? 0.6 + (1.12 - 0.6) * (p / 0.6) : 1.12 - 0.12 * ((p - 0.6) / 0.4); }
    function roundRect(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
    /* 字太寬就縮小字級 */
    function fitFont(text, size, maxW) {
        g.font = '900 ' + size + 'px ' + FONT;
        var w = g.measureText(text).width;
        if (w > maxW) { size = Math.floor(size * maxW / w); g.font = '900 ' + size + 'px ' + FONT; }
        return size;
    }
    function outlined(text, x, y, fill, rings) {
        g.lineJoin = 'round';
        rings.forEach(function (r) { g.lineWidth = r[1]; g.strokeStyle = r[0]; g.strokeText(text, x, y); });
        g.fillStyle = fill; g.fillText(text, x, y);
    }

    function drawCaption(l, W, H) {
        var unit = W / 1080, size = fitFont(l.text, l.size * unit, W - 110 * unit);
        var w = g.measureText(l.text).width + 80 * unit, h = size * 1.55, y = Math.min(H - h / 2 - 10, Math.max(h / 2 + 10, l.positionY * H));
        g.save();
        g.translate(W / 2, y); var s = popScale(l.appear); g.scale(s, s); g.globalAlpha = clamp(l.appear * 3);
        roundRect(-w / 2, -h / 2, w, h, 28 * unit); g.fillStyle = 'rgba(30,20,0,0.86)'; g.fill();
        g.lineWidth = 5 * unit; g.strokeStyle = '#FFE14D'; g.stroke();
        g.fillStyle = '#FFE14D'; g.fillText(l.text, 0, size * 0.04);
        g.restore();
    }
    function drawGain(l, W) {
        var unit = W / 1080, p = l.p;
        var s = p < 0.18 ? 0.4 + (1.25 - 0.4) * (p / 0.18) : (p < 0.32 ? 1.25 - 0.25 * ((p - 0.18) / 0.14) : 1);
        g.save();
        g.translate(W / 2, l.y - 80 * unit * p); g.scale(s, s); g.globalAlpha = p > 0.72 ? clamp((1 - p) / 0.28) : 1;
        g.font = '900 ' + 250 * unit + 'px ' + FONT;
        outlined('+' + l.value, 0, 0, '#FF7A00', [['#4A3B1E', 46 * unit], ['#FFFFFF', 26 * unit]]);
        g.restore();
    }
    function drawTitle(l, W, H) {
        var unit = W / 1080;
        g.fillStyle = 'rgba(251,243,217,' + (l.dim === undefined ? 0.62 : l.dim) + ')'; g.fillRect(0, 0, W, H);
        g.save();
        g.translate(W / 2, H * 0.43); var s = popScale(l.p); g.scale(s, s); g.globalAlpha = clamp(l.p * 3);
        fitFont(l.title, 180 * unit, W - 100 * unit);
        outlined(l.title, 0, 0, '#4A3B1E', [['#FFFFFF', 34 * unit]]);
        g.restore();
        if (l.subtitle) {
            g.save();
            g.globalAlpha = clamp(l.p * 2 - 0.3);
            fitFont(l.subtitle, 72 * unit, W - 120 * unit);
            outlined(l.subtitle, W / 2, H * 0.43 + 190 * unit, '#2F6AA8', [['#FFFFFF', 18 * unit]]);
            g.restore();
        }
    }

    window.composeInit = async function (W, H, allText) {
        cv.width = W; cv.height = H;
        await document.fonts.load('900 100px "Noto Sans TC"', allText + '0123456789+% ');
        await document.fonts.ready;
        return document.fonts.check('900 100px "Noto Sans TC"', allText);
    };

    /* 畫一格成品畫面，把 JPEG 交回給 compose.mjs。
       f：{ src（原始畫面網址）, zoom, focus:{x,y}, blur（模糊程度 px）, layers:[字幕／大字分數／片頭] } */
    window.composeFrame = async function (f) {
        var W = cv.width, H = cv.height, img = f.src ? await bitmap(f.src) : null;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#EFE4B8'; g.fillRect(0, 0, W, H);
        if (img) {
            g.save();
            if (f.zoom && f.zoom !== 1) {
                /* 以 focus 為中心放大，但不能讓畫面邊緣露出空白 */
                var z = f.zoom, ox = Math.max(W - W * z, Math.min(0, f.focus.x - f.focus.x * z)), oy = Math.max(H - H * z, Math.min(0, f.focus.y - f.focus.y * z));
                g.translate(ox, oy); g.scale(z, z);
            }
            if (f.blur) { var u = W / 1080; g.filter = 'blur(' + f.blur * u + 'px)'; g.drawImage(img, -30 * u, -30 * u, W + 60 * u, H + 60 * u); }
            else g.drawImage(img, 0, 0, W, H);
            g.restore();
        }
        (f.layers || []).forEach(function (l) {
            if (l.kind === 'caption') drawCaption(l, W, H);
            else if (l.kind === 'gain') drawGain(l, W);
            else if (l.kind === 'title') drawTitle(l, W, H);
        });
        /* 用 toDataURL（馬上轉好）：toBlob 要等瀏覽器「有空檔」才轉，看不見視窗的瀏覽器幾乎沒有空檔，一格要等 1 秒左右 */
        var url = cv.toDataURL('image/jpeg', 0.96);
        var res = await fetch('/__out', { method: 'POST', body: url.slice(url.indexOf(',') + 1) });
        if (!res.ok) throw new Error('畫面交不回去（ffmpeg 可能停了）');
        return true;
    };

    /* ═══ 聲音 ═══ */
    /* 錄影時只記下「第幾秒播了哪個音效」。這裡用遊戲自己的音效程式（js/sfx.js）在離線的聲音系統裡重播一次，
       所以聲音跟畫面一定對得上，也不會有收音雜訊。events：[{ t（成品的第幾秒）, name }] */
    window.renderAudio = async function (events, totalSec) {
        var rate = 48000, off = new OfflineAudioContext(2, Math.ceil(totalSec * rate), rate), at = 0;
        /* 假的 AudioContext：讓 sfx.js 以為「現在時間」是我們指定的那一秒 */
        var proxy = {
            get currentTime() { return at; }, sampleRate: rate, destination: off.destination, state: 'running', resume: function () { },
            createOscillator: function () { return off.createOscillator(); }, createGain: function () { return off.createGain(); },
            createBiquadFilter: function () { return off.createBiquadFilter(); }, createBuffer: function (a, b, c) { return off.createBuffer(a, b, c); },
            createBufferSource: function () { return off.createBufferSource(); }
        };
        var box = { AudioContext: function () { return proxy; }, localStorage: { getItem: function () { return null; }, setItem: function () { } }, setTimeout: setTimeout, setInterval: setInterval, clearInterval: clearInterval };
        var src = await (await fetch('/js/sfx.js')).text();
        new Function('window', src)(box);
        events.forEach(function (e) { at = e.t; box.Sfx.play(e.name); });
        var buf = await off.startRendering();
        var L = buf.getChannelData(0), R = buf.getChannelData(1), peak = 0;
        for (var i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
        var gain = peak > 0 ? 0.8 / peak : 1;               /* 遊戲音效本來偏小聲：整體放大到最大聲的地方約 −2 dB */
        var bytes = new Uint8Array(44 + L.length * 4), v = new DataView(bytes.buffer);
        var str = function (o, s) { for (var j = 0; j < s.length; j++) bytes[o + j] = s.charCodeAt(j); };
        str(0, 'RIFF'); v.setUint32(4, 36 + L.length * 4, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, L.length * 4, true);
        for (var n = 0; n < L.length; n++) {
            v.setInt16(44 + n * 4, Math.max(-1, Math.min(1, L[n] * gain)) * 32767, true);
            v.setInt16(46 + n * 4, Math.max(-1, Math.min(1, R[n] * gain)) * 32767, true);
        }
        var res = await fetch('/__audio', { method: 'POST', body: bytes });
        if (!res.ok) throw new Error('聲音交不回去');
        return { peak: peak };
    };
})();
