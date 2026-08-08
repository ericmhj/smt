export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldValidation {
  pattern?: string;
  min?: number;
  max?: number;
  minlength?: number;
  maxlength?: number;
}

export interface FormField {
  name: string;
  type: string;
  required: boolean;
  label?: string;
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
}

export interface ParsedForm {
  fields: FormField[];
  sanitizedHtml: string;
}

export interface JSONSchema {
  $schema: string;
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
}

export interface JSONSchemaProperty {
  type: string;
  format?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export type ChangeType = 'structural' | 'aesthetic';

export interface ChangeDetectionResult {
  type: ChangeType;
  addedFields: string[];
  removedFields: string[];
  renamedFields: { old: string; new: string }[];
  typeChangedFields: string[];
}

export interface FormMetadata {
  name: string;
}

export interface FormUpdateResult {
  type: ChangeType;
  form: FormResponse;
  newVersion?: FormVersionResponse;
}

export interface FormResponse {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  currentVersion: number;
  templateId: string | null;
  formType: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormVersionResponse {
  id: string;
  formId: string;
  versionNumber: number;
  htmlContent: string;
  sanitizedHtml: string;
  jsonSchema: JSONSchema;
  fieldsMetadata: FormField[];
  changeType: string;
  createdBy: string;
  createdAt: string;
}

export interface FormFilters {
  page?: number;
  pageSize?: number;
  isActive?: boolean;
  search?: string;
}
