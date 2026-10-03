# 秒反應・純函式測試

每個小遊戲檔案（`js/reaction_<id>.js`）都把判定／出題／難度曲線這些純函式放在 `G.test`，這裡的 `t_<id>.js` 在 Node 裡直接呼叫它們，不需要瀏覽器。

```
node test/reaction/run_all.js        # 全部跑一次
node test/reaction/t_coins.js        # 只跑一支
```

`load.js` 會用假的 `UI／Sfx／Stage` 載入 `reaction_core.js`、`reaction_kit.js` 和被測的遊戲檔案。沒有測試的遊戲（零秒出手、神準落下、大家來找碴、不可能任務、形形色色、色不異空、七彩陷阱）是 1.15.0 之前的舊遊戲，只能在瀏覽器裡驗證。
