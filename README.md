# YouTube Dual Native Subs

YouTube 双字幕 Tampermonkey 脚本。

当前版本：`4.1.0`

项目地址：https://github.com/luismusaj646-prog/dual-subtitles

## 功能

- 第一行显示 YouTube 原字幕轨文本。
- 第二行显示同一原字幕轨通过 YouTube `tlang` 得到的自动翻译。
- 不使用外部翻译服务。
- 不把页面已有的目标语言字幕轨当成第二行替代品。
- 字幕层放在 YouTube 播放器里。
- 面板按钮放在 YouTube 视频下方操作按钮区域。

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

## 权限与隐私

- 运行页面：`https://www.youtube.com/watch*`
- 网络连接：`www.youtube.com`
- 本地存储：保存字幕样式、语言和显示设置。

脚本只请求 YouTube 自身的字幕和 transcript 数据，不把字幕文本发送给第三方翻译、统计或广告服务。

## 使用

- 点击 YouTube 操作按钮区里的 `X` 打开面板。
- “关闭双字幕”只关闭脚本字幕层，不修改 YouTube 原生字幕设置。
- “显示模式”可切换：`原文 + 译文`、`只显示原文`、`只显示译文`。
- “目标语言”来自 YouTube 提供的自动翻译语言列表。
- “原字幕轨”用于指定第一行来源，第二行仍从这个原轨请求 `tlang`。
- 字体、字号、行间距、底部位置、颜色改完自动保存。

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
- `fetch.target` 能看到 YouTube `tlang` 请求是否成功

常见情况：

- `cuesA > 0` 且 `cuesB = 0`：原文可用，但 YouTube 当前没有返回自动翻译；换目标语言或点“重载”确认。
- `cuesA = 0`：当前原字幕轨没有可用 cue；切换“原字幕轨”或换视频。
- `displayMode = source`：当前是只显示原文，切回 `原文 + 译文`。
- `enabled = false`：面板里点“开启双字幕”。
- `fetch.target` 里有 `429`：YouTube timedtext 限流，等待一段时间再试。

## 开发与测试

```powershell
npm install
npm run test:syntax
npm run test:e2e
npm test
npm run diagnose -- "https://www.youtube.com/watch?v=VIDEO_ID"
npm run test:tampermonkey -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

更多测试说明见 [docs/testing.md](docs/testing.md)。
