export interface AssignFormDTO {
  formId: string;
  tecnicoId: string;
}

export interface AssignmentResponse {
  id: string;
  formId: string;
  tecnicoId: string;
  assignedBy: string;
  isActive: boolean;
  createdAt: string;
  revokedAt: string | null;
}

export interface AssignmentWithFormResponse {
  id: string;
  formId: string;
  tecnicoId: string;
  assignedBy: string;
  isActive: boolean;
  createdAt: string;
  revokedAt: string | null;
  form: {
    name: string;
    slug: string;
    currentVersion: number;
  };
}

export interface AssignmentWithTecnicoResponse {
  id: string;
  formId: string;
  tecnicoId: string;
  assignedBy: string;
  isActive: boolean;
  createdAt: string;
  revokedAt: string | null;
  tecnico: {
    name: string;
    email: string;
  };
}

export interface MyFormResponse {
  id: string;
  formId: string;
  formName: string;
  formSlug: string;
  currentVersion: number;
  jsonSchema: unknown;
  assignedAt: string;
}
