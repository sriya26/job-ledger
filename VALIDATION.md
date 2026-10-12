# Validation results

- `npm test`: 19 passing tests for extraction, dates, safe URLs, duplicate identity, merge behavior, JSON roundtrips, CSV escaping, filtering, and persistent storage mutations.
- `npm run check`: manifest paths, minimal permissions, and source JavaScript syntax pass.
- `scripts/browser-test.js`: passed in Chromium with the actual unpacked extension. Verified creation, inline edits, filtering, column preferences, popup/dashboard synchronization, unsaved drafts, duplicate loading without losing notes, safe rendering, JSON import/export, and browser-restart persistence. No application-page JavaScript errors or outgoing HTTP requests were observed in the monitored dashboard/popup session.
- `scripts/capture-test.js`: passed. Actual Chrome extension action, temporary activeTab permission, Capture button, editable preview, Save button, and dashboard row verified together against an intercepted JobPosting fixture.
- Dashboard and popup screenshots were rendered and visually inspected. Screenshots use synthetic test records in an isolated browser profile; the user's installed extension starts empty.

Extraction coverage: Greenhouse, Lever, Workday, LinkedIn, generic markup, nested structured JobPosting data, malformed JSON, and multiple ambiguous postings are fixture-tested. No authenticated live employer pages were tested. Cross-origin embedded forms and protected browser pages require opening a readable listing or manual entry.

## Embedded Greenhouse fix

27 logic/extraction tests and syntax/manifest checks pass. A live company careers page with an embedded Greenhouse job was verified with the actual extension popup in isolated Chromium profiles:

- Production optional-permission manifest: Capture detects the cross-origin Greenhouse frame and displays the permission-enable button.
- Disposable test-only copy with Greenhouse host access already granted: Capture reads the company and position from inside the frame, matches the Greenhouse job ID, and preserves the outer page URL.

The live-page check script is not kept in the repository. The native optional-permission approval dialog itself was not automated. The shipped manifest has optional host permissions, not the test copy's required host permissions. No changes were made to the user's Chrome profile or saved applications.
