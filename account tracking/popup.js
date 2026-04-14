// On/Off switch for tab closing
const toggle = document.getElementById("toggle-blocking");
chrome.storage.local.get(["tabClosingEnabled"], (result) => {
  toggle.checked = !!result.tabClosingEnabled;
});
toggle.addEventListener("change", () => {
  chrome.storage.local.set({ tabClosingEnabled: toggle.checked });
  chrome.runtime.sendMessage({
    type: "tabClosingToggled",
    enabled: toggle.checked,
  });
});

const counterEl = document.getElementById("counter");
const maxBlocksInput = document.getElementById("max-blocks");
let totalBlocked = 0;

// Load saved max blocks value
chrome.storage.local.get(["maxBlocks"], (result) => {
  if (result.maxBlocks && maxBlocksInput) {
    maxBlocksInput.value = result.maxBlocks;
  }
});

// Save max blocks value on change
if (maxBlocksInput) {
  maxBlocksInput.addEventListener("change", () => {
    let val = parseInt(maxBlocksInput.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    maxBlocksInput.value = val;
    chrome.storage.local.set({ maxBlocks: val });
  });
}

document.getElementById("start").addEventListener("click", async () => {
  // Enable profile blocking
  chrome.storage.local.set({ profileBlockingEnabled: true });
  // Save max blocks value
  let val = parseInt(maxBlocksInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  chrome.storage.local.set({ maxBlocks: val });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});

document.getElementById("stop").addEventListener("click", () => {
  // Disable profile blocking
  chrome.storage.local.set({ profileBlockingEnabled: false });
  chrome.runtime.sendMessage({ type: "stopBlocking" });
  window.close();
});

// Helper to render per-account block counts
function renderAccountBlockCounts(accountBlockCounts) {
  const listEl = document.getElementById("account-block-list");
  if (!listEl) return;
  if (!accountBlockCounts || Object.keys(accountBlockCounts).length === 0) {
    listEl.innerHTML = "<em>No accounts blocked yet.</em>";
    return;
  }
  let html = '<b>Blocks per account:</b><ul style="margin:4px 0 0 16px;">';
  for (const [username, count] of Object.entries(accountBlockCounts)) {
    html += `<li><b>@${username}</b>: ${count}</li>`;
  }
  html += "</ul>";
  listEl.innerHTML = html;
}

// Always show the true overall total from storage
function updateTotalBlockedDisplay() {
  chrome.storage.local.get(["totalBlocked"], (result) => {
    const total =
      typeof result.totalBlocked === "number" ? result.totalBlocked : 0;
    counterEl.textContent = `Total blocked: ${total}`;
  });
}

// Request current per-account counts when popup opens
chrome.runtime.sendMessage({ type: "getTotalBlocked" }, (response) => {
  updateTotalBlockedDisplay();
  renderAccountBlockCounts(response.accountBlockCounts);
});

// Listen for counter updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "accountBlocked") {
    updateTotalBlockedDisplay();
    alert(`Blocked an account! Total blocked: ${message.total}`);
    renderAccountBlockCounts(message.accountBlockCounts);
  }
});
