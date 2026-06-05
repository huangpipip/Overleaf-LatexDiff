async function requestLatexDiff(oldContent, newContent) {
  const body = new URLSearchParams({
    old: oldContent,
    new: newContent
  });

  const response = await fetch("https://3142.nl/latex-diff/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`latex-diff 请求失败：${response.status} ${response.statusText}`);
  }

  return response.text();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GENERATE_LATEX_DIFF") {
    return false;
  }

  requestLatexDiff(message.oldContent || "", message.newContent || "")
    .then((html) => sendResponse({ ok: true, html }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
