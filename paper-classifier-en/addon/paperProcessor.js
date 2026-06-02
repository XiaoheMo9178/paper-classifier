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

  // If no "primary/secondary" format is returned, route to "Other"
  return normalizeParsedClassification("Other", parts[0] || raw);
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
      name: "Evidence Synthesis",
      pattern: /(evidencesynthesis|systematicreview|meta-analysis|metaanalysis|scopingreview|review|综述|荟萃)/
    },
    {
      name: "Intervention and Trial Research",
      pattern: /(intervention|trial|rct|randomized|randomised|experiment|effectiveness|efficacy|clinicaltrial|干预|试验|实验)/
    },
    {
      name: "Observational and Epidemiology Research",
      pattern: /(observational|epidemiology|cohort|case-control|casecontrol|cross-sectional|crosssectional|survey|riskfactor|prevalence|incidence|观察|队列|横断面)/
    },
    {
      name: "Measurement and Instrument Development",
      pattern: /(measurement|instrument|scale|questionnaire|reliability|validity|psychometric|量表|问卷|信度|效度)/
    },
    {
      name: "Prediction and Diagnostic Evaluation",
      pattern: /(prediction|diagnosis|diagnostic|prognosis|screening|riskmodel|machinelearning|deeplearning|algorithm|预测|诊断|预后|筛查|机器学习)/
    },
    {
      name: "Mechanism and Basic Research",
      pattern: /(mechanism|basic|pathway|molecular|cell|animal|pathology|biomarker|机制|分子|细胞|动物|病理)/
    },
    {
      name: "Methodology and Theory",
      pattern: /(methodology|method|theory|framework|guideline|consensus|reportingstandard|方法|理论|框架|指南|共识)/
    },
    {
      name: "Application Systems and Resource Building",
      pattern: /(application|system|platform|software|engineering|implementation|deployment|dataset|database|resource|corpus|系统|平台|数据集|数据库|资源)/
    },
    {
      name: "Policy Ethics and Practice Translation",
      pattern: /(policy|ethics|economic|cost|qualityimprovement|practice|management|education|training|translation|政策|伦理|经济|实践|教育|培训)/
    },
    {
      name: "Other",
      pattern: /(other|uncertain|其他|待判定)/
    }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return name || "Other";
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
  const rules = taxonomy[primary] || taxonomy.Other;

  for (const rule of rules) {
    if (rule.pattern && rule.pattern.test(key)) {
      return rule.name;
    }
  }

  return getDefaultSecondaryName(primary);
}

function getSecondaryTaxonomy() {
  return {
    "Intervention and Trial Research": [
      { name: "Randomized Controlled Trial", pattern: /(random|rct|randomizedcontrolled|randomisedcontrolled|随机|随机对照)/ },
      { name: "Trial Protocol", pattern: /(protocol|registration|trialdesign|studyprotocol|方案|注册|设计方案)/ },
      { name: "Behavioral and Educational Intervention", pattern: /(education|training|behavior|behaviour|lifestyle|selfmanagement|nursing|rehabilitation|exercise|psychological|cognitive|教育|培训|行为|自我管理|护理|康复|运动|心理|认知)/ },
      { name: "Implementation and Adherence", pattern: /(implementation|feasibility|adherence|acceptability|uptake|实施|可行性|依从性|接受度)/ },
      { name: "Nonrandomized Intervention", pattern: /(quasi|nonrandom|beforeafter|singlearm|准实验|非随机|前后对照|单组)/ },
      { name: "Intervention Effect Evaluation", pattern: /(intervention|trial|experiment|effect|efficacy|effectiveness|treatment|干预|试验|实验|治疗|效果|疗效)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Observational and Epidemiology Research": [
      { name: "Cohort Study", pattern: /(cohort|longitudinal|followup|prospective|retrospective|队列|随访|纵向)/ },
      { name: "Case-Control Study", pattern: /(casecontrol|case-control|病例对照)/ },
      { name: "Cross-Sectional Survey", pattern: /(crosssectional|cross-sectional|survey|questionnairesurvey|横断面|调查|问卷调查)/ },
      { name: "Prevalence and Incidence", pattern: /(prevalence|incidence|morbidity|患病率|发生率|流行率|发病率)/ },
      { name: "Real-World Study", pattern: /(realworld|registry|ehr|emr|electronicmedical|真实世界|登记|电子病历)/ },
      { name: "Association and Risk Factors", pattern: /(riskfactor|association|correlat|determinant|factor|相关|因素|危险因素|影响因素|关联)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Evidence Synthesis": [
      { name: "Meta-Analysis", pattern: /(metaanalysis|meta|荟萃|meta分析)/ },
      { name: "Scoping Review", pattern: /(scoping|范围综述)/ },
      { name: "Evidence Map", pattern: /(evidencemap|evidencegap|mapping|证据图谱|证据地图)/ },
      { name: "Umbrella Review", pattern: /(umbrella|overviewofreviews|伞状)/ },
      { name: "Review Methodology", pattern: /(methodology|quality|bias|prisma|reporting|方法|质量评价|偏倚|报告)/ },
      { name: "Systematic Review", pattern: /(systematicreview|review|evidencesynthesis|系统评价|系统综述|综述)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Methodology and Theory": [
      { name: "Qualitative Study", pattern: /(qualitative|interview|focusgroup|thematic|groundedtheory|质性|访谈|扎根理论|主题分析)/ },
      { name: "Theory Model", pattern: /(theory|model|framework|conceptual|理论|模型|框架|概念)/ },
      { name: "Study Protocol", pattern: /(protocol|design|studyprotocol|方案|设计|计划)/ },
      { name: "Guideline and Consensus", pattern: /(guideline|consensus|recommendation|指南|共识|推荐)/ },
      { name: "Reporting Standard", pattern: /(reporting|checklist|statement|报告规范|报告标准|清单)/ },
      { name: "Methodology Study", pattern: /(methodology|method|statistical|方法学|方法|统计方法)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Measurement and Instrument Development": [
      { name: "Validity and Reliability", pattern: /(validity|reliability|validation|psychometric|信度|效度|验证)/ },
      { name: "Scale Development", pattern: /(development|develop|construction|开发|编制|构建)/ },
      { name: "Questionnaire Instrument", pattern: /(questionnaire|surveyinstrument|instrument|问卷|调查表|工具)/ },
      { name: "Indicator System", pattern: /(indicator|index|指标|指标体系|评价体系)/ },
      { name: "Measurement Method Comparison", pattern: /(measurement|comparison|agreement|测量|比较|一致性)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Mechanism and Basic Research": [
      { name: "Molecular Mechanism", pattern: /(molecular|gene|protein|expression|分子|基因|蛋白|表达|信号)/ },
      { name: "Cell Experiment", pattern: /(cell|invitro|细胞|体外)/ },
      { name: "Animal Experiment", pattern: /(animal|mouse|mice|rat|动物|小鼠|大鼠)/ },
      { name: "Pathophysiology", pattern: /(pathology|pathophysiology|physiology|病理|生理|病理生理)/ },
      { name: "Biomarker", pattern: /(biomarker|marker|标志物|生物标志)/ },
      { name: "Pathway Study", pattern: /(pathway|axis|mechanism|通路|途径|机制)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Prediction and Diagnostic Evaluation": [
      { name: "Diagnostic Accuracy", pattern: /(diagnos|accuracy|sensitivity|specificity|诊断|准确性|敏感性|特异性)/ },
      { name: "Screening Tool", pattern: /(screening|screen|筛查|筛检)/ },
      { name: "Prognostic Evaluation", pattern: /(prognosis|survival|outcome|预后|生存|结局预测)/ },
      { name: "Risk Score", pattern: /(riskscore|scoring|score|risk|风险评分|评分)/ },
      { name: "Model Validation", pattern: /(validation|calibration|验证|外部验证|校准)/ },
      { name: "Prediction Model", pattern: /(prediction|model|machinelearning|deeplearning|algorithm|预测|模型|机器学习|深度学习|算法)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Application Systems and Resource Building": [
      { name: "Decision Support System", pattern: /(decisionsupport|cdss|辅助决策|决策支持)/ },
      { name: "Database and Dataset", pattern: /(dataset|database|registry|cohortdata|数据库|数据集|登记)/ },
      { name: "Algorithm Application", pattern: /(algorithm|ai|artificialintelligence|machinelearning|deeplearning|application|算法|人工智能|机器学习|深度学习|应用)/ },
      { name: "Resource Building", pattern: /(resource|corpus|knowledgebase|ontology|资源|语料库|知识库|图谱)/ },
      { name: "Tool Development", pattern: /(tool|toolkit|development|工具|插件|开发)/ },
      { name: "Software Platform", pattern: /(software|platform|system|app|软件|平台|系统|应用)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    "Policy Ethics and Practice Translation": [
      { name: "Health Economics", pattern: /(economic|cost|costeffectiveness|healtheconomics|经济|成本|费用|卫生经济)/ },
      { name: "Ethics and Privacy", pattern: /(ethic|privacy|security|fairness|伦理|隐私|安全|公平)/ },
      { name: "Education and Training", pattern: /(education|training|curriculum|teaching|教育|培训|课程|教学)/ },
      { name: "Quality Improvement", pattern: /(qualityimprovement|qualitycontrol|workflow|质量改进|质量控制|流程)/ },
      { name: "Implementation Translation", pattern: /(implementation|translation|adoption|转化|实施|推广|落地)/ },
      { name: "Policy and Management", pattern: /(policy|management|governance|regulation|政策|管理|治理|监管)/ },
      { name: "General Study", pattern: /(general|other|综合)/ }
    ],
    Other: [
      { name: "Editorial and Commentary", pattern: /(editorial|comment|perspective|viewpoint|letter|评论|社论|观点)/ },
      { name: "Background Review", pattern: /(narrative|background|overview|背景|叙述综述|一般综述)/ },
      { name: "Uncertain", pattern: /(uncertain|other|unknown|不确定|待判定|其他)/ }
    ]
  };
}

function getDefaultSecondaryName(primary) {
  if (primary === "Other") {
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
