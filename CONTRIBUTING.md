# Contributing

Thanks for helping improve YT Cleaner.

## Reporting bugs

Before opening an issue, please:

1. Check the existing issues to avoid duplicates.
2. Confirm the bug affects the current code in the repository.
3. Include the browser version, OS, and the exact YouTube page where the problem occurs.
4. Provide steps to reproduce and any console errors you saw.

Use the bug report issue template in `.github/ISSUE_TEMPLATE/bug_report.md`.

## Suggesting features

Feature ideas are welcome when they are consistent with the extension's purpose: keep original YouTube titles and reduce noisy UI elements without changing account settings. Please open a feature request issue and explain:

- the problem it solves;
- the expected behavior;
- why it fits the existing extension;
- any relevant screenshots or examples.

## Local development setup

1. Clone the repository:

   ```bash
   git clone https://github.com/M003aad/YT-Cleaner.git
   cd YT-Cleaner
   ```

2. Install the JavaScript tooling:

   ```bash
   npm install
   ```

3. Validate the extension before testing:

   ```bash
   npm run lint
   npm run check
   npm run validate
   ```

4. Load the extension in developer mode:
   - Open `chrome://extensions/` or `edge://extensions/`.
   - Enable Developer mode.
   - Click **Load unpacked**.
   - Select the project root that contains `manifest.json`.

5. Open or refresh a YouTube tab to test changes.

## Pull requests

- Open a PR against the default branch.
- Keep changes focused and easy to review.
- Include a clear summary of the issue or feature being fixed.
- Update documentation when behavior changes.
- Run the repository checks locally before submitting.

We appreciate focused patches and well-documented changes.
