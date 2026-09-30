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

    var GAMES = [];
    var Reaction = {};

    /* game = { id, name, rule, mount(container, ctx) } */
    Reaction.register = function (game) { GAMES.push(game); };
    Reaction.list = function () { return GAMES; };

    Reaction.bestKey = function (id) { return 'fm.reaction.best.' + id; };
    Reaction.getBest = function (id) { return UI.store.get(Reaction.bestKey(id), null); };
    /* better(新值, 舊最佳) → true 表示新值更好；回傳這次是否刷新了紀錄 */
    Reaction.setBest = function (id, val, better) {
        var b = Reaction.getBest(id);
        var isNew = b == null || better(val, b);
        if (isNew) UI.store.set(Reaction.bestKey(id), val);
        return isNew;
    };

    global.Reaction = Reaction;
})(window);
