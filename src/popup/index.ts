import {
  Rule,
  RuleAction,
  RuleApplyMode,
  RuleInput,
  RulePatch,
  StoredRuleMap,
} from "../utils";

type StatusTone = "success" | "error" | "info";

const DEBUG_FLAG_STORAGE_KEY = "zapelm.debug";

interface PopupState {
  hostname: string | null;
  rules: Rule[];
  domainEnabled: boolean;
  editingRuleId: string | null;
  debugEnabled: boolean;
}

const state: PopupState = {
  hostname: null,
  rules: [],
  domainEnabled: true,
  editingRuleId: null,
  debugEnabled: false,
};

const els = {
  hostname: getElement("[data-el='hostname']"),
  ruleCount: getElement("[data-el='ruleCount']"),
  debugToggle: getElement<HTMLInputElement>("[data-el='debugToggle']"),
  siteToggle: getElement<HTMLInputElement>("[data-el='siteToggle']"),
  formSection: getElement<HTMLElement>("[data-el='formSection']"),
  importSection: getElement<HTMLElement>("[data-el='importSection']"),
  importToggleIndicator: getElement<HTMLElement>(
    "[data-el='importToggleIndicator']",
  ),
  ruleList: getElement<HTMLUListElement>("[data-el='ruleList']"),
  emptyState: getElement<HTMLElement>("[data-el='emptyState']"),
  status: getElement<HTMLElement>("[data-el='status']"),
  openFormButton: getElement<HTMLButtonElement>("[data-action='openForm']"),
  refreshButton: getElement<HTMLButtonElement>("[data-action='refresh']"),
  formContainer: getElement<HTMLElement>("[data-el='form']"),
  formTitle: getElement<HTMLElement>("[data-el='formTitle']"),
  formElement: getElement<HTMLFormElement>("[data-el='formElement']"),
  cancelFormButton: getElement<HTMLButtonElement>(
    "[data-action='cancelForm']",
  ),
  jsonArea: getElement<HTMLTextAreaElement>("[data-el='jsonArea']"),
  exportButton: getElement<HTMLButtonElement>("[data-action='export']"),
  importButton: getElement<HTMLButtonElement>("[data-action='import']"),
};

const ruleTemplate = getElement<HTMLTemplateElement>(
  "#rule-item-template",
);

document.addEventListener("DOMContentLoaded", () => {
  void initializePopup();
});

async function initializePopup() {
  state.hostname = await getActiveHostname();

  if (!state.hostname) {
    renderUnavailable();
    await loadDebugFlag();
    return;
  }

  attachEventListeners();
  await loadDebugFlag();
  await loadRules();
}

function attachEventListeners() {
  els.debugToggle.addEventListener("change", handleDebugToggle);
  els.siteToggle.addEventListener("change", handleSiteToggle);
  els.openFormButton.addEventListener("click", () => openForm());
  els.cancelFormButton.addEventListener("click", closeForm);
  els.formElement.addEventListener("submit", handleFormSubmit);
  els.refreshButton.addEventListener("click", () => {
    void loadRules(true);
  });
  const importToggleButton = document.querySelector<HTMLButtonElement>(
    "[data-action='toggleImport']",
  );
  importToggleButton?.addEventListener("click", toggleImportSection);
  els.ruleList.addEventListener("click", handleRuleListClick);
  els.ruleList.addEventListener("change", handleRuleToggle);
  els.exportButton.addEventListener("click", () => void handleExport());
  els.importButton.addEventListener("click", () => void handleImport());

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(DEBUG_FLAG_STORAGE_KEY in changes)) {
      return;
    }
    const next = Boolean(changes[DEBUG_FLAG_STORAGE_KEY]?.newValue);
    state.debugEnabled = next;
    els.debugToggle.checked = next;
  });
}

async function loadRules(notify = false) {
  if (!state.hostname) {
    return;
  }

  try {
    const response = await browser.runtime.sendMessage({
      type: "getRules",
      hostname: state.hostname,
    });

    if (!response || !("rules" in response)) {
      throw new Error("Unexpected response");
    }

    state.rules = response.rules as Rule[];
    state.domainEnabled =
      typeof response.domainEnabled === "boolean"
        ? response.domainEnabled
        : true;

    renderRules();

    if (notify) {
      await browser.runtime.sendMessage({
        type: "refreshContent",
        hostname: state.hostname,
      });
      showStatus("Loaded the latest rules", "success");
    }
  } catch (error) {
    console.error("Failed to load rules", error);
    showStatus("Failed to fetch rules", "error");
  }
}

async function loadDebugFlag() {
  try {
    const stored = await browser.storage.local.get(DEBUG_FLAG_STORAGE_KEY);
    state.debugEnabled = Boolean(stored[DEBUG_FLAG_STORAGE_KEY]);
    els.debugToggle.checked = state.debugEnabled;
  } catch (error) {
    console.error("Failed to load debug flag", error);
    state.debugEnabled = false;
    els.debugToggle.checked = false;
    showStatus("Failed to fetch the debug logging setting", "error");
  }
}

function renderUnavailable() {
  els.hostname.textContent = "Not available on this page";
  els.ruleCount.textContent = "";
  els.siteToggle.disabled = true;
  els.openFormButton.disabled = true;
  els.refreshButton.disabled = true;
  els.emptyState.hidden = false;
  showStatus(
    "Rules cannot be managed on pages without a hostname (e.g., about:blank).",
    "info",
  );
}

function renderRules() {
  els.hostname.textContent = state.hostname ?? "-";
  els.ruleCount.textContent =
    state.rules.length === 1
      ? "1 rule"
      : `${state.rules.length} rules`;
  els.siteToggle.checked = state.domainEnabled;

  els.ruleList.replaceChildren(
    ...state.rules.map((rule) => createRuleListItem(rule)),
  );

  els.emptyState.hidden = state.rules.length > 0;

  if (state.editingRuleId) {
    const currentRule = state.rules.find(
      (rule) => rule.id === state.editingRuleId,
    );
    if (!currentRule) {
      closeForm();
    }
  }
}

function createRuleListItem(rule: Rule): HTMLLIElement {
  const fragment = document.importNode(ruleTemplate.content, true);
  const item = fragment.querySelector("li");
  if (!item) {
    throw new Error("Rule template is missing list element");
  }

  item.dataset.ruleId = rule.id;

  const selectorEl = fragment.querySelector<HTMLElement>(
    "[data-slot='selector']",
  );
  const actionEl = fragment.querySelector<HTMLElement>(
    "[data-slot='action']",
  );
  const modeEl = fragment.querySelector<HTMLElement>("[data-slot='mode']");
  const toggleInput = fragment.querySelector<HTMLInputElement>(
    "[data-action='toggleRule']",
  );

  if (selectorEl) {
    selectorEl.textContent = rule.selector;
  }
  if (actionEl) {
    actionEl.textContent = rule.action === "hide" ? "Hide" : "Remove";
    actionEl.classList.toggle("success", rule.action === "hide");
    actionEl.classList.toggle("danger", rule.action === "remove");
  }
  if (modeEl) {
    modeEl.textContent =
      rule.applyMode === "observe" ? "Monitored" : "On load";
  }
  if (toggleInput) {
    toggleInput.checked = rule.enabled;
  }

  return item;
}

function handleRuleListClick(event: Event) {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>("button[data-action]");
  if (!button) {
    return;
  }

  const listItem = button.closest<HTMLLIElement>(".rule-item");
  const ruleId = listItem?.dataset.ruleId;
  if (!ruleId || !state.hostname) {
    return;
  }

  switch (button.dataset.action) {
    case "editRule": {
      const rule = state.rules.find((r) => r.id === ruleId);
      if (rule) {
        openForm(rule);
      }
      break;
    }
    case "deleteRule":
      void deleteRule(ruleId);
      break;
    default:
      break;
  }
}

function handleRuleToggle(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.dataset.action !== "toggleRule") {
    return;
  }

  const listItem = target.closest<HTMLLIElement>(".rule-item");
  const ruleId = listItem?.dataset.ruleId;

  if (!ruleId || !state.hostname) {
    return;
  }

  target.disabled = true;

  void browser.runtime
    .sendMessage({
      type: "updateRule",
      hostname: state.hostname,
      ruleId,
      patch: { enabled: target.checked } satisfies RulePatch,
    })
    .then(() => showStatus("Updated enabled state", "success"))
    .catch((error: unknown) => {
      console.error("Failed to toggle rule", error);
      showStatus("Failed to toggle enabled state", "error");
      target.checked = !target.checked;
    })
    .finally(async () => {
      target.disabled = false;
      await loadRules();
    });
}

async function handleDebugToggle(event: Event) {
  const checkbox = event.target as HTMLInputElement;
  checkbox.disabled = true;
  const next = checkbox.checked;

  try {
    await browser.storage.local.set({ [DEBUG_FLAG_STORAGE_KEY]: next });
    state.debugEnabled = next;
    showStatus(
      next
        ? "Enabled debug logging (outputs to the page console)"
        : "Disabled debug logging",
      "info",
    );
  } catch (error) {
    console.error("Failed to toggle debug logging", error);
    checkbox.checked = !next;
    state.debugEnabled = checkbox.checked;
    showStatus("Failed to update the debug logging setting", "error");
  } finally {
    checkbox.disabled = false;
  }
}

async function handleSiteToggle(event: Event) {
  if (!state.hostname) {
    return;
  }
  const checkbox = event.target as HTMLInputElement;
  checkbox.disabled = true;

  try {
    await browser.runtime.sendMessage({
      type: "toggleDomainEnabled",
      hostname: state.hostname,
      enabled: checkbox.checked,
    });
    state.domainEnabled = checkbox.checked;
    showStatus(
      checkbox.checked
        ? "Enabled rules for this site"
        : "Disabled rules for this site",
      "success",
    );
  } catch (error) {
    console.error("Failed to toggle domain state", error);
    checkbox.checked = !checkbox.checked;
    showStatus("Failed to toggle the site-level setting", "error");
  } finally {
    checkbox.disabled = false;
  }
}

function openForm(rule?: Rule) {
  state.editingRuleId = rule?.id ?? null;
  els.formTitle.textContent = rule ? "Edit rule" : "Add rule";
  els.formSection.hidden = false;
  els.formContainer.setAttribute("aria-hidden", "false");

  const selectorInput = els.formElement.querySelector<HTMLInputElement>(
    "input[name='selector']",
  );
  const actionSelect = els.formElement.querySelector<HTMLSelectElement>(
    "select[name='action']",
  );
  const modeSelect = els.formElement.querySelector<HTMLSelectElement>(
    "select[name='mode']",
  );
  const enabledCheckbox = els.formElement.querySelector<HTMLInputElement>(
    "input[name='enabled']",
  );

  if (!selectorInput || !actionSelect || !modeSelect || !enabledCheckbox) {
    throw new Error("Failed to locate form elements");
  }

  selectorInput.value = rule?.selector ?? "";
  actionSelect.value = rule?.action ?? "hide";
  modeSelect.value = rule?.applyMode ?? "immediate";
  enabledCheckbox.checked = rule?.enabled ?? true;
  selectorInput.focus();
}

function closeForm() {
  state.editingRuleId = null;
  els.formContainer.setAttribute("aria-hidden", "true");
  els.formSection.hidden = true;
  els.formElement.reset();
}

function toggleImportSection() {
  const isHidden = els.importSection.hidden;
  els.importSection.hidden = !isHidden;
  els.importToggleIndicator.textContent = isHidden ? "▲" : "▼";
}

async function handleFormSubmit(event: Event) {
  event.preventDefault();

  if (!state.hostname) {
    return;
  }

  const formData = new FormData(els.formElement);
  const selector = (formData.get("selector") as string).trim();
  const action = formData.get("action") as RuleAction | null;
  const applyMode = formData.get("mode") as RuleApplyMode | null;
  const enabledValue = formData.get("enabled") !== null;

  if (!selector) {
    showStatus("Enter a CSS selector.", "error");
    return;
  }

  const payload = {
    selector,
    action: action ?? "hide",
    applyMode: applyMode ?? "immediate",
    enabled: enabledValue,
  } satisfies RuleInput;

  try {
    if (state.editingRuleId) {
      await browser.runtime.sendMessage({
        type: "updateRule",
        hostname: state.hostname,
        ruleId: state.editingRuleId,
        patch: payload satisfies RulePatch,
      });
      showStatus("Rule updated", "success");
    } else {
      await browser.runtime.sendMessage({
        type: "addRule",
        hostname: state.hostname,
        rule: payload,
      });
      showStatus("Rule added", "success");
    }
    closeForm();
    await loadRules();
  } catch (error) {
    console.error("Failed to submit form", error);
    showStatus("Failed to save the rule", "error");
  }
}

async function deleteRule(ruleId: string) {
  if (!state.hostname) {
    return;
  }

  const confirmed = window.confirm("Delete the selected rule?");
  if (!confirmed) {
    return;
  }

  try {
    await browser.runtime.sendMessage({
      type: "deleteRule",
      hostname: state.hostname,
      ruleId,
    });
    showStatus("Rule deleted", "success");
    await loadRules();
  } catch (error) {
    console.error("Failed to delete rule", error);
    showStatus("Failed to delete the rule", "error");
  }
}

async function handleExport() {
  try {
    const response = await browser.runtime.sendMessage({
      type: "getAllRules",
    });
    if (!response || !("data" in response)) {
      throw new Error("Unexpected response");
    }
    const json = JSON.stringify(response.data as StoredRuleMap, null, 2);
    els.jsonArea.value = json;
    showStatus("Exported JSON. Copy it as needed.", "success");
  } catch (error) {
    console.error("Export failed", error);
    showStatus("Export failed", "error");
  }
}

async function handleImport() {
  const raw = els.jsonArea.value.trim();
  if (!raw) {
    showStatus("Provide JSON to import.", "error");
    return;
  }

  try {
    const data = JSON.parse(raw) as StoredRuleMap;
    validateRuleMap(data);

    await browser.runtime.sendMessage({
      type: "importRules",
      data,
    });
    showStatus("Imported rules from JSON", "success");

    if (state.hostname) {
      await loadRules();
      await browser.runtime.sendMessage({
        type: "refreshContent",
        hostname: state.hostname,
      });
    }
  } catch (error) {
    console.error("Import failed", error);
    showStatus(
      error instanceof Error ? error.message : "Import failed",
      "error",
    );
  }
}

function validateRuleMap(map: StoredRuleMap) {
  if (typeof map !== "object" || map === null) {
    throw new Error("Invalid JSON format.");
  }

  for (const [hostname, rules] of Object.entries(map)) {
    if (typeof hostname !== "string" || !Array.isArray(rules)) {
      throw new Error("Invalid JSON structure.");
    }

    rules.forEach((rule) => {
      if (
        typeof rule !== "object" ||
        rule === null ||
        typeof rule.selector !== "string" ||
        (rule.action !== "hide" && rule.action !== "remove") ||
        (rule.applyMode !== "immediate" && rule.applyMode !== "observe")
      ) {
        throw new Error(`Invalid rule format (${hostname}).`);
      }
    });
  }
}

function showStatus(message: string, tone: StatusTone) {
  els.status.textContent = message;
  els.status.dataset.variant = tone;
}

async function getActiveHostname(): Promise<string | null> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tab = tabs[0];
  if (!tab?.url) {
    return null;
  }
  try {
    return new URL(tab.url).hostname;
  } catch {
    return null;
  }
}

async function handleImportShortcut(event: ClipboardEvent) {
  if (!event.clipboardData) {
    return;
  }
  const text = event.clipboardData.getData("text/plain");
  if (text) {
    els.jsonArea.value = text;
    showStatus("Pasted JSON from the clipboard", "info");
  }
}

els.jsonArea.addEventListener("paste", handleImportShortcut);

function getElement<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector(selector) as T | null;
  if (!element) {
    throw new Error(`Required element not found for selector: ${selector}`);
  }
  return element;
}
