// options.js: Display per-account block counts from chrome.storage

document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("account-block-list");
  const totalEl = document.getElementById("total-blocked");
  const sourceEl = document.getElementById("source-account");
  const autoAddCheckbox = document.getElementById("auto-add-source-checkbox");
  const blockRepliesCheckbox = document.getElementById(
    "block-replies-checkbox",
  );

  // Load and set the checkbox states
  chrome.storage.local.get(
    ["autoAddSourceAccounts", "blockRepliesEnabled"],
    (result) => {
      autoAddCheckbox.checked = result.autoAddSourceAccounts !== false; // Default to true
      blockRepliesCheckbox.checked = result.blockRepliesEnabled !== false; // Default to true
    },
  );

  // Handle checkbox changes
  autoAddCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({
      autoAddSourceAccounts: autoAddCheckbox.checked,
    });
  });

  blockRepliesCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({
      blockRepliesEnabled: blockRepliesCheckbox.checked,
    });
  });

  chrome.storage.local.get(
    [
      "sourceBlockCounts",
      "totalBlocked",
      "sourceAccount",
      "sourceFollowerCounts",
      "completedAccounts",
      "accountNotes",
      "accountCategories",
    ],
    (result) => {
      const sourceBlockCounts = result.sourceBlockCounts || {};
      const totalBlocked =
        typeof result.totalBlocked === "number" ? result.totalBlocked : 0;
      const sourceAccount = result.sourceAccount || null;
      const sourceFollowerCounts = result.sourceFollowerCounts || {};
      const completedAccounts = result.completedAccounts || [];
      const accountNotes = result.accountNotes || {};
      const accountCategories = result.accountCategories || {};
      if (sourceEl) {
        sourceEl.textContent = sourceAccount
          ? `Source account: @${sourceAccount}`
          : "Source account: (not detected yet)";
      }
      if (totalEl) {
        totalEl.textContent = `Total blocked accounts: ${totalBlocked}`;
      }
      // Show only non-completed and non-categorized accounts in the main list
      const categorizedAccounts = new Set();
      for (const catKey of Object.keys(accountCategories)) {
        for (const acc of accountCategories[catKey] || []) {
          categorizedAccounts.add(acc);
        }
      }
      const activeAccounts = Object.keys(sourceBlockCounts).filter(
        (src) =>
          !completedAccounts.includes(src) && !categorizedAccounts.has(src),
      );
      if (activeAccounts.length === 0) {
        listEl.innerHTML =
          "<em>No source accounts have blocked followers yet.</em>";
        renderCompletedAccounts(completedAccounts, accountNotes);
        renderCategories(accountCategories, accountNotes, sourceBlockCounts);
        return;
      }
      let html = "<ul>";
      for (const src of activeAccounts) {
        const count = sourceBlockCounts[src];
        let display = `<b>@${src}</b>: ${count} blocked out of`;
        const noteValue = accountNotes[src] || "";
        display += ` <input type="text" data-account="${src}" value="${noteValue}" placeholder="Enter note or value..." style="margin-left:8px;width:180px;" />`;
        display += ` <button type="button" class="goto-btn" data-account="${src}">Go to</button>`;
        display += ` <button type="button" class="complete-btn" data-account="${src}">Complete</button>`;
        // Add category buttons
        for (const cat of CATEGORIES) {
          display += ` <button type="button" class="cat-btn" data-account="${src}" data-cat="${cat.key}">${cat.label}</button>`;
        }
        html += `<li>${display}</li>`;
      }
      html += "</ul>";
      listEl.innerHTML = html;

      // Add event listeners to all textboxes
      const inputs = listEl.querySelectorAll("input[data-account]");
      inputs.forEach((input) => {
        input.addEventListener("change", (e) => {
          const account = input.getAttribute("data-account");
          const value = input.value;
          chrome.storage.local.get(["accountNotes"], (noteResult2) => {
            const accountNotes2 = noteResult2.accountNotes || {};
            accountNotes2[account] = value;
            chrome.storage.local.set({ accountNotes: accountNotes2 });
          });
        });
      });

      // Add event listeners to all Go To buttons
      const gotoBtns = listEl.querySelectorAll("button.goto-btn");
      gotoBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const account = btn.getAttribute("data-account");
          if (account) {
            window.open(`https://twitter.com/${account}/followers`, "_blank");
          }
        });
      });

      // Add event listeners to all Complete buttons
      const completeBtns = listEl.querySelectorAll("button.complete-btn");
      completeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const account = btn.getAttribute("data-account");
          if (account) {
            chrome.storage.local.get(["completedAccounts"], (res) => {
              const completed = res.completedAccounts || [];
              if (!completed.includes(account)) {
                completed.push(account);
                chrome.storage.local.set(
                  { completedAccounts: completed },
                  () => {
                    // Re-render after update
                    window.location.reload();
                  },
                );
              }
            });
          }
        });
      });

      // Add event listeners to all category buttons
      const catBtns = listEl.querySelectorAll("button.cat-btn");
      catBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const account = btn.getAttribute("data-account");
          const cat = btn.getAttribute("data-cat");
          if (account && cat) {
            chrome.storage.local.get(["accountCategories"], (res) => {
              const cats = res.accountCategories || {};
              if (!cats[cat]) cats[cat] = [];
              if (!cats[cat].includes(account)) cats[cat].push(account);
              // Remove from other categories
              for (const k of Object.keys(cats)) {
                if (k !== cat) cats[k] = cats[k].filter((a) => a !== account);
              }
              chrome.storage.local.set({ accountCategories: cats }, () => {
                window.location.reload();
              });
            });
          }
        });
      });

      // Render completed accounts section
      renderCompletedAccounts(completedAccounts, accountNotes);
      // Render categories section
      renderCategories(accountCategories, accountNotes, sourceBlockCounts);
    },
  );
});

// Helper to render completed accounts
function renderCompletedAccounts(completedAccounts, accountNotes) {
  const completedListEl = document.getElementById("completed-account-list");
  if (!completedListEl) return;
  if (!completedAccounts || completedAccounts.length === 0) {
    completedListEl.innerHTML = "<em>None yet.</em>";
    return;
  }
  let html = "<ul>";
  for (const src of completedAccounts) {
    const noteValue = (accountNotes && accountNotes[src]) || "";
    html += `<li><b>@${src}</b> <input type="text" data-account="${src}" value="${noteValue}" placeholder="Enter note or value..." style="margin-left:8px;width:180px;" disabled /> <button type="button" class="undo-btn" data-account="${src}">Undo</button></li>`;
  }
  html += "</ul>";
  completedListEl.innerHTML = html;

  // Add event listeners to all Undo buttons
  const undoBtns = completedListEl.querySelectorAll("button.undo-btn");
  undoBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const account = btn.getAttribute("data-account");
      if (account) {
        chrome.storage.local.get(["completedAccounts"], (res) => {
          let completed = res.completedAccounts || [];
          completed = completed.filter((a) => a !== account);
          chrome.storage.local.set({ completedAccounts: completed }, () => {
            window.location.reload();
          });
        });
      }
    });
  });
}

// --- Category logic ---
const CATEGORIES = [
  { key: "lt50", label: "Less than 50" },
  { key: "51_500", label: "51-500" },
  { key: "501_1000", label: "501-1000" },
  { key: "1001_5000", label: "1001-5000" },
  { key: "5000plus", label: "5000+" },
];

function renderCategories(categoryMap, accountNotes, sourceBlockCounts) {
  let html = "";
  for (const cat of CATEGORIES) {
    html += `<div style="margin-bottom:16px;"><b>${cat.label}</b><ul id="cat-list-${cat.key}">`;
    const accounts = categoryMap[cat.key] || [];
    if (accounts.length === 0) {
      html += "<li><em>None</em></li>";
    } else {
      for (const src of accounts) {
        const count = sourceBlockCounts[src] || 0;
        const noteValue = (accountNotes && accountNotes[src]) || "";
        html += `<li><b>@${src}</b>: ${count} blocked out of <input type="text" value="${noteValue}" style="margin-left:8px;width:180px;" /> <button type="button" class="cat-goto-btn" data-account="${src}">Go to</button> <button type="button" class="cat-complete-btn" data-account="${src}" data-cat="${cat.key}">Complete</button> <button type="button" class="cat-undo-btn" data-account="${src}" data-cat="${cat.key}">Undo</button></li>`;
      }
    }
    html += "</ul></div>";
  }
  const catEl = document.getElementById("category-list");
  if (catEl) catEl.innerHTML = html;

  // Add event listeners to all Complete buttons in categories
  const completeBtns = document.querySelectorAll("button.cat-complete-btn");
  completeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const account = btn.getAttribute("data-account");
      const cat = btn.getAttribute("data-cat");
      if (account && cat) {
        chrome.storage.local.get(
          ["completedAccounts", "accountCategories"],
          (res) => {
            const completed = res.completedAccounts || [];
            const cats = res.accountCategories || {};
            if (!completed.includes(account)) completed.push(account);
            if (cats[cat]) cats[cat] = cats[cat].filter((a) => a !== account);
            chrome.storage.local.set(
              { completedAccounts: completed, accountCategories: cats },
              () => {
                window.location.reload();
              },
            );
          },
        );
      }
    });
  });

  // Add event listeners to all Undo buttons in categories
  const undoBtns = document.querySelectorAll("button.cat-undo-btn");
  undoBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const account = btn.getAttribute("data-account");
      const cat = btn.getAttribute("data-cat");
      if (account && cat) {
        chrome.storage.local.get(["accountCategories"], (res) => {
          const cats = res.accountCategories || {};
          if (cats[cat]) {
            cats[cat] = cats[cat].filter((a) => a !== account);
            chrome.storage.local.set({ accountCategories: cats }, () => {
              window.location.reload();
            });
          }
        });
      }
    });
  });

  // Add event listeners to all Go to buttons in categories
  const gotoBtns = document.querySelectorAll("button.cat-goto-btn");
  gotoBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const account = btn.getAttribute("data-account");
      if (account) {
        window.open(`https://twitter.com/${account}/followers`, "_blank");
      }
    });
  });
}
