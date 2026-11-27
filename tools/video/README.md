# 宣傳影片錄影工具（試錄版）

讓電腦自己玩遊戲、自己錄影，照劇本剪成一支直式影片。遊戲本身的檔案完全沒有改。

## 目前有劇本的遊戲

把下面指令裡的 `sumten` 換成要錄的代號。

| 代號 | 遊戲 | 影片結構（20 秒） |
|---|---|---|
| `sumten` | 拖曳湊十 | 精彩回顧 → 片頭 → 第 1 關教學 → 連續消除 → 故意拖錯＋字幕 |
| `cups` | 球在哪杯 | 初級示範 5 秒 → 片頭 2 秒 → 高級找出答案 6 秒 → 中級只猶豫不公布 7 秒 |
| `chicks` | 找回小雞 | 同上 |
| `schulte` | 數字方陣 | 從 1 依序點、越來越慢 15 秒 → 只徘徊 5 秒 |
| `timestable` | 乘法表抓錯 | 從表頭依序抓錯、越來越慢 15 秒 → 只徘徊 5 秒 |

## 段落種類（劇本裡的 `type`）

| type | 做什麼 | 用在 |
|---|---|---|
| `title` | 片頭文字 | 全部 |
| `play`、`wrongDrag` | 連續拖曳消除／故意拖錯 | `sumten` |
| `solve` | 看完（掀杯子、亮星星、移動）→ 猶豫一下 → 找出答案 | `cups`、`chicks` |
| `ponder` | 看完 → 手指在杯子或小雞之間徘徊，**不公布答案** | `cups`、`chicks` |
| `tapOrder` | 依序快點、越來越慢 → 最後只徘徊 | `schulte`、`timestable` |

`solve`、`ponder` 的原始畫面長度由遊戲決定（移動多久就錄多久）。合成時最後的作答或徘徊固定原速，前面「看」的部分用 `watchSpeed`／`introSec` 調：
- `watchSpeed: "fit"`：從頭看起，自動快轉到剛好塞進 `seconds`。加上 `introSec`，開頭亮球或亮星星停久一點，只快轉移動的部分。
- `watchSpeed: 數字`：照那個倍速，只放得下開始作答前的最後一段。
- 快轉超過 3.5 倍時，合成結果會提醒。

## 需要的東西

Node 22 以上、Chrome 或 Edge、ffmpeg（含 ffprobe，要加到 PATH）。不用安裝任何 npm 套件，也不用自己開網頁伺服器。

## 怎麼用（在專案根目錄執行）

| 要做什麼 | 指令 |
|---|---|
| 整支重錄＋合成 | `node tools/video/record.mjs sumten` |
| 只重錄某一段（多段用逗號隔開） | `node tools/video/record.mjs sumten --only challenge` |
| 不重錄，只重新合成 | `node tools/video/record.mjs sumten --compose` |

## 兩種模式：先用 `--live` 調內容，最後不加它出成品

上面三種指令**加上 `--live` 就是即時錄影**，不加就是逐格截圖。例如：

```
node tools/video/record.mjs sumten --live
node tools/video/record.mjs sumten --live --only combo
node tools/video/record.mjs sumten --live --compose
```

| | 即時錄影（`--live`） | 逐格截圖（不加） |
|---|---|---|
| 用途 | 快速預覽、調內容 | 正式成品 |
| 成品大小 | 540×960（原始畫面 500×889，較糊） | 1080×1920 |
| 整支花的時間（2026-11-27 實測） | 約 1 分鐘 | 約 3 分鐘 |
| 只重錄一段 | 約 35～40 秒 | — |
| 只重新合成 | 約 20 秒 | 約 40 秒 |
| 順暢度 | 動作很密時偶爾停頓約 0.3 秒，畫面常比聲音慢 1 格 | 每一格都有 |

兩種模式的**題目、每一串怎麼拖、得分和聲音的時間點完全一樣**（實測四段都相同），所以在預覽版調好的秒數、剪接點、字幕時間，成品裡不會跑掉。
預覽滿意後，要**拿掉 `--live` 整支重跑一次**才是成品：兩種的原始畫面分開放，互不通用。

- 成品：`tools/video/out/sumten/sumten_日期-時間.mp4`；預覽版檔名多了 `_live`。舊版不會被蓋掉，不要的自己刪。
- 原始畫面：`out/sumten/raw/`（逐格）、`out/sumten/raw_live/`（即時）。`--only`、`--compose` 要靠它。
- `out/` 不放進 git。

## 改劇本

劇本在 `tools/video/scripts/<遊戲>.json`，每個欄位的意思寫在檔案開頭的 `_欄位說明`。

| 你改了什麼 | 用哪個指令 |
|---|---|
| level、pickCells、dragSecPerCell、pauseSec、pathCells、backCells、releaseAtEnd | `--only` 那一段 |
| `solve`／`ponder` 的 thinkBeforeSec、tapGapSec、holdSec、thinkSec | `--only` 那一段 |
| `tapOrder` 的 seconds、thinkSec、tapGapSec、maxTaps | `--only main` |
| 字幕、片頭文字、配樂、clipStart、zoom、speed、bigGainText、watchSpeed、introSec、`solve`／`ponder` 的 seconds | `--compose` |
| seed、output、finger、gameOptions，或遊戲改版 | 整支重錄 |

加長 `seconds` 讓原始畫面不夠用，或改了需要重錄的欄位卻只用 `--compose` 時，工具會停下來告訴你該執行哪一行。
遊戲改版工具**不會**自己發現，要自己整支重錄。

## 它怎麼運作

1. 開一個看不見的 Chrome（全新設定檔），只讓它連本機和遊戲字型網站；排行榜換成假的，成績不會送出去。
2. 遊戲看到的時間由工具控制，一次前進 1/30 秒。**逐格截圖**：每前進一格拍一張，電腦快慢不影響順暢度。
   **即時錄影**：照真實時間的速度前進，同時讓瀏覽器把畫面一張張送過來（它只給網頁大小的圖）。
3. 自動玩家看盤面想答案，用虛擬手指送出真的滑鼠操作。
4. **聲音**：錄影時只記「第幾秒播哪個音效」，合成時用遊戲自己的 `js/sfx.js` 重新做出聲音。
5. 合成頁面一格一格加上片頭、字幕、推近、大字分數，再交給 ffmpeg 做成 MP4。

同一份劇本重錄，會出一樣的題目、做一樣的操作。

## 加新遊戲

需要兩個檔案：劇本 `scripts/<遊戲>.json`，和自動玩家 `lib/games/<遊戲>.mjs`。自動玩家要有 `boardRect`、`snapshot`（開局資料）和它支援的段落種類函式（`play`、`solve`、`ponder`、`tapOrder`…）。
闖關遊戲照 `sumten.mjs` 寫；沒有跳關功能的照 `cups.mjs`（`beforeStart` 接管進場、`start` 跳到指定關卡）；一進場就出好題目的照 `schulte.mjs`。共用的小工具在 `lib/games/common.mjs`（記得用 `disableHints` 關掉會洩漏答案的操作提示）。

## 目前的限制

- 只有上表五款有自動玩家。
- 即時錄影偶爾會收到整個瀏覽器視窗大小的畫面（橫的）。工具會檢查尺寸、重新設定；2026-11-27 之前錄的 `raw_live` 可能有壓扁的段落，重錄即可。
- 只支援直式。
- 一串最多 40 格（`pickCells`、`pathCells`）。串越長拖越久：總時間大約是「格數 × `dragSecPerCell`」再加 0.6 秒的掉落動畫，一段裡能消除幾次要照這個算。
- 影片裡的字型是遊戲用的 Noto Sans TC，錄影時需要網路下載字型；沒網路會改用電腦裡的字型。
