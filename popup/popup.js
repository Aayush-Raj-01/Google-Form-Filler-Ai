
// Default Tracker Webhook (Linked Google Sheet)
const DEFAULT_TRACKER_WEBHOOK = "https://script.google.com/macros/s/AKfycbx2O-0g-r_0sOQbJchKJpu6Vx-pHU0jqTxIzRcMd-8nngLTE-3KVbg46rQRYDYpqeXXbg/exec";

// Processing engine presets configuration
const PROVIDER_PRESETS = {
    gemini: {
        name: "Google Cloud Engine",
        models: [
            { id: "gemini-1.5-flash", name: "Fast Engine (Recommended)" },
            { id: "gemini-2.0-flash", name: "High Speed Engine" },
            { id: "gemini-1.5-pro", name: "High Precision Engine" }
        ],
        defaultModel: "gemini-1.5-flash",
        placeholder: "AIzaSy...",
        hint: "Access key from Google Cloud Console"
    },
    openai: {
        name: "Standard Cloud Engine",
        models: [
            { id: "gpt-4o-mini", name: "Standard Fast Engine (Default)" },
            { id: "gpt-4o", name: "Deep Analysis Engine" }
        ],
        defaultModel: "gpt-4o-mini",
        placeholder: "sk-proj-...",
        hint: "Access key from account dashboard"
    },
    openrouter: {
        name: "Universal Cloud Router",
        models: [
            { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 Engine" },
            { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Engine" },
            { id: "deepseek/deepseek-chat", name: "DeepSeek Engine" }
        ],
        defaultModel: "meta-llama/llama-3.3-70b-instruct",
        placeholder: "sk-or-v1-...",
        hint: "Universal router access key"
    },
    omniroute: {
        name: "OmniRoute Service",
        defaultEndpoint: "https://api.omniroute.io/v1/chat/completions",
        models: [
            { id: "gpt-4o-mini", name: "Balanced Engine (Default)" },
            { id: "gemini-1.5-flash", name: "Fast Cloud Engine" },
            { id: "meta-llama/llama-3.1-8b-instruct", name: "Compact Engine" },
            { id: "deepseek-chat", name: "High Performance Engine" },
            { id: "claude-3-haiku", name: "Speed Engine" }
        ],
        defaultModel: "gpt-4o-mini",
        placeholder: "Enter service key",
        hint: "Multi-route connection proxy"
    },
    freellm: {
        name: "Cloud Proxy Service",
        defaultEndpoint: "https://api.freellm.net/v1/chat/completions",
        models: [
            { id: "gpt-4o-mini", name: "Default Engine" },
            { id: "gemini-1.5-flash", name: "Fast Engine" },
            { id: "llama-3-8b-instruct", name: "Compact Engine" },
            { id: "mistral-7b-instruct", name: "Standard Engine" }
        ],
        defaultModel: "gpt-4o-mini",
        placeholder: "Access token (leave blank if not required)",
        hint: "Public proxy service endpoint"
    },
    custom: {
        name: "Custom / Local Endpoint",
        defaultEndpoint: "",
        models: [
            { id: "gpt-4o-mini", name: "Standard Engine" },
            { id: "llama-3-8b-instruct", name: "Local Engine" }
        ],
        defaultModel: "gpt-4o-mini",
        placeholder: "Access token (optional)",
        hint: "Self-hosted server or private API endpoint"
    }
};

// State
let currentConfig = null;
let currentTabInfo = { url: "", title: "", userEmail: "" };
let scannedQuestions = [];
let solvedAnswers = [];

// DOM Elements
const mainView = document.getElementById("mainView");
const settingsView = document.getElementById("settingsView");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const backToMainBtn = document.getElementById("backToMainBtn");
const configWarningBanner = document.getElementById("configWarningBanner");
const openSettingsFromBanner = document.getElementById("openSettingsFromBanner");

const scanBtn = document.getElementById("scanBtn");
const solveBtn = document.getElementById("solveBtn");
const solveCountBadge = document.getElementById("solveCountBadge");
const statusDot = document.getElementById("statusDot");
const status = document.getElementById("status");
const summaryBar = document.getElementById("summaryBar");
const summaryTotal = document.getElementById("summaryTotal");
const summarySolve = document.getElementById("summarySolve");
const summarySkip = document.getElementById("summarySkip");
const summaryAccount = document.getElementById("summaryAccount");
const emptyState = document.getElementById("emptyState");
const results = document.getElementById("results");

// Settings elements
const providerSelect = document.getElementById("providerSelect");
const endpointGroup = document.getElementById("endpointGroup");
const endpointInput = document.getElementById("endpointInput");
const modelSelect = document.getElementById("modelSelect");
const modelInput = document.getElementById("modelInput");
const autoPickBtn = document.getElementById("autoPickBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const toggleApiKeyVisibility = document.getElementById("toggleApiKeyVisibility");
const providerHint = document.getElementById("providerHint");
const customEmailInput = document.getElementById("customEmailInput");
const testStatus = document.getElementById("testStatus");
const testConnectionBtn = document.getElementById("testConnectionBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    await loadSettings();
});

function setupEventListeners() {
    settingsToggleBtn.addEventListener("click", () => toggleView(true));
    backToMainBtn.addEventListener("click", () => toggleView(false));
    openSettingsFromBanner.addEventListener("click", () => toggleView(true));

    providerSelect.addEventListener("change", () => {
        const val = providerSelect.value;
        const needsEndpoint = ["custom", "omniroute", "freellm"].includes(val);
        toggleEndpointVisibility(needsEndpoint);

        const preset = PROVIDER_PRESETS[val];
        if (needsEndpoint && preset?.defaultEndpoint && !endpointInput.value) {
            endpointInput.value = preset.defaultEndpoint;
        }

        populateModelPresets(val);
    });

    modelSelect.addEventListener("change", () => {
        modelInput.value = modelSelect.value;
    });

    toggleApiKeyVisibility.addEventListener("click", () => {
        const isPassword = apiKeyInput.type === "password";
        apiKeyInput.type = isPassword ? "text" : "password";
    });

    autoPickBtn.addEventListener("click", handleAutoPickModel);
    saveSettingsBtn.addEventListener("click", handleSaveSettings);
    testConnectionBtn.addEventListener("click", handleTestConnection);

    scanBtn.addEventListener("click", handleScan);
    solveBtn.addEventListener("click", handleSolveAndAutofill);
}

function toggleEndpointVisibility(show) {
    if (show) {
        endpointGroup.classList.remove("hidden");
    } else {
        endpointGroup.classList.add("hidden");
    }
}

function toggleView(showSettings) {
    if (showSettings) {
        mainView.classList.add("hidden");
        settingsView.classList.remove("hidden");
        testStatus.className = "test-status hidden";
        testStatus.textContent = "";
    } else {
        settingsView.classList.add("hidden");
        mainView.classList.remove("hidden");
    }
}

function setBusyState(element, isBusy, text) {
    if (!element) return;
    element.disabled = isBusy;
    const spinner = element.querySelector(".btn-spinner");
    const label = element.querySelector(".btn-label");
    const icon = element.querySelector(".btn-icon-svg");
    if (spinner) {
        if (isBusy) spinner.classList.remove("hidden");
        else spinner.classList.add("hidden");
    }
    if (icon) {
        if (isBusy) icon.classList.add("hidden");
        else icon.classList.remove("hidden");
    }
    if (label && text) {
        label.textContent = text;
    }
}

function updateSummaryPill(el, text) {
    if (!el) return;
    const txtSpan = el.querySelector(".pill-text");
    if (txtSpan) txtSpan.textContent = text;
    else el.textContent = text;
}

function setStatus(text, type = "normal") {
    status.textContent = text;
    if (type === "busy") {
        statusDot.className = "status-dot busy";
    } else if (type === "error") {
        statusDot.className = "status-dot error";
    } else {
        statusDot.className = "status-dot";
    }
}

async function loadSettings() {
    try {
        const { aiConfig, customUserEmail } = await chrome.storage.local.get(["aiConfig", "customUserEmail"]);
        currentConfig = aiConfig || null;

        if (customEmailInput && customUserEmail) {
            customEmailInput.value = customUserEmail;
        }

        if (currentConfig?.provider && (currentConfig?.apiKey || currentConfig?.endpoint)) {
            providerSelect.value = currentConfig.provider;
            const needsEndpoint = ["custom", "omniroute", "freellm"].includes(currentConfig.provider);
            toggleEndpointVisibility(needsEndpoint);

            if (currentConfig.endpoint) {
                endpointInput.value = currentConfig.endpoint;
            } else if (PROVIDER_PRESETS[currentConfig.provider]?.defaultEndpoint) {
                endpointInput.value = PROVIDER_PRESETS[currentConfig.provider].defaultEndpoint;
            }

            populateModelPresets(currentConfig.provider, currentConfig.model);
            apiKeyInput.value = currentConfig.apiKey || "";
            modelInput.value = currentConfig.model || "";

            configWarningBanner.classList.add("hidden");
        } else {
            providerSelect.value = "gemini";
            toggleEndpointVisibility(false);
            populateModelPresets("gemini");
            configWarningBanner.classList.remove("hidden");
        }
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}

function populateModelPresets(providerKey, selectedModelId = null) {
    const preset = PROVIDER_PRESETS[providerKey] || PROVIDER_PRESETS.gemini;
    modelSelect.innerHTML = "";

    preset.models.forEach(model => {
        const opt = document.createElement("option");
        opt.value = model.id;
        opt.textContent = model.name;
        modelSelect.appendChild(opt);
    });

    const chosenModel = selectedModelId || preset.defaultModel;
    modelSelect.value = chosenModel;
    modelInput.value = chosenModel;
    apiKeyInput.placeholder = preset.placeholder;
    providerHint.textContent = preset.hint;
}

// ---------------- AUTO-PICK WORKING MODEL ----------------

async function handleAutoPickModel() {
    const provider = providerSelect.value;
    const apiKey = apiKeyInput.value.trim();
    let endpoint = endpointInput.value.trim();

    if (["custom", "omniroute", "freellm"].includes(provider) && !endpoint) {
        endpoint = PROVIDER_PRESETS[provider]?.defaultEndpoint || "";
        endpointInput.value = endpoint;
    }

    autoPickBtn.disabled = true;
    autoPickBtn.textContent = "Detecting...";
    showTestStatus("Connecting to endpoint to detect active engines...", "");

    try {
        const response = await chrome.runtime.sendMessage({
            type: "AUTOPICK_MODEL",
            config: {
                provider,
                apiKey,
                endpoint: endpoint || undefined,
                model: modelInput.value.trim() || "gpt-4o-mini"
            }
        });

        if (!response?.success) {
            throw new Error(response?.error || "Engine auto-detection failed.");
        }

        const workingModel = response.workingModel;
        const availableModels = response.availableModels || [];

        if (availableModels.length > 0) {
            modelSelect.innerHTML = "";
            availableModels.forEach(mId => {
                const opt = document.createElement("option");
                opt.value = mId;
                opt.textContent = mId;
                modelSelect.appendChild(opt);
            });
            modelSelect.value = workingModel;
        }

        modelInput.value = workingModel;

        const statusMsg = response.unverified
            ? `Selected engine: "${workingModel}". Click Verify Connection to test.`
            : `Selected active engine: "${workingModel}"`;

        showTestStatus(statusMsg, "success");
    } catch (e) {
        showTestStatus(`Notice: ${e.message}`, "error");
    } finally {
        autoPickBtn.disabled = false;
        autoPickBtn.textContent = "Detect Engine";
    }
}

// ---------------- SAVE & TEST ----------------

async function handleSaveSettings() {
    const provider = providerSelect.value;
    const model = modelInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const endpoint = endpointInput.value.trim();

    const isCustomLike = ["custom", "omniroute", "freellm"].includes(provider);

    if (!isCustomLike && !apiKey) {
        showTestStatus("Please enter an access key.", "error");
        return;
    }

    if (provider === "custom" && !endpoint) {
        showTestStatus("Please enter a service endpoint URL.", "error");
        return;
    }

    if (!model) {
        showTestStatus("Please select or enter an engine model identifier.", "error");
        return;
    }

    const aiConfig = { provider, model, apiKey, endpoint };
    const customUserEmail = customEmailInput ? customEmailInput.value.trim().toLowerCase() : "";

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = "Saving...";

    try {
        await chrome.storage.local.set({ aiConfig, customUserEmail });
        currentConfig = aiConfig;
        configWarningBanner.classList.add("hidden");

        showTestStatus("Configuration saved successfully.", "success");
        setTimeout(() => {
            toggleView(false);
        }, 700);
    } catch (e) {
        showTestStatus(`Failed to save: ${e.message}`, "error");
    } finally {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = "Save Configuration";
    }
}

async function handleTestConnection() {
    const provider = providerSelect.value;
    const model = modelInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const endpoint = endpointInput.value.trim();

    const isCustomLike = ["custom", "omniroute", "freellm"].includes(provider);

    if (!isCustomLike && !apiKey) {
        showTestStatus("Please enter an access key to test.", "error");
        return;
    }

    if (provider === "custom" && !endpoint) {
        showTestStatus("Please enter a service endpoint URL to test.", "error");
        return;
    }

    if (!model) {
        showTestStatus("Please enter an engine model identifier to test.", "error");
        return;
    }

    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = "Verifying...";
    showTestStatus("Connecting to engine service...", "");

    try {
        const response = await chrome.runtime.sendMessage({
            type: "TEST_AI_CONNECTION",
            config: { provider, model, apiKey, endpoint }
        });

        if (!response?.success) {
            throw new Error(response?.error || "Connection test failed.");
        }

        showTestStatus(`Connection verified. Engine "${response.model}" active and ready.`, "success");
    } catch (e) {
        showTestStatus(`Test failed: ${e.message}`, "error");
    } finally {
        testConnectionBtn.disabled = false;
        testConnectionBtn.textContent = "Verify Connection";
    }
}

function showTestStatus(message, type) {
    testStatus.textContent = message;
    testStatus.className = `test-status ${type}`.trim();
}

// ---------------- SCAN FLOW ----------------

async function handleScan() {
    setBusyState(scanBtn, true, "Scanning...");
    solveBtn.classList.add("hidden");
    summaryBar.classList.add("hidden");
    results.replaceChildren();
    setStatus("Analyzing Google Form questions...", "busy");

    try {
        const scan = await chrome.runtime.sendMessage({
            type: "SCAN_ACTIVE_TAB"
        });

        if (!scan?.success) {
            throw new Error(scan?.error || "Scanning failed. Open a Google Form tab.");
        }

        scannedQuestions = scan.questions || [];

        // Check if custom override exists
        let activeEmail = scan.userEmail || "";
        try {
            const { customUserEmail } = await chrome.storage.local.get("customUserEmail");
            if (customUserEmail && customUserEmail.trim()) {
                activeEmail = customUserEmail.trim().toLowerCase();
            }
        } catch (_) {}

        currentTabInfo = {
            url: scan.formUrl || "",
            title: scan.formTitle || "",
            userEmail: activeEmail
        };

        if (scannedQuestions.length === 0) {
            if (emptyState) emptyState.classList.remove("hidden");
            setStatus("No questions detected on this page.");
            return;
        }

        if (emptyState) emptyState.classList.add("hidden");
        setStatus("Verifying question structure...", "busy");

        const classification = await chrome.runtime.sendMessage({
            type: "CLASSIFY_QUESTIONS",
            questions: scannedQuestions
        });

        if (!classification?.success) {
            throw new Error(classification?.error || "Classification failed");
        }

        const classified = classification.results;

        const solveItems = classified.filter(q => q.action === "solve");
        const skipItems = classified.filter(q => q.action === "skip");

        updateSummaryPill(summaryTotal, `${scannedQuestions.length} Total`);
        updateSummaryPill(summarySolve, `${solveItems.length} Ready`);
        updateSummaryPill(summarySkip, `${skipItems.length} Excluded`);

        if (activeEmail && summaryAccount) {
            updateSummaryPill(summaryAccount, activeEmail);
            summaryAccount.title = `Active Account: ${activeEmail}`;
            summaryAccount.classList.remove("hidden");
        } else if (summaryAccount) {
            summaryAccount.classList.add("hidden");
        }

        summaryBar.classList.remove("hidden");

        const accountNote = activeEmail ? ` • Account: ${activeEmail}` : "";
        setStatus(`${scannedQuestions.length} questions analyzed (${solveItems.length} ready)${accountNote}.`);

        if (solveItems.length > 0) {
            solveCountBadge.textContent = solveItems.length;
            solveBtn.classList.remove("hidden");
            const label = solveBtn.querySelector(".btn-label");
            if (label) label.textContent = `Solve & Autofill (${solveItems.length})`;
        }

        renderQuestionCards(classified);

    } catch (error) {
        console.error("Scan Error:", error);
        setStatus(`Error: ${error.message}`, "error");
    } finally {
        setBusyState(scanBtn, false, "Scan Form");
    }
}

function renderQuestionCards(classifiedList) {
    results.replaceChildren();

    classifiedList.forEach((q, idx) => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.id = `card-${q.id || idx}`;

        const cardTop = document.createElement("div");
        cardTop.className = "card-top";

        const title = document.createElement("span");
        title.className = "card-title";
        title.textContent = `${idx + 1}. ${q.question || "Diagram / Image Question"}`;

        const badge = document.createElement("span");
        badge.className = `action-badge ${q.action === "solve" ? "badge-solve" : "badge-skip"}`;
        badge.textContent = q.action === "solve" ? "READY" : "EXCLUDED";

        cardTop.append(title, badge);

        const meta = document.createElement("div");
        meta.className = "card-meta";
        const typeLabel = q.type === "multiple_choice" ? "Multiple Choice" :
                          q.type === "checkbox" ? "Checkbox" :
                          q.type === "short_answer" ? "Short Text" :
                          q.type === "paragraph" ? "Long Text" : q.type;
        meta.textContent = `${typeLabel} • ${q.options?.length || 0} options`;

        card.append(cardTop, meta);

        if (q.action === "skip") {
            const skipReason = document.createElement("div");
            skipReason.className = "skip-reason";
            skipReason.textContent = q.reason || q.detail || "Excluded by rule";
            card.appendChild(skipReason);
        }

        results.appendChild(card);
    });
}

// ---------------- SOLVE & AUTOFILL (ONE CLICK) ----------------

async function handleSolveAndAutofill() {
    const isCustomLike = ["custom", "omniroute", "freellm"].includes(currentConfig?.provider);
    if (!currentConfig || (!currentConfig.apiKey && !isCustomLike) || (currentConfig.provider === "custom" && !currentConfig.endpoint)) {
        alert("Please configure engine connection or access key in Settings first.");
        toggleView(true);
        return;
    }

    setBusyState(solveBtn, true, "Processing & Filling...");
    scanBtn.disabled = true;
    setStatus("Generating verified answers...", "busy");

    try {
        // Ensure tab info is populated
        if (!currentTabInfo.url) {
            try {
                const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                currentTabInfo.url = activeTab?.url || "";
                currentTabInfo.title = activeTab?.title || "";
            } catch (_) {}
        }

        // Step 1: Solve
        const response = await chrome.runtime.sendMessage({
            type: "PROCESS_QUESTIONS",
            questions: scannedQuestions,
            tabInfo: currentTabInfo
        });

        if (!response?.success) {
            throw new Error(response?.error || "Processing failed.");
        }

        solvedAnswers = response.solved || [];
        const skipped = response.skipped || [];

        displaySolvedAnswers(solvedAnswers, skipped);

        if (solvedAnswers.length === 0) {
            setStatus("No eligible questions could be answered.");
            return;
        }

        // Step 2: Immediate Autofill
        setStatus("Filling form answers...", "busy");

        const fillResult = await chrome.runtime.sendMessage({
            type: "AUTOFILL_FORM",
            answers: solvedAnswers
        });

        if (!fillResult?.success) {
            throw new Error(fillResult?.error || "Autofill failed");
        }

        setStatus(`Complete: Automatically filled ${fillResult.filledCount} of ${solvedAnswers.length} questions in Google Form.`);

        // Mark badges as COMPLETED
        solvedAnswers.forEach(item => {
            const card = document.getElementById(`card-${item.id}`);
            if (card) {
                const badge = card.querySelector(".action-badge");
                if (badge) {
                    badge.className = "action-badge badge-filled";
                    badge.textContent = "COMPLETED";
                }
            }
        });

        const label = solveBtn.querySelector(".btn-label");
        if (label) label.textContent = `Completed (${fillResult.filledCount} Filled)`;

    } catch (error) {
        console.error("Solve & Autofill Error:", error);
        setStatus(`Error: ${error.message}`, "error");
    } finally {
        setBusyState(solveBtn, false, null);
        scanBtn.disabled = false;
    }
}

function displaySolvedAnswers(solvedList, skippedList) {
    for (const item of solvedList) {
        const card = document.getElementById(`card-${item.id}`);
        if (!card) continue;

        const badge = card.querySelector(".action-badge");
        if (badge) {
            badge.className = "action-badge badge-filled";
            badge.textContent = "COMPLETED";
        }

        const oldBox = card.querySelector(".answer-box");
        if (oldBox) oldBox.remove();

        const answerBox = document.createElement("div");
        answerBox.className = "answer-box";

        const answerHeader = document.createElement("div");
        answerHeader.className = "answer-header";

        const label = document.createElement("span");
        label.className = "answer-label";
        label.textContent = "Selected Answer";

        const confidencePill = document.createElement("span");
        confidencePill.className = "confidence-pill";
        const confPercent = Math.round((item.answer?.confidence || 0.9) * 100);
        confidencePill.textContent = `${confPercent}% Match`;

        answerHeader.append(label, confidencePill);
        answerBox.appendChild(answerHeader);

        const optionsList = document.createElement("div");
        optionsList.className = "answer-options";

        const selectedOptions = item.answer?.selected_options || [];
        selectedOptions.forEach(optText => {
            const choice = document.createElement("div");
            choice.className = "answer-choice";
            choice.textContent = `✓ ${optText}`;
            optionsList.appendChild(choice);
        });
        answerBox.appendChild(optionsList);

        if (item.answer?.explanation) {
            const explanation = document.createElement("div");
            explanation.className = "answer-explanation";
            explanation.textContent = item.answer.explanation;
            answerBox.appendChild(explanation);
        }

        card.appendChild(answerBox);
    }

    for (const skip of skippedList) {
        if (skip.reason === "AI_ERROR" || skip.reason === "PROCESSING_ERROR") {
            const card = document.getElementById(`card-${skip.id}`);
            if (!card) continue;

            const errBox = document.createElement("div");
            errBox.className = "skip-reason";
            errBox.textContent = `Notice: ${skip.error || "Unable to solve question"}`;
            card.appendChild(errBox);
        }
    }
}
