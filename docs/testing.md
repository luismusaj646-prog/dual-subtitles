# 测试

这个项目的自动化测试不依赖 Tampermonkey 界面。Playwright 会加载一个 mock YouTube watch 页面，安装轻量 `GM_*` shim，注入 `yt-dual-subs.user.js`，然后验证 debug API 和实际渲染出来的双字幕行。

## 命令

```powershell
npm install
npm test
npm run test:e2e
npm run test:e2e:headed
npm run diagnose -- "https://www.youtube.com/watch?v=VIDEO_ID"
npm run test:tampermonkey -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

默认测试是确定性的，不访问真实 YouTube。覆盖：

- 第一行使用原字幕轨，第二行始终使用同一原轨的 YouTube `tlang` 自动翻译
- 即使页面存在目标语言字幕轨，也不拿它替代客户选择的自动翻译
- timedtext 裸 `baseUrl` 为空时，复用 YouTube 原生播放器 timedtext 请求里的 `pot` 参数重试
- timedtext 没有 cue 时回退到 transcript API
- transcript API 不可用时回退到 transcript UI
- 选中字幕轨无有效 cue 时，只允许同语言默认字幕轨兜底，避免原文被其他语言轨替换
- 原字幕为空时跳过第二行自动翻译请求，避免无意义限流
- 第二行自动翻译限流时保留第一行原字幕
- 目标语言使用 YouTube 提供的自动翻译语言列表下拉切换
- 原字幕轨和字幕样式配置改动后自动保存
- debug 面板默认折叠在“高级”区域
- 显示模式支持“原文+译文 / 只显示原文 / 只显示译文”
- 目标语言支持搜索过滤，并按源语言记忆上次选择
- 字幕默认自动避让播放器控制栏，并默认跟随 YouTube 原生字幕样式
- UI 有强制深色模式覆盖，Tampermonkey 烟测会记录 light/dark 样式和截图
- watch 页面没有字幕轨时进入等待状态
- 非 watch 页面保留 debug API，但卸载脚本 UI

## 验收点

当前版本的关键验收点：

- 页面加载后双字幕自动加载，面板默认不展开
- `X` 按钮在 YouTube 视频下方操作按钮区域，不覆盖播放器
- 打开面板后 UI 跟随 YouTube 浅色/深色主题
- 第一行必须是原字幕轨，第二行必须是同一原轨的 YouTube `tlang` 自动翻译
- `显示模式` 切换只影响渲染，不改变已抓到的 cue
- `跟随 YouTube 样式` 和 `自动避让控制栏` 是固定默认行为，没有 UI 开关

## 单视频诊断

`diagnose` 会打开真实 YouTube 页面，注入当前脚本，抓取 debug snapshot、字幕轨、timedtext 响应、原生 CC 文本和 transcript 候选入口。JSON 报告会写入 `diagnostics/`。

```powershell
npm run diagnose -- "https://www.youtube.com/watch?v=GnE1gY_TqGo"
```

## 真实 YouTube 冒烟测试

真实 YouTube 测试默认跳过，因为它受网络、地区、同意弹窗和 YouTube DOM 变化影响。

```powershell
$env:YDS_REAL_YOUTUBE = '1'
npm run test:e2e -- tests/e2e/real-youtube.spec.js --headed
```

## 真实 Tampermonkey 冒烟测试

`test:tampermonkey` 会启动 Playwright Chromium，加载本机 Chrome Profile 1 里的 Tampermonkey 和 uBlock Origin Lite，开启 Chrome 的“允许运行用户脚本”，把当前 `yt-dual-subs.user.js` 安装进 Tampermonkey，再打开真实 YouTube 页面截图。报告和截图写入 `diagnostics/`。

```powershell
npm run test:tampermonkey -- "https://www.youtube.com/watch?v=eIho2S0ZahI&hl=en&cc_lang_pref=en&cc_load_policy=1"
```

可以用环境变量指定测试选择的源语言和目标语言：

```powershell
$env:YDS_SOURCE_LANG = 'en'
$env:YDS_TARGET_LANG = 'zh-Hans'
npm run test:tampermonkey -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

指定视频：

```powershell
$env:YDS_REAL_YOUTUBE = '1'
$env:YDS_REAL_URL = 'https://www.youtube.com/watch?v=VIDEO_ID&ydsDebug=1'
npm run test:e2e -- tests/e2e/real-youtube.spec.js --headed
```

## 浏览器 Debug API

脚本安装到 YouTube watch 页面后，可以在 DevTools 里调用：

```js
window.__ydsDebug.snapshot()
window.__ydsDebug.reload()
window.__ydsDebug.setDebug(true)
window.__ydsDebug.scheduleInit('manual')
```

## 译文不见时

先在 DevTools 执行：

```js
window.__ydsDebug.snapshot()
```

判断顺序：

- `enabled=false`：面板里点“开启双字幕”
- `displayMode=source`：当前就是只显示原文
- `cuesA>0` 且 `cuesB=0`：原文加载成功，译文请求没有返回 cue，看 `fetch.target`
- `cuesA=0`：当前原字幕轨不可用，切换“原字幕轨”或换视频
- `fetch.target` 出现 `429`：YouTube timedtext 限流，等待后再点“重载”
- `targetLang` 不是预期语言：目标语言被自动保存了，重新选择目标语言

Tampermonkey 真实测试报告里也会记录这些字段，并额外保存截图：

- `initialUi.panelOpen`
- `initialUi.launcherInActions`
- `snapshot.cuesA`
- `snapshot.cuesB`
- `snapshot.fetch.target`
- `cueProbe.text`
