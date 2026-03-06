/* global Components, Services, Zotero, PaperClassifierEN */

Components.utils.import("resource://gre/modules/Services.jsm");

let chromeHandle = null;
let windowListener = null;
var PAPER_CLASSIFIER_PLUGIN_ID = null;
var PAPER_CLASSIFIER_ROOT_URI_SPEC = null;

function log(message) {
  if (typeof Zotero !== "undefined" && Zotero && typeof Zotero.debug === "function") {
    Zotero.debug("[PaperClassifierEN] " + message);
    return;
  }
  Services.console.logStringMessage("[PaperClassifierEN] " + message);
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
    throw new Error("Missing addon rootURI/resourceURI");
  }

  if (typeof source === "string") {
    return source.endsWith("/") ? source : source + "/";
  }

  if (source.spec && typeof source.spec === "string") {
    return source.spec.endsWith("/") ? source.spec : source.spec + "/";
  }

  throw new Error("Unable to resolve addon root path");
}

function getBrowserWindow(xulWindow) {
  try {
    return xulWindow
      .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
      .getInterface(Components.interfaces.nsIDOMWindow);
  } catch (e) {
    log("Failed to get window object: " + e.message);
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
      log("Failed to process window: " + e.message);
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
      ["content", "paper-classifier-en", addonRootSpec + "addon/chrome/content/"]
    ]);
  } catch (e) {
    // Keep loading core logic even if chrome registration fails
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
      PaperClassifierEN.onWindowLoad(win);
      return;
    }

    win.addEventListener(
      "load",
      function onLoad() {
        win.removeEventListener("load", onLoad, false);
        PaperClassifierEN.onWindowLoad(win);
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
            PaperClassifierEN.onWindowLoad(win);
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
    if (typeof PaperClassifierEN !== "undefined" && PaperClassifierEN && typeof PaperClassifierEN.onWindowUnload === "function") {
      PaperClassifierEN.onWindowUnload(win);
    }
  });

  if (typeof PaperClassifierEN !== "undefined" && PaperClassifierEN && typeof PaperClassifierEN.uninit === "function") {
    PaperClassifierEN.uninit();
  }

  if (chromeHandle && typeof chromeHandle.destruct === "function") {
    chromeHandle.destruct();
    chromeHandle = null;
  }

  PAPER_CLASSIFIER_PLUGIN_ID = null;
  PAPER_CLASSIFIER_ROOT_URI_SPEC = null;

  log("shutdown completed");
}
