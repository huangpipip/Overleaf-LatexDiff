# Overleaf LatexDiff

一个最小可用的 Chrome Manifest V3 插件。打开 Overleaf 项目页后，点击插件图标，可以选择项目中的两份 `.tex` 文件，通过 `https://3142.nl/latex-diff/` 生成 diff TeX，并在插件窗口里查看和复制结果。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择本目录：`/Users/hsp/Documents/ChromeTexdiff`。

## 使用

1. 在 Chrome 中打开并登录 Overleaf 项目页面，例如 `https://www.overleaf.com/project/...`。
2. 点击 Chrome 工具栏里的 `Overleaf LatexDiff`。
3. 在「旧版本」和「新版本」下拉框里选择两份 `.tex` 文件。
4. 点击「生成 diff」。
5. 生成的 diff TeX 会显示在窗口中，可以点击「复制」。

## 实现说明

插件通过 Overleaf 当前标签页的登录态请求项目文件树：

- 文件树：`/project/<projectId>/entities`

读取文件内容时，插件会调用 Overleaf 的单文件下载接口读取所选 `.tex` 文件；不会调用 Download source，也不会下载项目 zip。

生成 diff 时，插件会把用户选择的两份 TeX 内容作为 `old` 和 `new` 字段 POST 到 `https://3142.nl/latex-diff/`，并从返回页面的 Output 文本框中解析 diff TeX。

如果 Overleaf 后续调整文件树接口，`content.js` 里的文件列表读取逻辑需要同步更新。
