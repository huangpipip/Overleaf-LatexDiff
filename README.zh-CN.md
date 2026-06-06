# Overleaf LatexDiff

用于在 Overleaf 项目中选择两份 `.tex` 文件并生成 `latexdiff` 结果的 Chrome 插件。

打开 Overleaf 项目后，选择旧版本和新版本 TeX 文件，插件会通过 [3142.nl/latex-diff](https://3142.nl/latex-diff/) 生成 diff TeX。生成后可以复制结果，或插入到当前打开的 Overleaf 编辑器中。

## 功能

- 列出当前 Overleaf 项目中的 `.tex` 文件。
- 通过 Overleaf 单文件下载接口读取所选文件内容。
- 使用 `https://3142.nl/latex-diff/` 生成 `latexdiff` TeX。
- 在插件弹窗中显示生成的 diff。
- 一键复制 diff TeX。
- 将生成结果插入到当前打开的 Overleaf 编辑器。
- 可选删除结果中的 `\begin{displaymath}` 和 `\end{displaymath}`。
- 阻止把已有 `latexdiff` 输出文件作为输入文件。

## 安装

### 从源码安装

1. 克隆或下载本仓库。
2. 在 Chrome 中打开 `chrome://extensions/`。
3. 开启 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择包含 `manifest.json` 的仓库目录。

### 从 ZIP 安装

1. 下载发布版 zip 包。
2. 解压 zip。
3. 在 Chrome 中打开 `chrome://extensions/`。
4. 开启 **开发者模式**。
5. 点击 **加载已解压的扩展程序**，选择解压后的目录。

## 使用方法

1. 在 Chrome 中打开一个 Overleaf 项目。
2. 点击浏览器工具栏中的 **Overleaf LatexDiff** 插件图标。
3. 在「旧版本」和「新版本」下拉框中选择两份 `.tex` 文件。
4. 如有需要，勾选「删除结果中的 displaymath 环境」。
5. 点击「生成 diff」。
6. 复制生成的 TeX，或点击「插入」将结果写入当前打开的 Overleaf 编辑器。

## 隐私与网络行为

插件只读取你当前正在使用的 Overleaf 项目标签页。插件不会下载完整项目 zip。

生成 diff 时，插件会把所选旧版本和新版本 TeX 文件内容作为 `old` 和 `new` 表单字段发送到 `https://3142.nl/latex-diff/`。如果文档包含敏感内容，请确认你愿意将所选文件发送到该外部服务后再使用。

## 实现说明

- Chrome Extension Manifest V3。
- Overleaf 文件列表：`/project/<projectId>/entities`。
- Overleaf 文件内容：单文件下载接口，例如 `/Project/<projectId>/doc/<docId>/download`。
- diff 生成：background service worker 向 `https://3142.nl/latex-diff/` 发起 POST 请求，popup 解析返回页面中的 Output 文本框。

插件依赖 Overleaf 当前的网页路由和 DOM 结构。如果 Overleaf 调整内部实现，文件列表、文件读取或编辑器插入功能可能需要更新。

## 开发

校验扩展文件：

```sh
node --check popup.js
node --check content.js
node --check background.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```

打包扩展：

```sh
zip -r Overleaf-LatexDiff-0.1.0.zip manifest.json popup.html popup.css popup.js content.js background.js README.md README.zh-CN.md
```

## 限制

- 插件不会在本地运行 `latexdiff`。
- 插件不会自动创建新的 Overleaf 文件。
- 「插入」会替换当前打开编辑器中的内容，因此使用前请先打开目标文件。
- 生成结果质量取决于外部服务 `3142.nl/latex-diff/`。

## 许可证

本项目基于 [MIT License](LICENSE) 授权。
