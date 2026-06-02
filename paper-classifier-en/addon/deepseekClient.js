/**
 * Call DeepSeek API and classify a paper by research theme.
 * @param {string} title
 * @param {string} abstract
 * @param {string} apiKey
 * @param {string} endpoint
 * @param {string} model
 * @returns {Promise<string>}
 */
var PAPER_CLASSIFIER_EN_DEEPSEEK_DEFAULT_ENDPOINT = "https://api.deepseek.com";
var PAPER_CLASSIFIER_EN_DEEPSEEK_CHAT_PATH = "/chat/completions";
var PAPER_CLASSIFIER_EN_DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
var PAPER_CLASSIFIER_EN_DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";

async function classifyPaper(title, abstract, apiKey, endpoint, model) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("API Key is required");
  }
  if (!title || !title.trim()) {
    throw new Error("Paper title is required");
  }

  const trimmedApiKey = apiKey.trim();
  const baseEndpoint = (endpoint || PAPER_CLASSIFIER_EN_DEEPSEEK_DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
  const requestedModel = normalizeDeepSeekModel(model);
  const url = baseEndpoint + PAPER_CLASSIFIER_EN_DEEPSEEK_CHAT_PATH;

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
          content: "Classify the following paper and return only JSON.\n\nPaper title: " + title + "\n\nAbstract: " + (abstract || "")
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

  // Retry once with the other V4 model if the short classification is empty.
  if (!classification) {
    const fallbackModel =
      requestedModel === PAPER_CLASSIFIER_EN_DEEPSEEK_PRO_MODEL
        ? PAPER_CLASSIFIER_EN_DEEPSEEK_DEFAULT_MODEL
        : PAPER_CLASSIFIER_EN_DEEPSEEK_PRO_MODEL;
    if (typeof Zotero !== "undefined" && Zotero && typeof Zotero.debug === "function") {
      Zotero.debug("[PaperClassifier] " + requestedModel + " returned empty classification, fallback to " + fallbackModel);
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
    throw new Error("DeepSeek API response missing classification content (model=" + requestedModel + ", finish_reason=" + finishReason + ")");
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
    return PAPER_CLASSIFIER_EN_DEEPSEEK_PRO_MODEL;
  }

  if (
    normalized === "deepseek-v4-flash" ||
    normalized === "deepseek-flash" ||
    normalized === "deepseek flash" ||
    normalized === "deepseek-chat" ||
    normalized === "deepseek-reasoner"
  ) {
    return PAPER_CLASSIFIER_EN_DEEPSEEK_DEFAULT_MODEL;
  }

  return PAPER_CLASSIFIER_EN_DEEPSEEK_DEFAULT_MODEL;
}

function buildFocusedTaxonomyPrompt() {
  return [
    "You are an academic paper taxonomy expert. Your goal is to compress a batch of papers into a small, stable set of folders. Do not create categories from disease names, samples, regions, datasets, dosages, author institutions, or overly specific research objects.",
    "You must choose both primary and secondary from the controlled taxonomy below. The secondary theme must be one of the listed labels. Do not invent free-form secondary labels.",
    "Intervention and Trial Research: Randomized Controlled Trial, Nonrandomized Intervention, Trial Protocol, Intervention Effect Evaluation, Behavioral and Educational Intervention, Implementation and Adherence, General Study.",
    "Observational and Epidemiology Research: Cohort Study, Case-Control Study, Cross-Sectional Survey, Association and Risk Factors, Prevalence and Incidence, Real-World Study, General Study.",
    "Evidence Synthesis: Systematic Review, Meta-Analysis, Scoping Review, Evidence Map, Umbrella Review, Review Methodology, General Study.",
    "Methodology and Theory: Theory Model, Methodology Study, Study Protocol, Guideline and Consensus, Reporting Standard, Qualitative Study, General Study.",
    "Measurement and Instrument Development: Scale Development, Validity and Reliability, Questionnaire Instrument, Indicator System, Measurement Method Comparison, General Study.",
    "Mechanism and Basic Research: Molecular Mechanism, Cell Experiment, Animal Experiment, Pathophysiology, Biomarker, Pathway Study, General Study.",
    "Prediction and Diagnostic Evaluation: Prediction Model, Diagnostic Accuracy, Screening Tool, Prognostic Evaluation, Risk Score, Model Validation, General Study.",
    "Application Systems and Resource Building: Software Platform, Decision Support System, Database and Dataset, Algorithm Application, Resource Building, Tool Development, General Study.",
    "Policy Ethics and Practice Translation: Policy and Management, Health Economics, Ethics and Privacy, Education and Training, Quality Improvement, Implementation Translation, General Study.",
    "Other: Uncertain, Editorial and Commentary, Background Review.",
    "Priority: classify by study design and evidence type first, then choose the nearest fixed secondary label. If the paper object is very specific but the study type is clear, still choose a fixed label, e.g. diabetes education RCT -> Intervention and Trial Research/Randomized Controlled Trial or Behavioral and Educational Intervention.",
    "Output strict JSON only, with no Markdown and no explanation. Format: {\"primary\":\"Primary Theme\",\"secondary\":\"Secondary Theme\"}."
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
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/^(classification|category|topic)[:：]\s*/i, "")
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
      const primary = getJSONText(parsed, ["primary", "primaryTheme", "Primary Theme", "category"]);
      const secondary = getJSONText(parsed, ["secondary", "secondaryTheme", "Secondary Theme", "topic"]);
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
    .replace(/^(classification|category|topic|primary|secondary)[:：]\s*/i, "")
    .replace(/[;,.]+$/, "")
    .trim();
}
