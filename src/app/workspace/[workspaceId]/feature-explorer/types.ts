export interface CapabilityGroup {
  id: string;
  name: string;
  description: string;
}

export interface FeatureSummary {
  id: string;
  name: string;
  group: string;
  summary: string;
  status: string;
  sessionCount: number;
  changedFiles: number;
  updatedAt: string;
  sourceFileCount: number;
  pageCount: number;
  apiCount: number;
}

export interface FeatureSurfacePage {
  route: string;
  title: string;
  description: string;
  sourceFile: string;
}

export interface FeatureSurfaceApi {
  domain: string;
  method: string;
  path: string;
  operationId: string;
  summary: string;
}

export interface FeatureSurfaceImplementationApi {
  label: string;
  domain: string;
  method: string;
  path: string;
  sourceFiles: string[];
}

export interface FeatureSurfaceMetadataGroup {
  id: string;
  name: string;
  description?: string;
}

export interface FeatureSurfaceMetadataItem {
  id: string;
  name: string;
  group?: string;
  summary?: string;
  pages?: string[];
  apis?: string[];
  domainObjects?: string[];
  relatedFeatures?: string[];
  sourceFiles?: string[];
  screenshots?: string[];
  status?: string;
}

export interface FeatureSurfaceMetadata {
  schemaVersion: number;
  capabilityGroups: FeatureSurfaceMetadataGroup[];
  features: FeatureSurfaceMetadataItem[];
}

export interface FeatureSurfaceIndexResponse {
  generatedAt: string;
  pages: FeatureSurfacePage[];
  apis: FeatureSurfaceApi[];
  contractApis: FeatureSurfaceApi[];
  nextjsApis: FeatureSurfaceImplementationApi[];
  rustApis: FeatureSurfaceImplementationApi[];
  implementationApis: FeatureSurfaceImplementationApi[];
  metadata: FeatureSurfaceMetadata | null;
  repoRoot: string;
  warnings: string[];
}

export interface FeatureListResponse {
  capabilityGroups: CapabilityGroup[];
  features: FeatureSummary[];
}
