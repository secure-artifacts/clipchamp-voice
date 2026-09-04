# Clipchamp Voice Studio

当前入口是纯 JavaScript 桌面软件，不需要 Python 后端，也不需要云端部署。

直接双击：

```text
ClipchampVoiceStudio.exe
```

如果根目录没有这个文件，可以运行：

```powershell
build_exe.cmd
```

## 功能

- 独立 Electron 软件窗口，不再打开浏览器网页。
- 精致夜色界面，并带独立软件 logo / Windows 图标。
- 默认英文语音，支持加载 Microsoft Edge-TTS 完整语音列表。
- 支持从 Excel / Google Sheets 复制整列文案，多行粘贴自动拆成卡片。
- 每张卡片可试听前 30 个字；生成后可试听完整音频，也可以用“试听全部”按顺序播放。
- 批量生成严格串行执行，每条成功后休息 1.5 秒，降低触发限流的概率。
- 文件名会过滤 Windows 非法字符。
- 输出目录不存在时会自动创建，并可一键打开。
- 每条会保存 MP3，并用本地 ffmpeg 转成 AAC 音频的 MP4 容器。
- 可选择一键打包 MP3、MP4 或 MP3+MP4 ZIP。

## 开发与打包

源码在：

```text
js-desktop
```

启动开发版：

```powershell
cd js-desktop
start.cmd
```

重新打包：

```powershell
cd js-desktop
build.cmd
```

打包输出：

```text
js-desktop\dist\ClipchampVoiceStudio.exe
```

打包脚本也会复制一份到根目录：

```text
ClipchampVoiceStudio.exe
```

## 安全来源

- 依赖安装使用官方 npm registry：`https://registry.npmjs.org/`
- TTS 仍然需要联网访问 Microsoft Edge-TTS 服务。
- 不需要 API Key，也不需要登录账号。
- MP4 转码依赖 `ffmpeg-static`，打包产物中包含对应 LICENSE / README 文件。


## GitHub 发布流程

推送到 `main` 会运行 Desktop CI 和 CodeQL。创建并推送 `v*` tag 会触发 Release workflow，在 GitHub 的 Windows runner 上构建 `ClipchampVoiceStudio.exe`，上传到 GitHub Release，并生成构建证明。

```powershell
git tag -a v1.1.0 -m "Release version 1.1.0"
git push origin v1.1.0
```

发布产物：`ClipchampVoiceStudio.exe`

## 旧版说明

旧版 Python + 浏览器控制面板源码仍在仓库里，方便以后回退或参考；但默认启动脚本已经改为新版桌面软件。
