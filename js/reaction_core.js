/* ═══════════════════════════════════════════════════════════════════
   reaction_core.js — 秒反應的共用引擎（不含任何遊戲內容）
   ───────────────────────────────────────────────────────────────────
   · 三個小遊戲各自在自己的檔案裡呼叫 Reaction.register({...})；
     本檔案只提供登記清單、最佳紀錄存取（js/reaction.js 才負責畫面／隨機挑選）。
   · 新增小遊戲：新檔案呼叫 Reaction.register，並加到 boot.js 的 reaction 清單
     （reaction_core.js 之後、reaction.js 之前）。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    /* GAMES：所有小遊戲註冊進來的清單（陣列），每個元素長相是
       { id, name, rule, mount(container, ctx) }：
       · id／name：給 ?game= 參數比對、標題列顯示用。
       · rule：玩法說明文字，reaction.js 開場彈窗直接顯示。
       · mount(container, ctx)：真正開始這個遊戲的函式，container 是要把畫面畫進去
         的 DOM 元素（reaction.html 的 #screen），ctx 是給遊戲用的小工具物件
         （目前只有 ctx.setMeta(text) 可以改標題列右側文字）。
       這個檔案本身不知道、也不在乎 GAMES 裡實際有哪些遊戲——三款遊戲各自的檔案
       （reaction_speed.js／reaction_drop.js／reaction_spot.js）在自己檔案最下面
       呼叫 Reaction.register({...}) 把自己登記進來，彼此互不相依。 */
    var GAMES = [];
    var Reaction = {};

    Reaction.register = function (game) { GAMES.push(game); };
    Reaction.list = function () { return GAMES; };
    /* Reaction.current：「目前這一頁正在玩的是哪一款遊戲」（js/reaction.js 在決定要玩哪一款之後設定）。
       kit.result 靠它知道成績要送到哪一款遊戲的世界排行榜；沒設定（例如 Node 測試）就不會送。 */
    Reaction.current = null;

    /* 最佳紀錄用 localStorage 存，key 用 'fm.reaction.best.' + 遊戲 id 區分
       （例如 'fm.reaction.best.drop'），每款遊戲各自獨立不會互相覆蓋。 */
    Reaction.bestKey = function (id) { return 'fm.reaction.best.' + id; };
    Reaction.getBest = function (id) { return UI.store.get(Reaction.bestKey(id), null); };
    /* better(新值, 舊最佳) → true 表示新值更好；回傳這次是否刷新了紀錄。
       刻意把「新紀錄要怎麼比較」交給呼叫端傳進來的 better 函式，而不是寫死
       「數字越大越好」：因為「神準落下」是分數越高越好，但如果之後哪款遊戲是
       「時間越短越好」，這個共用函式完全不用改，呼叫端自己傳一個反過來比較的
       函式就行了。 */
    Reaction.setBest = function (id, val, better) {
        var b = Reaction.getBest(id);
        var isNew = b == null || better(val, b);
        if (isNew) UI.store.set(Reaction.bestKey(id), val);
        return isNew;
    };

    /* 遊戲的「成績單位或精度改版」時用：把舊版存下來的最佳紀錄換算成新版的數字，而且只換算一次。
       例如零秒出手原本存的是「毫秒整數」（123），現在改存「秒、小數 4 位」（0.1237），
       如果不換算，舊的 123 會被當成 123 秒，畫面上會出現怪怪的「最佳差 123.0000 秒」。
       做法：用一個旗標（舊 key 後面加 .v2）記住「已經換算過」，之後再呼叫就什麼都不做。
       convert(舊值) 回傳新值；舊值不存在（沒玩過）就只立旗標。
       tag：旗標的後綴，預設 '.v2'。同一款遊戲的紀錄又改了第二次（例如掛畫從「五回合平均」改成「單回合」，
       舊紀錄不能比，要清掉：convert 回傳 null），就換一個新的 tag（例如 '.single'），不然舊旗標已經立了，第二次換算會被跳過。 */
    Reaction.migrateBest = function (id, convert, tag) {
        var flag = Reaction.bestKey(id) + (tag || '.v2');
        if (UI.store.get(flag, false)) return;
        var b = Reaction.getBest(id);
        if (b != null) UI.store.set(Reaction.bestKey(id), convert(b));
        UI.store.set(flag, true);
    };

    global.Reaction = Reaction;
})(window);
