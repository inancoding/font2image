# Electron 打包说明

本项目已配置 Electron 打包支持，可以生成以下格式的安装包：

- **Windows**: exe 安装程序（NSIS 格式，64位）
- **Linux**: rpm 和 deb 格式（64位）
- **macOS**: dmg 格式（64位，已预留配置）

**包管理工具**: 本项目使用 pnpm

## 安装依赖

```bash
pnpm install
```

## 开发模式

在开发模式下运行 Electron 应用：

```bash
pnpm run electron:dev
```

这会同时启动 Vite 开发服务器和 Electron 窗口（使用 concurrently 跨平台支持）。

## 构建安装包

### 构建当前平台

```bash
pnpm run electron:build
```

### 构建 Windows 安装包（exe）

```bash
pnpm run electron:build:win
```

生成的 exe 安装程序位于 `release/` 目录。

### 构建 Linux 安装包（rpm + deb）

```bash
pnpm run electron:build:linux
```

生成的 rpm 和 deb 文件位于 `release/` 目录。

### 构建 macOS 安装包（dmg）

```bash
pnpm run electron:build:mac
```

生成的 dmg 文件位于 `release/` 目录。

### 构建所有平台

```bash
pnpm run electron:build:all
```

注意：跨平台构建需要在对应平台上进行，或使用 CI/CD 工具。

## 应用图标

请准备以下图标文件并放置在 `build/` 目录：

- `icon.png` - Linux 图标（至少 256x256 像素）
- `icon.ico` - Windows 图标（多尺寸，包含 256x256、128x128、64x64、48x48、32x32、16x16）
- `icon.icns` - macOS 图标

如果没有提供图标，electron-builder 会使用默认图标。

## 配置说明

打包配置在 `package.json` 的 `build` 字段中，主要配置项：

- `appId`: 应用唯一标识符
- `productName`: 应用显示名称
- `directories.output`: 输出目录（默认 `release/`）
- `win.target`: Windows 打包格式（nsis = 安装程序）
- `linux.target`: Linux 打包格式（rpm、deb）
- `mac.target`: macOS 打包格式（dmg）

所有平台均配置为 64 位（x64）架构。

## 注意事项

1. **应用图标**: 已提供 `build/icon.svg` 源文件，需要转换为 `icon.png`、`icon.ico`、`icon.icns` 格式。转换方法见 `build/README.md`。

2. **跨平台构建**: Windows 上只能构建 Windows 安装包，Linux 上只能构建 Linux 安装包。macOS 打包需要在 macOS 系统上进行。

3. **代码签名**: 
   - 当前配置未包含代码签名，构建时会显示 "signing is skipped" 警告
   - 生产环境建议对安装包进行代码签名，以提高用户信任度
   - Windows: 需要购买代码签名证书（如 DigiCert、GlobalSign）
   - macOS: 需要 Apple Developer 账号（$99/年）
   - Linux: 通常不需要签名
   - 签名配置参考：https://www.electron.build/code-signing

4. **自动更新**: 如需自动更新功能，需要配置 `electron-updater` 和更新服务器。

5. **文件大小**: Electron 应用包含完整的 Chromium 和 Node.js，安装包体积较大（通常 100MB+）。

## 故障排除

### 构建失败

确保已安装所有依赖：

```bash
pnpm install
pnpm run build:ui
pnpm run electron:build
```

### 图标问题

如果没有提供图标文件，electron-builder 会使用默认图标，但会显示警告。建议准备合适的图标文件。
