/**
 * ============================================================
 *  Forms Solver — Google Apps Script Tracker
 *  Deploy this as a Web App to receive usage events from
 *  the Chrome extension and log them to this spreadsheet.
 *
 *  SETUP (do this once):
 *  1. Open your Google Spreadsheet → Extensions → Apps Script
 *  2. Paste this entire file, replacing any existing code.
 *  3. Click Save (disk icon), then Deploy → New Deployment:
 *     - Select type: Web App (gear icon)
 *     - Description: Forms Solver Tracker
 *     - Execute as: Me
 *     - Who has access: Anyone (required for extension webhook)
 *  4. Click Deploy, Authorize access, and copy the Web App URL.
 *     (URL ends in /exec)
 *  5. Paste that URL into Forms Solver → Settings → Usage Tracker.
 * ============================================================
 */

// Name of the sheet tab to write data into
const SHEET_NAME = "Usage Log";

// Column order (must match HEADERS and row data)
const HEADERS = [
    "Email",
    "Total Uses",
    "Last Form URL",
    "Last Form Title",
    "All Form Links (History)",
    "Last Used (Local/IST)",
    "Last Used (UTC)",
    "IP Address",
    "Country",
    "Region / State",
    "ISP / Network",
    "Device Type",
    "Operating System",
    "Browser",
    "Total Solved",
    "Total Skipped"
];

// ---- Main entry point (Webhook Receiver) ----
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const sheet = getOrCreateSheet();

        const email = (data.email || "unknown@unknown").toLowerCase().trim();
        const existing = findRowByEmail(sheet, email);

        const currentLink = data.formUrl || "";
        const currentTitle = data.formTitle || "";

        if (existing.rowIndex === -1) {
            // New unique user — append a fresh row
            sheet.appendRow([
                email,
                1,                               // Total Uses
                currentLink,                     // Last Form URL
                currentTitle,                    // Last Form Title
                currentLink,                     // All Form Links
                data.localTime || "",            // Last Used (Local)
                data.timestamp || "",            // Last Used (UTC)
                data.ip || "",                   // IP Address
                data.country || "",              // Country
                data.region || "",               // Region / State
                data.isp || "",                  // ISP
                data.device || "",               // Device Type
                data.os || "",                   // OS
                data.browser || "",              // Browser
                Number(data.solvedThisRun) || 0, // Total Solved
                Number(data.skippedThisRun) || 0 // Total Skipped
            ]);
        } else {
            // Returning user — update row in-place
            const r    = existing.rowIndex;
            const prev = existing.values;

            const prevUses    = Number(prev[1])  || 0;
            const prevHistory = String(prev[4] || "");
            const prevSolved  = Number(prev[14]) || 0;
            const prevSkipped = Number(prev[15]) || 0;

            // Maintain unique set of form links visited by this email
            let updatedHistory = prevHistory;
            if (currentLink && !prevHistory.includes(currentLink)) {
                updatedHistory = prevHistory ? `${prevHistory}\n${currentLink}` : currentLink;
            }

            sheet.getRange(r, 2).setValue(prevUses + 1);
            sheet.getRange(r, 3).setValue(currentLink);
            sheet.getRange(r, 4).setValue(currentTitle);
            sheet.getRange(r, 5).setValue(updatedHistory);
            sheet.getRange(r, 6).setValue(data.localTime || "");
            sheet.getRange(r, 7).setValue(data.timestamp || "");
            sheet.getRange(r, 8).setValue(data.ip || prev[7] || "");
            sheet.getRange(r, 9).setValue(data.country || prev[8] || "");
            sheet.getRange(r, 10).setValue(data.region || prev[9] || "");
            sheet.getRange(r, 11).setValue(data.isp || prev[10] || "");
            sheet.getRange(r, 12).setValue(data.device || prev[11] || "");
            sheet.getRange(r, 13).setValue(data.os || prev[12] || "");
            sheet.getRange(r, 14).setValue(data.browser || prev[13] || "");
            sheet.getRange(r, 15).setValue(prevSolved + (Number(data.solvedThisRun) || 0));
            sheet.getRange(r, 16).setValue(prevSkipped + (Number(data.skippedThisRun) || 0));
        }

        return jsonResponse({ success: true, email });

    } catch (err) {
        return jsonResponse({ success: false, error: err.message });
    }
}

// ---- Health check endpoint (open URL in browser to verify) ----
function doGet(e) {
    return jsonResponse({
        status: "Forms Solver Tracker is active and ready.",
        columns: HEADERS
    });
}

// ---- Helpers ----

function getOrCreateSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
        sheet.appendRow(HEADERS);

        // Header styling
        const hRange = sheet.getRange(1, 1, 1, HEADERS.length);
        hRange.setFontWeight("bold");
        hRange.setBackground("#0f172a");
        hRange.setFontColor("#f8fafc");
        hRange.setHorizontalAlignment("center");

        sheet.setFrozenRows(1);
        sheet.setColumnWidth(1, 240); // Email
        sheet.setColumnWidth(2, 90);  // Uses
        sheet.setColumnWidth(3, 300); // Last URL
        sheet.setColumnWidth(4, 200); // Last Title
        sheet.setColumnWidth(5, 340); // Links History
        sheet.setColumnWidth(6, 170); // Local Time
        sheet.setColumnWidth(7, 190); // UTC Time
        sheet.setColumnWidth(8, 140); // IP
        sheet.setColumnWidth(9, 120); // Country
        sheet.setColumnWidth(10, 130); // Region
        sheet.setColumnWidth(11, 160); // ISP
        sheet.setColumnWidth(12, 110); // Device
        sheet.setColumnWidth(13, 130); // OS
        sheet.setColumnWidth(14, 130); // Browser
        sheet.setColumnWidth(15, 110); // Solved
        sheet.setColumnWidth(16, 110); // Skipped
    }

    return sheet;
}

function findRowByEmail(sheet, email) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if ((data[i][0] || "").toLowerCase().trim() === email) {
            return { rowIndex: i + 1, values: data[i] };
        }
    }
    return { rowIndex: -1, values: [] };
}

function jsonResponse(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
