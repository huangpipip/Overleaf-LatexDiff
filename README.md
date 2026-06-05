# Overleaf LatexDiff

Chrome extension for generating `latexdiff` output from two `.tex` files in an Overleaf project.

Open an Overleaf project, choose an old and a new TeX file, generate a diff through [3142.nl/latex-diff](https://3142.nl/latex-diff/), then copy the result or insert it back into the currently open Overleaf editor.

## Features

- Lists `.tex` files from the current Overleaf project.
- Reads selected files through Overleaf's single-file download endpoint.
- Generates `latexdiff` TeX using `https://3142.nl/latex-diff/`.
- Displays the generated diff in the extension popup.
- Copies the diff TeX to the clipboard.
- Inserts the generated diff into the currently open Overleaf editor.
- Optional cleanup to remove `\begin{displaymath}` and `\end{displaymath}` from the result.
- Prevents using an existing `latexdiff` output file as an input file.

## Installation

### From Source

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder that contains `manifest.json`.

### From ZIP

1. Download a packaged release zip.
2. Extract the zip.
3. Open `chrome://extensions/`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder.

## Usage

1. Open an Overleaf project in Chrome.
2. Click the **Overleaf LatexDiff** extension icon.
3. Choose the old revision and new revision `.tex` files.
4. Optionally enable **删除结果中的 displaymath 环境**.
5. Click **生成 diff**.
6. Copy the generated TeX or click **插入** to replace the currently open Overleaf editor content.

## Privacy and Network Behavior

This extension reads only the Overleaf project tab that you are currently using. It does not download the full project zip.

To generate the diff, the selected old and new TeX file contents are sent to `https://3142.nl/latex-diff/` as form fields named `old` and `new`. Do not use this extension with confidential documents unless you are comfortable sending those selected files to that external service.

## Implementation Notes

- Manifest version: Chrome Extension Manifest V3.
- Overleaf file list: `/project/<projectId>/entities`.
- Overleaf file content: single-file download routes such as `/Project/<projectId>/doc/<docId>/download`.
- Diff generation: background service worker posts to `https://3142.nl/latex-diff/` and the popup parses the returned Output textarea.

The extension depends on Overleaf's current web routes and DOM structure. If Overleaf changes those internals, file listing, file reading, or editor insertion may need updates.

## Development

Validate the extension files:

```sh
node --check popup.js
node --check content.js
node --check background.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```

Package the extension:

```sh
zip -r Overleaf-LatexDiff-0.1.0.zip manifest.json popup.html popup.css popup.js content.js background.js README.md
```

## Limitations

- The extension does not run `latexdiff` locally.
- The extension does not create a new Overleaf file automatically.
- The **插入** action replaces the content of the currently open editor, so open the intended target file before using it.
- Generated diff quality depends on the external `3142.nl/latex-diff/` service.

## License

Add a license before publishing if you want others to use, modify, or redistribute this project.
