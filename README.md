# ZAPELM (Zap Element)

ZAPELM is a Firefox extension that lets you quickly pick unwanted DOM elements (pop‑ups, ads, notifications, and so on) on any website and hide or remove them automatically.

![zapelm](https://raw.githubusercontent.com/niumlaque/i/28f3860536490bb42b5f55b38ed1d8c756280b34/i/931c6894-1326-4315-ba5f-ade4c5cef734.gif "zapelm")

## Overview

ZAPELM streamlines the way you tame noisy pages.

Launch the picker with `Alt + Shift + Z`, decide whether to hide or remove the highlighted element,  
and the extension stores a selector-based rule for that domain.

Each time you revisit, the rule runs automatically, catching new matching elements as they appear,  
and everything happens locally without sharing browsing data.

## Why?

I spend a lot of time browsing in Firefox Private Windows.

Every visit to Google in that mode triggers yet another "sign in" prompt,  
and plenty of other sites bombard me with "Do you want to enable notifications?", "Install this Firefox add-on?", or "Please accept cookies".

Having to respond to identical prompts on every page wastes time and interrupts the flow of browsing.  
I built ZAPELM to banish those distractions from my view.

## Features

-   **Element picker**
    -   Trigger with `Alt + Shift + Z`.
    -   Highlights elements under the cursor and records the selection on click.
-   **Rule storage**
    -   Saves CSS selectors per domain.
    -   Supports two actions: `hide` and `remove`.
    -   Choose when to apply: immediately or via delayed observation with `MutationObserver`.
-   **Automatic application**
    -   Loads rules on each visit to the site.
    -   Watches for dynamically inserted elements.
-   **Temporary suspension**
    -   Toggle on/off with `Alt + Shift + X`.
-   **Management UI**
    -   Lists rules for the current site.
    -   Add, edit, or delete rules.
    -   Import and export rules as JSON.

## Installation (GitHub Release)

1. Visit the [GitHub Releases](https://github.com/niumlaque/zapelm/releases) page and download the latest `zapelm-<VERSION>.zip` asset.
2. Extract the archive to obtain the signed `.xpi` file (for example, `zapelm-<VERSION>.xpi`).
3. Open Firefox and navigate to `about:addons`.
4. Click the gear icon, choose "Install Add-on From File…", select the extracted `.xpi`, and confirm the installation dialog.
5. After installation, pin the ZAPELM icon from the Extensions toolbar menu if you want quick access.

## Usage

1. Open the page you want to clean up.
2. Press `Alt + Shift + Z` to launch the picker.
3. Click the element you want to suppress.
4. Choose "Hide" or "Remove" in the dialog.
5. On future visits to that site, the same rule is applied automatically.
6. Press `Alt + Shift + X` to suspend or resume ZAPELM temporarily.

## Developer Guide

### Development Environment

Development happens inside Docker via the provided Dev Container configuration.

### Available Commands

| Command             | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `npm run typecheck` | Runs TypeScript type checking only.                                       |
| `npm run build`     | Bundles the TypeScript sources with esbuild and writes assets to `dist/`. |
| `npm run lint`      | Runs ESLint with warnings treated as errors.                              |

### Build Process

All builds run inside a Docker container.

Execute the script below from the host machine; it installs dependencies, runs `npm run build`, and emits `artifacts/zapelm-extension.zip`.

```sh
$ ./scripts/build-extension.sh
```

### Manual Verification

1. Run `npm run build` to populate `dist/`.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click "Load Temporary Add-on..." and select `manifest.json`.
    - The extension currently targets Firefox Manifest V2, with plans to migrate to V3 later.
4. Once loaded, the ZAPELM icon appears in the browser toolbar.

### Creating an XPI Package

Archive `manifest.json` together with the contents of `dist/`, then upload the ZIP file to the [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/).  
Firefox issues a signed XPI for an unlisted distribution.

### Debug Logging

Enable the toggle at the top of the popup to stream messages such as "Applied hide rules", "Matched elements for removal", and "Re-removing tracked element" to the target page’s content console; turn the toggle off to stop logging.

### Tips

-   If a page injects the target elements after load, change the `When to apply` field to "Monitor and apply to new elements".  
    Leaving it at "Apply on page load" only affects the initial DOM snapshot.

### Security Principles

-   ZAPELM runs entirely locally and collects no data.
-   The extension never contacts external servers.
-   User preferences are stored solely in the browser’s local storage.

### Manifest Version

-   ZAPELM presently relies on Firefox Manifest V2 APIs.
-   Once Manifest V3 support stabilizes in Firefox, the background logic will migrate to a service worker architecture.
