# Clipchamp Edge-TTS 批量配音工坊

本项目现在主路线是本地 EXE 软件版：双击 `ClipchampTTS.exe` 后自动启动本地服务并打开浏览器控制面板，生成的音频会直接保存到你设置的电脑目录，页面也提供单条 MP3/MP4 下载，并可选择一键打包 MP3、MP4 或全部格式。

## 开发启动

```powershell
start.cmd
```

启动后会自动打开本地页面。

## 打包 EXE

```powershell
build_exe.cmd
```

打包成功后，EXE 位于：

```text
dist\ClipchampTTS.exe
```

## 功能

- 默认英文语音，并支持加载 Microsoft Edge-TTS 完整语音列表。
- 支持从 Excel / Google Sheets 复制整列文案，多行粘贴自动拆分成卡片。
- 每张卡片可试听前 30 个字；生成后可试听完整音频，也可以用「试听全部」按顺序播放。
- 批量生成严格串行执行，后端每条成功后休息 1.5 秒，降低触发限流的概率。
- 文件名会过滤 Windows 非法字符。
- 输出目录不存在时会自动创建，并可一键打开。
- 生成后每张卡片可单独下载 MP3 / MP4，也可以选择一键打包 MP3、MP4 或 MP3+MP4 ZIP 下载。

## 注意

- 生成音频仍然需要联网访问 Microsoft Edge-TTS 在线服务。
- 不需要 API Key，也不需要登录账号。
- 如果依赖安装或生成时出现 `WinError 10013` / 403 / WebSocket 错误，通常是防火墙、杀毒软件、VPN、代理、系统时间或网络策略问题。
## GitHub 安全发布

本仓库包含 GitHub Actions 发布流程：推送 `v*` 版本标签后，会在 `windows-latest` 上构建 `ClipchampTTS.exe`，生成 GitHub Release，并通过 `actions/attest-build-provenance` 为发布产物生成构建证明。

```powershell
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

发布产物在 GitHub Release 页面下载。可选校验命令：

```powershell
gh attestation verify ClipchampTTS.exe --owner secure-artifacts
```

仓库还包含 CodeQL 与 Dependabot 配置，用于持续进行代码扫描和依赖更新提醒。

## 如何发布新版本

本项目使用 GitHub Actions 自动构建和发布。每次发布新版本只需要创建一个 Git Tag 并推送即可。

### 发布步骤

#### 1. 确保代码已提交并推送

在发布之前，确保你的所有代码改动已经提交并推送到 GitHub：

```bash
# 查看当前状态
git status

# 添加所有改动
git add .

# 提交改动（把“你的改动说明”替换成实际描述）
git commit -m "你的改动说明"

# 推送到 GitHub
git push origin main
```

#### 2. 创建版本 Tag

Git Tag 是版本标记，用于标识发布版本。版本号格式为 `v主版本.次版本.修订版本`，例如 `v1.0.0`、`v1.1.0`、`v2.0.0`。

```bash
# 创建一个新的版本 tag（将 v1.0.1 替换为你想发布的版本号）
git tag -a v1.0.1 -m "Release version 1.0.1"
```

#### 3. 推送 Tag 触发自动构建

```bash
# 推送 tag 到 GitHub，这会自动触发 CI 构建
git push origin v1.0.1
```

推送后，GitHub Actions 会自动执行以下操作：

1. 构建 Windows EXE
2. 生成 Attestation 构建证明
3. 创建 GitHub Release 并上传 `ClipchampTTS.exe`

#### 4. 查看构建结果

- 构建进度：访问项目的 Actions 页面查看
- 发布结果：访问项目的 Releases 页面查看已发布文件

### 版本号说明

| 版本号格式 | 什么时候用 | 示例 |
| --- | --- | --- |
| `vX.0.0` | 重大更新、不兼容改动 | `v2.0.0` |
| `vX.Y.0` | 新增功能 | `v1.1.0` |
| `vX.Y.Z` | 修复 bug | `v1.0.1` |

### 如果构建失败怎么办

1. 访问项目的 Actions 页面查看错误日志。
2. 修复代码或 workflow 配置。
3. 删除失败的 tag 并重新创建：

```bash
# 删除本地 tag
git tag -d v1.0.1

# 删除远程 tag
git push origin :refs/tags/v1.0.1

# 修复问题后，重新创建并推送
git tag -a v1.0.1 -m "Release version 1.0.1"
git push origin v1.0.1
```
