import { Rule, RuleInput, StoredRuleMap } from "./types";

const STORAGE_KEY = "zapelm.rules";

export async function loadRuleMap(): Promise<StoredRuleMap> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const map = stored[STORAGE_KEY] as StoredRuleMap | undefined;
  return map ?? {};
}

export async function saveRuleMap(map: StoredRuleMap): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: map });
}

export async function getRulesForHostname(
  hostname: string,
): Promise<Rule[]> {
  const map = await loadRuleMap();
  return map[hostname]?.slice() ?? [];
}

export async function setRulesForHostname(
  hostname: string,
  rules: Rule[],
): Promise<void> {
  const map = await loadRuleMap();
  if (rules.length === 0) {
    delete map[hostname];
  } else {
    map[hostname] = rules;
  }
  await saveRuleMap(map);
}

export function createRule(input: RuleInput): Rule {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  };
}

export function updateRule(rule: Rule, patch: Partial<Rule>): Rule {
  return {
    ...rule,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}
