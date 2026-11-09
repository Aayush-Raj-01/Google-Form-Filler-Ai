
import { classifyQuestion } from "./classifier.js";
import { solveQuestion, testAIConnection, autoPickWorkingModel } from "./ai.js";
import { logUsage, testWebhook, DEFAULT_TRACKER_WEBHOOK } from "./tracker.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.type === "SCAN_ACTIVE_TAB") {
        scanActiveTab()
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.type === "PROCESS_QUESTIONS") {
        processQuestions(request.questions, request.tabInfo)
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.type === "CLASSIFY_QUESTIONS") {
        if (!Array.isArray(request.questions)) {
            sendResponse({ success: false, error: "Invalid questions payload" });
            return;
        }

        const results = request.questions.map(question => ({
            id: question.id,
            cardIndex: question.cardIndex,
            question: question.question,
            type: question.type,
            options: question.options,
            ...classifyQuestion(question)
        }));

        sendResponse({ success: true, results });
        return;
    }

    if (request.type === "TEST_AI_CONNECTION") {
        testAIConnection(request.config)
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.type === "AUTOPICK_MODEL") {
        autoPickWorkingModel(request.config)
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.type === "AUTOFILL_FORM") {
        autofillActiveTab(request.answers)
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.type === "TEST_TRACKER_WEBHOOK") {
        testWebhook(request.webhookUrl)
            .then(sendResponse)
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

});

async function scanActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error("No active browser tab found.");

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/scanner.js"]
    });

    const scanResult = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_FORMS" });

    // Log form scan event to Google Sheet immediately (non-blocking)
    if (scanResult?.success) {
        logUsage({
            userEmail: scanResult.userEmail || "",
            formUrl:   tab.url || scanResult.formUrl || "",
            formTitle: tab.title || scanResult.formTitle || "",
            solved:    0,
            skipped:   0
        }).catch(() => {});
    }

    return scanResult;
}

async function autofillActiveTab(answers) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error("No active browser tab found.");

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/filler.js"]
    });

    return await chrome.tabs.sendMessage(tab.id, { type: "FILL_FORM", answers });
}

async function processQuestions(questions, tabInfo = {}) {
    if (!Array.isArray(questions)) throw new Error("Invalid questions data.");

    const solved  = [];
    const skipped = [];

    for (const question of questions) {
        const classification = classifyQuestion(question);

        if (classification.action === "skip") {
            skipped.push({
                id:       question.id,
                cardIndex: question.cardIndex,
                question: question.question,
                reason:   classification.category,
                detail:   classification.reason || "Skipped by rule"
            });
            continue;
        }

        try {
            const answer = await solveQuestion(question);
            solved.push({
                id:       question.id,
                cardIndex: question.cardIndex,
                question: question.question,
                type:     question.type,
                options:  question.options,
                answer
            });
        } catch (error) {
            console.error("Solve error:", question.question, error);
            skipped.push({
                id:       question.id,
                cardIndex: question.cardIndex,
                question: question.question,
                reason:   "PROCESSING_ERROR",
                error:    error.message
            });
        }
    }

    // Log usage to spreadsheet and wait for completion
    const { trackerConfig } = await chrome.storage.local.get("trackerConfig");
    const isEnabled = trackerConfig ? trackerConfig.enabled !== false : true;
    const webhookUrl = trackerConfig?.webhookUrl || DEFAULT_TRACKER_WEBHOOK;

    if (isEnabled && webhookUrl) {
        let finalUrl = tabInfo.url || "";
        let finalTitle = tabInfo.title || "";
        if (!finalUrl) {
            try {
                const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                finalUrl = activeTab?.url || "";
                finalTitle = activeTab?.title || "";
            } catch (_) {}
        }

        await logUsage({
            webhookUrl,
            userEmail:  tabInfo.userEmail || "",
            formUrl:    finalUrl,
            formTitle:  finalTitle,
            solved:     solved.length,
            skipped:    skipped.length
        }).catch(err => console.warn("Tracker error:", err));
    }

    return {
        success: true,
        total:   questions.length,
        solved,
        skipped
    };
}
