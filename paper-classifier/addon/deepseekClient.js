/**
 * 调用 DeepSeek API 对论文进行分类。
 * @param {string} title
 * @param {string} abstract
 * @param {string} apiKey
 * @param {string} endpoint
 * @param {string} model
 * @returns {Promise<string>}
 */
var PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_ENDPOINT = "https://api.deepseek.com";
var PAPER_CLASSIFIER_DEEPSEEK_CHAT_PATH = "/chat/completions";
var PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
var PAPER_CLASSIFIER_DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";

async function classifyPaper(title, abstract, apiKey, endpoint, model) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("API Key 不能为空");
  }
  if (!title || !title.trim()) {
    throw new Error("论文标题不能为空");
  }

  const trimmedApiKey = apiKey.trim();
  const baseEndpoint = (endpoint || PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
  const requestedModel = normalizeDeepSeekModel(model);
  const url = baseEndpoint + PAPER_CLASSIFIER_DEEPSEEK_CHAT_PATH;

  const buildBody = function (targetModel) {
    return {
      model: targetModel,
      messages: [
        {
          role: "system",
          content: buildFocusedTaxonomyPrompt()
        },
        {
          role: "user",
          content: "请分类以下论文，只返回 JSON。\n\n论文标题：" + title + "\n\n摘要：" + (abstract || "")
        }
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: 160,
      temperature: 0,
      stream: false
    };
  };

  let parsed = await requestCompletion(url, trimmedApiKey, buildBody(requestedModel));
  let classification = extractClassification(parsed);

  // 若短输出被截断或为空，换另一个 V4 模型兜底一次。
  if (!classification) {
    const fallbackModel =
      requestedModel === PAPER_CLASSIFIER_DEEPSEEK_PRO_MODEL
        ? PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_MODEL
        : PAPER_CLASSIFIER_DEEPSEEK_PRO_MODEL;
    if (typeof Zotero !== "undefined" && Zotero && typeof Zotero.debug === "function") {
      Zotero.debug("[PaperClassifier] " + requestedModel + " 返回空分类，自动回退 " + fallbackModel + " 重试");
    }
    parsed = await requestCompletion(url, trimmedApiKey, buildBody(fallbackModel));
    classification = extractClassification(parsed);
  }

  if (!classification) {
    const finishReason =
      parsed &&
      parsed.choices &&
      parsed.choices[0] &&
      parsed.choices[0].finish_reason
        ? parsed.choices[0].finish_reason
        : "unknown";
    throw new Error("DeepSeek API 返回结果缺少分类内容（model=" + requestedModel + ", finish_reason=" + finishReason + "）");
  }

  return classification;
}

function normalizeDeepSeekModel(model) {
  const raw = String(model || "").trim();
  const normalized = raw.toLowerCase();

  if (
    normalized === "deepseek-v4-pro" ||
    normalized === "deepseek-pro" ||
    normalized === "deepseek pro"
  ) {
    return PAPER_CLASSIFIER_DEEPSEEK_PRO_MODEL;
  }

  if (
    normalized === "deepseek-v4-flash" ||
    normalized === "deepseek-flash" ||
    normalized === "deepseek flash" ||
    normalized === "deepseek-chat" ||
    normalized === "deepseek-reasoner"
  ) {
    return PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_MODEL;
  }

  return PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_MODEL;
}

function buildFocusedTaxonomyPrompt() {
  return [
    "你是学术论文主题归档专家。目标是把一批论文压缩到少量稳定目录，不要按疾病、样本、地区、数据集、药物剂量、作者或具体研究对象创建新分类。",
    "必须从下面受控分类表中选择一级主题和二级主题。二级主题只能使用表内名称，不能自由命名。",
    "干预与试验研究：随机对照试验、非随机干预研究、临床试验方案、干预效果评价、行为教育干预、实施与依从性、综合研究。",
    "观察性与流行病学研究：队列研究、病例对照研究、横断面调查、相关因素研究、患病率与发生率、真实世界研究、综合研究。",
    "系统综述与证据综合：系统评价、Meta分析、范围综述、证据图谱、伞状综述、综述方法、综合研究。",
    "方法学与理论框架：理论模型、方法学研究、研究方案、指南共识、报告规范、质性研究、综合研究。",
    "量表与测量工具：量表开发、信效度验证、问卷工具、指标体系、测量方法比较、综合研究。",
    "机制与基础研究：分子机制、细胞实验、动物实验、病理生理、生物标志物、作用通路、综合研究。",
    "预测模型与诊断评估：预测模型、诊断准确性、筛查工具、预后评估、风险评分、模型验证、综合研究。",
    "应用系统与资源构建：软件平台、决策支持系统、数据库与数据集、算法应用、资源构建、工具开发、综合研究。",
    "政策伦理与实践转化：政策管理、健康经济学、伦理隐私、教育培训、质量改进、实施转化、综合研究。",
    "其他：待判定、评论社论、背景综述。",
    "归并优先级：先判断研究类型和证据类型，再选最接近的固定二级主题。若论文对象很具体但研究类型明确，仍选择固定二级主题，例如糖尿病教育RCT归入干预与试验研究/随机对照试验或行为教育干预。",
    "只输出严格 JSON，不要 Markdown，不要解释。格式：{\"primary\":\"一级主题\",\"secondary\":\"二级主题\"}。"
  ].join("\n");
}

function requestCompletion(url, apiKey, body) {
  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.timeout = 30000;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", "Bearer " + apiKey);

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch (e) {
          reject(new Error("DeepSeek API 响应解析失败：" + e.message));
        }
        return;
      }

      let errorMessage = xhr.statusText || "请求失败";
      try {
        const parsedError = JSON.parse(xhr.responseText || "{}");
        if (parsedError && parsedError.error) {
          if (typeof parsedError.error === "string") {
            errorMessage = parsedError.error;
          } else if (parsedError.error.message) {
            errorMessage = parsedError.error.message;
          }
        }
      } catch (e) {
        if (xhr.responseText) {
          errorMessage = xhr.responseText;
        }
      }

      reject(new Error("DeepSeek API 请求失败（状态码 " + xhr.status + "）：" + errorMessage));
    };

    xhr.onerror = function () {
      reject(new Error("DeepSeek API 请求失败（状态码 0）：网络错误"));
    };

    xhr.ontimeout = function () {
      reject(new Error("DeepSeek API 请求失败（状态码 0）：请求超时（30秒）"));
    };

    xhr.send(JSON.stringify(body));
  });
}

function extractClassification(parsed) {
  if (!parsed || !parsed.choices || !parsed.choices[0]) {
    return "";
  }

  const choice = parsed.choices[0];
  const message = choice.message || {};

  const directCandidates = [
    extractTextValue(message.content),
    extractTextValue(choice.text),
    extractTextValue(parsed.output_text),
    extractTextValue(parsed.response && parsed.response.output_text)
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeClassification(candidate);
    if (normalized) {
      return normalized;
    }
  }

  // 兜底：若服务端返回了 reasoning_content，也尝试从中提取分类。
  const reasoning = extractTextValue(message.reasoning_content);
  const reasoningNormalized = normalizeClassification(reasoning);
  if (reasoningNormalized) {
    return reasoningNormalized;
  }

  return "";
}

function extractTextValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = [];
    for (const part of value) {
      if (!part) {
        continue;
      }
      if (typeof part === "string") {
        parts.push(part);
        continue;
      }
      if (typeof part.text === "string") {
        parts.push(part.text);
      }
    }
    return parts.join("\n");
  }

  if (typeof value === "object" && typeof value.text === "string") {
    return value.text;
  }

  return String(value);
}

function normalizeClassification(text) {
  if (!text) {
    return "";
  }

  let normalized = String(text).replace(/\r/g, "\n");

  // 清理 think 块、代码块与常见前缀
  normalized = normalized
    .replace(/<think>[\s\S]*?<\/think>/gi, "\n")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/^分类[:：]\s*/i, "")
    .trim();

  if (!normalized) {
    return "";
  }

  const jsonClassification = extractJSONClassification(normalized);
  if (jsonClassification) {
    return jsonClassification;
  }

  const slashParts = normalized
    .split(/[\/／|｜\\]+/)
    .map(function (part) {
      return normalizeClassificationPart(part);
    })
    .filter(Boolean);
  if (slashParts.length >= 2) {
    return slashParts[0] + "/" + slashParts.slice(1).join("-");
  }

  const lines = normalized
    .split("\n")
    .map(function (line) {
      return normalizeClassificationPart(line);
    })
    .filter(Boolean);

  if (lines.length > 0) {
    return lines[0];
  }

  return "";
}

function extractJSONClassification(text) {
  const candidates = [text];
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch && objectMatch[0] !== text) {
    candidates.push(objectMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const primary = getJSONText(parsed, ["primary", "primaryTheme", "一级主题", "一级分类", "category"]);
      const secondary = getJSONText(parsed, ["secondary", "secondaryTheme", "二级主题", "二级分类", "topic"]);
      if (primary && secondary) {
        return normalizeClassificationPart(primary) + "/" + normalizeClassificationPart(secondary);
      }
    } catch (e) {}
  }

  return "";
}

function getJSONText(obj, keys) {
  if (!obj || typeof obj !== "object") {
    return "";
  }

  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return String(obj[key]);
    }
  }

  return "";
}

function normalizeClassificationPart(value) {
  return String(value || "")
    .trim()
    .replace(/^[-*•\d\.\)\(]+\s*/, "")
    .replace(/^(分类|主题|一级主题|二级主题|primary|secondary)[:：]\s*/i, "")
    .replace(/[。；;，,]+$/, "")
    .trim();
}
