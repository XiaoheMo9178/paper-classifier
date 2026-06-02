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
    "你是学术论文主题归档专家。目标是让一批论文聚合到少量稳定主题目录中，不要给每篇论文发明新的一级目录。",
    "一级主题必须优先从以下稳定主题池选择：干预与试验研究、观察性与流行病学研究、系统综述与证据综合、方法学与理论框架、量表与测量工具、机制与基础研究、预测模型与诊断评估、应用系统与资源构建、政策伦理与实践转化、其他。",
    "归并规则：RCT、随机对照、临床试验、干预效果归入“干预与试验研究”；系统评价、meta分析、荟萃分析、范围综述归入“系统综述与证据综合”；问卷、量表、信效度、测量工具归入“量表与测量工具”；预测、诊断、筛查、预后、风险模型归入“预测模型与诊断评估”。",
    "二级主题用于表达具体但可复用的研究对象、问题或方法。保持简短聚焦，避免样本量、年份、地区、数据集版本、作者机构、具体药物剂量等过窄信息；同义主题使用同一名称。",
    "只输出严格 JSON，不要 Markdown，不要解释。格式：{\"primary\":\"一级主题\",\"secondary\":\"二级主题\"}。信息不足时输出：{\"primary\":\"其他\",\"secondary\":\"待判定\"}。"
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
