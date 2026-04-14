let followerTabId = null;
let totalBlocked = 0;

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "openProfile") {
    if (!followerTabId) followerTabId = sender.tab.id;
    chrome.tabs.create({ url: message.url });
  }

  if (message.type === "blockComplete") {
    const profileTabId = sender.tab.id;
    chrome.tabs.remove(profileTabId, () => {
      if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
    });
    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, { type: "continueBlocking" });
    }
  }

  if (message.type === "stopBlocking") {
    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, { type: "forceStop" });
    }
  }

  if (message.type === "emergencyStop") {
    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, { type: "emergencyStop" });
    }
    // Close all bot profile tabs
    chrome.tabs.query({}, (tabs) => {
      for (let tab of tabs) {
        if (tab.url.includes("twitter.com/") && tab.id !== followerTabId) {
          chrome.tabs.remove(tab.id);
        }
      }
    });
  }

  if (message.type === "accountBlocked") {
    totalBlocked++;
    chrome.runtime.sendMessage({ type: "accountBlocked", total: totalBlocked });
  }

  if (message.type === "getTotalBlocked") {
    sendResponse({ total: totalBlocked });
  }
});
