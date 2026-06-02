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

function canonicalizeSecondaryName(primary, rawPrimary, rawSecondary) {
  const rawSecondaryName = normalizeSecondaryName(rawSecondary);
  const rawPrimaryName = normalizeName(rawPrimary);
  const lookupSource =
    normalizeTaxonomyKey(rawPrimaryName) && normalizeTaxonomyKey(rawPrimaryName) !== normalizeTaxonomyKey(primary)
      ? rawPrimaryName + " " + rawSecondaryName
      : rawSecondaryName;
  const key = normalizeTaxonomyKey(lookupSource);
  const taxonomy = getSecondaryTaxonomy();
  const rules = taxonomy[primary] || taxonomy["其他"];

  for (const rule of rules) {
    if (rule.pattern && rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return getDefaultSecondaryName(primary);
}

function getSecondaryTaxonomy() {
  return {
    "干预与试验研究": [
      { name: "随机对照试验", pattern: /(随机|rct|random|对照试验|随机对照)/ },
      { name: "临床试验方案", pattern: /(方案|protocol|注册|设计方案|试验设计)/ },
      { name: "行为教育干预", pattern: /(教育|培训|行为|生活方式|依从|自我管理|护理|康复训练|运动|心理|认知|behavior|education|training|lifestyle|selfmanagement)/ },
      { name: "实施与依从性", pattern: /(实施|推广|可行性|依从性|接受度|implementation|feasibility|adherence|acceptability)/ },
      { name: "非随机干预研究", pattern: /(准实验|非随机|前后对照|单组|quasi|nonrandom|beforeafter)/ },
      { name: "干预效果评价", pattern: /(干预|试验|实验|治疗|效果|疗效|临床试验|intervention|trial|experiment|effect|efficacy|effectiveness|treatment)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "观察性与流行病学研究": [
      { name: "队列研究", pattern: /(队列|随访|纵向|cohort|longitudinal|followup)/ },
      { name: "病例对照研究", pattern: /(病例对照|casecontrol|case-control)/ },
      { name: "横断面调查", pattern: /(横断面|问卷调查|调查|crosssectional|cross-sectional|survey)/ },
      { name: "患病率与发生率", pattern: /(患病率|发生率|流行率|发病率|prevalence|incidence)/ },
      { name: "真实世界研究", pattern: /(真实世界|登记|电子病历|数据库研究|realworld|registry|ehr|emr)/ },
      { name: "相关因素研究", pattern: /(相关|因素|危险因素|影响因素|关联|预测因素|riskfactor|association|correlat|determinant|factor)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "系统综述与证据综合": [
      { name: "Meta分析", pattern: /(meta|荟萃|meta分析|meta-analysis|metaanalysis)/ },
      { name: "范围综述", pattern: /(范围综述|scoping)/ },
      { name: "证据图谱", pattern: /(证据图谱|证据地图|evidencemap|evidencegap|mapping)/ },
      { name: "伞状综述", pattern: /(伞状|umbrella|overviewofreviews)/ },
      { name: "综述方法", pattern: /(方法|方法学|质量评价|偏倚|报告|method|quality|bias|prisma)/ },
      { name: "系统评价", pattern: /(系统评价|系统综述|综述|review|evidencesynthesis)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "方法学与理论框架": [
      { name: "质性研究", pattern: /(质性|访谈|扎根理论|主题分析|qualitative|interview|focusgroup|thematic)/ },
      { name: "理论模型", pattern: /(理论|模型|框架|概念|theory|model|framework|conceptual)/ },
      { name: "研究方案", pattern: /(方案|protocol|设计|计划|studyprotocol)/ },
      { name: "指南共识", pattern: /(指南|共识|推荐|guideline|consensus|recommendation)/ },
      { name: "报告规范", pattern: /(报告规范|报告标准|清单|reporting|checklist|statement)/ },
      { name: "方法学研究", pattern: /(方法学|方法|评价方法|统计方法|methodology|method|statistical)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "量表与测量工具": [
      { name: "量表开发", pattern: /(开发|编制|构建|development|develop|construction)/ },
      { name: "信效度验证", pattern: /(信度|效度|验证|validity|reliability|validation|psychometric)/ },
      { name: "问卷工具", pattern: /(问卷|调查表|questionnaire|surveyinstrument)/ },
      { name: "指标体系", pattern: /(指标|指标体系|评价体系|index|indicator)/ },
      { name: "测量方法比较", pattern: /(测量|比较|一致性|agreement|measurement|comparison)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "机制与基础研究": [
      { name: "分子机制", pattern: /(分子|基因|蛋白|表达|信号|molecular|gene|protein|expression)/ },
      { name: "细胞实验", pattern: /(细胞|体外|cell|invitro)/ },
      { name: "动物实验", pattern: /(动物|小鼠|大鼠|模型动物|animal|mouse|mice|rat)/ },
      { name: "病理生理", pattern: /(病理|生理|病理生理|pathology|pathophysiology|physiology)/ },
      { name: "生物标志物", pattern: /(标志物|生物标志|biomarker|marker)/ },
      { name: "作用通路", pattern: /(通路|途径|pathway|axis|mechanism)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "预测模型与诊断评估": [
      { name: "诊断准确性", pattern: /(诊断|准确性|敏感性|特异性|diagnos|accuracy|sensitivity|specificity)/ },
      { name: "筛查工具", pattern: /(筛查|筛检|screening|screen)/ },
      { name: "预后评估", pattern: /(预后|结局预测|生存|prognosis|survival|outcome)/ },
      { name: "风险评分", pattern: /(风险评分|评分|score|scoring|risk)/ },
      { name: "模型验证", pattern: /(验证|外部验证|校准|validation|calibration)/ },
      { name: "预测模型", pattern: /(预测|模型|机器学习|深度学习|算法|prediction|model|machinelearning|deeplearning|algorithm)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "应用系统与资源构建": [
      { name: "决策支持系统", pattern: /(决策支持|辅助决策|decision|support|cdss)/ },
      { name: "数据库与数据集", pattern: /(数据库|数据集|dataset|database|registry|cohortdata)/ },
      { name: "算法应用", pattern: /(算法|模型应用|ai|人工智能|机器学习|深度学习|algorithm|application)/ },
      { name: "资源构建", pattern: /(资源|语料库|知识库|图谱|resource|corpus|knowledgebase|ontology)/ },
      { name: "工具开发", pattern: /(工具|插件|开发|tool|toolkit|development)/ },
      { name: "软件平台", pattern: /(软件|平台|系统|app|应用|software|platform|system)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "政策伦理与实践转化": [
      { name: "健康经济学", pattern: /(经济|成本|费用|成本效果|卫生经济|economic|cost|costeffectiveness)/ },
      { name: "伦理隐私", pattern: /(伦理|隐私|安全|公平|ethic|privacy|security|fairness)/ },
      { name: "教育培训", pattern: /(教育|培训|课程|教学|education|training|curriculum|teaching)/ },
      { name: "质量改进", pattern: /(质量改进|质量控制|流程|quality|improvement|workflow)/ },
      { name: "实施转化", pattern: /(转化|实施|推广|落地|implementation|translation|adoption)/ },
      { name: "政策管理", pattern: /(政策|管理|治理|监管|policy|management|governance|regulation)/ },
      { name: "综合研究", pattern: /(综合|general|other)/ }
    ],
    "其他": [
      { name: "评论社论", pattern: /(评论|社论|观点|letter|editorial|comment|perspective|viewpoint)/ },
      { name: "背景综述", pattern: /(背景|叙述综述|一般综述|narrative|background|overview)/ },
      { name: "待判定", pattern: /(待判定|不确定|uncertain|other|其他)/ }
    ]
  };
}

function getDefaultSecondaryName(primary) {
  if (primary === "其他") {
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
