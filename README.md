# Job Ledger

A local Chrome extension for capturing job details and managing applications in a clean, dark, Notion-style table. No account, server, cloud storage, analytics, or AI API is required. Data is stored in `chrome.storage.local` in the Chrome profile where the extension is installed.

## Install in Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select this project folder, the one containing `manifest.json`.
5. Open Chrome's extensions menu (the puzzle icon) and pin **Job Ledger — Local Job Tracker**.
6. Click the extension icon, then **Open dashboard**.

No build step, npm install, or running terminal is needed to use the extension. Keep this folder in place. After updating its source, click **Reload** on the extension's card at `chrome://extensions`, then reload any dashboard tabs.

## Configure your emails

The **Email used** dropdown lists addresses from a local `config.js` file. That file is gitignored, so your addresses stay out of the repository.

```sh
cp config.example.js config.js
```

Edit `EMAIL_CHOICES` in `config.js`, then click **Reload** on the extension's card at `chrome://extensions`. Without `config.js` the extension still works, but the dropdown has no addresses. An email already saved on an application always stays selectable.

## Capture an application

1. Open the individual job listing. This usually contains more details than the application form.
2. Click the extension icon, then **Capture job**.
3. Review company, position, location, URL, source, and requisition ID. Add missing information or correct the preview.
4. Choose **To apply**, or choose **Applied** after submitting your application. The application date defaults to today’s local date automatically, regardless of stage, and remains editable.
5. Choose the email you applied with from the email dropdown and add notes if needed. Each new capture starts with no email selected. Click **Save application**.

The dashboard updates automatically. Capture does not submit applications or detect submission success. Browser pages such as `chrome://` and some protected pages cannot be read; use manual entry there. For a Greenhouse application embedded on a company website, click **Enable embedded Greenhouse capture** when prompted, then allow Chrome’s site-access request. This one-time permission lets Capture read the job inside the frame. If Chrome closes the popup during the prompt, reopen it and click Capture again. Other inaccessible cross-origin forms still require opening the form directly or manual entry.

Captures use structured JobPosting data first, platform-specific selectors second, and visible headings/labels as a fallback. Greenhouse, Lever, Workday, and LinkedIn have initial rules. Websites change and employers customize their pages; always review results. A page with several job postings must be narrowed to an individual job. Missing company or location is left blank, not fabricated.

Repeated captures show possible matches. **Load existing** retains your notes, dates, stage, and email. To save a separate application anyway, use Save and confirm the duplicate warning. Distinct requisition IDs remain separate.

Unsaved popup previews are stored per browser tab and restored when you reopen the popup for that tab. They are not application records until saved. The dashboard also retains the most recent unfinished detail form; **New** offers to restore it.

## Dashboard

- Location fields suggest locations already saved in the dashboard as you type; you can also enter a new location.
- Edit cells directly. Changes save on leaving a field or pressing Enter; Escape cancels that cell's edit.
- Click the small document button beside a company to open full details and multiline notes. Save the panel explicitly.
- Search company, position, location, and notes. Filter by stage, location, and email.
- Sort any data column ascending or descending using the toolbar sort menu. Click a column header to sort it; click again to reverse the order. An arrow marks the active sort, which is remembered. Empty values stay at the bottom.
- Hide optional columns with **Columns**. These preferences and sorting are remembered.
- Company, stage, and position stay fixed while scrolling on wide screens. Fewer columns remain fixed on narrow screens to leave room for the remaining data.
- Click the arrow beside a job URL to open it in a new tab.
- Delete through the detail panel, with confirmation.

Stages: To apply, Applied, Assessment, Interview, Offer, Rejected, Withdrawn. New applications automatically receive today’s local applied date. Moving to a later stage preserves the original applied date. Moving a saved application to any stage after Applied sets its response date to today. This happens in the table, the detail panel, and the popup. You can still edit that date, and a response date you type in the same edit is kept.

## Daily activity and Overview

- **Daily activity** shows applications per day (2 weeks, 30 days, or 90 days) as bars stacked by each application's current stage, with a 7-day average line. Today's count, the last 7 days, your streak, daily average, and best day sit above it. A year heatmap and a weekday chart show your rhythm. Select any bar or heatmap day to list that day's applications, and select an application to open it.
- **Overview** shows submitted, awaiting reply, in process, offers, rejected, and response rate. It also has a waffle chart with one square per application, how far applications have progressed, each week's applications by current stage, time to hear back (from response dates), and top locations. Select a tile or legend entry to filter the table to that stage.
- Both views count by applied date and skip "To apply" jobs. Stages show where each application is now. Table filters don't change these views.

## Backups

Use **Export → JSON backup** regularly. This includes all saved application fields and stable record IDs. **Export → CSV spreadsheet** exports all applications for spreadsheet use, safely quoting commas, quotes, and multiline notes. Spreadsheet formula-like text is prefixed with an apostrophe in CSV only.

Use **Import** to select a Job Ledger JSON backup. A preview reports valid rows, invalid rows, and duplicate candidates. Invalid files cannot be imported until corrected.

- **Merge** preserves existing records and skips exact duplicates, including matching IDs. Possible duplicates are retained as separate records.
- **Replace** replaces the application list after confirmation. Export your current data first if needed.

Backups cover saved applications; unfinished drafts and interface preferences are not included. Removing the extension clears its Chrome local storage. Data is not synchronized to other devices. Chrome local storage has a quota; if storage fills up, an actionable save error is shown rather than pretending the save succeeded.

## Development

The extension is plain HTML, CSS, and JavaScript modules. There are no runtime packages. Development dependencies are used only by tests.

```sh
npm ci
npm test
npm run check
```

Browser integration checks use a disposable Chromium profile, not your personal Chrome data:

```sh
npx playwright install chromium
npm run test:browser
```

If browsers were installed in a custom location, set `PLAYWRIGHT_BROWSERS_PATH` to that location. In this build environment the browser was installed under `/private/tmp/job-ledger-browsers`.

Files:

- `manifest.json`: Manifest V3, activeTab/scripting/storage permissions, optional Greenhouse host access, and local-only extension CSP.
- `src/background.js`: serialized storage mutations through one service worker.
- `src/store.js`: versioned storage, drafts, preferences, import and mutation logic.
- `src/model.js`: validation, dates, duplicate detection, filtering, CSV and backup handling.
- `src/extract.js`: self-contained page extraction function executed in an isolated world.
- `src/popup.js`: capture preview and save workflow.
- `src/dashboard.js`: editable table, detail panel, filters, export and import.
- `src/ui.js`, `styles.css`: shared accessible form elements and presentation.
- `tests/`: focused logic and extraction fixture tests.
- `scripts/browser-test.js`: unpacked extension integration checks and screenshots.
- `scripts/capture-test.js`: actual Chrome action and activeTab capture against an intercepted fixture page.

No background page monitoring or network requests are implemented. Extension pages have `connect-src 'none'`. Extracted content is assigned as text/input values; HTML from job sites is never rendered or evaluated. HTTP(S) links are validated. Local storage access is restricted to trusted extension contexts.

## Verification scope

Platform extraction rules are tested against representative local HTML fixtures, not authenticated live accounts. Greenhouse, Lever, Workday, LinkedIn, generic pages, nested JobPosting JSON-LD, malformed JSON, and ambiguous multi-job pages are covered. These fixtures do not guarantee support for every employer's site layout.

The browser integration script checks the actual unpacked extension, local saves, editing, filters, preferences, popup/dashboard synchronization, drafts, duplicate handling, backup merge/export, safe rendering, and persistence after a browser restart. Browser test screenshots are written to `artifacts/` using synthetic records in an isolated test profile. The installed extension starts empty.

The actual extension-button workflow is also verified in Chromium: triggering the action grants `activeTab`, Capture extracts a structured job fixture, and Save creates the dashboard row. The fixture URL is intercepted by the test; this is not a claim of live employer-site verification. The capture test uses Chromium's browser-level extension debugging protocol only in a disposable test process. Those debugging flags are not required to install or use Job Ledger.

Embedded Greenhouse capture preserves the original company application URL and matches the job ID to the correct frame. The extension requests access only to the detected Greenhouse board origin, not all websites. It does not continuously monitor pages.
