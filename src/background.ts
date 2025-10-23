import {
  AddRuleRequest,
  BackgroundResponse,
  BackgroundToContentMessage,
  ContentReadyMessage,
  ContentToBackgroundMessage,
  DeleteRuleRequest,
  GetAllRulesRequest,
  GetRulesRequest,
  ImportRulesRequest,
  Rule,
  RuleInput,
  RuleResponse,
  ToggleDomainRequest,
  UpdateRuleRequest,
} from "./utils/types";
import {
  createRule,
  getRulesForHostname,
  loadRuleMap,
  saveRuleMap,
  setRulesForHostname,
  updateRule,
} from "./utils/storage";

const tabActivation = new Map<number, boolean>();
const domainOverrides = new Map<string, boolean>();

browser.runtime.onMessage.addListener(
  (
    message: ContentToBackgroundMessage,
    sender,
  ): Promise<BackgroundResponse | void> | void => {
    if (!message || typeof message !== "object" || !("type" in message)) {
      return undefined;
    }

    switch (message.type) {
      case "contentReady":
        return handleContentReady(message, sender.tab?.id ?? null);
      case "getRules":
        return respondWithRules(message);
      case "getAllRules":
        return handleGetAllRules(message);
      case "addRule":
        return handleAddRule(message);
      case "updateRule":
        return handleUpdateRule(message);
      case "deleteRule":
        return handleDeleteRule(message);
      case "toggleDomainEnabled":
        return handleToggleDomain(message);
      case "importRules":
        return handleImportRules(message);
      case "refreshContent":
        return broadcastHostname(message.hostname).then(
          (): BackgroundResponse => ({ success: true }),
        );
      default:
        return undefined;
    }
  },
);

browser.commands.onCommand.addListener(async (command) => {
  if (command === "zapelm.activatePicker") {
    await dispatchToActiveTab({ type: "activatePicker" });
    return;
  }

  if (command === "zapelm.toggleEnabled") {
    const tab = await getActiveTab();
    if (!tab?.id) {
      return;
    }

    const current = tabActivation.get(tab.id) ?? true;
    const next = !current;
    tabActivation.set(tab.id, next);
    await dispatchToTab(tab.id, {
      type: "setEnabled",
      enabled: next,
      reason: "command",
    });
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabActivation.delete(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabActivation.set(tabId, true);
  }
});

async function handleContentReady(
  message: ContentReadyMessage,
  tabId: number | null,
): Promise<void> {
  if (!tabId) {
    return;
  }

  const enabled = tabActivation.get(tabId) ?? true;
  const override = domainOverrides.get(message.hostname);

  await dispatchToTab(tabId, {
    type: "setEnabled",
    enabled: override ?? enabled,
    reason: "command",
  });

  const rules = await getRulesForHostname(message.hostname);
  await dispatchToTab(tabId, {
    type: "applyRules",
    rules,
  });
}

async function respondWithRules(
  request: GetRulesRequest,
): Promise<BackgroundResponse> {
  const rules = await getRulesForHostname(request.hostname);
  const override = domainOverrides.has(request.hostname)
    ? domainOverrides.get(request.hostname)
    : undefined;
  const domainEnabled = override ?? true;
  return {
    hostname: request.hostname,
    rules,
    domainEnabled,
  } satisfies RuleResponse;
}

async function handleGetAllRules(
  _request: GetAllRulesRequest,
): Promise<BackgroundResponse> {
  const map = await loadRuleMap();
  return { data: map };
}

async function handleAddRule(
  request: AddRuleRequest,
): Promise<BackgroundResponse> {
  const existing = await getRulesForHostname(request.hostname);
  const rule = createRule(request.rule as RuleInput);
  existing.push(rule);
  await setRulesForHostname(request.hostname, existing);
  await broadcastRules(request.hostname, existing);
  return { success: true };
}

async function handleUpdateRule(
  request: UpdateRuleRequest,
): Promise<BackgroundResponse> {
  const existing = await getRulesForHostname(request.hostname);
  const index = existing.findIndex((rule) => rule.id === request.ruleId);
  if (index === -1) {
    return { success: false, error: "Rule not found" };
  }
  const updated = updateRule(existing[index], request.patch);
  existing[index] = updated;
  await setRulesForHostname(request.hostname, existing);
  await broadcastRules(request.hostname, existing);
  return { success: true };
}

async function handleDeleteRule(
  request: DeleteRuleRequest,
): Promise<BackgroundResponse> {
  const existing = await getRulesForHostname(request.hostname);
  const next = existing.filter((rule) => rule.id !== request.ruleId);
  await setRulesForHostname(request.hostname, next);
  await broadcastRules(request.hostname, next);
  return { success: true };
}

async function handleToggleDomain(
  request: ToggleDomainRequest,
): Promise<BackgroundResponse> {
  if (request.enabled) {
    domainOverrides.delete(request.hostname);
  } else {
    domainOverrides.set(request.hostname, false);
  }
  await broadcastEnabledState(request.hostname, request.enabled);
  return { success: true };
}

async function handleImportRules(
  request: ImportRulesRequest,
): Promise<BackgroundResponse> {
  await saveRuleMap(request.data);
  await Promise.all(
    Object.entries(request.data).map(([hostname, rules]) =>
      broadcastRules(hostname, rules),
    ),
  );
  return { success: true };
}

async function broadcastRules(hostname: string, rules: Rule[]) {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => tab.id && tab.url && hostnameFromUrl(tab.url) === hostname)
      .map((tab) =>
        dispatchToTab(tab.id!, {
          type: "applyRules",
          rules,
        }),
      ),
  );
}

async function broadcastEnabledState(hostname: string, enabled: boolean) {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => tab.id && tab.url && hostnameFromUrl(tab.url) === hostname)
      .map((tab) =>
        dispatchToTab(tab.id!, {
          type: "setEnabled",
          enabled,
          reason: "popup",
        }),
      ),
  );
}

async function dispatchToActiveTab(message: BackgroundToContentMessage) {
  const tab = await getActiveTab();
  if (tab?.id) {
    await dispatchToTab(tab.id, message);
  }
}

async function dispatchToTab(
  tabId: number,
  message: BackgroundToContentMessage,
) {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Could not establish connection")
    ) {
      return;
    }
    console.error("Failed to dispatch message", error);
  }
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tabs[0];
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function broadcastHostname(hostname: string) {
  const rules = await getRulesForHostname(hostname);
  await broadcastRules(hostname, rules);
}
