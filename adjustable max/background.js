let followerTabId = null;
// Track all tab IDs opened by the extension
let openedTabIds = new Set();
let tabClosingEnabled = true;

// Load tabClosingEnabled from storage
chrome.storage.local.get(["tabClosingEnabled"], (result) => {
  if (typeof result.tabClosingEnabled === "boolean") {
    tabClosingEnabled = result.tabClosingEnabled;
  }
});
let totalBlocked = 0;

// Load cached value on service worker startup
chrome.storage.local.get(["totalBlocked"], (result) => {
  if (result.totalBlocked !== undefined) {
    totalBlocked = result.totalBlocked;
    console.log("Loaded cached totalBlocked:", totalBlocked);
  }
});

// Save to cache whenever it changes
function saveTotalBlocked() {
  chrome.storage.local.set({ totalBlocked });
}

// Single consolidated message handler — prevents duplicate handling and keeps logic in one place
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "tabClosingToggled":
      tabClosingEnabled = !!message.enabled;
      chrome.storage.local.set({ tabClosingEnabled });
      break;
    case "accountBlocked":
      // Only count messages coming from content scripts (sender.tab is set).
      // This avoids handling the internal broadcast that updates other extension parts.
      if (sender && sender.tab) {
        totalBlocked++;
        saveTotalBlocked(); // persist the increment
        chrome.runtime.sendMessage({
          type: "accountBlocked",
          total: totalBlocked,
        });
      }
      break;

    case "resetTotalBlocked":
      totalBlocked = 0;
      saveTotalBlocked();
      sendResponse({ total: totalBlocked });
      break;

    case "openProfile":
      followerTabId = sender.tab.id;
      chrome.tabs.create({ url: message.url, active: false }, (tab) => {
        if (tab && tab.id !== undefined) {
          openedTabIds.add(tab.id);
        }
      });
      // Listen for tab updates and close only extension-opened tabs if not follower list

      // (Moved listeners outside the message handler for single registration)
      break;

    case "blockComplete": {
      const profileTabId = sender.tab.id;
      if (tabClosingEnabled) {
        chrome.tabs.remove(profileTabId);
      }
      if (followerTabId) {
        chrome.tabs.sendMessage(followerTabId, { type: "continueBlocking" });
      }
      break;
    }

    case "stopBlocking":
      if (followerTabId) {
        chrome.tabs.sendMessage(followerTabId, { type: "forceStop" });
      }
      break;

    case "getTotalBlocked":
      sendResponse({ total: totalBlocked });
      break;
  }
});
