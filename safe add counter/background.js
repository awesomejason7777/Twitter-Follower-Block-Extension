let followerTabId = null;
let totalBlocked = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "openProfile") {
    followerTabId = sender.tab.id;

    chrome.tabs.create({ url: message.url });
  }

  if (message.type === "blockComplete") {
    const profileTabId = sender.tab.id;

    chrome.tabs.remove(profileTabId);

    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, {
        type: "continueBlocking",
      });
    }
  }

  if (message.type === "stopBlocking") {
    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, {
        type: "forceStop",
      });
    }
  }

  if (message.type === "accountBlocked") {
    totalBlocked++;
    chrome.runtime.sendMessage({ type: "accountBlocked", total: totalBlocked });
  }

  if (message.type === "getTotalBlocked") {
    sendResponse({ total: totalBlocked });
  }
});
