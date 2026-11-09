(() => {

    if (globalThis.aiAutofillerFillerLoaded) return;
    globalThis.aiAutofillerFillerLoaded = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

        if (request.type !== "FILL_FORM") return;

        try {
            const result = fillGoogleForms(request.answers || []);
            sendResponse({
                success: true,
                ...result
            });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message
            });
        }

    });

    function normalize(str) {
        return (str || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function simulateClick(element) {
        if (!element) return;
        
        // Dispatch mouse events in proper sequence for Google Forms closure components
        const mouseEvents = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
        for (const evtName of mouseEvents) {
            element.dispatchEvent(new MouseEvent(evtName, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        }

        // Native click as fallback
        if (typeof element.click === "function") {
            element.click();
        }

        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function fillGoogleForms(solvedQuestions) {
        const cards = Array.from(document.querySelectorAll(".Qr7Oae"));
        let filledCount = 0;
        const details = [];

        for (const item of solvedQuestions) {
            const { question: questionText, cardIndex, answer, type } = item;
            if (!answer || !Array.isArray(answer.selected_options) || answer.selected_options.length === 0) {
                continue;
            }

            // Target selected options normalized
            const targetOptions = answer.selected_options.map(opt => normalize(opt));

            // Find matching card: first check cardIndex, then fallback to matching question text
            let targetCard = null;
            if (typeof cardIndex === "number" && cards[cardIndex]) {
                const title = cards[cardIndex].querySelector(".M7eMe, [role='heading']")?.innerText?.trim() || "";
                if (!questionText || normalize(title) === normalize(questionText)) {
                    targetCard = cards[cardIndex];
                }
            }

            if (!targetCard && questionText) {
                targetCard = cards.find(card => {
                    const title = card.querySelector(".M7eMe, [role='heading']")?.innerText?.trim() || "";
                    return normalize(title) === normalize(questionText);
                });
            }

            if (!targetCard) {
                details.push({ question: questionText, status: "card_not_found" });
                continue;
            }

            // Find all choice elements inside this card
            const optionElements = Array.from(
                targetCard.querySelectorAll('[role="radio"], [role="checkbox"]')
            );

            let cardFilled = false;

            for (const el of optionElements) {
                const container = el.closest(".docssharedWizToggleLabeledContainer") ||
                                  el.closest(".SGIOEc") ||
                                  el.parentElement;

                let optText = el.getAttribute("aria-label") || "";
                if (!optText && container) {
                    const labelEl = container.querySelector(".aDTYNe, .M7eMe, .ulDsOb, span");
                    optText = labelEl?.innerText?.trim() || "";
                }
                if (!optText) {
                    optText = el.innerText?.trim() || "";
                }

                const normOptText = normalize(optText);
                const isChecked = el.getAttribute("aria-checked") === "true";
                const isTarget = targetOptions.some(t => t === normOptText || (t.length > 2 && normOptText.includes(t)));

                if (type === "multiple_choice" || el.getAttribute("role") === "radio") {
                    if (isTarget && !isChecked) {
                        simulateClick(el);
                        cardFilled = true;
                    }
                } else if (type === "checkbox" || el.getAttribute("role") === "checkbox") {
                    if (isTarget && !isChecked) {
                        simulateClick(el);
                        cardFilled = true;
                    } else if (!isTarget && isChecked) {
                        // Uncheck if previously selected but not chosen by AI
                        simulateClick(el);
                    }
                }
            }

            if (cardFilled) {
                filledCount++;
                details.push({ question: questionText, status: "filled", selected: answer.selected_options });
            } else {
                details.push({ question: questionText, status: "options_not_matched" });
            }
        }

        return {
            filledCount,
            total: solvedQuestions.length,
            details
        };
    }

})();

