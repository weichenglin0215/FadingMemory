/* ═══════════════════════════════════════════════════════════════════
   emoji_png.js — emoji 圖片庫（V1.47；「分類點擊」「草叢找動物」用）
   ───────────────────────────────────────────────────────────────────
   為什麼要有它：emoji 是「字型」畫出來的，每個平台長得不一樣——iPhone 的 emoji 比較寫實、失去卡通圖示的風格，
   而且在 canvas 裡畫出來的大小跟電腦差很多（草叢找動物在 iPhone 上，動物只剩一半大，幾乎看不見）。
   所以改成事先在「電腦的瀏覽器」把 emoji 畫下來，存成一張透明背景的 PNG 圖集（img/emoji/emoji.png，每個 emoji 一格），
   遊戲直接貼圖，每個平台看到的都一樣，背景透明所以可以襯在不同的底色上。
   圖集是用 test/reaction/make_emoji_png.mjs 產生的；下面「EMOJI-LIST」那一段也是它自動寫的（要新增 emoji 就改遊戲的清單，再重跑它）。
   ───────────────────────────────────────────────────────────────────
   用法（都掛在 Reaction.emojiPng 底下）：
     EP.has(ch)                  這個 emoji 有沒有在圖集裡
     EP.load(cb)                 開始載入圖集（只載一次）；載好（或載失敗）後呼叫 cb(影像｜null)
     EP.ready()                  圖集載好了沒
     EP.el(ch, fontPx, inline)   回傳一個 <span>，用貼圖畫出這個 emoji，大小跟「字級 fontPx 的文字 emoji」差不多（給 DOM 版面用，例如分類點擊的格子）；
                                  inline 為 true 時跟前後的文字排在同一行（題目上的代表圖示），否則是獨佔一整行的方塊；
                                  圖集裡沒有這個 emoji 就改用文字 emoji（跟以前一樣）
     EP.draw(ctx, ch, cx, cy, fontPx)  在 canvas 的 ctx 上，以 (cx, cy) 為中心畫這個 emoji（給 canvas 版面用，例如草叢找動物）；
                                  回傳 true＝畫了貼圖，false＝圖集還沒載好或沒有這個 emoji（呼叫的人可以改用文字）
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';

    var Reaction = global.Reaction = global.Reaction || {};
    var EP = {};
    EP.FILE = 'img/emoji/emoji.png';                    /* 圖集檔案（用 FM_VERSION 加上 ?v= 避免瀏覽器用到舊的快取） */
    var VS16 = String.fromCharCode(0xFE0F);             /* 變體選擇符：有些 emoji 後面會接它（要求用彩色圖案）。比對時一律去掉它，所以 🐿 與 🐿️ 算同一個 */

    /* EMOJI-LIST-BEGIN（自動產生，請勿手改；產生器：node test/reaction/make_emoji_png.mjs --write） */
    EP.CELL = 128;
    EP.COLS = 16;
    EP.FONT = 100;
    EP.LIST = [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
        '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑',
        '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
        '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
        '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🥳', '😎', '🤓', '🐒', '🦧', '🐶',
        '🐕', '🐺', '🦊', '🦝', '🐱', '🐈', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎',
        '🦄', '🦓', '🦌', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐏', '🐑',
        '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🐰', '🐇', '🐿', '🦔', '🦇', '🐻',
        '🐨', '🐼', '🦨', '🦘', '🐔', '🐓', '🐣', '🐤', '🥝', '🍅', '🥥', '🥑',
        '🍆', '🥔', '🥕', '🌽', '🌶', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜',
        '🌰', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎', '🏍', '🛵', '🛺', '🚲',
        '🛴', '⛵', '🛳', '🚢', '✈', '🛩', '🚁', '🚟', '🚠', '🛰', '🚀', '🛸',
        '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵',
        '💂', '👷', '🧕', '🤵', '👰', '🤱', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜',
        '🧝', '🧞', '🧟', '💆', '👩', '😺', '😸', '🐵', '🐸', '🐕‍🦺', '🦏', '🦎',
        '🐍', '🐉', '🦕', '🐠', '🐡', '🦅', '🦢', '🦜', '🦩', '🦉', '🐦', '🐧'
    ];
    /* EMOJI-LIST-END */

    /* key：去掉變體選擇符的字串；索引表：key → 第幾格（由左到右、由上到下） */
    EP.key = function (ch) { return String(ch).split(VS16).join(''); };
    var INDEX = {};
    EP.LIST.forEach(function (k, i) { INDEX[k] = i; });
    EP.index = function (ch) { var i = INDEX[EP.key(ch)]; return i == null ? -1 : i; };
    EP.has = function (ch) { return EP.index(ch) >= 0; };

    /* 圖集的網址：有版本號就接在後面（版本一換，瀏覽器就重新抓） */
    function url() {
        var v = global.FM_VERSION && global.FM_VERSION.version;
        return EP.FILE + (v ? '?v=' + encodeURIComponent(v) : '');
    }

    /* 載入圖集（只載一次；多次呼叫共用同一張）：載好呼叫 cb(影像)，載失敗呼叫 cb(null)（這時 el／draw 會退回文字 emoji） */
    var img = null, state = 0, waiting = [];            /* state：0 還沒開始、1 載入中、2 載好了、3 失敗了 */
    EP.load = function (cb) {
        if (state === 2) { if (cb) cb(img); return; }
        if (state === 3) { if (cb) cb(null); return; }
        if (cb) waiting.push(cb);
        if (state === 1) return;
        state = 1;
        if (typeof Image === 'undefined') { state = 3; flush(null); return; }   /* Node 測試環境沒有 Image */
        img = new Image();
        img.onload = function () { state = 2; flush(img); };
        img.onerror = function () { state = 3; flush(null); };
        img.src = url();
    };
    function flush(v) { var w = waiting; waiting = []; w.forEach(function (f) { f(v); }); }
    EP.ready = function () { return state === 2; };

    /* DOM 版：一個 <span>，裡面用背景圖貼出這個 emoji。
       fontPx：跟「字級 fontPx 的文字 emoji」差不多大（圖集每格 EP.CELL px 是用字級 EP.FONT 畫的，所以按比例縮放：邊長 ＝ CELL × fontPx ÷ FONT，取整數才不會切到鄰格）。
       背景圖縮放後的整張圖集大小＝邊長 × 欄數；背景位置往左上拉到那一格。 */
    EP.el = function (ch, fontPx, inline) {
        var i = EP.index(ch), s = global.document.createElement('span');
        if (i < 0) { s.textContent = ch; s.style.fontSize = fontPx + 'px'; return s; }   /* 圖集裡沒有：退回文字 emoji */
        var d = Math.max(1, Math.round(EP.CELL * fontPx / EP.FONT)), rows = Math.ceil(EP.LIST.length / EP.COLS);
        s.className = 'emojipng';
        s.setAttribute('role', 'img'); s.setAttribute('aria-label', EP.key(ch));
        var st = s.style;
        st.display = inline ? 'inline-block' : 'block'; st.width = d + 'px'; st.height = d + 'px'; st.flex = '0 0 auto';
        if (inline) st.verticalAlign = '-' + Math.round(d * 0.22) + 'px';       /* 跟文字排同一行時，往下沉一點，圖片的中心才會跟文字的中心對齊 */
        st.backgroundImage = 'url(' + url() + ')'; st.backgroundRepeat = 'no-repeat';
        st.backgroundSize = (d * EP.COLS) + 'px ' + (d * rows) + 'px';
        st.backgroundPosition = (-(i % EP.COLS) * d) + 'px ' + (-Math.floor(i / EP.COLS) * d) + 'px';
        st.pointerEvents = 'none';                      /* 點擊交給外面的格子處理 */
        EP.load();                                      /* 順便開始載入圖集（已經在載就什麼都不做） */
        return s;
    };

    /* canvas 版：以 (cx, cy) 為中心，畫出「字級 fontPx 的文字 emoji」那麼大的貼圖。回傳是否真的畫了（圖集沒載好或沒有這個 emoji 就回傳 false，不畫） */
    EP.draw = function (ctx, ch, cx, cy, fontPx) {
        var i = EP.index(ch);
        if (state !== 2 || i < 0) return false;
        var d = EP.CELL * fontPx / EP.FONT;
        ctx.drawImage(img, (i % EP.COLS) * EP.CELL, Math.floor(i / EP.COLS) * EP.CELL, EP.CELL, EP.CELL, cx - d / 2, cy - d / 2, d, d);   /* drawImage(影像, 來源 x, y, 寬, 高, 目的 x, y, 寬, 高)：把圖集裡的一格貼到畫布上，順便縮放 */
        return true;
    };

    Reaction.emojiPng = EP;
})(window);
