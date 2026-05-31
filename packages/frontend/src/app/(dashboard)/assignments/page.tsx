'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import AssignmentForm from '@/components/assignments/AssignmentForm';
import AssignmentList from '@/components/assignments/AssignmentList';

export interface Assignment {
  id: string;
  userId: string;
  userName: string;
  formId: string;
  formName: string;
  assignedAt: string;
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const response = await api<{
        data: Array<{
          id: string;
          tecnicoId: string;
          formId: string;
          createdAt: string;
          tecnico: { name: string };
          form: { name: string };
        }>;
      }>('/api/assignments');

      setAssignments(
        (response.data || []).map((assignment) => ({
          id: assignment.id,
          userId: assignment.tecnicoId,
          userName: assignment.tecnico.name,
          formId: assignment.formId,
          formName: assignment.form.name,
          assignedAt: assignment.createdAt,
        }))
      );
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const handleRevoke = async (id: string) => {
    if (!confirm('¿Revocar esta asignación?')) return;
    try {
      await api(`/api/assignments/${id}`, { method: 'DELETE' });
      fetchAssignments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Asignaciones</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-medium text-gray-700 mb-4">Nueva asignación</h2>
            <AssignmentForm onSuccess={fetchAssignments} />
          </div>
        </div>

        <div className="lg:col-span-2">
          {loading ? (
            <p className="text-gray-500">Cargando...</p>
          ) : (
            <AssignmentList assignments={assignments} onRevoke={handleRevoke} />
          )}
        </div>
      </div>
    </div>
  );
}
