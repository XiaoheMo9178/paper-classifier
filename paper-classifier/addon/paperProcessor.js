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
 * 顺序批量处理条目，避免并发导致限流。
 * @param {Array<Object>} items Zotero Item 数组
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

  // 未按“一级/二级”返回时，挂到固定兜底目录，避免新建自由分类。
  return normalizeParsedClassification("弱相关或排除", parts[0] || raw);
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
      name: "核心主题研究",
      pattern: /(核心|直接相关|相关研究|主题研究|子主题|人群|场景|问题现状|core|direct|relevant|topic|population|setting|status)/
    },
    {
      name: "背景理论与概念",
      pattern: /(背景|理论|概念|定义|趋势|叙述综述|background|theory|concept|definition|trend|narrative)/
    },
    {
      name: "方法模型与工具",
      pattern: /(方法|模型|预测|诊断|筛查|算法|验证|method|model|prediction|diagnosis|screen|algorithm|validation)/
    },
    {
      name: "测量评价与指标",
      pattern: /(测量|评价|指标|量表|问卷|信度|效度|measurement|evaluation|indicator|scale|questionnaire|validity|reliability)/
    },
    {
      name: "干预应用与实践",
      pattern: /(干预|应用|实践|随机|rct|试验|实施|效果|教育|intervention|application|practice|trial|implementation|effect|education)/
    },
    {
      name: "机制基础与风险因素",
      pattern: /(机制|基础|风险|因素|标志物|实验|相关因素|mechanism|basic|risk|factor|biomarker|experiment|association)/
    },
    {
      name: "证据综合与综述",
      pattern: /(证据|综述|系统评价|meta|范围综述|指南|共识|evidence|review|metaanalysis|meta-analysis|scoping|guideline|consensus)/
    },
    {
      name: "数据资源与系统",
      pattern: /(数据|资源|系统|平台|软件|决策支持|工具|dataset|database|resource|system|platform|software|decision|tool)/
    },
    {
      name: "政策伦理与转化",
      pattern: /(政策|伦理|隐私|经济|培训|质量改进|转化|policy|ethics|privacy|economic|training|quality|translation)/
    },
    {
      name: "弱相关或排除",
      pattern: /(弱相关|不相关|排除|待判定|uncertain|exclude|irrelevant|weak|other)/
    }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return "弱相关或排除";
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

function canonicalizeSecondaryName(primary, rawPrimary, rawSecondary) {
  const rawSecondaryName = normalizeSecondaryName(rawSecondary);
  const rawPrimaryName = normalizeName(rawPrimary);
  const lookupSource =
    normalizeTaxonomyKey(rawPrimaryName) && normalizeTaxonomyKey(rawPrimaryName) !== normalizeTaxonomyKey(primary)
      ? rawPrimaryName + " " + rawSecondaryName
      : rawSecondaryName;
  const key = normalizeTaxonomyKey(lookupSource);
  const taxonomy = getSecondaryTaxonomy();
  const rules = taxonomy[primary] || taxonomy["弱相关或排除"];

  for (const rule of rules) {
    if (rule.pattern && rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return getDefaultSecondaryName(primary);
}

function getSecondaryTaxonomy() {
  return {
    "核心主题研究": [
      { name: "直接相关研究", pattern: /(直接|核心|主题|目标|主要|direct|core|main|target)/ },
      { name: "子主题扩展", pattern: /(子主题|扩展|分支|亚组|subtopic|extension|subgroup)/ },
      { name: "人群与场景", pattern: /(人群|患者|对象|场景|环境|population|patient|setting|context)/ },
      { name: "问题现状", pattern: /(现状|负担|流行|患病率|发生率|status|burden|prevalence|incidence)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "背景理论与概念": [
      { name: "理论框架", pattern: /(理论|框架|模型|theory|framework|model)/ },
      { name: "概念定义", pattern: /(概念|定义|术语|concept|definition|terminology)/ },
      { name: "发展趋势", pattern: /(趋势|进展|发展|trend|progress|development)/ },
      { name: "叙述综述", pattern: /(叙述|背景综述|一般综述|narrative|overview|background)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "方法模型与工具": [
      { name: "模型验证", pattern: /(验证|校准|外部验证|validation|calibration)/ },
      { name: "研究方法", pattern: /(方法|方法学|设计|统计|method|methodology|design|statistical)/ },
      { name: "预测模型", pattern: /(预测|预后|风险模型|prediction|prognosis|riskmodel)/ },
      { name: "诊断筛查", pattern: /(诊断|筛查|筛检|diagnosis|screening)/ },
      { name: "算法方法", pattern: /(算法|机器学习|深度学习|人工智能|algorithm|machinelearning|deeplearning|ai)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "测量评价与指标": [
      { name: "量表开发", pattern: /(开发|编制|构建|量表开发|development|develop|construction)/ },
      { name: "信效度验证", pattern: /(信度|效度|验证|validity|reliability|validation|psychometric)/ },
      { name: "评价指标", pattern: /(指标|评价体系|指标体系|indicator|index)/ },
      { name: "测量方法", pattern: /(测量|问卷|工具|measurement|questionnaire|instrument)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "干预应用与实践": [
      { name: "随机对照试验", pattern: /(随机|rct|random|随机对照|对照试验)/ },
      { name: "行为教育干预", pattern: /(教育|培训|行为|生活方式|自我管理|护理|康复|运动|心理|education|training|behavior|lifestyle|selfmanagement|rehabilitation)/ },
      { name: "实施转化", pattern: /(实施|转化|推广|依从|可行性|implementation|translation|adherence|feasibility)/ },
      { name: "效果评价", pattern: /(效果|疗效|评价|effect|efficacy|effectiveness|evaluation)/ },
      { name: "干预研究", pattern: /(干预|试验|治疗|实践|intervention|trial|treatment|practice)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "机制基础与风险因素": [
      { name: "机制研究", pattern: /(机制|通路|病理生理|mechanism|pathway|pathophysiology)/ },
      { name: "风险因素", pattern: /(风险|危险因素|影响因素|risk|riskfactor|determinant)/ },
      { name: "生物标志物", pattern: /(标志物|生物标志|biomarker|marker)/ },
      { name: "基础实验", pattern: /(基础|实验|细胞|动物|分子|basic|experiment|cell|animal|molecular)/ },
      { name: "相关因素", pattern: /(相关|关联|因素|association|correlation|factor)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "证据综合与综述": [
      { name: "Meta分析", pattern: /(meta|荟萃|meta分析|meta-analysis|metaanalysis)/ },
      { name: "范围综述", pattern: /(范围综述|scoping)/ },
      { name: "指南共识", pattern: /(指南|共识|推荐|guideline|consensus|recommendation)/ },
      { name: "系统评价", pattern: /(系统评价|系统综述|systematicreview|review)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "数据资源与系统": [
      { name: "数据集资源", pattern: /(数据集|数据库|资源|dataset|database|resource|registry)/ },
      { name: "软件平台", pattern: /(软件|平台|系统|app|software|platform|system)/ },
      { name: "决策支持系统", pattern: /(决策支持|辅助决策|decision|support|cdss)/ },
      { name: "工具开发", pattern: /(工具|插件|开发|tool|toolkit|development)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "政策伦理与转化": [
      { name: "政策管理", pattern: /(政策|管理|治理|监管|policy|management|governance|regulation)/ },
      { name: "伦理隐私", pattern: /(伦理|隐私|安全|公平|ethic|privacy|security|fairness)/ },
      { name: "健康经济学", pattern: /(经济|成本|费用|成本效果|卫生经济|economic|cost|costeffectiveness)/ },
      { name: "教育培训", pattern: /(教育|培训|课程|教学|education|training|curriculum|teaching)/ },
      { name: "质量改进", pattern: /(质量改进|质量控制|流程|quality|improvement|workflow)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "弱相关或排除": [
      { name: "弱相关", pattern: /(弱相关|间接|边缘|weak|indirect|marginal)/ },
      { name: "不相关", pattern: /(不相关|无关|排除|irrelevant|exclude|unrelated)/ },
      { name: "待判定", pattern: /(待判定|不确定|uncertain|unknown|other|其他)/ }
    ]
  };
}

function getDefaultSecondaryName(primary) {
  if (primary === "弱相关或排除") {
    return "待判定";
  }
  return "综合研究";
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
