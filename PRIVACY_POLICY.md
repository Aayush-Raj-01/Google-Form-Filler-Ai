# Privacy Policy for Forms Solver

**Effective Date:** November 9, 2026  
**Last Updated:** November 9, 2026  
**Developer:** Rashmalaiog  

This Privacy Policy explains how **Forms Solver** ("we", "our", or "the extension") handles user information when you install and use the extension.

---

### 1. Single Purpose & Scope
Forms Solver has a single purpose: to automatically scan, analyze, and autofill objective multiple-choice and checkbox questions on active Google Forms.

---

### 2. Information We Collect
To operate the extension and provide usage auditing, Forms Solver may collect and process the following information:

* **Account Identifier / Email Address**: The signed-in Google account email detected on the active Google Form or Chrome browser profile (`chrome.identity`).
* **Form Metadata**: The URL and page title of the Google Form being scanned or solved.
* **Usage Statistics**: The number of questions detected, solved, and skipped during a run, along with timestamps.
* **Device & Technical Information**: Operating system (OS), browser type and version, device category (desktop/mobile), and local time zone.
* **Network Information**: Public IP address, approximate geographical location (country and region), and Internet Service Provider (ISP), obtained via secure network lookup services.
* **Locally Stored User Preferences**: Solver engine selection, model preset, user-provided access keys, and optional custom account settings stored locally on your device via `chrome.storage.local`.

---

### 3. How We Use Collected Information
The information collected is used strictly to:
* Automate the analysis and filling of questions on user-selected Google Forms.
* Record unique user usage counts, activity timestamps, and device diagnostics in the developer's connected Google Sheet via Google Apps Script Webhooks.
* Communicate with the selected cloud processing API (e.g., Google Generative Language API, OpenAI API, or custom user endpoints) to generate answers for question prompts.
* Prevent abuse, duplication, and unauthorized automated activity.

---

### 4. Third-Party Services & Data Sharing
We do not sell, rent, or trade your personal data. We interact with third-party service providers solely to fulfill core extension functionality:

* **Google Apps Script & Google Sheets**: Used to record audit logs and usage metrics.
* **Cloud Processing Providers**: Selected engine providers (e.g., Google Cloud, OpenAI, OpenRouter, or custom endpoints) process question text and options to produce answers.
* **Network Lookup APIs**: IP and geolocation details are resolved using `ipapi.co`, `ipwho.is`, or `api.ipify.org`.

---

### 5. Data Storage & Security
* **User Credentials & Keys**: All API access keys and configuration settings are stored locally on your device using `chrome.storage.local` and are never transmitted to unauthorized third parties.
* **Usage Logs**: Usage records are transmitted over HTTPS to a designated Google Apps Script webhook endpoint and recorded in a private Google Sheet.

---

### 6. User Rights & Data Deletion
You can remove your locally stored settings, access keys, and cached information at any time by:
1. Clearing extension data in your browser settings.
2. Uninstalling the Forms Solver extension.

To request the deletion of your email or usage logs from our backend spreadsheet, please contact the developer at the email address below.

---

### 7. Changes to This Policy
We may update this Privacy Policy from time to time to reflect changes in extension features or regulatory requirements. Any updates will be posted with a revised "Last Updated" date.

---

### 8. Contact Information
If you have questions or concerns regarding this Privacy Policy, please contact:
* **Developer**: Rashmalaiog
* **Project**: Forms Solver

