export type RuleAction = "hide" | "remove";

export type RuleApplyMode = "immediate" | "observe";

export interface Rule {
  id: string;
  selector: string;
  action: RuleAction;
  applyMode: RuleApplyMode;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RuleInput = Omit<Rule, "id" | "createdAt" | "updatedAt">;

export type RulePatch = Partial<Omit<Rule, "id" | "createdAt" | "updatedAt">>;

export type StoredRuleMap = Record<string, Rule[]>;

export interface GetRulesRequest {
  type: "getRules";
  hostname: string;
}

export interface GetAllRulesRequest {
  type: "getAllRules";
}

export interface AddRuleRequest {
  type: "addRule";
  hostname: string;
  rule: RuleInput;
}

export interface UpdateRuleRequest {
  type: "updateRule";
  hostname: string;
  ruleId: string;
  patch: RulePatch;
}

export interface DeleteRuleRequest {
  type: "deleteRule";
  hostname: string;
  ruleId: string;
}

export interface ImportRulesRequest {
  type: "importRules";
  data: StoredRuleMap;
}

export interface ToggleDomainRequest {
  type: "toggleDomainEnabled";
  hostname: string;
  enabled: boolean;
}

export interface RequestContentRefresh {
  type: "refreshContent";
  hostname: string;
}

export type BackgroundRequest =
  | GetRulesRequest
  | GetAllRulesRequest
  | AddRuleRequest
  | UpdateRuleRequest
  | DeleteRuleRequest
  | ImportRulesRequest
  | ToggleDomainRequest
  | RequestContentRefresh
  | ContentReadyMessage;

export interface RuleResponse {
  hostname: string;
  rules: Rule[];
  domainEnabled: boolean;
}

export interface AllRulesResponse {
  data: StoredRuleMap;
}

export interface OperationSuccess {
  success: true;
}

export interface OperationFailure {
  success: false;
  error: string;
}

export type BackgroundResponse =
  | RuleResponse
  | AllRulesResponse
  | OperationSuccess
  | OperationFailure;

export interface ActivatePickerMessage {
  type: "activatePicker";
}

export interface SetEnabledMessage {
  type: "setEnabled";
  enabled: boolean;
  reason?: "command" | "popup";
}

export interface ApplyRulesMessage {
  type: "applyRules";
  rules: Rule[];
}

export interface ContentReadyMessage {
  type: "contentReady";
  hostname: string;
}

export type BackgroundToContentMessage =
  | ActivatePickerMessage
  | SetEnabledMessage
  | ApplyRulesMessage;

export type ContentToBackgroundMessage = BackgroundRequest;
