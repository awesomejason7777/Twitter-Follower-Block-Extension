let emergencyStop = false; // if true, the bot stops immediately

(async function () {
  const path = location.pathname + location.search;

  // -----------------------------
  // Utility functions
  // -----------------------------
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function randomDelay(min = 800, max = 1200) {
    return wait(Math.floor(Math.random() * (max - min + 1)) + min);
  }

  function waitForSelector(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const interval = 200;
      let waited = 0;
      const check = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(check);
          resolve(el);
        }
        waited += interval;
        if (waited >= timeout) {
          clearInterval(check);
          reject("Timeout waiting for " + selector);
        }
      }, interval);
    });
  }

  // ==================================================
  // FOLLOWERS PAGE LOGIC
  // ==================================================
  if (path.endsWith("/followers") || path.includes("/verified_followers")) {
    console.log("Followers page detected");

    const MAX_BLOCKS = 5;  // change if needed
    let blocksCompleted = 0;
    let shouldStop = false;
    let eligibleProfiles = [];
    let currentIndex = 0;

    function getFollowerCards() {
  // Select all user cards
      const allCards = Array.from(document.querySelectorAll('[data-testid="UserCell"]'));

      // Filter out cards that are inside the "Who to Follow" suggestion box
      return allCards.filter(card => {
        // Ignore any card with a "Suggested" badge
        const suggestedBadge = card.querySelector('svg[aria-label="Suggested"]');
        if (suggestedBadge) return false;

        // Optional: ignore cards inside a container that isn’t the main followers list
        const parent = card.closest('div[data-testid="primaryColumn"]');
        if (!parent) return false;

        return true; // keep this card
      });
    }


    function isBlocked(card) {
      const text = card.innerText || "";
      return text.includes("Blocked") || text.includes("Unblock");
    }

    function isFollowing(card) {
      const text = card.innerText || "";
      return text.includes("Following");
    }

    function getProfileUrl(card) {
      const links = Array.from(card.querySelectorAll('a[href^="/"]'));
      const profileLink = links.find(a => {
        const href = a.getAttribute("href");
        return (
          href &&
          !href.includes("/status/") &&
          href.split("/").filter(Boolean).length === 1
        );
      });
      return profileLink ? profileLink.href : null;
    }

    function collectEligibleProfiles() {
      const cards = getFollowerCards();
      eligibleProfiles = cards
        .filter(card => !isBlocked(card) && !isFollowing(card))
        .map(card => getProfileUrl(card))
        .filter(Boolean);
      console.log("Eligible profiles:", eligibleProfiles.length);
    }

    async function openNextProfile() {
      if (shouldStop || emergencyStop) {
        console.log("Bot stopped - will not open new profiles.");
        return;
      }

      if (shouldStop) {
        console.log("Stop flag active — exiting.");
        return;
      }

      if (blocksCompleted >= MAX_BLOCKS) {
        console.log("Reached MAX_BLOCKS limit.");
        alert("Reached safe block limit.");
        return;
      }

      if (currentIndex >= eligibleProfiles.length) {
        console.log("All profiles processed.");
        return;
      }

      const url = eligibleProfiles[currentIndex];
      currentIndex++;

      console.log(`Opening profile ${blocksCompleted + 1}/${MAX_BLOCKS}:`, url);

      chrome.runtime.sendMessage({
        type: "openProfile",
        url
      });
    }

    chrome.runtime.onMessage.addListener(async (message) => {
      if (message.type === "emergencyStop") {
        emergencyStop = true;
        shouldStop = true; // also set the regular stop flag
        console.log("Emergency stop received — halting all operations.");
        alert("Emergency stop activated. Bot will halt immediately.");
      }

      if (message.type === "forceStop") {
        shouldStop = true; // SET THE FLAG
        console.log("Stop received — will halt blocking.");
        alert("Blocking stopped.");
        return;
      }

      if (message.type === "continueBlocking") {
        if (shouldStop) {
          console.log("Stop flag active — not continuing.");
          return; // DO NOT open next profile
        }

        blocksCompleted++;
        console.log("Blocks completed:", blocksCompleted);

        await randomDelay();
        openNextProfile();
      }

      if (message.type === "startBlocking") {
        console.log("Start blocking received");
        collectEligibleProfiles();
        openNextProfile();
      }
    });


    // Start automatically if needed
    collectEligibleProfiles();
    openNextProfile();

    return;
  }

  // ==================================================
  // PROFILE PAGE LOGIC
  // ==================================================
  const isProfile =
    path.split("/").filter(Boolean).length === 1 &&
    !path.includes("followers") &&
    !path.includes("following");

  if (isProfile && emergencyStop) {
    console.log("Emergency stop active — ignoring this profile page.");
    return;
  }
  if (isProfile) {
    console.log("Profile page detected — attempting block");

    try {
      await randomDelay(1500, 2500); // initial delay for page load

      // Open triple-dot menu
      const menuButton = await waitForSelector('button[data-testid="userActions"]');
      menuButton.click();
      console.log("Opened user menu");

      await randomDelay(500, 800);

      // Find block option
      const menuItems = Array.from(document.querySelectorAll('div[role="menuitem"]'));
      const blockOption = menuItems.find(item => item.innerText.includes("Block"));

      if (!blockOption) {
        console.log("Block option not found.");
        chrome.runtime.sendMessage({ type: "blockComplete" });
        return;
      }

      blockOption.click();
      console.log("Clicked block option");

      await randomDelay(500, 800);

      // Confirm block
      const confirmButton = await waitForSelector('[data-testid="confirmationSheetConfirm"]');
      confirmButton.click();
      console.log("Confirmed block");

      await randomDelay(500, 800);

      console.log("Block successful");
      chrome.runtime.sendMessage({ type: "accountBlocked" }); // Notify popup of block
      chrome.runtime.sendMessage({ type: "blockComplete" });

    } catch (err) {
      console.error("Block failed:", err);
      chrome.runtime.sendMessage({ type: "blockComplete" });
    }
  }

})();
