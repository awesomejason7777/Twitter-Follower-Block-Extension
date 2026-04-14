const statusEl = document.getElementById("status");
const counterEl = document.getElementById("counter");
let totalBlocked = 0;

// Request current total when popup opens
chrome.runtime.sendMessage({ type: "getTotalBlocked" }, (response) => {
  if (response && typeof response.total === "number") {
    totalBlocked = response.total;
    counterEl.textContent = `Total blocked: ${totalBlocked}`;
  }
});

// START
document.getElementById("startBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "startBlocking" });
    statusEl.textContent = "Status: Blocking started...";
  });
});

// STOP
document.getElementById("stopBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "stopBlocking" });
  statusEl.textContent = "Status: Stopping...";
});

// EMERGENCY STOP
document.getElementById("emergencyStopBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "emergencyStop" });
  statusEl.textContent = "Status: EMERGENCY STOP activated!";
});

// Listen for counter updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "accountBlocked") {
    totalBlocked = message.total;
    counterEl.textContent = `Total blocked: ${totalBlocked}`;
  }
});
