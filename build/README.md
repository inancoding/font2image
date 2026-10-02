# 应用图标说明

项目 Logo 位于 `public/logo.png`（1000x1000 像素），已复制到 `build/icon.png`。

## 自动转换

electron-builder 会在构建时自动将 `icon.png` 转换为各平台所需的格式：
- **Windows**: 自动转换为 `.ico` 格式
- **Linux**: 直接使用 `.png` 格式
- **macOS**: 自动转换为 `.icns` 格式

无需手动转换，只需确保 `build/icon.png` 存在且尺寸至少为 256x256 像素。

## 手动转换（可选）

如需手动转换，可使用以下方法：

### 方法 1：在线转换

1. 访问 https://cloudconvert.com/png-to-ico
2. 上传 `build/icon.png`
3. 选择输出尺寸（256x256、128x128、64x64、48x48、32x32、16x16）
4. 下载并放置到 `build/` 目录

### 方法 2：使用 ImageMagick

```bash
# 安装 ImageMagick: https://imagemagick.org/script/download.php

# 生成 ICO（Windows）
magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# 生成 ICNS（macOS，需要在 macOS 上执行）
mkdir icon.iconset
magick convert icon.png -resize 16x16 icon.iconset/icon_16x16.png
magick convert icon.png -resize 32x32 icon.iconset/icon_16x16@2x.png
magick convert icon.png -resize 32x32 icon.iconset/icon_32x32.png
magick convert icon.png -resize 64x64 icon.iconset/icon_32x32@2x.png
magick convert icon.png -resize 128x128 icon.iconset/icon_128x128.png
magick convert icon.png -resize 256x256 icon.iconset/icon_128x128@2x.png
magick convert icon.png -resize 256x256 icon.iconset/icon_256x256.png
magick convert icon.png -resize 512x512 icon.iconset/icon_256x256@2x.png
magick convert icon.png -resize 512x512 icon.iconset/icon_512x512.png
magick convert icon.png -resize 1024x1024 icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
```

## 注意事项

- 当前配置使用 `build/icon.png`，electron-builder 会自动处理转换
- 如果手动提供了 `icon.ico` 或 `icon.icns`，electron-builder 会优先使用
- 建议保持 `build/icon.png` 与 `public/logo.png` 同步
