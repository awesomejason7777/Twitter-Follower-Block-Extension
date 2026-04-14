document.getElementById("start").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
});


document.getElementById("stop").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "stopBlocking" });
  window.close();
});
