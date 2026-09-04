'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface UserFormData {
  email: string;
  name: string;
  password?: string;
  role: string;
}

interface UserFormProps {
  initialData?: Partial<UserFormData>;
  isEdit?: boolean;
  onSubmit: (data: UserFormData) => Promise<void>;
}

export default function UserForm({ initialData, isEdit, onSubmit }: UserFormProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();

  // Derive email domain from tenant subdomain (e.g. "el-reloj.localhost:3000" → "@el-reloj.com")
  let tenantDomain = '';
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2 && parts[parts.length - 1] === 'localhost') {
      tenantDomain = `@${parts[0]}.com`;
    } else if (currentUser?.tenantSlug) {
      tenantDomain = `@${currentUser.tenantSlug}.com`;
    }
  }

  const [formData, setFormData] = useState<UserFormData>({
    email: initialData?.email || '',
    name: initialData?.name || '',
    password: '',
    role: initialData?.role || 'tecnico',
  });
  const [emailPrefix, setEmailPrefix] = useState(
    initialData?.email ? initialData.email.split('@')[0] || '' : ''
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordWarning, setShowPasswordWarning] = useState(false);

  // Update full email when prefix changes
  const handleEmailPrefixChange = (prefix: string) => {
    setEmailPrefix(prefix);
    setFormData({ ...formData, email: prefix ? `${prefix}${tenantDomain}` : '' });
  };

  // Sends the form data to the API. Password is stripped when empty (edit mode).
  const submitForm = async () => {
    setError('');
    const data = { ...formData };
    if (!data.password || data.password.trim() === '') {
      delete data.password;
    }

    setLoading(true);
    try {
      await onSubmit(data);
      router.push('/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // When editing and changing the password, warn that all active sessions
    // for this user will be closed and they will need to sign in again.
    const isPasswordChange = isEdit && !!formData.password && formData.password.trim() !== '';
    if (isPasswordChange) {
      setShowPasswordWarning(true);
      return;
    }

    await submitForm();
  };

  const confirmPasswordChange = async () => {
    setShowPasswordWarning(false);
    await submitForm();
  };

  return (
    <>
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
        <div className="flex">
          <input
            type="text"
            value={emailPrefix}
            onChange={(e) => handleEmailPrefixChange(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
            required
            placeholder="usuario"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="inline-flex items-center px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md text-sm text-gray-600">
            {tenantDomain}
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Contraseña {isEdit && '(dejar vacío para no cambiar)'}
        </label>
        <input
          type="text"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required={!isEdit}
          placeholder={isEdit ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
          minLength={isEdit ? undefined : 8}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        {!isEdit && (
          <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="tecnico">Técnico</option>
          <option value="asistente">Asistente</option>
          <option value="manager">Manager</option>
          <option value="admin">Administrador</option>
          <option value="superusuario">Superusuario</option>
        </select>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear usuario'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/users')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Cancelar
        </button>
      </div>
    </form>

    {showPasswordWarning && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwd-warning-title"
      >
        <div className="w-full max-w-md rounded-lg bg-white shadow-xl border-t-4 border-blue-600">
          <div className="flex items-start gap-4 p-6">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 id="pwd-warning-title" className="text-base font-semibold text-gray-900">
                Cambiar contraseña
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Al cambiar la contraseña se cerrarán todas las sesiones activas de este usuario
                y deberá iniciar sesión nuevamente. ¿Deseas continuar?
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowPasswordWarning(false)}
              disabled={loading}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmPasswordChange}
              disabled={loading}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Sí, cambiar contraseña'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
