let followerTabId = null;

chrome.runtime.onMessage.addListener((message, sender) => {

  // Followers page wants to open profile
  if (message.type === "openProfile") {

    followerTabId = sender.tab.id;

    chrome.tabs.create({ url: message.url }, (newTab) => {
      console.log("Opened profile tab:", newTab.id);
    });
  }

  // Profile page says block complete
  if (message.type === "blockComplete") {

    const profileTabId = sender.tab.id;

    console.log("Block complete in tab:", profileTabId);

    // Close profile tab
    chrome.tabs.remove(profileTabId);

    // Tell followers page to continue
    if (followerTabId) {
      chrome.tabs.sendMessage(followerTabId, {
        type: "continueBlocking"
      });
    }
  }
});
