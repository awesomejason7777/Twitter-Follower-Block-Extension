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

// Request current total when popup opens
chrome.runtime.sendMessage({ type: "getTotalBlocked" }, (response) => {
  if (response && typeof response.total === "number") {
    totalBlocked = response.total;
    counterEl.textContent = `Total blocked: ${totalBlocked}`;
  }
});

// Listen for counter updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "accountBlocked") {
    totalBlocked = message.total;
    alert(`Blocked an account! Total blocked: ${totalBlocked}`);
    counterEl.textContent = `Total blocked: ${totalBlocked}`;
  }
});
