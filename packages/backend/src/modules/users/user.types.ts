export type Role = 'platform_admin' | 'superusuario' | 'admin' | 'manager' | 'tecnico' | 'asistente';

export interface CreateUserDTO {
  email: string;
  password: string;
  name: string;
  roles: Role[];
}

export interface UpdateUserDTO {
  email?: string;
  password?: string;
  name?: string;
  roles?: Role[];
  isActive?: boolean;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserFilters {
  page?: number;
  pageSize?: number;
  role?: Role;
  isActive?: boolean;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
