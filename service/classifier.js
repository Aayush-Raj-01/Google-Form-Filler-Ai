// Classifies Google Forms questions into:
// - "personal" (skip): User identity, contact info, personal details
// - "objective" (solve): Multiple choice / checkbox questions with definite answers
// - "unsupported" (skip): Paragraph, short-answer or open-ended questions

const PERSONAL_PATTERNS = [
    // Direct requests for personal identity
    /\b(your|ur)\s+(full\s+)?name\b/i,
    /\b(first|last)\s+name\b/i,
    /\b(your|ur)\s+(phone|mobile|cell|whatsapp|contact)\s*(no|number)?\b/i,
    /\b(phone|mobile|cell|whatsapp|contact)\s*(no|num|number)\b/i,
    /\b(your|ur)\s+email(\s*id|\s*address)?\b/i,
    /\bemail\s*(id|address)\b/i,
    /\b(enter|provide|type|submit|write|share)\s+(your|ur)?\s*(email|name|phone|number|contact)\b/i,
    /\b(your|ur)\s+(address|location|city|country|state|pincode|zipcode)\b/i,
    /\b(your|ur)\s+(college|university|school|institution|department|branch|year|batch|section|class)\b/i,
    /\b(roll\s*(no|num|number)|reg(istration)?\s*(no|num|number)|student\s*id|employee\s*id)\b/i,
    /\b(your|ur)\s+(age|gender|dob|date\s+of\s+birth)\b/i,
    /\bdate\s+of\s+birth\b/i,
    /\b(are\s+you\s+a\s+)?hostel(l)?er\b/i,
    /\broom\s*(no|num|number)\b/i,
    /\b(your|ur)\s+(experience|portfolio|resume|cv|previous\s+works?)\b/i,
    /\b(instagram|twitter|youtube|linkedin|github)\s*(handle|link|profile|url|username|id)?\b/i,
    /\b(social\s+media|social\s+handle)\b/i
];

// Patterns that strongly indicate an academic/objective question, even if keywords appear
const OBJECTIVE_OVERRIDE_PATTERNS = [
    /^(what|which|who|where|when|why|how|define|calculate|identify|solve|select|choose|find|evaluate)\b/i,
    /\b(stands?\s+for|meaning\s+of|protocol|algorithm|formula|function|layer|component|theory)\b/i,
    /\b(correct|incorrect|true|false|not\s+true|all\s+of\s+the\s+above|none\s+of\s+the\s+above)\b/i
];

export function classifyQuestion(question) {
    const rawText = (question.question || "").trim();
    const text = rawText.toLowerCase().replace(/[^\w\s]/g, " ");

    // If there is no question text and no options, skip
    if (!rawText && (!question.options || question.options.length === 0)) {
        return {
            category: "unsupported",
            action: "skip",
            reason: "Empty question card"
        };
    }

    // Check if question asks for personal information
    const isPersonalMatch = PERSONAL_PATTERNS.some(pattern => pattern.test(rawText));

    if (isPersonalMatch) {
        // Double check: if it's clearly an objective query with options (e.g., "Which protocol is used for email?"), do not skip!
        const isObjectiveOverride = OBJECTIVE_OVERRIDE_PATTERNS.some(pattern => pattern.test(rawText));
        const hasObjectiveOptions = (question.options || []).length >= 2;

        if (!(isObjectiveOverride && hasObjectiveOptions)) {
            return {
                category: "personal",
                action: "skip",
                reason: "Personal information request"
            };
        }
    }

    // Only objective choice questions (MCQ / checkbox) are sent to AI
    if (question.type === "multiple_choice" || question.type === "checkbox") {
        return {
            category: "objective",
            action: "solve",
            reason: "Objective choice question"
        };
    }

    // Paragraph and short-answer are skipped per project decisions
    return {
        category: "unsupported",
        action: "skip",
        reason: question.type === "short_answer" || question.type === "paragraph"
            ? "Open-ended / text questions are not supported"
            : "Unsupported question format"
    };
}
