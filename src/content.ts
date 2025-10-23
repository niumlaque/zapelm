import {
  Rule,
  RuleAction,
  RuleApplyMode,
  RuleInput,
  BackgroundToContentMessage,
} from "./utils/types";
import { buildSelector } from "./utils/selectors";

type PickerState = "idle" | "active" | "dialog";

interface RemovedNodeRecord {
  ruleId: string;
  parent: Node | null;
  nextSibling: ChildNode | null;
  node: Element;
}

const PICKER_OVERLAY_ATTR = "data-zapelm-overlay";
const PICKER_DIALOG_ATTR = "data-zapelm-dialog";
const STYLE_ELEMENT_ID = "zapelm-hide-style";
const DEBUG_FLAG_STORAGE_KEY = "zapelm.debug";

let pickerState: PickerState = "idle";
let pickerHighlight: HTMLDivElement | null = null;
let pickerInfo: HTMLDivElement | null = null;

let hideStyleElement: HTMLStyleElement | null = null;
const removalObservers = new Map<string, MutationObserver>();
let removedNodeRecords: RemovedNodeRecord[] = [];

let allRules: Rule[] = [];
let enabled = true;
let debugEnabled = false;

void initializeDebugFlag();

function logDebug(...args: unknown[]) {
  if (!debugEnabled) {
    return;
  }
  console.log("[ZAPELM]", ...args);
}

async function initializeDebugFlag() {
  try {
    const stored = await browser.storage.local.get(DEBUG_FLAG_STORAGE_KEY);
    debugEnabled = Boolean(stored[DEBUG_FLAG_STORAGE_KEY]);
    logDebug("Debug logging initialized", { enabled: debugEnabled });
  } catch (error) {
    console.error("ZAPELM: failed to initialize debug flag", error);
  }
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !(DEBUG_FLAG_STORAGE_KEY in changes)) {
    return;
  }
  const change = changes[DEBUG_FLAG_STORAGE_KEY];
  debugEnabled = Boolean(change?.newValue);
  logDebug("Debug logging toggled", { enabled: debugEnabled });
  if (!debugEnabled) {
    console.log("[ZAPELM]", "Debug logging disabled");
  }
});

browser.runtime.onMessage.addListener((message: BackgroundToContentMessage) => {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return;
  }

  switch (message.type) {
    case "activatePicker":
      if (enabled) {
        startPicker();
      } else {
        showToast("ZAPELM is disabled (press Alt+Shift+X to re-enable)", "info");
      }
      break;
    case "setEnabled":
      setEnabled(message.enabled);
      break;
    case "applyRules":
      allRules = message.rules;
      applyActiveRules();
      break;
    default:
      break;
  }
});

void notifyContentReady();

async function notifyContentReady() {
  try {
    await browser.runtime.sendMessage({
      type: "contentReady",
      hostname: window.location.hostname,
    });
  } catch (error) {
    console.error("ZAPELM: contentReady notification failed", error);
  }
}

function setEnabled(next: boolean) {
  if (enabled === next) {
    return;
  }

  enabled = next;

  if (!enabled) {
    stopPicker();
    tearDownRules();
    restoreRemovedNodes();
    showToast("Temporarily disabled ZAPELM", "info");
    return;
  }

  showToast("ZAPELM has been re-enabled", "success");
  applyActiveRules();
}

function applyActiveRules() {
  if (!enabled) {
    return;
  }

  const activeRules = allRules.filter((rule) => rule.enabled);
  updateHideStyles(activeRules);
  runImmediateRemovals(activeRules);
  configureRemovalObservers(activeRules);
}

function tearDownRules() {
  updateHideStyles([]);
  stopRemovalObservers();
}

function updateHideStyles(rules: Rule[]) {
  const hides = rules.filter((rule) => rule.action === "hide");

  if (hides.length === 0) {
    if (hideStyleElement) {
      hideStyleElement.remove();
      hideStyleElement = null;
    }
    return;
  }

  if (!hideStyleElement) {
    hideStyleElement = document.createElement("style");
    hideStyleElement.id = STYLE_ELEMENT_ID;
    hideStyleElement.setAttribute("data-origin", "zapelm");
    const target =
      document.head ?? document.body ?? document.documentElement;
    target?.appendChild(hideStyleElement);
  }

  const cssRules = hides
    .map((rule) => rule.selector)
    .filter(isSelectorValid)
    .map(
      (selector) =>
        `${selector} { display: none !important; visibility: hidden !important; }`,
    );

  hideStyleElement.textContent = cssRules.join("\n");
  if (cssRules.length > 0) {
    logDebug("Applied hide rules", hides.map((rule) => rule.selector));
  }
}

function runImmediateRemovals(rules: Rule[]) {
  const removalRules = rules.filter((rule) => rule.action === "remove");
  removalRules.forEach((rule) => removeElementsForRule(rule));
}

function configureRemovalObservers(rules: Rule[]) {
  const observeRules = rules.filter(
    (rule) => rule.action === "remove" && rule.applyMode === "observe",
  );
  const activeIds = new Set(observeRules.map((rule) => rule.id));

  observeRules.forEach((rule) => {
    if (removalObservers.has(rule.id)) {
      return;
    }
    const observer = createRemovalObserver(rule);
    if (observer) {
      removalObservers.set(rule.id, observer);
    }
  });

  for (const [ruleId, observer] of removalObservers) {
    if (!activeIds.has(ruleId)) {
      observer.disconnect();
      removalObservers.delete(ruleId);
    }
  }
}

function stopRemovalObservers() {
  for (const observer of removalObservers.values()) {
    observer.disconnect();
  }
  removalObservers.clear();
}

function createRemovalObserver(rule: Rule): MutationObserver | null {
  const root = document.body ?? document.documentElement;
  if (!root) {
    return null;
  }

  if (!isSelectorValid(rule.selector)) {
    return null;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        handleNodeForRule(node, rule);
      });
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  return observer;
}

function handleNodeForRule(element: Element, rule: Rule) {
  if (!isSelectorValid(rule.selector)) {
    return;
  }

  if (element.matches(rule.selector)) {
    removeElement(element, rule);
  }

  const nestedMatches = Array.from(
    element.querySelectorAll(rule.selector),
  ) as Element[];
  nestedMatches.forEach((match) => removeElement(match, rule));
}

function removeElementsForRule(rule: Rule) {
  if (!isSelectorValid(rule.selector)) {
    showToast(`Skipped invalid selector: ${rule.selector}`, "error");
    return;
  }

  const matches = Array.from(
    document.querySelectorAll(rule.selector),
  ) as Element[];
  if (matches.length > 0) {
    logDebug("Matched elements for removal", rule.selector, matches);
  }
  matches.forEach((element) => removeElement(element, rule));
}

function removeElement(element: Element, rule: Rule) {
  if (!element.isConnected) {
    return;
  }

  if (removedNodeRecords.some((record) => record.node === element)) {
    logDebug("Re-removing tracked element", rule.selector, element);
    element.remove();
    return;
  }

  removedNodeRecords.push({
    ruleId: rule.id,
    parent: element.parentNode,
    nextSibling: element.nextSibling,
    node: element,
  });

  logDebug("Removed element", rule.selector, {
    ruleId: rule.id,
    applyMode: rule.applyMode,
    element,
  });
  element.remove();
}

function restoreRemovedNodes() {
  removedNodeRecords = removedNodeRecords.filter((record) => {
    if (!record.parent) {
      return false;
    }
    try {
      record.parent.insertBefore(record.node, record.nextSibling);
      return false;
    } catch {
      return false;
    }
  });
}

function startPicker() {
  if (pickerState !== "idle") {
    return;
  }

  pickerState = "active";
  ensureHighlightElements();
  document.addEventListener("mousemove", onPointerMove, true);
  document.addEventListener("click", onPointerClick, true);
  document.addEventListener("keydown", onPickerKeyDown, true);
  document.documentElement.style.setProperty("cursor", "crosshair");
  showToast("Click an element to add a rule (Esc to cancel)", "info");
}

function stopPicker() {
  if (pickerState === "idle") {
    return;
  }

  pickerState = "idle";
  removeHighlightElements();
  document.removeEventListener("mousemove", onPointerMove, true);
  document.removeEventListener("click", onPointerClick, true);
  document.removeEventListener("keydown", onPickerKeyDown, true);
  document.documentElement.style.removeProperty("cursor");
}

function pausePickerForDialog() {
  pickerState = "dialog";
  document.removeEventListener("mousemove", onPointerMove, true);
  document.removeEventListener("click", onPointerClick, true);
}

function ensureHighlightElements() {
  if (pickerHighlight && pickerHighlight.isConnected) {
    return;
  }

  pickerHighlight = document.createElement("div");
  pickerHighlight.setAttribute(PICKER_OVERLAY_ATTR, "highlight");
  pickerHighlight.style.position = "absolute";
  pickerHighlight.style.zIndex = "2147483646";
  pickerHighlight.style.pointerEvents = "none";
  pickerHighlight.style.border = "2px solid #ff4081";
  pickerHighlight.style.background = "rgba(255, 64, 129, 0.08)";
  pickerHighlight.style.borderRadius = "4px";
  pickerHighlight.style.transition = "all 80ms ease-out";
  pickerHighlight.style.boxShadow =
    "0 0 0 2px rgba(255, 64, 129, 0.2), 0 0 24px rgba(255, 64, 129, 0.2)";

  pickerInfo = document.createElement("div");
  pickerInfo.setAttribute(PICKER_OVERLAY_ATTR, "info");
  pickerInfo.style.position = "absolute";
  pickerInfo.style.zIndex = "2147483647";
  pickerInfo.style.pointerEvents = "none";
  pickerInfo.style.background = "#ff4081";
  pickerInfo.style.color = "#fff";
  pickerInfo.style.fontSize = "12px";
  pickerInfo.style.padding = "2px 6px";
  pickerInfo.style.borderRadius = "3px";
  pickerInfo.style.whiteSpace = "nowrap";
  pickerInfo.textContent = "ZAPELM";

  const parent = document.body ?? document.documentElement;
  parent?.appendChild(pickerHighlight);
  parent?.appendChild(pickerInfo);
}

function removeHighlightElements() {
  pickerHighlight?.remove();
  pickerInfo?.remove();
  pickerHighlight = null;
  pickerInfo = null;
}

function onPointerMove(event: MouseEvent) {
  if (pickerState !== "active") {
    return;
  }
  const target = event.target as Element | null;
  if (!target || isPickerElement(target)) {
    return;
  }

  updateHighlightPosition(target);
}

function updateHighlightPosition(target: Element) {
  if (!pickerHighlight || !pickerInfo) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  pickerHighlight.style.left = `${rect.left + scrollX}px`;
  pickerHighlight.style.top = `${rect.top + scrollY}px`;
  pickerHighlight.style.width = `${rect.width}px`;
  pickerHighlight.style.height = `${rect.height}px`;

  const infoX = rect.left + scrollX;
  const infoY = rect.top + scrollY - 24;
  pickerInfo.style.left = `${infoX}px`;
  pickerInfo.style.top = `${infoY}px`;
}

function onPointerClick(event: MouseEvent) {
  if (pickerState !== "active") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const target = event.target as Element | null;
  if (!target || isPickerElement(target)) {
    return;
  }

  pausePickerForDialog();
  void handleElementSelection(target);
}

async function handleElementSelection(target: Element) {
  const selector = buildSelector(target);
  const config = await promptForRule(selector);

  if (!config) {
    stopPicker();
    return;
  }

  const rule: RuleInput = {
    selector,
    action: config.action,
    applyMode: config.applyMode,
    enabled: config.enabled,
  };

  try {
    const response = await browser.runtime.sendMessage({
      type: "addRule",
      hostname: window.location.hostname,
      rule,
    });

    if (response && "success" in response && !response.success) {
      showToast(`Failed to save the rule: ${response.error}`, "error");
    } else {
      showToast("Rule saved", "success");
    }
  } catch (error) {
    console.error("ZAPELM: addRule failed", error);
    showToast("An error occurred while saving the rule", "error");
  } finally {
    stopPicker();
  }
}

function onPickerKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    stopPicker();
  }
}

function isPickerElement(element: Element): boolean {
  return (
    element.hasAttribute(PICKER_OVERLAY_ATTR) ||
    element.closest(`[${PICKER_OVERLAY_ATTR}]`) !== null ||
    element.hasAttribute(PICKER_DIALOG_ATTR) ||
    element.closest(`[${PICKER_DIALOG_ATTR}]`) !== null
  );
}

function promptForRule(selector: string): Promise<{
  action: RuleAction;
  applyMode: RuleApplyMode;
  enabled: boolean;
} | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.setAttribute(PICKER_DIALOG_ATTR, "backdrop");
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.background = "rgba(0, 0, 0, 0.38)";
    backdrop.style.zIndex = "2147483647";
    backdrop.style.display = "flex";
    backdrop.style.alignItems = "center";
    backdrop.style.justifyContent = "center";

    const panel = document.createElement("div");
    panel.setAttribute(PICKER_DIALOG_ATTR, "panel");
    panel.style.background = "#ffffff";
    panel.style.borderRadius = "8px";
    panel.style.minWidth = "320px";
    panel.style.maxWidth = "420px";
    panel.style.boxShadow =
      "0 18px 24px rgba(15, 23, 42, 0.18), 0 4px 8px rgba(15, 23, 42, 0.1)";
    panel.style.padding = "20px 24px";
    panel.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    panel.style.color = "#1f2937";

    const title = document.createElement("h2");
    title.textContent = "Create a ZAPELM rule";
    title.style.margin = "0 0 8px";
    title.style.fontSize = "18px";

    const description = document.createElement("p");
    description.textContent = "Choose how to handle the selected element.";
    description.style.margin = "0 0 12px";
    description.style.fontSize = "13px";
    description.style.color = "#4b5563";

    const selectorBlock = document.createElement("code");
    selectorBlock.textContent = selector;
    selectorBlock.style.display = "block";
    selectorBlock.style.padding = "8px";
    selectorBlock.style.background = "#f3f4f6";
    selectorBlock.style.borderRadius = "4px";
    selectorBlock.style.marginBottom = "16px";
    selectorBlock.style.wordBreak = "break-all";
    selectorBlock.style.fontSize = "12px";

    const form = document.createElement("form");
    form.setAttribute(PICKER_DIALOG_ATTR, "form");

    const actionFieldset = createRadioFieldset<RuleAction>({
      legend: "Action",
      name: "zapelm-action",
      options: [
        { value: "hide", label: "Hide (display: none)" },
        { value: "remove", label: "Remove from the DOM" },
      ],
      defaultValue: "hide",
    });

    const modeFieldset = createRadioFieldset<RuleApplyMode>({
      legend: "When to apply",
      name: "zapelm-mode",
      options: [
        { value: "immediate", label: "Apply on page load" },
        { value: "observe", label: "Monitor and apply to new elements" },
      ],
      defaultValue: "immediate",
    });

    const enabledToggle = document.createElement("label");
    enabledToggle.style.display = "flex";
    enabledToggle.style.alignItems = "center";
    enabledToggle.style.gap = "8px";
    enabledToggle.style.fontSize = "13px";
    enabledToggle.style.margin = "12px 0 16px";

    const enabledCheckbox = document.createElement("input");
    enabledCheckbox.type = "checkbox";
    enabledCheckbox.checked = true;

    const enabledText = document.createElement("span");
    enabledText.textContent = "Enable this rule immediately";

    enabledToggle.appendChild(enabledCheckbox);
    enabledToggle.appendChild(enabledText);

    const buttonRow = document.createElement("div");
    buttonRow.style.display = "flex";
    buttonRow.style.justifyContent = "flex-end";
    buttonRow.style.gap = "8px";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.style.border = "none";
    cancelButton.style.background = "#e5e7eb";
    cancelButton.style.color = "#1f2937";
    cancelButton.style.padding = "8px 12px";
    cancelButton.style.borderRadius = "4px";
    cancelButton.style.cursor = "pointer";

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.textContent = "Save";
    submitButton.style.border = "none";
    submitButton.style.background = "#2563eb";
    submitButton.style.color = "#fff";
    submitButton.style.padding = "8px 16px";
    submitButton.style.borderRadius = "4px";
    submitButton.style.cursor = "pointer";

    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(submitButton);

    form.appendChild(actionFieldset);
    form.appendChild(modeFieldset);
    form.appendChild(enabledToggle);
    form.appendChild(buttonRow);

    panel.appendChild(title);
    panel.appendChild(description);
    panel.appendChild(selectorBlock);
    panel.appendChild(form);
    backdrop.appendChild(panel);

    let resolved = false;
    const cleanup = (result: {
      action: RuleAction;
      applyMode: RuleApplyMode;
      enabled: boolean;
    } | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      document.removeEventListener("keydown", onKeyDown, true);
      backdrop.remove();
      resolve(result);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(null);
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const actionInput = form.querySelector(
        'input[name="zapelm-action"]:checked',
      ) as HTMLInputElement | null;
      const modeInput = form.querySelector(
        'input[name="zapelm-mode"]:checked',
      ) as HTMLInputElement | null;

      const actionValue =
        (actionInput?.value as RuleAction | undefined) ?? "hide";
      const applyModeValue =
        (modeInput?.value as RuleApplyMode | undefined) ?? "immediate";

      cleanup({
        action: actionValue,
        applyMode: applyModeValue,
        enabled: enabledCheckbox.checked,
      });
    });

    cancelButton.addEventListener("click", () => {
      cleanup(null);
    });

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        cleanup(null);
      }
    });

    document.addEventListener("keydown", onKeyDown, true);

    (document.body ?? document.documentElement)?.appendChild(backdrop);
  });
}

function createRadioFieldset<T extends string>(options: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  defaultValue: T;
}): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  fieldset.style.border = "1px solid #e5e7eb";
  fieldset.style.borderRadius = "6px";
  fieldset.style.padding = "12px";
  fieldset.style.marginBottom = "12px";

  const legend = document.createElement("legend");
  legend.textContent = options.legend;
  legend.style.fontWeight = "600";
  legend.style.fontSize = "13px";
  legend.style.color = "#1f2937";

  fieldset.appendChild(legend);

  options.options.forEach((option) => {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";
    label.style.fontSize = "13px";
    label.style.marginTop = "6px";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = options.name;
    input.value = option.value;
    input.checked = option.value === options.defaultValue;

    label.appendChild(input);
    label.appendChild(document.createTextNode(option.label));
    fieldset.appendChild(label);
  });

  return fieldset;
}

function isSelectorValid(selector: string): boolean {
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function showToast(
  message: string,
  tone: "success" | "error" | "info" = "success",
) {
  if (!document.body) {
    return;
  }

  const toast = document.createElement("div");
  toast.setAttribute(PICKER_OVERLAY_ATTR, "toast");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "24px";
  toast.style.right = "24px";
  toast.style.padding = "10px 14px";
  toast.style.borderRadius = "6px";
  toast.style.fontFamily =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  toast.style.fontSize = "13px";
  toast.style.boxShadow = "0 10px 18px rgba(15, 23, 42, 0.18)";
  toast.style.zIndex = "2147483647";
  toast.style.color = "#fff";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 120ms ease-out, transform 120ms ease-out";
  toast.style.transform = "translateY(8px)";

  const backgroundMap: Record<"success" | "error" | "info", string> = {
    success: "#16a34a",
    error: "#dc2626",
    info: "#2563eb",
  };

  toast.style.background = backgroundMap[tone];

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(() => toast.remove(), 200);
  }, 2400);
}
