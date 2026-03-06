/**
 * Process one item: read fields -> classify -> route to second-level collection.
 * @param {Object} item Zotero Item
 * @param {Object} [context]
 * @returns {Promise<{classification: string, collectionPath: string}>}
 */
async function processItem(item, context) {
  const title = item.getField("title");
  const abstract = item.getField("abstractNote");

  if (!title || !title.trim()) {
    throw new Error("Item is missing title");
  }
  if (!abstract || !abstract.trim()) {
    throw new Error("Item is missing abstract");
  }

  const settings = context && context.settings ? context.settings : readProcessorSettings();
  const runtime = context && context.runtime ? context.runtime : createRuntimeCache();

  const classification = await classifyPaper(
    title,
    abstract,
    settings.apiKey,
    settings.endpoint,
    settings.model
  );

  const parsed = parseClassification(classification);
  const targetCollection = await ensureClassificationCollection(item.libraryID, settings.collectionRoot, parsed, runtime);

  await moveItemToCollection(item, targetCollection.id, settings.keepOriginalCollections);

  const collectionPath = settings.collectionRoot + "/" + parsed.primary + "/" + parsed.secondary;
  return {
    classification: parsed.primary + "/" + parsed.secondary,
    collectionPath: collectionPath
  };
}

/**
 * Process items sequentially to avoid API throttling.
 * @param {Array<Object>} items Zotero Item array
 * @returns {Promise<{success: Array<{item: Object, classification: string, collectionPath: string}>, failed: Array<{item: Object, error: Error}>}>}
 */
async function processItems(items) {
  const summary = {
    success: [],
    failed: []
  };

  const settings = readProcessorSettings();
  const runtime = createRuntimeCache();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const title = item.getField("title") || "(Untitled)";

    Zotero.debug("[PaperClassifier] Start processing (" + (i + 1) + "/" + items.length + "): " + title);

    try {
      const result = await processItem(item, { settings: settings, runtime: runtime });
      summary.success.push({
        item: item,
        classification: result.classification,
        collectionPath: result.collectionPath
      });
      Zotero.debug(
        "[PaperClassifier] Completed (" +
          (i + 1) +
          "/" +
          items.length +
          "): " +
          title +
          " -> " +
          result.collectionPath
      );
    } catch (error) {
      summary.failed.push({ item: item, error: error });
      Zotero.debug(
        "[PaperClassifier] Failed (" +
          (i + 1) +
          "/" +
          items.length +
          "): " +
          title +
          " -> " +
          (error && error.message ? error.message : String(error))
      );
    }
  }

  return summary;
}

function readProcessorSettings() {
  return {
    apiKey: getPluginPref("apiKey", ""),
    endpoint: getPluginPref("apiEndpoint", "https://api.deepseek.com"),
    model: getPluginPref("model", "deepseek-chat"),
    collectionRoot: normalizeName(getPluginPref("collectionRoot", "AI Theme Classification")) || "AI Theme Classification",
    keepOriginalCollections: !!getPluginPref("keepOriginalCollections", false)
  };
}

function createRuntimeCache() {
  return {
    topCollectionsByKey: new Map(),
    childCollectionsByKey: new Map()
  };
}

function parseClassification(rawClassification) {
  const raw = normalizeName(String(rawClassification || "").replace(/^(classification|category|topic)[:：]\s*/i, ""));
  if (!raw) {
    throw new Error("Classification result is empty");
  }

  const normalizedSlash = raw.replace(/[／|｜\\]+/g, "/");
  const parts = normalizedSlash
    .split("/")
    .map(function (part) {
      return normalizeName(part);
    })
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      primary: parts[0],
      secondary: parts.slice(1).join("-")
    };
  }

  // If no "primary/secondary" format is returned, route to "Other"
  return {
    primary: "Other",
    secondary: parts[0] || raw
  };
}

async function ensureClassificationCollection(libraryID, rootName, parsed, runtime) {
  const rootCollection = await getOrCreateTopCollection(libraryID, rootName, runtime);
  const primaryCollection = await getOrCreateChildCollection(rootCollection, parsed.primary, runtime);
  const secondaryCollection = await getOrCreateChildCollection(primaryCollection, parsed.secondary, runtime);
  return secondaryCollection;
}

async function getOrCreateTopCollection(libraryID, name, runtime) {
  const key = String(libraryID) + "::" + name;
  if (runtime.topCollectionsByKey.has(key)) {
    const existingID = runtime.topCollectionsByKey.get(key);
    const existingCollection = Zotero.Collections.get(existingID);
    if (existingCollection && !existingCollection.deleted) {
      return existingCollection;
    }
  }

  const topCollections = Zotero.Collections.getByLibrary(libraryID, false, false);
  for (const collection of topCollections) {
    if ((collection.name || "") === name) {
      runtime.topCollectionsByKey.set(key, collection.id);
      return collection;
    }
  }

  const collection = new Zotero.Collection();
  collection.libraryID = libraryID;
  collection.name = name;
  const collectionID = await collection.saveTx();
  runtime.topCollectionsByKey.set(key, collectionID);
  return Zotero.Collections.get(collectionID);
}

async function getOrCreateChildCollection(parentCollection, name, runtime) {
  const key = String(parentCollection.id) + "::" + name;
  if (runtime.childCollectionsByKey.has(key)) {
    const existingID = runtime.childCollectionsByKey.get(key);
    const existingCollection = Zotero.Collections.get(existingID);
    if (existingCollection && !existingCollection.deleted) {
      return existingCollection;
    }
  }

  const children = parentCollection.getChildCollections(false, false);
  for (const child of children) {
    if ((child.name || "") === name) {
      runtime.childCollectionsByKey.set(key, child.id);
      return child;
    }
  }

  const collection = new Zotero.Collection();
  collection.libraryID = parentCollection.libraryID;
  collection.parentID = parentCollection.id;
  collection.name = name;
  const collectionID = await collection.saveTx();
  runtime.childCollectionsByKey.set(key, collectionID);
  return Zotero.Collections.get(collectionID);
}

async function moveItemToCollection(item, targetCollectionID, keepOriginalCollections) {
  await Zotero.DB.executeTransaction(async function () {
    if (keepOriginalCollections) {
      if (!item.inCollection(targetCollectionID)) {
        item.addToCollection(targetCollectionID);
        await item.save();
      }
      return;
    }

    const currentCollections = item.getCollections(false);
    if (currentCollections.length === 1 && currentCollections[0] === targetCollectionID) {
      return;
    }

    item.setCollections([targetCollectionID]);
    await item.save();
  });
}

function normalizeName(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPluginPref(key, fallbackValue) {
  const prefKey = "extensions.paper-classifier-en." + key;
  let value = "";

  // Correct read mode: global=true (full pref key)
  try {
    value = Zotero.Prefs.get(prefKey, true);
  } catch (e) {}

  if (value !== undefined && value !== null && String(value) !== "") {
    return value;
  }

  // Compatibility fallback for incorrectly scoped legacy keys
  try {
    const legacyValue = Zotero.Prefs.get(prefKey);
    if (legacyValue !== undefined && legacyValue !== null && String(legacyValue) !== "") {
      Zotero.Prefs.set(prefKey, legacyValue, true);
      return legacyValue;
    }
  } catch (e) {}

  return fallbackValue;
}
