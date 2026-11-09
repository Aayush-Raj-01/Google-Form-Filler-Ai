
const PROVIDERS = {
    gemini: "https://generativelanguage.googleapis.com/v1beta/models/",
    openai: "https://api.openai.com/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    omniroute: "https://api.omniroute.io/v1/chat/completions",
    freellm: "https://api.freellm.net/v1/chat/completions"
};

export async function getAIConfig() {
    const { aiConfig } = await chrome.storage.local.get("aiConfig");

    if (!aiConfig?.provider || !aiConfig?.model) {
        throw new Error("AI provider is not configured. Please open Settings.");
    }

    const isCustomLike = ["custom", "omniroute", "freellm"].includes(aiConfig.provider);

    if (!isCustomLike && !aiConfig?.apiKey) {
        throw new Error("API key is missing. Please configure your API key in Settings.");
    }

    if (aiConfig.provider === "custom" && !aiConfig?.endpoint) {
        throw new Error("Custom endpoint URL is missing. Please configure it in Settings.");
    }

    return aiConfig;
}

function normalize(str) {
    return (str || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function resolveEndpoint(config) {
    let ep = (config.endpoint || "").trim();

    if (!ep) {
        ep = PROVIDERS[config.provider] || PROVIDERS.openai;
    }

    if (!ep.endsWith("/chat/completions")) {
        if (ep.endsWith("/")) {
            ep = ep + "chat/completions";
        } else if (ep.endsWith("/v1")) {
            ep = ep + "/chat/completions";
        } else {
            ep = ep.replace(/\/+$/, "") + "/chat/completions";
        }
    }
    return ep;
}

export function resolveBaseUrl(config) {
    const full = resolveEndpoint(config);
    return full.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
}

// Download an image and convert it to Base64 (or parse existing data URL)
async function getImageData(url) {
    try {
        if (!url) return null;

        if (url.startsWith("data:")) {
            const commaIndex = url.indexOf(",");
            if (commaIndex === -1) return null;
            const mimeMatch = url.slice(0, commaIndex).match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
            const data = url.slice(commaIndex + 1);
            return { mimeType, data };
        }

        const response = await fetch(url);
        if (!response.ok) return null;

        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return null;
        if (blob.size > 5 * 1024 * 1024) return null; // 5 MB limit

        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }

        return {
            mimeType: blob.type,
            data: btoa(binary)
        };
    } catch (e) {
        console.warn("Failed to fetch image for AI:", url, e);
        return null;
    }
}

function buildPromptHeader(question) {
    return `You are an accurate objective-question solving assistant.

Solve the following question using your knowledge, any attached images, and the supplied options.

QUESTION:
${question.question || "Refer to the attached question image."}

QUESTION TYPE:
${question.type}
`;
}

const PROMPT_RULES_AND_FORMAT = `
RULES:
1. Answer only objective knowledge questions.
2. For multiple_choice, select exactly one option.
3. For checkbox, select all applicable options.
4. Select options only from the supplied list. Return the exact "text" of the selected option(s).
5. Never invent or paraphrase an option.
6. If the question is ambiguous or you cannot determine the answer with high confidence, set "needs_review": true.
7. Provide a concise 1-2 sentence explanation.

Return strictly valid JSON only in this exact format:
{
    "selected_options": ["exact option text"],
    "confidence": 0.95,
    "explanation": "Brief explanation",
    "needs_review": false
}
`;

async function buildGeminiContentParts(question) {
    const parts = [
        { text: buildPromptHeader(question) }
    ];

    if (question.images && question.images.length > 0) {
        parts.push({ text: "\n[ATTACHED QUESTION IMAGE(S)]:\n" });
        for (let i = 0; i < question.images.length; i++) {
            const imgData = await getImageData(question.images[i].src);
            if (imgData) {
                parts.push({ text: `Question Image ${i + 1}:` });
                parts.push({
                    inlineData: {
                        mimeType: imgData.mimeType,
                        data: imgData.data
                    }
                });
            }
        }
    }

    parts.push({ text: "\nAVAILABLE OPTIONS:\n" });
    for (const opt of (question.options || [])) {
        const optText = normalize(opt.text) || `Option ${opt.index + 1}`;
        parts.push({ text: `Option ${opt.index + 1}: "${optText}"\n` });

        if (opt.images && opt.images.length > 0) {
            for (let j = 0; j < opt.images.length; j++) {
                const imgData = await getImageData(opt.images[j].src);
                if (imgData) {
                    parts.push({ text: `[Image for Option ${opt.index + 1}]:` });
                    parts.push({
                        inlineData: {
                            mimeType: imgData.mimeType,
                            data: imgData.data
                        }
                    });
                }
            }
        }
    }

    parts.push({ text: PROMPT_RULES_AND_FORMAT });
    return parts;
}

async function buildOpenAIContentParts(question) {
    const content = [
        { type: "text", text: buildPromptHeader(question) }
    ];

    if (question.images && question.images.length > 0) {
        content.push({ type: "text", text: "\n[ATTACHED QUESTION IMAGE(S)]:\n" });
        for (let i = 0; i < question.images.length; i++) {
            const imgData = await getImageData(question.images[i].src);
            if (imgData) {
                content.push({ type: "text", text: `Question Image ${i + 1}:` });
                content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:${imgData.mimeType};base64,${imgData.data}`,
                        detail: "high"
                    }
                });
            }
        }
    }

    content.push({ type: "text", text: "\nAVAILABLE OPTIONS:\n" });
    for (const opt of (question.options || [])) {
        const optText = normalize(opt.text) || `Option ${opt.index + 1}`;
        content.push({ type: "text", text: `Option ${opt.index + 1}: "${optText}"\n` });

        if (opt.images && opt.images.length > 0) {
            for (let j = 0; j < opt.images.length; j++) {
                const imgData = await getImageData(opt.images[j].src);
                if (imgData) {
                    content.push({ type: "text", text: `[Image for Option ${opt.index + 1}]:` });
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${imgData.mimeType};base64,${imgData.data}`,
                            detail: "high"
                        }
                    });
                }
            }
        }
    }

    content.push({ type: "text", text: PROMPT_RULES_AND_FORMAT });
    return content;
}

async function callOpenAICompatible(config, question) {
    const content = await buildOpenAIContentParts(question);
    const endpoint = resolveEndpoint(config);
    const headers = {
        "Content-Type": "application/json"
    };

    if (config.apiKey && config.apiKey.trim()) {
        headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
    }

    if (config.provider === "openrouter") {
        headers["HTTP-Referer"] = "https://ai-autofiller.extension";
        headers["X-Title"] = "AI AutoFiller";
    }

    const requestPayload = {
        model: config.model.trim(),
        messages: [{ role: "user", content }],
        temperature: 0.1
    };

    let response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            ...requestPayload,
            response_format: { type: "json_object" }
        })
    });

    let data;
    try {
        data = await response.json();
    } catch (err) {
        const text = await response.text().catch(() => "");
        throw new Error(`API returned invalid JSON: ${text || response.statusText}`);
    }

    // Auto-retry without response_format if not supported by custom provider / proxy
    if (!response.ok && response.status === 400 && data.error?.message?.toLowerCase().includes("response_format")) {
        console.warn("Retrying custom API without response_format...");
        response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(requestPayload)
        });
        data = await response.json();
    }

    if (!response.ok) {
        throw new Error(data.error?.message || `AI request failed with status ${response.status}`);
    }

    return data.choices?.[0]?.message?.content;
}

async function callGemini(config, question) {
    const parts = await buildGeminiContentParts(question);
    const modelName = encodeURIComponent(config.model.trim());
    const apiKey = encodeURIComponent(config.apiKey.trim());
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.apiKey.trim()
        },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || `Gemini request failed with status ${response.status}`);
    }

    return data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
}

function parseResponse(raw) {
    if (!raw) {
        throw new Error("AI returned an empty response.");
    }

    const cleaned = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1) {
        throw new Error("Invalid AI response: Expected JSON object.");
    }

    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
        throw new Error(`Failed to parse AI JSON response: ${e.message}`);
    }
}

function validateAnswer(answer, question) {
    if (!answer || !Array.isArray(answer.selected_options)) {
        throw new Error("AI response missing selected_options array.");
    }

    const availableOptions = (question.options || []).map(opt => ({
        original: opt.text || `Option ${opt.index + 1}`,
        normalized: normalize(opt.text || `Option ${opt.index + 1}`).toLowerCase(),
        index: opt.index
    }));

    const matchedOptions = [];

    for (const rawSelected of answer.selected_options) {
        const normSelected = normalize(String(rawSelected)).toLowerCase();

        // 1. Direct normalized match
        let match = availableOptions.find(opt => opt.normalized === normSelected);

        // 2. Prefix strip match
        if (!match) {
            const stripped = normSelected.replace(/^(option\s*\d+[:.]?|[a-z][\).:])\s*/i, "").trim();
            match = availableOptions.find(opt => opt.normalized === stripped);
        }

        // 3. Match by index
        if (!match) {
            const indexMatch = normSelected.match(/^(?:option\s*)?(\d+)$/i);
            if (indexMatch) {
                const targetIdx = parseInt(indexMatch[1], 10) - 1;
                match = availableOptions.find(opt => opt.index === targetIdx || opt.index === parseInt(indexMatch[1], 10));
            }
        }

        // 4. Substring inclusion
        if (!match && normSelected.length > 2) {
            match = availableOptions.find(opt => opt.normalized.includes(normSelected) || normSelected.includes(opt.normalized));
        }

        if (match) {
            if (!matchedOptions.includes(match.original)) {
                matchedOptions.push(match.original);
            }
        }
    }

    if (matchedOptions.length === 0 && (question.options || []).length > 0) {
        throw new Error(`AI selected "${answer.selected_options.join(", ")}" which does not match available options.`);
    }

    if (question.type === "multiple_choice" && matchedOptions.length > 1) {
        matchedOptions.length = 1;
    }

    return {
        selected_options: matchedOptions,
        confidence: Math.max(0, Math.min(1, Number(answer.confidence) || 0.9)),
        explanation: String(answer.explanation || "Selected based on objective question analysis."),
        needs_review: Boolean(answer.needs_review)
    };
}

export async function solveQuestion(question) {
    const config = await getAIConfig();

    let raw;
    if (["openai", "openrouter", "custom", "omniroute", "freellm"].includes(config.provider)) {
        raw = await callOpenAICompatible(config, question);
    } else if (config.provider === "gemini") {
        raw = await callGemini(config, question);
    } else {
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }

    const answer = parseResponse(raw);
    return validateAnswer(answer, question);
}

export async function testAIConnection(config) {
    if (!config?.provider || !config?.model) {
        throw new Error("Provider and Model are required.");
    }

    const testQuestion = {
        question: "What is 2 + 2?",
        type: "multiple_choice",
        options: [
            { index: 0, text: "3" },
            { index: 1, text: "4" },
            { index: 2, text: "5" }
        ],
        images: []
    };

    let raw;
    if (["openai", "openrouter", "custom", "omniroute", "freellm"].includes(config.provider)) {
        raw = await callOpenAICompatible(config, testQuestion);
    } else if (config.provider === "gemini") {
        raw = await callGemini(config, testQuestion);
    } else {
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }

    const answer = parseResponse(raw);
    const validated = validateAnswer(answer, testQuestion);
    return {
        success: true,
        model: config.model,
        testAnswer: validated.selected_options[0] || "4"
    };
}

// ---------------- MODEL AUTO-PICKING / AUTO-DETECTION ----------------

const POPULAR_CANDIDATES = [
    "gpt-4o-mini",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "meta-llama/llama-3.1-8b-instruct",
    "meta-llama/llama-3.3-70b-instruct",
    "llama-3-8b-instruct",
    "deepseek-chat",
    "deepseek/deepseek-chat",
    "mistralai/mistral-7b-instruct",
    "claude-3-haiku",
    "gpt-3.5-turbo"
];

// Query /models endpoint of an OpenAI-compatible API
async function fetchModelsFromEndpoint(config) {
    const baseUrl = resolveBaseUrl(config);
    const modelsUrl = baseUrl.replace(/\/+$/, "") + "/models";

    const headers = { "Content-Type": "application/json" };
    if (config.apiKey && config.apiKey.trim()) {
        headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
        const response = await fetch(modelsUrl, { headers, signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) return null;

        const data = await response.json();
        const rawList = Array.isArray(data) ? data : (data.data || data.models || []);

        const validModels = rawList
            .map(m => (typeof m === "string" ? m : m?.id))
            .filter(Boolean)
            // Filter out non-chat utilities (embeddings, audio, tts, moderation)
            .filter(id => !/(embed|tts|whisper|dall-e|moderation|bge|rerank)/i.test(id));

        return validModels.length > 0 ? validModels : null;
    } catch (e) {
        clearTimeout(timeout);
        return null;
    }
}

// Quick 1-question check to verify a model responds
async function pingModel(config, modelId) {
    const testConfig = { ...config, model: modelId };
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);

        const endpoint = resolveEndpoint(testConfig);
        const headers = { "Content-Type": "application/json" };
        if (testConfig.apiKey && testConfig.apiKey.trim()) {
            headers["Authorization"] = `Bearer ${testConfig.apiKey.trim()}`;
        }

        const res = await fetch(endpoint, {
            method: "POST",
            headers,
            signal: controller.signal,
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: "user", content: "What is 1+1? Answer with JSON: {\"selected_options\":[\"2\"]}" }],
                temperature: 0.1
            })
        });
        clearTimeout(timeout);

        if (res.ok) {
            const json = await res.json();
            return Boolean(json.choices?.[0]?.message?.content);
        }
        return false;
    } catch {
        return false;
    }
}

// Autopick the best working model for OmniRoute, FreeLLM, or Custom API
export async function autoPickWorkingModel(config) {
    // 1. First, attempt to discover available models from /models
    const fetchedModels = await fetchModelsFromEndpoint(config);

    let candidateList = [];

    if (fetchedModels && fetchedModels.length > 0) {
        // Sort fetched models based on preference
        const sorted = [...fetchedModels].sort((a, b) => {
            const scoreA = getModelPreferenceScore(a);
            const scoreB = getModelPreferenceScore(b);
            return scoreB - scoreA;
        });
        candidateList = sorted;
    } else {
        // Fallback candidate list based on provider
        if (config.provider === "omniroute") {
            candidateList = [
                "gpt-4o-mini",
                "gemini-1.5-flash",
                "meta-llama/llama-3.1-8b-instruct",
                "deepseek-chat",
                "claude-3-haiku",
                "gpt-3.5-turbo"
            ];
        } else if (config.provider === "freellm") {
            candidateList = [
                "gpt-4o-mini",
                "gemini-1.5-flash",
                "llama-3-8b-instruct",
                "mistral-7b-instruct",
                "gpt-3.5-turbo"
            ];
        } else {
            candidateList = POPULAR_CANDIDATES;
        }
    }

    // 2. Test the top candidates to find the first one that successfully responds
    const topToTest = candidateList.slice(0, 5);
    for (const candidate of topToTest) {
        const isAlive = await pingModel(config, candidate);
        if (isAlive) {
            return {
                success: true,
                workingModel: candidate,
                availableModels: candidateList
            };
        }
    }

    // If ping couldn't confirm (e.g. rate limit or strict timeout), return the highest ranked model
    const fallbackModel = candidateList[0] || "gpt-4o-mini";
    return {
        success: true,
        workingModel: fallbackModel,
        availableModels: candidateList,
        unverified: true
    };
}

function getModelPreferenceScore(modelId) {
    const lower = modelId.toLowerCase();
    if (lower.includes("gpt-4o-mini")) return 100;
    if (lower.includes("gemini-1.5-flash") || lower.includes("gemini-2.0-flash")) return 95;
    if (lower.includes("llama-3.3-70b") || lower.includes("llama-3.1-8b")) return 90;
    if (lower.includes("deepseek-chat") || lower.includes("deepseek-v3")) return 85;
    if (lower.includes("gpt-4o")) return 80;
    if (lower.includes("claude-3-haiku")) return 75;
    if (lower.includes("mistral")) return 70;
    if (lower.includes("gpt-3.5")) return 65;
    return 10;
}
