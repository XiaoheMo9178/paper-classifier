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
    settings.model,
    settings.researchTopic
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
async function processItems(items, options) {
  const summary = {
    success: [],
    failed: [],
    researchTopic: ""
  };

  const settings = readProcessorSettings();
  if (options && options.researchTopic) {
    settings.researchTopic = normalizeName(options.researchTopic);
  }
  summary.researchTopic = settings.researchTopic || "";
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
    model: normalizeDeepSeekModelPref(getPluginPref("model", "deepseek-v4-flash")),
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
    return normalizeParsedClassification(parts[0], parts.slice(1).join("-"));
  }

  // If no "primary/secondary" format is returned, route to a fixed fallback.
  return normalizeParsedClassification("Weakly Related or Exclude", parts[0] || raw);
}

function normalizeParsedClassification(primary, secondary) {
  const canonicalPrimary = canonicalizePrimaryName(primary);
  return {
    primary: canonicalPrimary,
    secondary: canonicalizeSecondaryName(canonicalPrimary, primary, secondary)
  };
}

function canonicalizePrimaryName(value) {
  const name = normalizeName(value);
  const key = name.toLowerCase().replace(/\s+/g, "");

  const rules = [
    {
      name: "Core Topic Research",
      pattern: /(core|direct|relevant|topic|subtopic|population|setting|status|核心|直接相关|主题|子主题|人群|场景|现状)/
    },
    {
      name: "Background Theory and Concepts",
      pattern: /(background|theory|concept|definition|trend|narrative|背景|理论|概念|定义|趋势|叙述)/
    },
    {
      name: "Methods Models and Tools",
      pattern: /(method|model|prediction|diagnosis|screen|algorithm|validation|方法|模型|预测|诊断|筛查|算法|验证)/
    },
    {
      name: "Measurement Evaluation and Indicators",
      pattern: /(measurement|evaluation|indicator|scale|questionnaire|validity|reliability|测量|评价|指标|量表|问卷|信度|效度)/
    },
    {
      name: "Intervention Application and Practice",
      pattern: /(intervention|application|practice|trial|implementation|effect|education|干预|应用|实践|试验|实施|效果|教育)/
    },
    {
      name: "Mechanisms and Risk Factors",
      pattern: /(mechanism|basic|risk|factor|biomarker|experiment|association|机制|基础|风险|因素|标志物|实验|相关)/
    },
    {
      name: "Evidence Synthesis and Review",
      pattern: /(evidence|review|metaanalysis|meta-analysis|scoping|guideline|consensus|证据|综述|系统评价|范围综述|指南|共识)/
    },
    {
      name: "Data Resources and Systems",
      pattern: /(data|dataset|database|resource|system|platform|software|decision|tool|数据|数据集|数据库|资源|系统|平台|软件|决策|工具)/
    },
    {
      name: "Policy Ethics and Translation",
      pattern: /(policy|ethics|privacy|economic|training|quality|translation|政策|伦理|隐私|经济|培训|质量|转化)/
    },
    {
      name: "Weakly Related or Exclude",
      pattern: /(weak|irrelevant|exclude|unrelated|uncertain|弱相关|不相关|排除|待判定)/
    }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return "Weakly Related or Exclude";
}

function normalizeSecondaryName(value) {
  const normalized = normalizeName(value)
    .replace(/^(secondary theme|secondary category|topic|category)[:：]\s*/i, "")
    .replace(/[\/／|｜\\]+/g, "-")
    .replace(/[;,.]+$/, "")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > 56 ? normalized.slice(0, 56).trim() : normalized;
}

function canonicalizeSecondaryName(primary, rawPrimary, rawSecondary) {
  const rawSecondaryName = normalizeSecondaryName(rawSecondary);
  const rawPrimaryName = normalizeName(rawPrimary);
  const lookupSource =
    normalizeTaxonomyKey(rawPrimaryName) && normalizeTaxonomyKey(rawPrimaryName) !== normalizeTaxonomyKey(primary)
      ? rawPrimaryName + " " + rawSecondaryName
      : rawSecondaryName;
  const key = normalizeTaxonomyKey(lookupSource);
  const taxonomy = getSecondaryTaxonomy();
  const rules = taxonomy[primary] || taxonomy["Weakly Related or Exclude"];

  for (const rule of rules) {
    if (rule.pattern && rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return getDefaultSecondaryName(primary);
}

function getSecondaryTaxonomy() {
  return {
    "Core Topic Research": [
      { name: "Directly Relevant Study", pattern: /(direct|core|main|target|直接|核心|主题|目标|主要)/ },
      { name: "Subtopic Extension", pattern: /(subtopic|extension|subgroup|子主题|扩展|分支|亚组)/ },
      { name: "Population and Setting", pattern: /(population|patient|setting|context|人群|患者|对象|场景|环境)/ },
      { name: "Problem Status", pattern: /(status|burden|prevalence|incidence|现状|负担|流行|患病率|发生率)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Background Theory and Concepts": [
      { name: "Theory Framework", pattern: /(theory|framework|model|理论|框架|模型)/ },
      { name: "Concept Definition", pattern: /(concept|definition|terminology|概念|定义|术语)/ },
      { name: "Development Trend", pattern: /(trend|progress|development|趋势|进展|发展)/ },
      { name: "Narrative Review", pattern: /(narrative|overview|background|叙述|背景综述|一般综述)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Methods Models and Tools": [
      { name: "Model Validation", pattern: /(validation|calibration|验证|校准|外部验证)/ },
      { name: "Research Method", pattern: /(method|methodology|design|statistical|方法|方法学|设计|统计)/ },
      { name: "Prediction Model", pattern: /(prediction|prognosis|riskmodel|预测|预后|风险模型)/ },
      { name: "Diagnosis and Screening", pattern: /(diagnosis|screening|诊断|筛查|筛检)/ },
      { name: "Algorithm Method", pattern: /(algorithm|machinelearning|deeplearning|ai|算法|机器学习|深度学习|人工智能)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Measurement Evaluation and Indicators": [
      { name: "Scale Development", pattern: /(development|develop|construction|开发|编制|构建)/ },
      { name: "Validity and Reliability", pattern: /(validity|reliability|validation|psychometric|信度|效度|验证)/ },
      { name: "Evaluation Indicator", pattern: /(indicator|index|evaluation|指标|评价体系|指标体系)/ },
      { name: "Measurement Method", pattern: /(measurement|questionnaire|instrument|测量|问卷|工具)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Intervention Application and Practice": [
      { name: "Randomized Controlled Trial", pattern: /(random|rct|randomizedcontrolled|randomisedcontrolled|随机|随机对照|对照试验)/ },
      { name: "Behavioral and Educational Intervention", pattern: /(education|training|behavior|behaviour|lifestyle|selfmanagement|nursing|rehabilitation|exercise|psychological|教育|培训|行为|自我管理|护理|康复|运动|心理)/ },
      { name: "Implementation Translation", pattern: /(implementation|translation|adherence|feasibility|实施|转化|推广|依从|可行性)/ },
      { name: "Effect Evaluation", pattern: /(effect|efficacy|effectiveness|evaluation|效果|疗效|评价)/ },
      { name: "Intervention Study", pattern: /(intervention|trial|treatment|practice|干预|试验|治疗|实践)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Mechanisms and Risk Factors": [
      { name: "Mechanism Study", pattern: /(mechanism|pathway|pathophysiology|机制|通路|病理生理)/ },
      { name: "Risk Factors", pattern: /(risk|riskfactor|determinant|风险|危险因素|影响因素)/ },
      { name: "Biomarker", pattern: /(biomarker|marker|标志物|生物标志)/ },
      { name: "Basic Experiment", pattern: /(basic|experiment|cell|animal|molecular|基础|实验|细胞|动物|分子)/ },
      { name: "Association Factors", pattern: /(association|correlation|factor|相关|关联|因素)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Evidence Synthesis and Review": [
      { name: "Meta-Analysis", pattern: /(metaanalysis|meta|荟萃|meta分析)/ },
      { name: "Scoping Review", pattern: /(scoping|范围综述)/ },
      { name: "Guideline and Consensus", pattern: /(guideline|consensus|recommendation|指南|共识|推荐)/ },
      { name: "Systematic Review", pattern: /(systematicreview|review|系统评价|系统综述|综述)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Data Resources and Systems": [
      { name: "Dataset Resource", pattern: /(dataset|database|resource|registry|数据库|数据集|资源|登记)/ },
      { name: "Software Platform", pattern: /(software|platform|system|app|软件|平台|系统|应用)/ },
      { name: "Decision Support", pattern: /(decisionsupport|cdss|辅助决策|决策支持)/ },
      { name: "Tool Development", pattern: /(tool|toolkit|development|工具|插件|开发)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Policy Ethics and Translation": [
      { name: "Policy Management", pattern: /(policy|management|governance|regulation|政策|管理|治理|监管)/ },
      { name: "Ethics and Privacy", pattern: /(ethic|privacy|security|fairness|伦理|隐私|安全|公平)/ },
      { name: "Health Economics", pattern: /(economic|cost|costeffectiveness|healtheconomics|经济|成本|费用|卫生经济)/ },
      { name: "Education and Training", pattern: /(education|training|curriculum|teaching|教育|培训|课程|教学)/ },
      { name: "Quality Improvement", pattern: /(qualityimprovement|qualitycontrol|workflow|质量改进|质量控制|流程)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Weakly Related or Exclude": [
      { name: "Weakly Related", pattern: /(weak|indirect|marginal|弱相关|间接|边缘)/ },
      { name: "Irrelevant", pattern: /(irrelevant|exclude|unrelated|不相关|无关|排除)/ },
      { name: "Uncertain", pattern: /(uncertain|other|unknown|不确定|待判定|其他)/ }
    ]
  };
}

function getDefaultSecondaryName(primary) {
  if (primary === "Weakly Related or Exclude") {
    return "Uncertain";
  }
  return "General Study";
}

function normalizeTaxonomyKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）_\-—,，.。:：;；/／|｜\\]/g, "");
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
