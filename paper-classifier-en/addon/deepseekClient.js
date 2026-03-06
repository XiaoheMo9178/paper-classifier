/**
 * Call DeepSeek API and classify a paper by research theme.
 * @param {string} title
 * @param {string} abstract
 * @param {string} apiKey
 * @param {string} endpoint
 * @param {string} model
 * @returns {Promise<string>}
 */
async function classifyPaper(title, abstract, apiKey, endpoint, model) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("API Key is required");
  }
  if (!title || !title.trim()) {
    throw new Error("Paper title is required");
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
          content: "You are an expert in classifying research papers by research theme (not by discipline). Classify using study design, evidence type, objective, and core question. Typical themes include randomized controlled trial, systematic review, meta-analysis, theoretical research, scale development and validation, mechanism study, intervention study, etc., and you may create better-fit theme names when needed. Output only the classification with no explanation. Output format must be exactly: Primary Theme/Secondary Theme. If information is insufficient, output: Other/Uncertain."
        },
        {
          role: "user",
          content: "Paper title: " + title + "\n\nAbstract: " + (abstract || "")
        }
      ],
      // Reasoner may return empty final content with low output budget
      max_tokens: 128,
      temperature: 0.1,
      stream: false
    };
  };

  let parsed = await requestCompletion(url, trimmedApiKey, buildBody(requestedModel));
  let classification = extractClassification(parsed);

  // Compatibility fallback for deepseek-reasoner empty content
  if (!classification && requestedModel === "deepseek-reasoner") {
    if (typeof Zotero !== "undefined" && Zotero && typeof Zotero.debug === "function") {
      Zotero.debug("[PaperClassifier] deepseek-reasoner returned empty content, fallback to deepseek-chat");
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
    throw new Error("DeepSeek API response missing classification content (model=" + requestedModel + ", finish_reason=" + finishReason + ")");
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
          reject(new Error("Failed to parse DeepSeek API response: " + e.message));
        }
        return;
      }

      let errorMessage = xhr.statusText || "Request failed";
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

      reject(new Error("DeepSeek API request failed (status " + xhr.status + "): " + errorMessage));
    };

    xhr.onerror = function () {
      reject(new Error("DeepSeek API request failed (status 0): Network error"));
    };

    xhr.ontimeout = function () {
      reject(new Error("DeepSeek API request failed (status 0): Request timed out (30s)"));
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

  // Fallback: try to extract from reasoning_content
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

  // Clean think blocks, code blocks, and common prefixes
  normalized = normalized
    .replace(/<think>[\s\S]*?<\/think>/gi, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^(classification|category|topic)[:：]\s*/i, "")
    .trim();

  if (!normalized) {
    return "";
  }

  const slashMatch = normalized.match(/([^\s\/:;,.\n]+)\s*\/\s*([^\s\/:;,.\n]+)/);
  if (slashMatch) {
    return (slashMatch[1] + "/" + slashMatch[2]).trim();
  }

  const lines = normalized
    .split("\n")
    .map(function (line) {
      return line
        .trim()
        .replace(/^[-*•\d\.\)\(]+\s*/, "")
        .replace(/^(classification|category|topic)[:：]\s*/i, "")
        .replace(/[;,.]+$/, "")
        .trim();
    })
    .filter(Boolean);

  if (lines.length > 0) {
    return lines[0];
  }

  return "";
}
