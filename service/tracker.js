
// ----------------------------------------------------------------
// Forms Solver — Usage Tracker
// Logs one row per unique email to Google Sheets via Apps Script.
// ----------------------------------------------------------------

export const DEFAULT_TRACKER_WEBHOOK = "https://script.google.com/macros/s/AKfycbx2O-0g-r_0sOQbJchKJpu6Vx-pHU0jqTxIzRcMd-8nngLTE-3KVbg46rQRYDYpqeXXbg/exec";

let cachedNetInfo = null;

/**
 * Get signed-in Chrome profile email.
 */
export async function getProfileEmail() {
    if (typeof chrome === "undefined" || !chrome.identity?.getProfileUserInfo) return "";
    try {
        const info = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" });
        if (info?.email) return info.email.toLowerCase().trim();
    } catch (_) { /* Permission or account not present */ }
    return "";
}

/**
 * Fetch public IP and geo information with fast caching & fallback.
 */
export async function fetchNetworkInfo() {
    if (cachedNetInfo && cachedNetInfo.ip && cachedNetInfo.ip !== "Unavailable") {
        return cachedNetInfo;
    }

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
        try {
            const stored = await chrome.storage.local.get("cachedNetInfo");
            if (stored?.cachedNetInfo?.ip && stored.cachedNetInfo.ip !== "Unavailable") {
                cachedNetInfo = stored.cachedNetInfo;
                return cachedNetInfo;
            }
        } catch (_) {}
    }

    const defaults = { ip: "Unavailable", country: "", region: "", org: "" };

    // 1. Try ipapi.co (2 second timeout)
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch("https://ipapi.co/json/", { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
            const j = await res.json();
            cachedNetInfo = {
                ip: j.ip || defaults.ip,
                country: j.country_name || "",
                region: j.region || "",
                org: j.org || ""
            };
            if (typeof chrome !== "undefined" && chrome.storage?.local) {
                chrome.storage.local.set({ cachedNetInfo }).catch(() => {});
            }
            return cachedNetInfo;
        }
    } catch (_) {}

    // 2. Fallback: ipwho.is (2 second timeout)
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch("https://ipwho.is/", { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
            const j = await res.json();
            if (j.success !== false) {
                cachedNetInfo = {
                    ip: j.ip || defaults.ip,
                    country: j.country || "",
                    region: j.region || "",
                    org: j.connection?.isp || j.connection?.org || ""
                };
                if (typeof chrome !== "undefined" && chrome.storage?.local) {
                    chrome.storage.local.set({ cachedNetInfo }).catch(() => {});
                }
                return cachedNetInfo;
            }
        }
    } catch (_) {}

    // 3. Fallback: api.ipify.org (1.5 second timeout)
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
            const j = await res.json();
            cachedNetInfo = { ...defaults, ip: j.ip || defaults.ip };
            if (typeof chrome !== "undefined" && chrome.storage?.local) {
                chrome.storage.local.set({ cachedNetInfo }).catch(() => {});
            }
            return cachedNetInfo;
        }
    } catch (_) {}

    return defaults;
}

/**
 * Extract OS, device type, and browser.
 */
export function getDeviceInfo() {
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    const platform = (typeof navigator !== "undefined" && navigator.platform) || "";

    let os = "Unknown OS";
    if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
    else if (/Windows NT 6\.3/.test(ua)) os = "Windows 8.1";
    else if (/Windows NT 6\.1/.test(ua)) os = "Windows 7";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) {
        const v = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, ".") || "";
        os = `macOS ${v}`;
    }
    else if (/Android/.test(ua)) {
        const v = ua.match(/Android ([\d.]+)/)?.[1] || "";
        os = `Android ${v}`;
    }
    else if (/iPhone|iPad/.test(ua)) os = "iOS";
    else if (/Linux/.test(ua)) os = "Linux";
    else if (platform) os = platform;

    const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
    const device = isMobile ? "Mobile" : "Desktop";
    const chromeVer = ua.match(/Chrome\/([\d.]+)/)?.[1] || "";

    let timezone = "";
    try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_) {}

    return {
        device,
        os,
        browser: chromeVer ? `Chrome ${chromeVer}` : "Chrome",
        timezone,
        language: typeof navigator !== "undefined" ? navigator.language : ""
    };
}

/**
 * Increment local usage count for a given email.
 */
async function incrementLocalCount(email) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return 1;
    try {
        const key = `uc_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const stored = await chrome.storage.local.get(key);
        const next = (stored[key] || 0) + 1;
        await chrome.storage.local.set({ [key]: next });
        return next;
    } catch (_) {
        return 1;
    }
}

/**
 * Test webhook connectivity.
 */
export async function testWebhook(webhookUrl) {
    const targetUrl = webhookUrl || DEFAULT_TRACKER_WEBHOOK;
    if (!targetUrl || !targetUrl.startsWith("https://")) {
        throw new Error("Invalid webhook URL. Must start with https://");
    }

    const net = await fetchNetworkInfo();
    const dev = getDeviceInfo();
    let email = "";
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
        try {
            const stored = await chrome.storage.local.get("customUserEmail");
            if (stored?.customUserEmail && stored.customUserEmail.trim()) {
                email = stored.customUserEmail.trim().toLowerCase();
            }
        } catch (_) {}
    }
    if (!email) {
        email = (await getProfileEmail()) || "test-connection@example.com";
    }

    const payload = {
        email,
        usageCount: 1,
        formUrl: "https://docs.google.com/forms/d/test-connection/viewform",
        formTitle: "Connection Test",
        solvedThisRun: 1,
        skippedThisRun: 0,
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString("en-IN", { timeZone: dev.timezone || "Asia/Kolkata" }),
        ip: net.ip,
        country: net.country,
        region: net.region,
        isp: net.org,
        device: dev.device,
        os: dev.os,
        browser: dev.browser
    };

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);

    // text/plain avoids CORS preflight OPTIONS in browser
    const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
    });
    clearTimeout(tid);

    if (!res.ok) {
        throw new Error(`Webhook returned status ${res.status}: ${res.statusText}`);
    }

    return { success: true, email, ip: net.ip };
}

/**
 * Post one usage event to the Google Apps Script webhook.
 */
export async function logUsage({ webhookUrl, userEmail = "", formUrl = "", formTitle = "", solved = 0, skipped = 0 }) {
    const targetUrl = webhookUrl || DEFAULT_TRACKER_WEBHOOK;
    if (!targetUrl || !targetUrl.startsWith("https://")) return;

    const dev = getDeviceInfo();

    let email = "";

    // 1. Check user-configured override in settings (if provided)
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
        try {
            const stored = await chrome.storage.local.get("customUserEmail");
            if (stored?.customUserEmail && stored.customUserEmail.trim()) {
                email = stored.customUserEmail.trim().toLowerCase();
            }
        } catch (_) {}
    }

    // 2. Form-detected email from scanner.js
    if (!email && userEmail && userEmail.trim()) {
        email = userEmail.trim().toLowerCase();
    }

    // 3. Signed-in Chrome profile email
    if (!email) {
        email = await getProfileEmail();
    }

    // 4. Fallback to stable client identifier
    if (!email) {
        let clientId = "";
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
            try {
                const stored = await chrome.storage.local.get("clientId");
                clientId = stored?.clientId;
                if (!clientId) {
                    clientId = Math.random().toString(36).substring(2, 9);
                    await chrome.storage.local.set({ clientId });
                }
            } catch (_) {}
        }
        if (!clientId) {
            clientId = Math.random().toString(36).substring(2, 9);
        }
        email = `client-${clientId}@device`;
    }
    email = email.toLowerCase().trim();

    const net = await fetchNetworkInfo();
    const usageCount = await incrementLocalCount(email);

    const payload = {
        email,
        usageCount,
        formUrl: formUrl || "",
        formTitle: formTitle || "",
        solvedThisRun: Number(solved) || 0,
        skippedThisRun: Number(skipped) || 0,
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString("en-IN", { timeZone: dev.timezone || "Asia/Kolkata" }),
        ip: net.ip,
        country: net.country,
        region: net.region,
        isp: net.org,
        device: dev.device,
        os: dev.os,
        browser: dev.browser
    };

    try {
        // text/plain avoids CORS preflight OPTIONS in browser
        const res = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });

        console.log(`[Forms Solver Tracker] Logged to Google Sheet: ${email} (${payload.ip})`);
        return { success: true, email, ip: net.ip };
    } catch (err) {
        console.warn("[Forms Solver Tracker] Failed to send payload:", err.message);
        return { success: false, error: err.message };
    }
}
