/**
 * 处理单条文献：读取字段 -> 调用分类 -> 归档到二级分类集合。
 * @param {Object} item Zotero Item
 * @param {Object} [context]
 * @returns {Promise<{classification: string, collectionPath: string}>}
 */
async function processItem(item, context) {
  const title = item.getField("title");
  const abstract = item.getField("abstractNote");

  if (!title || !title.trim()) {
    throw new Error("条目缺少标题");
  }
  if (!abstract || !abstract.trim()) {
    throw new Error("条目缺少摘要");
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
 * 顺序批量处理条目，避免并发导致限流。
 * @param {Array<Object>} items Zotero Item 数组
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
    const title = item.getField("title") || "(无标题)";

    Zotero.debug("[PaperClassifier] 开始处理(" + (i + 1) + "/" + items.length + "): " + title);

    try {
      const result = await processItem(item, { settings: settings, runtime: runtime });
      summary.success.push({
        item: item,
        classification: result.classification,
        collectionPath: result.collectionPath
      });
      Zotero.debug(
        "[PaperClassifier] 处理完成(" +
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
        "[PaperClassifier] 处理失败(" +
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
    model: normalizeDeepSeekModelPref(getPluginPref("model", "deepseek-v4-flash")),
    collectionRoot: normalizeName(getPluginPref("collectionRoot", "AI主题分类")) || "AI主题分类",
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
  const raw = normalizeName(String(rawClassification || "").replace(/^分类[:：]\s*/i, ""));
  if (!raw) {
    throw new Error("分类结果为空");
  }

  const normalizedSlash = raw.replace(/[／|｜\\]+/g, "/");
  const parts = normalizedSlash
    .split("/")
    .map(function (part) {
      return normalizeName(part);
    })
    .filter(Boolean);

  if (parts.length >= 2) {
    return normalizeParsedClassification(parts[0], parts.slice(1).join("-"));
  }

  // 未按“一级/二级”返回时，挂到“其他”二级目录
  return normalizeParsedClassification("其他", parts[0] || raw);
}

function normalizeParsedClassification(primary, secondary) {
  return {
    primary: canonicalizePrimaryName(primary),
    secondary: normalizeSecondaryName(secondary) || "待细分"
  };
}

function canonicalizePrimaryName(value) {
  const name = normalizeName(value);
  const key = name.toLowerCase().replace(/\s+/g, "");

  const rules = [
    {
      name: "系统综述与证据综合",
      pattern: /(系统综述|系统评价|meta|荟萃|证据综合|范围综述|scopingreview|review)/
    },
    {
      name: "干预与试验研究",
      pattern: /(随机|rct|对照试验|临床试验|干预|试验|实验|效果评估|effectiveness|efficacy)/
    },
    {
      name: "观察性与流行病学研究",
      pattern: /(观察|队列|病例|横断面|流行病|调查|相关|危险因素|患病率|发生率|cohort|casecontrol|crosssectional)/
    },
    {
      name: "量表与测量工具",
      pattern: /(量表|问卷|测量|信度|效度|工具|指标体系|评估工具|scale|questionnaire|instrument|validity|reliability)/
    },
    {
      name: "预测模型与诊断评估",
      pattern: /(预测|诊断|预后|筛查|风险模型|机器学习|深度学习|算法|模型构建|prediction|diagnosis|prognosis|screening|machinelearning|deeplearning)/
    },
    {
      name: "机制与基础研究",
      pattern: /(机制|基础|通路|分子|细胞|动物|病理|生物标志物|mechanism|pathway|molecular|cell|animal|biomarker)/
    },
    {
      name: "方法学与理论框架",
      pattern: /(方法学|方法|理论|框架|指南|共识|规范|报告标准|methodology|theory|framework|guideline|consensus)/
    },
    {
      name: "应用系统与资源构建",
      pattern: /(系统|平台|应用|软件|工程|实现|部署|数据集|数据库|资源|语料库|system|platform|software|dataset|database|resource|corpus)/
    },
    {
      name: "政策伦理与实践转化",
      pattern: /(政策|伦理|经济|成本|质量改进|实践|管理|教育|培训|policy|ethics|economic|cost|implementation|education|training)/
    },
    {
      name: "其他",
      pattern: /(其他|待判定|uncertain|other)/
    }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return name || "其他";
}

function normalizeSecondaryName(value) {
  const normalized = normalizeName(value)
    .replace(/^(二级主题|二级分类|主题|分类)[:：]\s*/i, "")
    .replace(/^(关于|有关|针对)\s*/, "")
    .replace(/[\/／|｜\\]+/g, "-")
    .replace(/[。；;，,]+$/, "")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > 40 ? normalized.slice(0, 40).trim() : normalized;
}

function normalizeDeepSeekModelPref(model) {
  const normalized = String(model || "").trim().toLowerCase();
  if (
    normalized === "deepseek-v4-pro" ||
    normalized === "deepseek-pro" ||
    normalized === "deepseek pro"
  ) {
    return "deepseek-v4-pro";
  }
  return "deepseek-v4-flash";
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
  const prefKey = "extensions.paper-classifier." + key;
  let value = "";

  // 正确读取方式：global=true（完整 pref key）
  try {
    value = Zotero.Prefs.get(prefKey, true);
  } catch (e) {}

  if (value !== undefined && value !== null && String(value) !== "") {
    return value;
  }

  // 兼容迁移：历史版本可能错误写入到了 Zotero 分支前缀下
  try {
    const legacyValue = Zotero.Prefs.get(prefKey);
    if (legacyValue !== undefined && legacyValue !== null && String(legacyValue) !== "") {
      Zotero.Prefs.set(prefKey, legacyValue, true);
      return legacyValue;
    }
  } catch (e) {}

  return fallbackValue;
}
