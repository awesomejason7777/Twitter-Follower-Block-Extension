let followerTabId = null;

chrome.runtime.onMessage.addListener((message, sender) => {

  if (message.type === "openProfile") {
    followerTabId = sender.tab.id;

    chrome.tabs.create({ url: message.url });
  }

  if (message.type === "blockComplete") {
    const profileTabId = sender.tab.id;

    chrome.tabs.remove(profileTabId);

    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, {
        type: "continueBlocking"
      });
    }
  }

  if (message.type === "stopBlocking") {
    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, {
        type: "forceStop"
      });
    }
  }
});
