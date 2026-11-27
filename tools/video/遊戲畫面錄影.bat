rem ./record.mjs <game> [--full <script>] [--part <script>] [--watch] [--live]
rem 指令後面加 --live 就是即時錄影(540*960 低解析)，不加就是逐格截圖(1080*1920 高解析)。
node ./record.mjs sumten --live
rem 只重錄其中一段，例如最後的挑戰段：
rem node ./record.mjs sumten --only challenge
rem 只重新合成、不重錄，例如改字幕：
rem node ./record.mjs sumten --compose