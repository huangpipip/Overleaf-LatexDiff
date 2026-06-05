const statusEl = document.getElementById("status");
const refreshButton = document.getElementById("refresh");
const oldFileSelect = document.getElementById("oldFileSelect");
const newFileSelect = document.getElementById("newFileSelect");
const removeDisplaymathCheckbox = document.getElementById("removeDisplaymath");
const generateDiffButton = document.getElementById("generateDiff");
const fileNameEl = document.getElementById("fileName");
const contentEl = document.getElementById("content");
const insertButton = document.getElementById("insert");
const copyButton = document.getElementById("copy");

let activeTabId = null;
let files = [];
let currentText = "";

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setContent(name, text) {
  fileNameEl.textContent = name || "未选择文件";
  contentEl.textContent = text || "";
  currentText = text || "";
  insertButton.disabled = !currentText;
  copyButton.disabled = !currentText;
}

function cleanTexDisplayName(value) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(description|insert_drive_file)(?=[A-Za-z0-9_-]+\.tex\b)/i, "");
  const matches = text.match(/[^\s"'<>]*?\.tex\b/gi);
  if (!matches?.length) return text;
  return matches
    .map((match) => match.replace(/^[^\w./-]+|[^\w./-]+$/g, ""))
    .filter(Boolean)
    .at(-1) || text;
}

function displayFileName(file) {
  return String(file.path || file.name || file.id || "")
    .split("/")
    .map((part) => /\.tex\b/i.test(part) ? cleanTexDisplayName(part) : part.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("/");
}

function setSelectOptions(select, items) {
  select.textContent = "";

  if (!items.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未找到可读取的 TeX 文件";
    select.append(option);
    select.disabled = true;
    return;
  }

  for (const item of items) {
    const option = document.createElement("option");
    option.value = String(select.options.length);
    option.textContent = displayFileName(item);
    select.append(option);
  }

  select.disabled = false;
}

function setAllSelectOptions(items) {
  setSelectOptions(oldFileSelect, items);
  setSelectOptions(newFileSelect, items);
  generateDiffButton.disabled = items.length < 2;
}

async function getActiveOverleafTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/([^/]+\.)?overleaf\.com\/project\//.test(tab.url || "")) {
    throw new Error("请先切换到已打开的 Overleaf 项目标签页。");
  }
  return tab;
}

function sendToContentScript(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(activeTabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Overleaf 页面没有返回有效数据。"));
        return;
      }
      resolve(response.data);
    });
  });
}

async function ensureContentScript() {
  await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    files: ["content.js"]
  });
}

async function readFileContent(selected) {
  const data = await sendToContentScript({ type: "READ_TEX_FILE_DOWNLOAD", file: selected });
  return data.content || "";
}

function replaceCurrentOverleafEditorContent(text) {
  function dispatchInput(element) {
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const cm6 = document.querySelector(".cm-content");
  const cm6View = cm6?.cmView?.view;
  if (cm6View?.dispatch && cm6View.state?.doc) {
    cm6View.dispatch({
      changes: {
        from: 0,
        to: cm6View.state.doc.length,
        insert: text
      }
    });
    cm6View.focus?.();
    return "CodeMirror 6";
  }

  const codeMirror = document.querySelector(".CodeMirror")?.CodeMirror;
  if (codeMirror?.setValue) {
    codeMirror.setValue(text);
    codeMirror.focus?.();
    return "CodeMirror";
  }

  const ace = document.querySelector(".ace_editor")?.env?.editor;
  if (ace?.setValue) {
    ace.setValue(text, -1);
    ace.focus?.();
    return "Ace";
  }

  const textarea = document.querySelector("textarea");
  if (textarea) {
    textarea.value = text;
    dispatchInput(textarea);
    textarea.focus();
    return "textarea";
  }

  throw new Error("没有找到当前 Overleaf 编辑器。请先在 Overleaf 中打开要插入的 TeX 文件。");
}

async function insertIntoCurrentEditor() {
  if (!currentText) {
    throw new Error("没有可插入的 diff 结果。");
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    world: "MAIN",
    func: replaceCurrentOverleafEditorContent,
    args: [currentText]
  });

  setStatus(`已插入到当前 Overleaf 编辑器（${result?.result || "editor"}）。`);
}

function parseLatexDiffOutput(html) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const textareas = Array.from(document.querySelectorAll("textarea"));
  const output = textareas
    .map((textarea) => textarea.value || "")
    .findLast((value) => value.includes("DIF LATEXDIFF") || value.includes("\\DIFadd") || value.includes("\\DIFdel")) ||
    textareas.at(-1)?.value ||
    "";

  if (!output.trim()) {
    throw new Error("latex-diff 返回页面里没有找到 diff 输出。");
  }

  if (!output.includes("\\DIFadd") && !output.includes("\\DIFdel") && !output.includes("DIF LATEXDIFF")) {
    throw new Error("latex-diff 返回了页面，但没有包含 latexdiff 标记。");
  }

  return output;
}

function removeDisplaymathEnvironment(tex) {
  return tex
    .replace(/\\begin\{displaymath\}\s*/g, "")
    .replace(/\s*\\end\{displaymath\}/g, "");
}

async function generateLatexDiff(oldContent, newContent) {
  const response = await chrome.runtime.sendMessage({
    type: "GENERATE_LATEX_DIFF",
    oldContent,
    newContent
  });

  if (!response?.ok) {
    throw new Error(response?.error || "latex-diff 后台请求失败。");
  }

  return parseLatexDiffOutput(response.html || "");
}

function looksLikeLatexDiffOutput(content) {
  return /%DIF LATEXDIFF DIFFERENCE FILE|%DIF PREAMBLE EXTENSION ADDED BY LATEXDIFF|\\DIFadd|\\DIFdel|\\DIFaddbegin|\\DIFdelbegin/.test(content);
}

async function loadFiles() {
  setStatus("正在读取 Overleaf 项目文件...");
  setContent("未生成 diff", "");
  oldFileSelect.disabled = true;
  newFileSelect.disabled = true;
  generateDiffButton.disabled = true;

  const tab = await getActiveOverleafTab();
  activeTabId = tab.id;
  await ensureContentScript();

  const data = await sendToContentScript({ type: "LIST_TEX_FILES" });
  files = data.files || [];
  setAllSelectOptions(files);

  if (!files.length) {
    const debug = data.debug;
    const detail = debug
      ? `接口候选 ${debug.entityCandidates} 个，页面候选 ${debug.domCandidates} 个，顶层键：${debug.entityKeys.join(", ") || debug.entityShape}`
      : "没有返回调试信息";
    setStatus(`没有找到可读取的 .tex 文件。${detail}`, true);
    return;
  }

  oldFileSelect.value = "0";
  newFileSelect.value = files.length > 1 ? "1" : "0";

  if (files.length < 2) {
    setStatus("当前项目少于 2 个 TeX 文件，无法生成双文件 diff。", true);
    return;
  }

  setStatus(`找到 ${files.length} 个 TeX 文件。`);
}

async function generateSelectedDiff() {
  const oldFile = files[Number(oldFileSelect.value)];
  const newFile = files[Number(newFileSelect.value)];

  if (!oldFile || !newFile) {
    throw new Error("请先选择旧版本和新版本 TeX 文件。");
  }

  const oldName = displayFileName(oldFile);
  const newName = displayFileName(newFile);
  const sameFile = oldFileSelect.value === newFileSelect.value;

  setStatus(sameFile ? "旧/新文件相同，diff 可能为空；正在读取内容..." : "正在读取两份 TeX 内容...");
  setContent(`${oldName} -> ${newName}`, "");
  generateDiffButton.disabled = true;

  try {
    const oldContent = await readFileContent(oldFile);
    const newContent = await readFileContent(newFile);

    if (!oldContent.trim() || !newContent.trim()) {
      throw new Error("至少一个选中文件内容为空，无法生成 diff。");
    }

    if (looksLikeLatexDiffOutput(oldContent)) {
      throw new Error(`${oldName} 看起来已经是 latexdiff 输出文件。请选择原始 TeX 文件，不要选择 diff.tex。`);
    }

    if (looksLikeLatexDiffOutput(newContent)) {
      throw new Error(`${newName} 看起来已经是 latexdiff 输出文件。请选择原始 TeX 文件，不要选择 diff.tex。`);
    }

    setStatus("正在调用 latex-diff 生成结果...");
    const rawDiffContent = await generateLatexDiff(oldContent, newContent);
    const diffContent = removeDisplaymathCheckbox.checked
      ? removeDisplaymathEnvironment(rawDiffContent)
      : rawDiffContent;
    setContent(`${oldName} -> ${newName}`, diffContent);
    setStatus(sameFile ? "已通过 3142.nl 生成 diff。旧/新文件相同，结果可能没有变化。" : "已通过 3142.nl 生成 diff TeX。");
  } finally {
    generateDiffButton.disabled = files.length < 2;
  }
}

refreshButton.addEventListener("click", () => {
  loadFiles().catch((error) => {
    setStatus(error.message, true);
    setAllSelectOptions([]);
    setContent("读取失败", "");
  });
});

generateDiffButton.addEventListener("click", () => {
  generateSelectedDiff().catch((error) => {
    setStatus(error.message, true);
    setContent("读取失败", "");
  });
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(currentText);
  setStatus("内容已复制。");
});

insertButton.addEventListener("click", () => {
  insertIntoCurrentEditor().catch((error) => {
    setStatus(error.message, true);
  });
});

loadFiles().catch((error) => {
  setStatus(error.message, true);
  setAllSelectOptions([]);
  setContent("读取失败", "");
});
