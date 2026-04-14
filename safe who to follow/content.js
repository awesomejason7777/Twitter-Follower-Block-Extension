(async function () {
  const path = location.pathname;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForSelector(selector, timeout = 1000) {
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

  // ==================================================
  // FOLLOWERS PAGE LOGIC
  // ==================================================

  if (path.endsWith("/followers")) {
    console.log("Followers page detected");

    const MAX_BLOCKS = 15;
    let blocksCompleted = 0;
    let shouldStop = false;

    let eligibleProfiles = [];
    let currentIndex = 0;

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getFollowerCards() {
      // Find the main scrollable followers list (usually role="region" and not complementary)
      const mainLists = Array.from(
        document.querySelectorAll(
          '[role="region"]:not([role="complementary"])',
        ),
      );
      // Fallback: use the largest region if multiple
      let mainList = mainLists[0];
      if (mainLists.length > 1) {
        mainList = mainLists.reduce(
          (largest, el) =>
            el.offsetHeight > largest.offsetHeight ? el : largest,
          mainLists[0],
        );
      }
      if (!mainList) return [];
      return Array.from(mainList.querySelectorAll('[data-testid="UserCell"]'));
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

      const profileLink = links.find((a) => {
        const href = a.getAttribute("href");
        return (
          href && !href.includes("/status/") && href.split("/").length === 2
        );
      });

      return profileLink ? profileLink.href : null;
    }

    function collectEligibleProfiles() {
      const cards = getFollowerCards();

      eligibleProfiles = cards
        .filter((card) => !isBlocked(card) && !isFollowing(card))
        .map((card) => getProfileUrl(card))
        .filter(Boolean);

      console.log("Eligible profiles:", eligibleProfiles.length);
    }

    async function openNextProfile() {
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
        url,
      });
    }

    chrome.runtime.onMessage.addListener(async (message) => {
      if (message.type === "forceStop") {
        shouldStop = true;
        console.log("Blocking manually stopped.");
        alert("Blocking stopped.");
        return;
      }

      if (message.type === "continueBlocking") {
        if (shouldStop) {
          console.log("Stopped — not continuing.");
          return;
        }

        blocksCompleted++;
        console.log("Blocks completed:", blocksCompleted);

        // Short delay between profiles
        await delay(1500);

        openNextProfile();
      }
    });

    // Start process
    collectEligibleProfiles();
    openNextProfile();

    return;
  }

  // ==================================================
  // PROFILE PAGE LOGIC
  // ==================================================

  const isProfile =
    path.split("/").length === 2 &&
    !path.includes("followers") &&
    !path.includes("following");

  if (isProfile) {
    console.log("Profile page detected — attempting block");

    try {
      await wait(800);

      // Open triple dot menu
      const menuButton = await waitForSelector(
        'button[data-testid="userActions"]',
      );

      menuButton.click();
      console.log("Opened user menu");

      await wait(800);

      // Find block option
      const menuItems = Array.from(
        document.querySelectorAll('div[role="menuitem"]'),
      );

      const blockOption = menuItems.find((item) =>
        item.innerText.includes("Block"),
      );

      if (!blockOption) {
        console.log("Block option not found.");
        chrome.runtime.sendMessage({ type: "blockComplete" });
        return;
      }

      blockOption.click();
      console.log("Clicked block option");

      await wait(800);

      // Confirm block
      //const confirmButton = await waitForSelector(
      //'[data-testid="confirmationSheetConfirm"]'
      //);

      //confirmButton.click();
      //console.log("Confirmed block");

      //await wait(500);

      console.log("Block successful");
      chrome.runtime.sendMessage({ type: "accountBlocked" });
      chrome.runtime.sendMessage({ type: "blockComplete" });
    } catch (err) {
      console.error("Block failed:", err);
      chrome.runtime.sendMessage({ type: "blockComplete" });
    }
  }
})();
