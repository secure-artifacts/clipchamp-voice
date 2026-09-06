# Clipchamp Voice Studio

精致夜色 JavaScript 桌面版。它使用 Electron 打开本地软件窗口，TTS 逻辑由 Electron 主进程通过 Node WebSocket 连接 Edge-TTS 完成；保存文件、打开目录、MP4 转码和 ZIP 打包由 Electron 主进程在本机完成。

## 直接使用

打包好的便携版在：

```text
js-desktop\dist\ClipchampVoiceStudio.exe
```

双击即可打开，不需要 Python，也不需要部署云端。

## 启动开发版

```powershell
cd js-desktop
start.cmd
```

第一次运行会从官方 npm 安装 Electron 依赖。

## 重新打包

```powershell
cd js-desktop
build.cmd
```

## 连接方式

软件不会再从 renderer 页面直接打开浏览器 WebSocket；页面通过 IPC 调用 Electron 主进程，由主进程发送带 Edge headers 的 WebSocket 请求。这样可以避开 Chromium 页面 WebSocket 不能自定义握手头导致的 403。

## 说明

- 默认英文语音，可加载 Microsoft Edge-TTS 完整语音列表。
- 支持从 Excel / Google Sheets 复制整列文案，多行粘贴会自动拆成卡片。
- 批量生成严格串行执行，每条之间休息 1.5 秒，降低触发限流的概率。
- 每条生成后会保存 MP3，并用本地 ffmpeg 转成 AAC 音频的 MP4 容器。
- 可单条定位 MP3 / MP4，也可一键打包 MP3、MP4 或全部格式 ZIP。
- 所有输出文件都保存在你选择的本地文件夹里。
- 仍然需要联网访问 Microsoft Edge-TTS 服务；不需要 API Key，也不需要登录账号。

## 安全来源

依赖安装固定使用官方 npm registry：`https://registry.npmjs.org/`。

MP4 转码依赖 `ffmpeg-static`，其 npm 包许可证为 GPL-3.0-or-later；打包产物中包含对应 LICENSE / README 文件。适合开源分享，如果以后要闭源商业分发，需要单独处理许可证方案。
