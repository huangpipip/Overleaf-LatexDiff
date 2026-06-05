(() => {
if (globalThis.__chromeTexDiffContentLoaded) {
  return;
}
globalThis.__chromeTexDiffContentLoaded = true;

const PROJECT_ID_PATTERN = /\/project\/([0-9a-f]{24}|[A-Za-z0-9_-]+)/;

function getProjectId() {
  const match = window.location.pathname.match(PROJECT_ID_PATTERN);
  return match?.[1] || null;
}

async function fetchJson(path) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function firstSuccessful(paths) {
  const errors = [];

  for (const path of paths) {
    try {
      return await fetchJson(path);
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }

  throw new Error(errors.join("; "));
}

function normalizeId(entity) {
  return entity?._id || entity?.id || entity?.doc_id || entity?.docId || "";
}

function collectIds(entity) {
  if (!entity || typeof entity !== "object") return [];
  return [
    entity._id,
    entity.id,
    entity.doc_id,
    entity.docId,
    entity.entityId,
    entity.fileId,
    entity.linkedFileData?.v1_source_doc_id,
    entity.linkedFileData?.source_doc_id
  ]
    .filter(Boolean)
    .map(String)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

function cleanTexName(value) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(description|insert_drive_file)(?=[A-Za-z0-9_-]+\.tex\b)/i, "");
  if (!text) return "";

  const matches = text.match(/[^\s"'<>]*?\.tex\b/gi);
  if (!matches?.length) {
    return text;
  }

  return matches
    .map((match) => match.replace(/^[^\w./-]+|[^\w./-]+$/g, ""))
    .filter(Boolean)
    .at(-1) || text;
}

function cleanPath(value) {
  return String(value || "")
    .split("/")
    .map((part) => /\.tex\b/i.test(part) ? cleanTexName(part) : part.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("/");
}

function entityName(entity) {
  const name = entity?.name || entity?.pathname || entity?.path || "";
  return cleanPath(name);
}

function walkEntities(node, parentPath = "", results = [], visited = new WeakSet(), inferredType = "") {
  if (!node) return results;

  if (Array.isArray(node)) {
    for (const item of node) {
      walkEntities(item, parentPath, results, visited, inferredType);
    }
    return results;
  }

  if (typeof node !== "object") {
    return results;
  }

  if (visited.has(node)) {
    return results;
  }
  visited.add(node);

  const name = entityName(node);
  const currentPath = name ? `${parentPath}${name}` : parentPath;
  const displayName = cleanTexName(name);
  const displayPath = cleanPath(currentPath);
  const id = normalizeId(node);
  const type = String(node.type || node.kind || inferredType || "").toLowerCase();
  const looksLikeReadableFile = type === "doc" || type === "file" || node.lines || node.content || /\.tex$/i.test(name);

  if (id && name && looksLikeReadableFile) {
    results.push({
      id,
      readIds: collectIds(node),
      name: displayName,
      path: displayPath,
      type: type || "doc"
    });
  }

  const folderPath = name && !id ? `${currentPath}/` : currentPath ? `${currentPath}/` : parentPath;
  const childrenKeys = ["docs", "fileRefs", "files", "folders", "children", "entities"];
  let traversedKnownChildren = false;
  for (const key of childrenKeys) {
    if (node[key]) {
      traversedKnownChildren = true;
      const childType = key === "docs" ? "doc" : key === "fileRefs" || key === "files" ? "file" : "";
      walkEntities(node[key], folderPath, results, visited, childType);
    }
  }

  if (node.rootFolder) {
    traversedKnownChildren = true;
    walkEntities(node.rootFolder, parentPath, results, visited);
  }

  if (!name && !traversedKnownChildren) {
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        walkEntities(value, parentPath, results, visited);
      }
    }
  }

  return results;
}

function uniqueTexFiles(files) {
  const seen = new Set();
  return files
    .map((file) => ({
      ...file,
      name: cleanTexName(file.name || file.path || ""),
      path: cleanPath(file.path || file.name || "")
    }))
    .filter((file) => /\.tex$/i.test(file.path || file.name || ""))
    .filter((file) => {
      const key = file.id || file.path;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));
}

function collectTexFilesFromDom() {
  const selectors = [
    "[data-doc-id]",
    "[data-entity-id]",
    "[data-file-id]",
    "[data-id]",
    "[data-ol-doc-id]",
    "[aria-selected='true']",
    ".active",
    ".selected"
  ];
  const candidates = [];

  for (const element of document.querySelectorAll(selectors.join(","))) {
    const name = cleanTexName(element.getAttribute("aria-label") || element.title || element.textContent);
    if (!/\.tex$/i.test(name)) {
      continue;
    }

    const id = findEntityId(element);

    if (id) {
      candidates.push({
        id,
        readIds: [id],
        name,
        path: name,
        type: "dom"
      });
    }
  }

  return uniqueTexFiles(candidates);
}

function findEntityId(element) {
  let current = element;

  while (current && current !== document.body) {
    const id =
      current.dataset?.docId ||
      current.dataset?.entityId ||
      current.dataset?.fileId ||
      current.dataset?.id ||
      current.dataset?.olDocId ||
      "";

    if (id) {
      return id;
    }

    current = current.parentElement;
  }

  return "";
}

async function listTexFiles() {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("无法从当前 URL 识别 Overleaf 项目 ID。");
  }

  const entities = await firstSuccessful([
    `/project/${projectId}/entities`,
    `/project/${projectId}/entities?include_deleted=false`,
    `/project/${projectId}/project`
  ]);

  const entityCandidates = uniqueTexFiles(walkEntities(entities));
  const domCandidates = collectTexFilesFromDom();
  const files = uniqueTexFiles([...entityCandidates, ...domCandidates]);
  return {
    projectId,
    files,
    debug: {
      entityCandidates: entityCandidates.length,
      domCandidates: domCandidates.length,
      entityShape: Array.isArray(entities) ? "array" : typeof entities,
      entityKeys: entities && typeof entities === "object" && !Array.isArray(entities) ? Object.keys(entities).slice(0, 12) : []
    }
  };
}

async function fetchText(path) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Accept": "text/plain, application/octet-stream, */*"
    }
  });

  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function readTexFileByDownload(file) {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("无法从当前 URL 识别 Overleaf 项目 ID。");
  }

  const ids = Array.isArray(file?.readIds) && file.readIds.length
    ? file.readIds
    : [file?.id].filter(Boolean);
  const paths = [];
  const preferredType = String(file?.type || "").toLowerCase();

  for (const id of ids) {
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedId = encodeURIComponent(id);

    if (preferredType === "file") {
      paths.push(`/Project/${encodedProjectId}/file/${encodedId}`);
      paths.push(`/Project/${encodedProjectId}/doc/${encodedId}/download`);
    } else {
      paths.push(`/Project/${encodedProjectId}/doc/${encodedId}/download`);
      paths.push(`/Project/${encodedProjectId}/file/${encodedId}`);
    }
  }

  const errors = [];
  for (const path of paths) {
    try {
      const content = await fetchText(path);
      if (content.trim()) {
        return { content, source: "single-file-download", path };
      }
      errors.push(`${path}: empty response`);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(`单文件下载读取失败：${errors.join(" ; ")}`);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  async function handle() {
    if (message?.type === "LIST_TEX_FILES") {
      return listTexFiles();
    }
    if (message?.type === "READ_TEX_FILE_DOWNLOAD") {
      return readTexFileByDownload(message.file);
    }
    throw new Error("未知请求。");
  }

  handle()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
})();
