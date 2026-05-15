# YouTube Dual Native Subs

YouTube 双字幕 Tampermonkey 脚本。

当前版本：`4.2.2`

项目地址：https://github.com/luismusaj646-prog/dual-subtitles

## 功能

- 第一行显示 YouTube 原字幕轨文本。
- 如果视频本身带有目标语言人工字幕，第二行优先使用这条人工字幕轨。
- 没有可用人工字幕时，第二行先显示 `translate.googleapis.com` 的逐句机翻。
- 后台继续运行 4.1 风格的 YouTube 预热、`tlang` 自动翻译和原生 DOM 监听；YouTube 译文稳定可用后平滑接管，机翻继续作为兜底。
- 自动产生字幕轨会尽量使用同源 ASR 原文和译文，并对轻微错位做吸附对齐。
- 原字幕语言已经等于目标语言时默认不启动双字幕；也可在高级设置里配置哪些源语言默认跳过。
- 脚本启用时会压制 YouTube 原生字幕层，减少加载瞬间原生字幕闪现。
- 字幕层放在 YouTube 播放器里。
- 面板按钮放在 YouTube 视频下方操作按钮区域。
- UI 默认跟随浏览器语言，也可以在面板里手动切换。

## 安装

推荐从 GreasyFork 安装：

https://greasyfork.org/zh-TW/scripts/575317-youtube-dual-native-subs

GreasyFork 页面会提供“安装脚本”按钮，并负责从 GreasyFork 安装用户的后续更新。

备用安装链接：

https://raw.githubusercontent.com/luismusaj646-prog/dual-subtitles/master/yt-dual-subs.user.js

手动安装：

1. 打开 Tampermonkey。
2. 新建或打开 `YouTube Dual Native Subs` 脚本。
3. 用 `yt-dual-subs.user.js` 的内容覆盖保存。
4. 刷新 YouTube watch 页面。

### Chrome / Tampermonkey 权限

- Tampermonkey 扩展保持启用，脚本列表里的 `YouTube Dual Native Subs` 也保持启用。
- Chrome 138 及以上：在 `chrome://extensions` 打开 Tampermonkey 详情，开启“允许运行用户脚本”。
- Chrome 138 以前：如果脚本无法运行，在 `chrome://extensions` 开启“开发者模式”。
- Tampermonkey 的网站访问权限需要允许 `https://www.youtube.com/*`，或设置为“在所有网站上”。

快速排查清单：

- YouTube 页面地址必须是 `https://www.youtube.com/watch?...`。
- 扩展详情里的“网站访问权限”不能是“点击时”。
- 安装或更新脚本后刷新 YouTube watch 页面。
- 如果按钮不出现，先确认 Chrome 的“允许运行用户脚本”开关。

## 权限与隐私

- 运行页面：`https://www.youtube.com/watch*`
- 网络连接：`www.youtube.com`、`translate.googleapis.com`
- 本地存储：保存字幕样式、语言和显示设置。

脚本会请求 YouTube 字幕数据；默认机翻优先开启时，会把当前字幕句子发送到 Google Translate 公共接口 `translate.googleapis.com` 获取译文。脚本不发送统计或广告请求。

## 使用

- 点击 YouTube 操作按钮区里的 `X` 打开面板。
- “关闭双字幕”只关闭脚本字幕层，不修改 YouTube 原生字幕设置。
- “显示模式”可切换：`原文 + 译文`、`只显示原文`、`只显示译文`。
- “目标语言”来自 YouTube 提供的自动翻译语言列表。
- “原字幕轨”用于指定第一行来源，第二行仍从这个原轨请求 `tlang`。
- “界面语言”默认跟随浏览器，也可手动切换为简体中文、繁體中文、English、日本語、한국어、Español。
- “跳过源语言”在高级设置里，填 `zh, ja, ko` 这类语言代码；命中的是原字幕轨语言，不是人工翻译目标轨。
- 字体、字号、行间距、底部位置、颜色改完自动保存。
- 快捷键：`Alt+X` 开关双字幕，`Alt+D` 切换显示模式，`Alt+R` 重载字幕。
- 首次安装会优先根据浏览器语言推断目标语言；切过的目标语言会按原字幕语言记忆。
- 同一视频、原字幕轨和目标语言的字幕结果会短期缓存，减少重复请求和限流概率。

## 排查

在 YouTube watch 页面打开 DevTools，执行：

```js
window.__ydsDebug.snapshot()
```

重点字段：

- `enabled` 应该是 `true`
- `displayMode` 是 `dual` 或 `target` 时才会显示译文
- `cuesA` 是原文 cue 数
- `cuesB` 是译文 cue 数
- `targetLang` 是当前目标语言
- `translationRequest` 为 `manual-target` 时代表正在使用视频自带人工翻译字幕
- `targetProvider` 显示当前译文来源是 YouTube 还是机翻
- `nativeCaptionSuppressed` 为 `true` 时代表 YouTube 原生字幕层已被脚本压制
- `fetch.target` 能看到 YouTube `tlang` 请求是否成功

常见情况：

- `translationRequest = manual-target`：正在优先使用视频自带的人工目标字幕轨。
- `cuesA > 0` 且 `cuesB = 0`：原文可用，但人工目标轨、YouTube 自动翻译或机翻当前没有返回可显示译文；换目标语言或点“重载”确认。
- `cuesA = 0`：当前原字幕轨没有可用 cue；切换“原字幕轨”或换视频。
- `displayMode = source`：当前是只显示原文，切回 `原文 + 译文`。
- `enabled = false`：面板里点“开启双字幕”。
- `fetch.target` 里有 `429`：YouTube timedtext 限流，等待一段时间再试。
- 译文被限流时会先保留原文，并在倒计时结束后自动重试。

## 开发与测试

```powershell
npm install
npm run check:version
npm run check:build
npm run test:syntax
npm run test:e2e
npm run test:real
npm test
npm run diagnose -- "https://www.youtube.com/watch?v=VIDEO_ID"
npm run test:tampermonkey -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

开发时编辑 `src/yt-dual-subs.user.js`，然后执行 `npm run build` 生成根目录的 `yt-dual-subs.user.js`。

GitHub Actions 会在 push 和 PR 时运行确定性的本地测试；`workflow_dispatch` 手动触发时会额外运行真实 YouTube smoke。

GreasyFork 已通过 GitHub webhook 连接到本仓库；push 到 `master` 后，GreasyFork 会自动从 raw 同步脚本。若需要立即确认，可在 GreasyFork 管理页查看同步状态。

更多测试说明见 [docs/testing.md](docs/testing.md)。
