(() => {

    if (globalThis.aiAutofillerScannerLoaded) return;
    globalThis.aiAutofillerScannerLoaded = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

        if (request.type !== "SCAN_FORMS") return;

        try {
            const questions = scanGoogleForms();
            const userEmail = detectFormUserEmail();

            sendResponse({
                success: true,
                count: questions.length,
                questions,
                userEmail,
                formTitle: document.title || "",
                formUrl: window.location.href
            });

        } catch (error) {
            sendResponse({
                success: false,
                error: error.message
            });
        }

    });

    function scanGoogleForms() {
        // Select Google Forms question cards
        const cards = document.querySelectorAll(".Qr7Oae");
        const questions = [];

        cards.forEach((card, index) => {
            const question = extractQuestion(card, index);
            if (question) {
                questions.push(question);
            }
        });

        return questions;
    }

    function extractQuestion(card, cardIndex) {
        // Find question title
        const titleElement = card.querySelector(".M7eMe, [role='heading']");
        const questionText = titleElement?.innerText?.trim() || "";

        // Find answer options (radio or checkbox)
        const optionElements = Array.from(card.querySelectorAll('[role="radio"], [role="checkbox"]'));

        const options = optionElements.map((element, index) => {
            // Find option container (wrapper label/row)
            const optionContainer = element.closest(".docssharedWizToggleLabeledContainer") ||
                                    element.closest(".SGIOEc") ||
                                    element.parentElement;

            let text = element.getAttribute("aria-label") || "";
            if (!text && optionContainer) {
                const labelElement = optionContainer.querySelector(".aDTYNe, .M7eMe, .ulDsOb, span");
                text = labelElement?.innerText?.trim() || "";
            }
            if (!text) {
                text = element.innerText?.trim() || "";
            }

            // Extract images specific to this option
            const optionImages = optionContainer ? extractImages(optionContainer) : extractImages(element);

            return {
                index,
                type: element.getAttribute("role") || "radio",
                text: text.replace(/\u00a0/g, " ").trim(),
                selected: element.getAttribute("aria-checked") === "true",
                images: optionImages
            };
        });

        // Question-level images: images inside the card that are NOT part of any option
        const cardImages = extractImages(card);
        const optionImageSrcs = new Set(options.flatMap(opt => opt.images.map(img => img.src)));
        const questionImages = cardImages.filter(img => !optionImageSrcs.has(img.src));

        // Detect question type
        let type = "unknown";
        if (options.length > 0) {
            type = options[0].type === "radio" ? "multiple_choice" : "checkbox";
        } else if (card.querySelector("textarea")) {
            type = "paragraph";
        } else if (card.querySelector('input[type="text"]')) {
            type = "short_answer";
        }

        // Ignore cards that aren't questions (e.g. section headers without inputs)
        if (!questionText && questionImages.length === 0 && options.length === 0) {
            return null;
        }

        return {
            id: crypto.randomUUID(),
            cardIndex,
            question: questionText || (questionImages.length > 0 ? "Image-based Question" : ""),
            type,
            images: questionImages,
            options
        };
    }

    function extractImages(container) {
        if (!container) return [];
        return Array.from(container.querySelectorAll("img"))
            .map(img => {
                let src = img.currentSrc || img.src;

                // If image is a blob URL, convert to data URL directly in page context
                if (src && src.startsWith("blob:")) {
                    const dataUrl = convertBlobImageToDataUrl(img);
                    if (dataUrl) src = dataUrl;
                }

                return {
                    src,
                    alt: img.alt || "",
                    width: img.naturalWidth || img.width || 0,
                    height: img.naturalHeight || img.height || 0
                };
            })
            // Filter out empty sources, tiny UI icons (<20px) or SVGs
            .filter(img => {
                if (!img.src || img.src.startsWith("data:image/svg")) return false;
                if (img.width > 0 && img.width < 20 && img.height > 0 && img.height < 20) return false;
                return true;
            });
    }

    function convertBlobImageToDataUrl(img) {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || img.width || 300;
            canvas.height = img.naturalHeight || img.height || 200;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL("image/png");
        } catch (e) {
            return null;
        }
    }

    function detectFormUserEmail() {
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

        // 1. Google Form's explicit "Switch account" container
        // Google Forms puts the respondent email directly adjacent to "Switch account"
        const switchElements = Array.from(document.querySelectorAll("a, button, [role='button'], span, div"))
            .filter(el => {
                const t = (el.innerText || el.textContent || "").trim().toLowerCase();
                return t === "switch account" || t === "switch accounts";
            });

        for (const el of switchElements) {
            const parent = el.parentElement;
            if (parent) {
                const m = (parent.innerText || parent.textContent || "").match(emailRegex);
                if (m) return m[0].toLowerCase().trim();
            }
            const prev = el.previousElementSibling;
            if (prev) {
                const m = (prev.innerText || prev.textContent || "").match(emailRegex);
                if (m) return m[0].toLowerCase().trim();
            }
            const grand = parent?.parentElement;
            if (grand && (grand.innerText || "").length < 250) {
                const m = (grand.innerText || "").match(emailRegex);
                if (m) return m[0].toLowerCase().trim();
            }
        }

        // Check links with AccountChooser or accounts.google.com
        const accountLinks = document.querySelectorAll('a[href*="AccountChooser"], a[href*="accounts.google.com/AddSession"]');
        for (const link of accountLinks) {
            const parent = link.parentElement;
            if (parent && (parent.innerText || "").length < 250) {
                const m = (parent.innerText || "").match(emailRegex);
                if (m) return m[0].toLowerCase().trim();
            }
            const prev = link.previousElementSibling;
            if (prev) {
                const m = (prev.innerText || "").match(emailRegex);
                if (m) return m[0].toLowerCase().trim();
            }
        }

        // 2. Google Account profile avatar chip (aria-label / title)
        // Format: aria-label="Google Account: First Last\n(student@gmail.com)"
        const profileChips = document.querySelectorAll(
            '[aria-label*="Google Account" i], [aria-label*="Google account" i], [title*="Google Account" i], [title*="Google account" i], img[alt*="Google Account" i]'
        );
        for (const chip of profileChips) {
            const text = chip.getAttribute("aria-label") || chip.getAttribute("title") || chip.getAttribute("alt") || "";
            const m = text.match(emailRegex);
            if (m) return m[0].toLowerCase().trim();
        }

        // 3. Google Forms disclaimer / notice patterns in page text
        const bodyText = document.body ? (document.body.innerText || document.body.textContent || "") : "";

        const recordMatch = bodyText.match(/Record\s+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s+as\s+the\s+email/i);
        if (recordMatch) return recordMatch[1].toLowerCase().trim();

        const notMatch = bodyText.match(/Not\s+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\?\s+Switch\s+account/i);
        if (notMatch) return notMatch[1].toLowerCase().trim();

        const assocMatch = bodyText.match(/associated\s+with\s+your\s+Google\s+account[^\n\r]*?\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/i);
        if (assocMatch) return assocMatch[1].toLowerCase().trim();

        const shareMatch = bodyText.match(/sharing\s+to\s+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
        if (shareMatch) return shareMatch[1].toLowerCase().trim();

        // 4. Strict Google Forms account banner elements
        const strictHeaderElements = document.querySelectorAll(
            ".cBGG0e .D29t1c, .freebirdFormviewerViewHeaderEmail, [data-email]"
        );
        for (const el of strictHeaderElements) {
            const dataAttr = el.getAttribute("data-email");
            if (dataAttr && emailRegex.test(dataAttr)) return dataAttr.toLowerCase().trim();
            const text = el.innerText || el.textContent || "";
            const m = text.match(emailRegex);
            if (m) return m[0].toLowerCase().trim();
        }

        // 5. Pre-filled Email field in form
        const emailInputs = document.querySelectorAll('input[type="email"], input[autocomplete="email"]');
        for (const input of emailInputs) {
            const val = (input.value || "").trim();
            if (val && emailRegex.test(val)) return val.toLowerCase();
        }

        // 6. Embedded script data in Google Forms
        const scripts = document.querySelectorAll("script");
        for (const s of scripts) {
            const content = s.textContent || "";
            if (content.includes("WIZ_global_data")) {
                const m = content.match(/"o6ZaF"\s*:\s*"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"/i);
                if (m) return m[1].toLowerCase().trim();
            }
        }

        return "";
    }

})();
