/* global Components, Services, Zotero, PaperClassifier */

Components.utils.import("resource://gre/modules/Services.jsm");

let chromeHandle = null;
let windowListener = null;
var PAPER_CLASSIFIER_PLUGIN_ID = null;
var PAPER_CLASSIFIER_ROOT_URI_SPEC = null;

function log(message) {
  if (typeof Zotero !== "undefined" && Zotero && typeof Zotero.debug === "function") {
    Zotero.debug("[PaperClassifier] " + message);
    return;
  }
  Services.console.logStringMessage("[PaperClassifier] " + message);
}

function applyDefaultPrefs(resourceURI) {
  if (!resourceURI) {
    return;
  }

  const defaultBranch = Services.prefs.getDefaultBranch("");
  const scope = {
    pref: function (key, value) {
      if (typeof value === "string") {
        defaultBranch.setStringPref(key, value);
      } else if (typeof value === "boolean") {
        defaultBranch.setBoolPref(key, value);
      } else if (typeof value === "number") {
        defaultBranch.setIntPref(key, value);
      }
    }
  };

  Services.scriptloader.loadSubScript(resourceURI + "addon/prefs.js", scope);
}

function normalizeRootSpec(rootURI, resourceURI) {
  const source = rootURI || resourceURI;
  if (!source) {
    throw new Error("缺少插件 rootURI/resourceURI");
  }

  if (typeof source === "string") {
    return source.endsWith("/") ? source : source + "/";
  }

  if (source.spec && typeof source.spec === "string") {
    return source.spec.endsWith("/") ? source.spec : source.spec + "/";
  }

  throw new Error("无法解析插件根路径");
}

function getBrowserWindow(xulWindow) {
  try {
    return xulWindow
      .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
      .getInterface(Components.interfaces.nsIDOMWindow);
  } catch (e) {
    log("获取窗口对象失败: " + e.message);
    return null;
  }
}

function forEachOpenWindow(handler) {
  const enumerator = Services.wm.getEnumerator("navigator:browser");
  while (enumerator.hasMoreElements()) {
    const win = enumerator.getNext();
    try {
      handler(win);
    } catch (e) {
      log("处理窗口失败: " + e.message);
    }
  }
}

async function install(data, reason) {
  log("install reason=" + reason);
  applyDefaultPrefs(data && data.resourceURI);
}

async function uninstall(data, reason) {
  log("uninstall reason=" + reason);
}

async function startup({ id, version, rootURI, resourceURI }) {
  const addonRootSpec = normalizeRootSpec(rootURI, resourceURI);
  PAPER_CLASSIFIER_PLUGIN_ID = id;
  PAPER_CLASSIFIER_ROOT_URI_SPEC = addonRootSpec;

  log("startup id=" + id + ", version=" + version);

  await Zotero.initializationPromise;
  if (Zotero.uiReadyPromise) {
    await Zotero.uiReadyPromise;
  }

  applyDefaultPrefs(addonRootSpec);

  const aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);

  try {
    const addonRootURIObj = Services.io.newURI(addonRootSpec, null, null);
    const manifestURI = Services.io.newURI("manifest.json", null, addonRootURIObj);
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "paper-classifier", addonRootSpec + "addon/chrome/content/"]
    ]);
  } catch (e) {
    // 注册失败时仍继续加载主逻辑，避免插件完全不可用
    log("registerChrome failed: " + e.message);
  }

  const modulePaths = [
    "addon/deepseekClient.js",
    "addon/paperProcessor.js",
    "addon/main.js"
  ];

  for (const path of modulePaths) {
    Services.scriptloader.loadSubScript(addonRootSpec + path);
    log("loaded: " + path);
  }

  forEachOpenWindow(function (win) {
    if (!win || !win.document) {
      return;
    }

    if (win.document.readyState === "complete") {
      PaperClassifier.onWindowLoad(win);
      return;
    }

    win.addEventListener(
      "load",
      function onLoad() {
        win.removeEventListener("load", onLoad, false);
        PaperClassifier.onWindowLoad(win);
      },
      false
    );
  });

  windowListener = {
    onOpenWindow: function (xulWindow) {
      const win = getBrowserWindow(xulWindow);
      if (!win) {
        return;
      }

      win.addEventListener(
        "load",
        function onLoad() {
          win.removeEventListener("load", onLoad, false);
          if (
            win.document &&
            win.document.documentElement &&
            win.document.documentElement.getAttribute("windowtype") === "navigator:browser"
          ) {
            PaperClassifier.onWindowLoad(win);
          }
        },
        false
      );
    },
    onCloseWindow: function () {},
    onWindowTitleChange: function () {}
  };

  Services.wm.addListener(windowListener);
  log("startup completed");
}

async function shutdown({ id, version, resourceURI }, reason) {
  if (reason === 1) {
    return;
  }

  log("shutdown id=" + id + ", version=" + version + ", reason=" + reason);

  if (windowListener) {
    Services.wm.removeListener(windowListener);
    windowListener = null;
  }

  forEachOpenWindow(function (win) {
    if (typeof PaperClassifier !== "undefined" && PaperClassifier && typeof PaperClassifier.onWindowUnload === "function") {
      PaperClassifier.onWindowUnload(win);
    }
  });

  if (typeof PaperClassifier !== "undefined" && PaperClassifier && typeof PaperClassifier.uninit === "function") {
    PaperClassifier.uninit();
  }

  if (chromeHandle && typeof chromeHandle.destruct === "function") {
    chromeHandle.destruct();
    chromeHandle = null;
  }

  PAPER_CLASSIFIER_PLUGIN_ID = null;
  PAPER_CLASSIFIER_ROOT_URI_SPEC = null;

  log("shutdown completed");
}
