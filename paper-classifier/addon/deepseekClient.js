/**
 * 调用 DeepSeek API 对论文进行分类。
 * @param {string} title
 * @param {string} abstract
 * @param {string} apiKey
 * @param {string} endpoint
 * @param {string} model
 * @param {string} researchTopic
 * @returns {Promise<string>}
 */
var PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_ENDPOINT = "https://api.deepseek.com";
var PAPER_CLASSIFIER_DEEPSEEK_CHAT_PATH = "/chat/completions";
var PAPER_CLASSIFIER_DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
var PAPER_CLASSIFIER_DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";

async function classifyPaper(title, abstract, apiKey, endpoint, model, researchTopic) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("API Key 不能为空");
  }
  if (!title || !title.trim()) {
    throw new Error("论文标题不能为空");
  }
  if (!researchTopic || !researchTopic.trim()) {
    throw new Error("研究题目不能为空");
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
          content:
            "本次研究题目：" +
            researchTopic.trim() +
            "\n\n请判断以下论文在本次研究中的主题作用，只返回 JSON。\n\n论文标题：" +
            title +
            "\n\n摘要：" +
            (abstract || "")
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
    "你是面向具体研究项目的文献主题归档专家。用户会给出本次研究题目，你必须判断每篇论文相对该研究题目的作用，而不是只按论文自身疾病、样本、地区、数据集、药物剂量或作者创建分类。",
    "必须从下面受控分类表中选择一级主题和二级主题。一级和二级都只能使用表内名称，不能自由命名。",
    "核心主题研究：直接相关研究、子主题扩展、人群与场景、问题现状、综合研究。",
    "背景理论与概念：理论框架、概念定义、发展趋势、叙述综述、综合研究。",
    "方法模型与工具：研究方法、预测模型、诊断筛查、算法方法、模型验证、综合研究。",
    "测量评价与指标：量表开发、信效度验证、评价指标、测量方法、综合研究。",
    "干预应用与实践：干预研究、随机对照试验、行为教育干预、实施转化、效果评价、综合研究。",
    "机制基础与风险因素：机制研究、风险因素、生物标志物、基础实验、相关因素、综合研究。",
    "证据综合与综述：系统评价、Meta分析、范围综述、指南共识、综合研究。",
    "数据资源与系统：数据集资源、软件平台、决策支持、工具开发、综合研究。",
    "政策伦理与转化：政策管理、伦理隐私、健康经济、教育培训、质量改进、综合研究。",
    "弱相关或排除：弱相关、不相关、待判定。",
    "归并优先级：先判断论文与研究题目的关系，再判断它在该研究中的作用。若与题目直接相关，优先归入“核心主题研究”；若只是提供方法、量表、机制、证据综述或政策背景，则归入对应作用类别；明显无关则归入“弱相关或排除”。",
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
