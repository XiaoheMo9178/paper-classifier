/* global Services, Zotero, processItems, XMLHttpRequest */

var XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function createMenuNode(doc, tagName) {
  if (typeof doc.createXULElement === "function") {
    return doc.createXULElement(tagName);
  }
  return doc.createElementNS(XUL_NS, tagName);
}

var PaperClassifierEN = {
  observerID: null,
  preferencePaneID: null,
  preferencePaneKey: "paper-classifier-en-prefpane",
  prefPrefix: "extensions.paper-classifier-en.",
  prefDefaultEndpoint: "https://api.deepseek.com",
  prefDefaultModel: "deepseek-v4-flash",
  preferencePaneRegistering: false,
  preferencePaneRetryCount: 0,
  preferencePaneRetryMax: 60,
  preferencePaneRetryTimer: null,

  getPluginID: function () {
    return (typeof PAPER_CLASSIFIER_PLUGIN_ID !== "undefined" && PAPER_CLASSIFIER_PLUGIN_ID) ||
      "paper-classifier-en@example.com";
  },

  getGlobalPref: function (key, fallbackValue) {
    const prefKey = this.prefPrefix + key;
    let value = null;

    try {
      value = Zotero.Prefs.get(prefKey, true);
    } catch (e) {}

    if (value !== null && value !== undefined && String(value) !== "") {
      return value;
    }

    // Compatibility migration for incorrectly scoped legacy prefs
    try {
      const legacyValue = Zotero.Prefs.get(prefKey);
      if (legacyValue !== null && legacyValue !== undefined && String(legacyValue) !== "") {
        Zotero.Prefs.set(prefKey, legacyValue, true);
        return legacyValue;
      }
    } catch (e) {}

    return fallbackValue;
  },

  setGlobalPref: function (key, value) {
    Zotero.Prefs.set(this.prefPrefix + key, value, true);
  },

  normalizeModelPref: function (model) {
    const normalized = String(model || "").trim().toLowerCase();
    if (
      normalized === "deepseek-v4-pro" ||
      normalized === "deepseek-pro" ||
      normalized === "deepseek pro"
    ) {
      return "deepseek-v4-pro";
    }
    return this.prefDefaultModel;
  },

  onPreferencePaneLoad: function (prefWin) {
    const doc = prefWin && prefWin.document ? prefWin.document : null;
    if (!doc) {
      return;
    }

    const apiKeyEl = doc.getElementById("paper-classifier-pref-apiKey");
    const modelEl = doc.getElementById("paper-classifier-pref-model");
    const collectionRootEl = doc.getElementById("paper-classifier-pref-collectionRoot");
    const keepOriginalEl = doc.getElementById("paper-classifier-pref-keepOriginalCollections");
    const statusEl = doc.getElementById("paper-classifier-pref-test-status");

    if (!apiKeyEl || !modelEl || !collectionRootEl || !keepOriginalEl || !statusEl) {
      return;
    }

    this.setGlobalPref("apiEndpoint", this.prefDefaultEndpoint);

    apiKeyEl.value = this.getGlobalPref("apiKey", "");
    const model = this.normalizeModelPref(this.getGlobalPref("model", this.prefDefaultModel));
    modelEl.value = model;
    this.setGlobalPref("model", model);
    collectionRootEl.value = this.getGlobalPref("collectionRoot", "AI Theme Classification");
    keepOriginalEl.checked = !!this.getGlobalPref("keepOriginalCollections", false);
    statusEl.value = "";
    statusEl.style.color = "";

    if (doc.__paperClassifierPrefsBound) {
      return;
    }
    doc.__paperClassifierPrefsBound = true;

    apiKeyEl.addEventListener("input", () => {
      this.setGlobalPref("apiKey", (apiKeyEl.value || "").trim());
    });
    apiKeyEl.addEventListener("change", () => {
      this.setGlobalPref("apiKey", (apiKeyEl.value || "").trim());
    });

    modelEl.addEventListener("command", () => {
      this.setGlobalPref("model", this.normalizeModelPref(modelEl.value));
    });

    collectionRootEl.addEventListener("input", () => {
      const val = (collectionRootEl.value || "").trim();
      this.setGlobalPref("collectionRoot", val || "AI Theme Classification");
    });
    collectionRootEl.addEventListener("change", () => {
      const val = (collectionRootEl.value || "").trim();
      this.setGlobalPref("collectionRoot", val || "AI Theme Classification");
    });

    keepOriginalEl.addEventListener("command", () => {
      this.setGlobalPref("keepOriginalCollections", !!keepOriginalEl.checked);
    });
    keepOriginalEl.addEventListener("change", () => {
      this.setGlobalPref("keepOriginalCollections", !!keepOriginalEl.checked);
    });
  },

  testPreferenceConnection: function (prefWin) {
    const doc = prefWin && prefWin.document ? prefWin.document : null;
    if (!doc) {
      return;
    }

    const apiKeyEl = doc.getElementById("paper-classifier-pref-apiKey");
    const modelEl = doc.getElementById("paper-classifier-pref-model");
    const collectionRootEl = doc.getElementById("paper-classifier-pref-collectionRoot");
    const keepOriginalEl = doc.getElementById("paper-classifier-pref-keepOriginalCollections");
    const testBtnEl = doc.getElementById("paper-classifier-pref-test");
    const statusEl = doc.getElementById("paper-classifier-pref-test-status");

    if (!apiKeyEl || !modelEl || !collectionRootEl || !keepOriginalEl || !testBtnEl || !statusEl) {
      return;
    }

    const apiKey = (apiKeyEl.value || "").trim();
    const model = this.normalizeModelPref(modelEl.value);
    const collectionRoot = (collectionRootEl.value || "").trim() || "AI Theme Classification";
    const keepOriginalCollections = !!keepOriginalEl.checked;

    if (!apiKey) {
      statusEl.value = "Please enter API Key first";
      statusEl.style.color = "#b91c1c";
      return;
    }

    this.setGlobalPref("apiKey", apiKey);
    this.setGlobalPref("model", model);
    this.setGlobalPref("collectionRoot", collectionRoot);
    this.setGlobalPref("keepOriginalCollections", keepOriginalCollections);
    this.setGlobalPref("apiEndpoint", this.prefDefaultEndpoint);

    testBtnEl.disabled = true;
    statusEl.value = "Testing...";
    statusEl.style.color = "#6b7280";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", this.prefDefaultEndpoint + "/chat/completions", true);
    xhr.timeout = 15000;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", "Bearer " + apiKey);

    xhr.onload = () => {
      testBtnEl.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        statusEl.value = "Connection successful";
        statusEl.style.color = "#166534";
        return;
      }

      let errText = "HTTP " + xhr.status;
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (data && data.error && data.error.message) {
          errText += " - " + data.error.message;
        }
      } catch (e) {}

      statusEl.value = "Connection failed: " + errText;
      statusEl.style.color = "#b91c1c";
    };

    xhr.onerror = () => {
      testBtnEl.disabled = false;
      statusEl.value = "Connection failed: Network error";
      statusEl.style.color = "#b91c1c";
    };

    xhr.ontimeout = () => {
      testBtnEl.disabled = false;
      statusEl.value = "Connection failed: Request timeout";
      statusEl.style.color = "#b91c1c";
    };

    xhr.send(JSON.stringify({
      model: model,
      messages: [
        {
          role: "user",
          content: "Please reply: ok"
        }
      ],
      thinking: { type: "disabled" },
      max_tokens: 5,
      temperature: 0,
      stream: false
    }));
  },

  syncExistingPreferencePane: function () {
    if (!Zotero.PreferencePanes || !Array.isArray(Zotero.PreferencePanes.pluginPanes)) {
      return;
    }

    const pluginID = this.getPluginID();
    const matched = Zotero.PreferencePanes.pluginPanes.filter((pane) => {
      return pane && (
        pane.id === this.preferencePaneKey ||
        pane.pluginID === pluginID
      );
    });

    if (matched.length === 0) {
      return;
    }

    const uniqueIDs = [...new Set(matched.map((pane) => pane.id))];

    // If duplicate panes exist, keep target pane ID and remove others
    if (uniqueIDs.length > 1) {
      for (const paneID of uniqueIDs) {
        if (paneID !== this.preferencePaneKey) {
          Zotero.PreferencePanes.unregister(paneID);
        }
      }
    }

    // Legacy versions might have duplicate registrations with same ID
    if (matched.length > 1 && uniqueIDs.length === 1 && uniqueIDs[0] === this.preferencePaneKey) {
      Zotero.PreferencePanes.unregister(this.preferencePaneKey);
      this.preferencePaneID = null;
      return;
    }

    this.preferencePaneID = this.preferencePaneKey;
  },

  init: function () {
    if (this.observerID) {
      return;
    }

    Zotero.PaperClassifierEN = this;

    this.observerID = Zotero.Notifier.registerObserver(
      {
        notify: function (event, type, ids) {
          Zotero.debug("[PaperClassifierEN] Notifier event=" + event + ", type=" + type + ", ids=" + ids.join(","));
        }
      },
      ["item"],
      "paper-classifier-en"
    );

    this.registerPreferencePane();
    Zotero.debug("[PaperClassifierEN] init completed");
  },

  uninit: function () {
    if (this.observerID) {
      Zotero.Notifier.unregisterObserver(this.observerID);
      this.observerID = null;
    }

    if (Zotero.PaperClassifierEN === this) {
      delete Zotero.PaperClassifierEN;
    }

    if (
      this.preferencePaneID &&
      Zotero.PreferencePanes &&
      typeof Zotero.PreferencePanes.unregister === "function"
    ) {
      Zotero.PreferencePanes.unregister(this.preferencePaneID);
      this.preferencePaneID = null;
    }

    if (this.preferencePaneRetryTimer) {
      clearTimeout(this.preferencePaneRetryTimer);
      this.preferencePaneRetryTimer = null;
    }
    this.preferencePaneRegistering = false;
    this.preferencePaneRetryCount = 0;

    Zotero.debug("[PaperClassifierEN] uninit completed");
  },

  registerPreferencePane: function () {
    if (this.preferencePaneID || this.preferencePaneRegistering) {
      return;
    }

    if (!Zotero.PreferencePanes || typeof Zotero.PreferencePanes.register !== "function") {
      if (this.preferencePaneRetryCount < this.preferencePaneRetryMax) {
        this.preferencePaneRetryCount += 1;
        const self = this;
        this.preferencePaneRetryTimer = setTimeout(function () {
          self.preferencePaneRetryTimer = null;
          self.registerPreferencePane();
        }, 1000);
      } else {
        Zotero.debug("[PaperClassifierEN] preference pane API unavailable after retries");
      }
      return;
    }

    const pluginID = this.getPluginID();

    if (Array.isArray(Zotero.PreferencePanes.pluginPanes)) {
      const paneIDsToClear = Zotero.PreferencePanes.pluginPanes
        .filter((pane) => {
          return pane && (
            pane.id === this.preferencePaneKey ||
            pane.pluginID === pluginID
          );
        })
        .map((pane) => pane.id)
        .filter(Boolean);

      for (const paneID of paneIDsToClear) {
        try {
          Zotero.PreferencePanes.unregister(paneID);
        } catch (e) {}
      }
      this.preferencePaneID = null;
    }

    this.preferencePaneRegistering = true;

    Zotero.PreferencePanes.register({
      pluginID: pluginID,
      id: this.preferencePaneKey,
      src: "addon/chrome/content/preferencesPane.xhtml",
      image: "chrome://paper-classifier-en/content/icons/icon-32.png",
      label: "Paper Classifier EN"
    }).then((paneID) => {
      this.preferencePaneID = paneID;
      this.preferencePaneRetryCount = 0;
      Zotero.debug("[PaperClassifierEN] preference pane registered: " + paneID);
    }).catch((error) => {
      Zotero.logError(error);
      this.syncExistingPreferencePane();
    }).finally(() => {
      this.preferencePaneRegistering = false;
    });
  },

  onWindowLoad: function (win) {
    const doc = win.document;
    win.PaperClassifierEN = this;
    this.registerPreferencePane();

    const itemMenu = doc.getElementById("zotero-itemmenu");
    if (itemMenu && !doc.getElementById("paper-classifier-en-classify")) {
      const classifyItem = createMenuNode(doc, "menuitem");
      classifyItem.setAttribute("id", "paper-classifier-en-classify");
      classifyItem.setAttribute("label", "AI Classify Papers");
      classifyItem.setAttribute("oncommand", "PaperClassifierEN.classifySelected()");
      itemMenu.appendChild(classifyItem);
    }

    const toolsMenu = doc.getElementById("tools-menu") || doc.getElementById("menu_ToolsPopup");
    if (toolsMenu && !doc.getElementById("paper-classifier-en-open-preferences")) {
      const prefsItem = createMenuNode(doc, "menuitem");
      prefsItem.setAttribute("id", "paper-classifier-en-open-preferences");
      prefsItem.setAttribute("label", "Paper Classifier EN Settings...");
      prefsItem.setAttribute("oncommand", "PaperClassifierEN.openPreferences()");
      toolsMenu.appendChild(prefsItem);
    }
  },

  onWindowUnload: function (win) {
    const doc = win.document;
    const removableIds = [
      "paper-classifier-en-classify",
      "paper-classifier-en-open-preferences"
    ];

    for (const id of removableIds) {
      const element = doc.getElementById(id);
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }

    if (win.PaperClassifierEN === this) {
      delete win.PaperClassifierEN;
    }
  },

  buildCompletionMessage: function (summary) {
    const successGroups = this.groupSuccessResults(summary.success || []);
    const failureGroups = this.groupFailureResults(summary.failed || []);
    const maxVisibleGroups = 30;

    let message =
      "Classification completed: " +
      summary.success.length +
      " succeeded, " +
      summary.failed.length +
      " failed";

    if (summary.researchTopic) {
      message += "\nResearch topic: " + this.compactMessage(summary.researchTopic, 120);
    }

    if (successGroups.length > 0) {
      message += "\n\nRouted into " + successGroups.length + " categories";
      message += this.formatGroupedCounts(successGroups, maxVisibleGroups, "papers");
    }

    if (failureGroups.length > 0) {
      message += "\n\nFailure reasons: " + failureGroups.length + " categories";
      message += this.formatGroupedCounts(failureGroups, maxVisibleGroups, "papers");
    }

    return message;
  },

  groupSuccessResults: function (successEntries) {
    const counts = Object.create(null);
    for (const entry of successEntries) {
      const key = (entry.collectionPath || entry.classification || "Uncategorized").trim();
      counts[key] = (counts[key] || 0) + 1;
    }
    return this.sortCountGroups(counts);
  },

  groupFailureResults: function (failedEntries) {
    const counts = Object.create(null);
    for (const entry of failedEntries) {
      const message =
        entry.error && entry.error.message
          ? entry.error.message
          : String(entry.error || "Unknown error");
      const key = this.compactMessage(message, 120);
      counts[key] = (counts[key] || 0) + 1;
    }
    return this.sortCountGroups(counts);
  },

  sortCountGroups: function (counts) {
    return Object.keys(counts)
      .map(function (name) {
        return { name: name, count: counts[name] };
      })
      .sort(function (a, b) {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.name.localeCompare(b.name);
      });
  },

  formatGroupedCounts: function (groups, maxVisibleGroups, unit) {
    const visible = groups.slice(0, maxVisibleGroups);
    let text = "";

    visible.forEach(function (group, index) {
      text += "\n" + (index + 1) + ". " + group.name + ": " + group.count + " " + unit;
    });

    if (groups.length > maxVisibleGroups) {
      text += "\n... " + (groups.length - maxVisibleGroups) + " more categories not shown";
    }

    return text;
  },

  compactMessage: function (message, maxLength) {
    const normalized = String(message || "")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length <= maxLength) {
      return normalized || "Unknown error";
    }
    return normalized.slice(0, maxLength - 3) + "...";
  },

  promptForResearchTopic: function (win) {
    const input = {
      value: this.getGlobalPref("lastResearchTopic", "")
    };
    const checkState = { value: false };

    const ok = Services.prompt.prompt(
      win,
      "Paper Classifier EN",
      "Enter the current research topic. The plugin will classify each paper by its role in this topic:",
      input,
      null,
      checkState
    );

    if (!ok) {
      return null;
    }

    const researchTopic = (input.value || "").trim();
    if (!researchTopic) {
      Services.prompt.alert(win, "Paper Classifier EN", "Research topic is required.");
      return null;
    }

    this.setGlobalPref("lastResearchTopic", researchTopic);
    return researchTopic;
  },

  classifySelected: async function () {
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    if (!win) {
      return;
    }

    let selectedItems = [];
    try {
      if (win.ZoteroPane && typeof win.ZoteroPane.getSelectedItems === "function") {
        selectedItems = win.ZoteroPane.getSelectedItems();
      } else if (typeof ZoteroPane !== "undefined" && typeof ZoteroPane.getSelectedItems === "function") {
        selectedItems = ZoteroPane.getSelectedItems();
      }
    } catch (error) {
      Services.prompt.alert(win, "Paper Classifier EN", "Failed to read selected items: " + error.message);
      return;
    }

    const items = selectedItems.filter(function (item) {
      return item && item.isRegularItem && item.isRegularItem() && (!item.isAttachment || !item.isAttachment());
    });

    if (items.length === 0) {
      Services.prompt.alert(win, "Paper Classifier EN", "No valid items selected (regular top-level items only).");
      return;
    }

    const researchTopic = this.promptForResearchTopic(win);
    if (!researchTopic) {
      return;
    }

    let summary;
    try {
      summary = await processItems(items, { researchTopic: researchTopic });
    } catch (error) {
      Services.prompt.alert(win, "Paper Classifier EN", "Error during classification: " + error.message);
      return;
    }

    Services.prompt.alert(win, "Paper Classifier EN", this.buildCompletionMessage(summary));
  },

  openPreferences: function () {
    this.registerPreferencePane();

    if (
      Zotero.Utilities &&
      Zotero.Utilities.Internal &&
      typeof Zotero.Utilities.Internal.openPreferences === "function"
    ) {
      Zotero.Utilities.Internal.openPreferences(this.preferencePaneKey);
      return;
    }

    const win = Services.wm.getMostRecentWindow("navigator:browser");
    if (win && typeof win.openDialog === "function") {
      win.openDialog(
        "chrome://zotero/content/preferences/preferences.xhtml",
        "zotero-prefs",
        "chrome,titlebar,centerscreen,resizable=yes",
        { pane: this.preferencePaneKey }
      );
    }
  }
};

PaperClassifierEN.init();
