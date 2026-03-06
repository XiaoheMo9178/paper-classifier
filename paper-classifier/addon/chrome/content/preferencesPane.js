/* global Zotero, XMLHttpRequest */

var PaperClassifierPrefsPane = {
  PREFIX: "extensions.paper-classifier.",
  DEFAULT_ENDPOINT: "https://api.deepseek.com",
  _els: null,

  getPref: function (key, fallbackValue) {
    const prefKey = this.PREFIX + key;
    let value = null;

    try {
      value = Zotero.Prefs.get(prefKey, true);
    } catch (e) {}

    if (value !== null && value !== undefined && String(value) !== "") {
      return value;
    }

    // 兼容历史错误分支并迁移
    try {
      const legacyValue = Zotero.Prefs.get(prefKey);
      if (legacyValue !== null && legacyValue !== undefined && String(legacyValue) !== "") {
        Zotero.Prefs.set(prefKey, legacyValue, true);
        return legacyValue;
      }
    } catch (e) {}

    return fallbackValue;
  },

  setPref: function (key, value) {
    Zotero.Prefs.set(this.PREFIX + key, value, true);
  },

  onLoad: function () {
    const doc = window.document;
    const apiKeyEl = doc.getElementById("paper-classifier-pref-apiKey");
    const modelEl = doc.getElementById("paper-classifier-pref-model");
    const outputEl = doc.getElementById("paper-classifier-pref-outputField");
    const testBtnEl = doc.getElementById("paper-classifier-pref-test");
    const testStatusEl = doc.getElementById("paper-classifier-pref-test-status");

    if (!apiKeyEl || !modelEl || !outputEl || !testBtnEl || !testStatusEl) {
      return;
    }

    this._els = {
      apiKey: apiKeyEl,
      model: modelEl,
      output: outputEl,
      testBtn: testBtnEl,
      testStatus: testStatusEl
    };

    // 固定 endpoint，避免历史配置导致请求地址不一致
    this.setPref("apiEndpoint", this.DEFAULT_ENDPOINT);

    // preference 绑定可自动保存，这里仅保证首次显示有默认值
    if (!apiKeyEl.value) {
      apiKeyEl.value = this.getPref("apiKey", "");
    }
    if (!modelEl.value) {
      modelEl.value = this.getPref("model", "deepseek-chat");
    }
    if (!outputEl.value) {
      outputEl.value = this.getPref("outputField", "tag");
    }
  },

  _setTestStatus: function (text, color) {
    if (!this._els || !this._els.testStatus) {
      return;
    }
    this._els.testStatus.value = text;
    this._els.testStatus.style.color = color || "";
  },

  testConnection: function () {
    if (!this._els) {
      this.onLoad();
    }
    if (!this._els) {
      return;
    }

    const apiKey = (this._els.apiKey.value || "").trim();
    const model = this._els.model.value || "deepseek-chat";

    if (!apiKey) {
      this._setTestStatus("请先输入 API Key", "#b91c1c");
      return;
    }

    this._els.testBtn.disabled = true;
    this._setTestStatus("验证中...", "#6b7280");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", this.DEFAULT_ENDPOINT + "/v1/chat/completions", true);
    xhr.timeout = 15000;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", "Bearer " + apiKey);

    xhr.onload = () => {
      this._els.testBtn.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        this._setTestStatus("连接成功", "#166534");
        return;
      }

      let errText = "HTTP " + xhr.status;
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (data && data.error && data.error.message) {
          errText += " - " + data.error.message;
        }
      } catch (e) {}

      this._setTestStatus("连接失败：" + errText, "#b91c1c");
    };

    xhr.onerror = () => {
      this._els.testBtn.disabled = false;
      this._setTestStatus("连接失败：网络错误", "#b91c1c");
    };

    xhr.ontimeout = () => {
      this._els.testBtn.disabled = false;
      this._setTestStatus("连接失败：请求超时", "#b91c1c");
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
  }
};
