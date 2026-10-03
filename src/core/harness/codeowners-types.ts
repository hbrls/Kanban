export type OwnerKind = "user" | "team" | "email";

export type CodeownersOwner = {
  name: string;
  kind: OwnerKind;
};

export type CodeownersRule = {
  pattern: string;
  owners: CodeownersOwner[];
  line: number;
  precedence: number;
};

export type OwnershipMatch = {
  filePath: string;
  owners: CodeownersOwner[];
  matchedRule: CodeownersRule | null;
  overlap: boolean;
  covered: boolean;
};

export type TriggerOwnershipCorrelation = {
  triggerName: string;
  severity: string;
  action: string;
  ownerGroups: string[];
  ownerGroupCount: number;
  touchedFileCount: number;
  unownedPaths: string[];
  overlappingPaths: string[];
  spansMultipleOwnerGroups: boolean;
  hasOwnershipGap: boolean;
};

export type OwnershipRoutingContext = {
  changedFiles: string[];
  touchedOwners: string[];
  touchedOwnerGroupsCount: number;
  unownedChangedFiles: string[];
  overlappingChangedFiles: string[];
  highRiskUnownedFiles: string[];
  crossOwnerTriggers: string[];
  triggerCorrelations: TriggerOwnershipCorrelation[];
};
