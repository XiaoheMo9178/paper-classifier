/**
 * 调用 DeepSeek API 对论文进行分类。
 * @param {string} title
 * @param {string} abstract
 * @param {string} apiKey
 * @param {string} endpoint
 * @param {string} model
 * @returns {Promise<string>}
 */
async function classifyPaper(title, abstract, apiKey, endpoint, model) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("API Key 不能为空");
  }
  if (!title || !title.trim()) {
    throw new Error("论文标题不能为空");
  }

  const trimmedApiKey = apiKey.trim();
  const baseEndpoint = (endpoint || "https://api.deepseek.com").trim().replace(/\/+$/, "");
  const requestedModel = (model || "deepseek-chat").trim();
  const url = baseEndpoint + "/v1/chat/completions";

  const buildBody = function (targetModel) {
    return {
      model: targetModel,
      messages: [
        {
          role: "system",
          content: "你是一个学术论文研究主题分类专家。请基于论文标题与摘要进行“研究主题”归类，而不是学科归类。优先依据研究设计与证据类型、研究目标和核心问题进行分类，例如随机对照试验、系统评价、meta分析、理论研究、量表编制与验证、机制研究、干预研究等；如果需要可自定义更贴切的主题名称。只输出中文分类结果，不要解释，不要多余文本，输出格式固定为：一级主题/二级主题。若信息不足则输出：其他/待判定"
        },
        {
          role: "user",
          content: "论文标题：" + title + "\n\n摘要：" + (abstract || "")
        }
      ],
      // reasoner 模型在低 token 场景可能出现 content 为空，适当提高上限
      max_tokens: 128,
      temperature: 0.1,
      stream: false
    };
  };

  let parsed = await requestCompletion(url, trimmedApiKey, buildBody(requestedModel));
  let classification = extractClassification(parsed);

  // 兼容 deepseek-reasoner：若最终 content 为空，自动回退一次 deepseek-chat
  if (!classification && requestedModel === "deepseek-reasoner") {
    if (typeof Zotero !== "undefined" && Zotero && typeof Zotero.debug === "function") {
      Zotero.debug("[PaperClassifier] deepseek-reasoner 返回空内容，自动回退 deepseek-chat 重试");
    }
    parsed = await requestCompletion(url, trimmedApiKey, buildBody("deepseek-chat"));
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

  // reasoner 兜底：尝试从 reasoning_content 中提取 “一级/二级”
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
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^分类[:：]\s*/i, "")
    .trim();

  if (!normalized) {
    return "";
  }

  const slashMatch = normalized.match(/([^\s\/：:；;，,。！？!?\n]+)\s*\/\s*([^\s\/：:；;，,。！？!?\n]+)/);
  if (slashMatch) {
    return (slashMatch[1] + "/" + slashMatch[2]).trim();
  }

  const lines = normalized
    .split("\n")
    .map(function (line) {
      return line
        .trim()
        .replace(/^[-*•\d\.\)\(]+\s*/, "")
        .replace(/^分类[:：]\s*/i, "")
        .replace(/[。；;，,]+$/, "")
        .trim();
    })
    .filter(Boolean);

  if (lines.length > 0) {
    return lines[0];
  }

  return "";
}
