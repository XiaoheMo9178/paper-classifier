/* global Services, Zotero, processItems, XMLHttpRequest */

var XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function createMenuNode(doc, tagName) {
  if (typeof doc.createXULElement === "function") {
    return doc.createXULElement(tagName);
  }
  return doc.createElementNS(XUL_NS, tagName);
}

var PaperClassifier = {
  observerID: null,
  preferencePaneID: null,
  preferencePaneKey: "paper-classifier-prefpane",
  prefPrefix: "extensions.paper-classifier.",
  prefDefaultEndpoint: "https://api.deepseek.com",
  preferencePaneRegistering: false,
  preferencePaneRetryCount: 0,
  preferencePaneRetryMax: 60,
  preferencePaneRetryTimer: null,

  getPluginID: function () {
    return (typeof PAPER_CLASSIFIER_PLUGIN_ID !== "undefined" && PAPER_CLASSIFIER_PLUGIN_ID) ||
      "paper-classifier@example.com";
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

    // 兼容迁移：读取历史错误分支并写回正确分支
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
    modelEl.value = this.getGlobalPref("model", "deepseek-chat");
    collectionRootEl.value = this.getGlobalPref("collectionRoot", "AI主题分类");
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
      this.setGlobalPref("model", modelEl.value || "deepseek-chat");
    });

    collectionRootEl.addEventListener("input", () => {
      const val = (collectionRootEl.value || "").trim();
      this.setGlobalPref("collectionRoot", val || "AI主题分类");
    });
    collectionRootEl.addEventListener("change", () => {
      const val = (collectionRootEl.value || "").trim();
      this.setGlobalPref("collectionRoot", val || "AI主题分类");
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
    const model = modelEl.value || "deepseek-chat";
    const collectionRoot = (collectionRootEl.value || "").trim() || "AI主题分类";
    const keepOriginalCollections = !!keepOriginalEl.checked;

    if (!apiKey) {
      statusEl.value = "请先输入 API Key";
      statusEl.style.color = "#b91c1c";
      return;
    }

    this.setGlobalPref("apiKey", apiKey);
    this.setGlobalPref("model", model);
    this.setGlobalPref("collectionRoot", collectionRoot);
    this.setGlobalPref("keepOriginalCollections", keepOriginalCollections);
    this.setGlobalPref("apiEndpoint", this.prefDefaultEndpoint);

    testBtnEl.disabled = true;
    statusEl.value = "验证中...";
    statusEl.style.color = "#6b7280";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", this.prefDefaultEndpoint + "/v1/chat/completions", true);
    xhr.timeout = 15000;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", "Bearer " + apiKey);

    xhr.onload = () => {
      testBtnEl.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        statusEl.value = "连接成功";
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

      statusEl.value = "连接失败：" + errText;
      statusEl.style.color = "#b91c1c";
    };

    xhr.onerror = () => {
      testBtnEl.disabled = false;
      statusEl.value = "连接失败：网络错误";
      statusEl.style.color = "#b91c1c";
    };

    xhr.ontimeout = () => {
      testBtnEl.disabled = false;
      statusEl.value = "连接失败：请求超时";
      statusEl.style.color = "#b91c1c";
    };

    xhr.send(JSON.stringify({
      model: model,
      messages: [
        {
          role: "user",
          content: "请回复：ok"
        }
      ],
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

    // 如果检测到重复 pane，保留目标 ID，移除其他重复项
    if (uniqueIDs.length > 1) {
      for (const paneID of uniqueIDs) {
        if (paneID !== this.preferencePaneKey) {
          Zotero.PreferencePanes.unregister(paneID);
        }
      }
    }

    // 历史版本可能造成同一 ID 被重复注册，直接清空后重建
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

    Zotero.PaperClassifier = this;

    this.observerID = Zotero.Notifier.registerObserver(
      {
        notify: function (event, type, ids) {
          Zotero.debug("[PaperClassifier] Notifier event=" + event + ", type=" + type + ", ids=" + ids.join(","));
        }
      },
      ["item"],
      "paper-classifier"
    );

    this.registerPreferencePane();
    Zotero.debug("[PaperClassifier] init completed");
  },

  uninit: function () {
    if (this.observerID) {
      Zotero.Notifier.unregisterObserver(this.observerID);
      this.observerID = null;
    }

    if (Zotero.PaperClassifier === this) {
      delete Zotero.PaperClassifier;
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

    Zotero.debug("[PaperClassifier] uninit completed");
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
        Zotero.debug("[PaperClassifier] preference pane API unavailable after retries");
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
      image: "chrome://paper-classifier/content/icons/icon-32.png",
      label: "Paper Classifier"
    }).then((paneID) => {
      this.preferencePaneID = paneID;
      this.preferencePaneRetryCount = 0;
      Zotero.debug("[PaperClassifier] preference pane registered: " + paneID);
    }).catch((error) => {
      Zotero.logError(error);
      this.syncExistingPreferencePane();
    }).finally(() => {
      this.preferencePaneRegistering = false;
    });
  },

  onWindowLoad: function (win) {
    const doc = win.document;
    win.PaperClassifier = this;
    this.registerPreferencePane();

    const itemMenu = doc.getElementById("zotero-itemmenu");
    if (itemMenu && !doc.getElementById("paper-classifier-classify")) {
      const classifyItem = createMenuNode(doc, "menuitem");
      classifyItem.setAttribute("id", "paper-classifier-classify");
      classifyItem.setAttribute("label", "AI 分类论文");
      classifyItem.setAttribute("oncommand", "PaperClassifier.classifySelected()");
      itemMenu.appendChild(classifyItem);
    }

    const toolsMenu = doc.getElementById("tools-menu") || doc.getElementById("menu_ToolsPopup");
    if (toolsMenu && !doc.getElementById("paper-classifier-open-preferences")) {
      const prefsItem = createMenuNode(doc, "menuitem");
      prefsItem.setAttribute("id", "paper-classifier-open-preferences");
      prefsItem.setAttribute("label", "Paper Classifier 设置...");
      prefsItem.setAttribute("oncommand", "PaperClassifier.openPreferences()");
      toolsMenu.appendChild(prefsItem);
    }
  },

  onWindowUnload: function (win) {
    const doc = win.document;
    const removableIds = [
      "paper-classifier-classify",
      "paper-classifier-open-preferences"
    ];

    for (const id of removableIds) {
      const element = doc.getElementById(id);
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }

    if (win.PaperClassifier === this) {
      delete win.PaperClassifier;
    }
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
      Services.prompt.alert(win, "Paper Classifier", "读取选中条目失败：" + error.message);
      return;
    }

    const items = selectedItems.filter(function (item) {
      return item && item.isRegularItem && item.isRegularItem() && (!item.isAttachment || !item.isAttachment());
    });

    if (items.length === 0) {
      Services.prompt.alert(win, "Paper Classifier", "未选中有效论文条目（需为常规文献条目且非附件）。");
      return;
    }

    let summary;
    try {
      summary = await processItems(items);
    } catch (error) {
      Services.prompt.alert(win, "Paper Classifier", "分类过程中发生错误：" + error.message);
      return;
    }

    let message = "分类完成：成功 " + summary.success.length + " 篇，失败 " + summary.failed.length + " 篇";

    if (summary.success.length > 0) {
      message += "\n\n成功列表：\n";
      summary.success.forEach(function (entry, index) {
        const title = entry.item.getField("title") || "(无标题)";
        const location = entry.collectionPath || entry.classification;
        message += (index + 1) + ". " + title + " -> " + location + "\n";
      });
    }

    if (summary.failed.length > 0) {
      message += "\n失败列表：\n";
      summary.failed.forEach(function (entry, index) {
        const title = entry.item.getField("title") || "(无标题)";
        const errMsg = entry.error && entry.error.message ? entry.error.message : String(entry.error);
        message += (index + 1) + ". " + title + " -> " + errMsg + "\n";
      });
    }

    Services.prompt.alert(win, "Paper Classifier", message);
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

PaperClassifier.init();
