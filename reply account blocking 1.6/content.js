// Profile blocking logic is enabled only when triggered from popup
(async function () {
  // Check if profile blocking is enabled
  const profileBlockingEnabled = await new Promise((resolve) => {
    chrome.storage.local.get(["profileBlockingEnabled"], (result) => {
      resolve(!!result.profileBlockingEnabled);
    });
  });
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

  if (path.endsWith("/followers")) {
    // Extract and store the source account username from the URL
    const sourceAccount = path.split("/")[1] || null;
    if (sourceAccount) {
      chrome.storage.local.set({ sourceAccount });
    }

    // Fetch the profile page and extract the follower count from the Followers link
    if (sourceAccount) {
      fetch(`https://twitter.com/${sourceAccount}`)
        .then((response) => response.text())
        .then((html) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          // Find the /verified_followers link and extract the number displayed before it
          let followerCount = null;
          try {
            const header = doc.querySelector(
              '[data-testid="UserProfileHeader_Items"]',
            );
            if (header) {
              const links = Array.from(
                header.querySelectorAll('a[href*="/verified_followers"]'),
              );
              for (const link of links) {
                let found = false;
                for (const node of link.childNodes) {
                  if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent.trim();
                    if (text && /[\d,.KkMm]+/.test(text)) {
                      let num = text.replace(/,/g, "");
                      if (num.endsWith("K") || num.endsWith("k")) {
                        num = parseFloat(num) * 1000;
                      } else if (num.endsWith("M") || num.endsWith("m")) {
                        num = parseFloat(num) * 1000000;
                      } else {
                        num = parseInt(num, 10);
                      }
                      followerCount = Math.round(num);
                      found = true;
                      break;
                    }
                  } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const text = node.textContent.trim();
                    if (text && /[\d,.KkMm]+/.test(text)) {
                      let num = text.replace(/,/g, "");
                      if (num.endsWith("K") || num.endsWith("k")) {
                        num = parseFloat(num) * 1000;
                      } else if (num.endsWith("M") || num.endsWith("m")) {
                        num = parseFloat(num) * 1000000;
                      } else {
                        num = parseInt(num, 10);
                      }
                      followerCount = Math.round(num);
                      found = true;
                      break;
                    }
                  }
                }
                if (found) break;
              }
            }
          } catch (e) {
            // ignore
          }
          if (followerCount !== null) {
            chrome.storage.local.get(["sourceFollowerCounts"], (result) => {
              const sourceFollowerCounts = result.sourceFollowerCounts || {};
              sourceFollowerCounts[sourceAccount] = followerCount;
              chrome.storage.local.set({ sourceFollowerCounts });
            });
          }
          console.log(
            "Fetched profile for:",
            sourceAccount,
            "Followers:",
            followerCount,
          );
        })
        .catch((e) => {
          // ignore
        });
    }

    // Get maxBlocks from storage (default 15)
    const MAX_BLOCKS = await new Promise((resolve) => {
      chrome.storage.local.get(["maxBlocks"], (result) => {
        resolve(result.maxBlocks ? parseInt(result.maxBlocks, 10) : 15);
      });
    });

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
        chrome.storage.local.set({ profileBlockingEnabled: false });
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

  if (isProfile && profileBlockingEnabled) {
    console.log("Profile page detected — attempting block");

    // Extract username from URL (e.g., /username)
    const username = path.split("/")[1] || null;

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

      // Confirm block (if needed)
      //const confirmButton = await waitForSelector(
      //'[data-testid="confirmationSheetConfirm"]'
      //);
      //confirmButton.click();
      //console.log("Confirmed block");
      //await wait(500);

      console.log("Block successful");
      // Send username with block event
      chrome.runtime.sendMessage({ type: "accountBlocked", username });
      chrome.runtime.sendMessage({ type: "blockComplete" });
    } catch (err) {
      //console.error("Block failed:", err);
      chrome.runtime.sendMessage({ type: "blockComplete" });
    }
  }

  // ==================================================
  // REPLY COLLECTION & BLOCKING LOGIC
  // ==================================================

  // Check if reply blocking is enabled
  const replyBlockingEnabled = await new Promise((resolve) => {
    chrome.storage.local.get(["blockRepliesEnabled"], (result) => {
      resolve(result.blockRepliesEnabled !== false); // Default to enabled
    });
  });

  if (replyBlockingEnabled) {
    // Check if we're on a tweet detail page (path like /username/status/id)
    const pathParts = path.split("/");
    const isTweetPage =
      pathParts.length >= 4 &&
      pathParts[2] === "status" &&
      !pathParts[1].includes(":");

    if (isTweetPage) {
      // Extract the tweet author (source account)
      const tweetAuthor = pathParts[1];
      if (tweetAuthor) {
        chrome.storage.local.set({ sourceAccount: tweetAuthor });
      }

      // Add a button to collect repliers
      const addCollectButton = () => {
        // Check if button already exists
        if (document.getElementById("collect-replies-btn")) return;

        // Wait a bit for the page to load
        setTimeout(() => {
          // Find a good place to inject the button (near the top of the page)
          const header = document.querySelector(
            '[data-testid="primaryColumn"]',
          );
          if (header) {
            const btn = document.createElement("button");
            btn.id = "collect-replies-btn";
            btn.textContent = "Block Reply Accounts";
            btn.style.cssText =
              "padding:8px 12px;margin:10px;background:#1DA1F2;color:white;border:none;border-radius:20px;cursor:pointer;font-weight:bold;";

            btn.addEventListener("click", () => {
              collectAndBlockReplies(tweetAuthor);
            });

            // Inject at the top of the primary column
            header.insertBefore(btn, header.firstChild);
          }
        }, 1000);
      };

      addCollectButton();

      // Variables to track reply blocking state
      let replyBlockingState = {
        replyElements: [],
        currentIndex: 0,
        blocksCompleted: 0,
        maxBlocks: 15,
        shouldStop: false,
      };

      // Function to collect and block replies
      async function collectAndBlockReplies(authorAccount) {
        console.log("Collecting replies from tweet...");

        // Get maxBlocks from storage (default 15)
        const MAX_BLOCKS = await new Promise((resolve) => {
          chrome.storage.local.get(["maxBlocks"], (result) => {
            resolve(result.maxBlocks ? parseInt(result.maxBlocks, 10) : 15);
          });
        });

        // Get all reply articles
        const allArticles = Array.from(
          document.querySelectorAll('article[data-testid="tweet"]'),
        );

        const replyElements = [];

        for (const article of allArticles) {
          // Get the username from the reply
          const authorLink = article.querySelector('a[href*="/"]');
          if (!authorLink) continue;

          const authorHref = authorLink.getAttribute("href");
          if (!authorHref) continue;

          const username = authorHref.split("/")[1];

          // Skip the main tweet author and duplicates
          if (username && username !== authorAccount) {
            // Check if we already have this user
            const isDuplicate = replyElements.some((el) => {
              const link = el.querySelector('a[href*="/"]');
              return (
                link && link.getAttribute("href").split("/")[1] === username
              );
            });

            if (!isDuplicate) {
              replyElements.push(article);
            }
          }
        }

        console.log("Found reply elements:", replyElements.length);

        if (replyElements.length === 0) {
          alert("No replies found to block.");
          return;
        }

        // Initialize state for blocking replies
        replyBlockingState.replyElements = replyElements;
        replyBlockingState.currentIndex = 0;
        replyBlockingState.blocksCompleted = 0;
        replyBlockingState.maxBlocks = MAX_BLOCKS;
        replyBlockingState.shouldStop = false;

        //alert(
        //  `Found ${replyElements.length} replies. Will block up to ${MAX_BLOCKS} accounts.`,
        //);

        // Start blocking replies
        blockNextReply();
      }

      async function blockNextReply() {
        if (replyBlockingState.shouldStop) {
          console.log("Reply blocking stopped.");
          return;
        }

        if (
          replyBlockingState.blocksCompleted >= replyBlockingState.maxBlocks
        ) {
          console.log("Reached MAX_BLOCKS limit for replies.");
          alert("Reached safe block limit.");
          return;
        }

        if (
          replyBlockingState.currentIndex >=
          replyBlockingState.replyElements.length
        ) {
          console.log("All replies processed.");
          alert(
            `Finished blocking ${replyBlockingState.blocksCompleted} reply accounts.`,
          );
          return;
        }

        const replyArticle =
          replyBlockingState.replyElements[replyBlockingState.currentIndex];
        replyBlockingState.currentIndex++;

        try {
          // Get username from the reply
          const authorLink = replyArticle.querySelector('a[href*="/"]');
          const username = authorLink.getAttribute("href").split("/")[1];

          console.log(
            `Blocking replier ${replyBlockingState.blocksCompleted + 1}/${replyBlockingState.maxBlocks}: @${username}`,
          );

          // Find the three-dot menu button within this reply article
          const menuButton = replyArticle.querySelector(
            'button[data-testid="caret"]',
          );
          if (!menuButton) {
            console.log("Menu button not found for reply, skipping...");
            replyBlockingState.blocksCompleted++;
            await wait(500);
            blockNextReply();
            return;
          }

          // Click the menu button
          menuButton.click();
          console.log("Opened reply menu");

          await wait(500);

          // Find and click the block option
          const menuItems = Array.from(
            document.querySelectorAll('div[role="menuitem"]'),
          );

          const blockOption = menuItems.find((item) =>
            item.innerText.includes("Block"),
          );

          if (!blockOption) {
            console.log("Block option not found in menu.");
            // Close the menu by clicking elsewhere
            document.body.click();
            await wait(500);
            replyBlockingState.blocksCompleted++;
            blockNextReply();
            return;
          }

          blockOption.click();
          console.log("Clicked block option");

          await wait(800);

          // Find and click the confirmation button
          const confirmButtons = Array.from(
            document.querySelectorAll(
              'button[data-testid="confirmationSheetConfirm"]',
            ),
          );

          if (confirmButtons.length > 0) {
            confirmButtons[confirmButtons.length - 1].click();
            console.log("Clicked confirmation button");
            await wait(500);
          }

          // Send the block event
          chrome.runtime.sendMessage({
            type: "accountBlocked",
            username,
          });

          replyBlockingState.blocksCompleted++;
          console.log(
            "Reply blocks completed:",
            replyBlockingState.blocksCompleted,
          );

          await wait(800);

          // Continue to next reply
          blockNextReply();
        } catch (err) {
          console.error("Error blocking reply:", err);
          replyBlockingState.blocksCompleted++;
          await wait(500);
          blockNextReply();
        }
      }
    }
  }
})();
