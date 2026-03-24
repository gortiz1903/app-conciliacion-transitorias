import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, agenciesApi } from '../services/api';
import { Button } from '../components/ui/button';
import type { User, Agency } from '../types';
import { useState } from 'react';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await usersApi.list()).data.users as User[],
  });

  const { data: _agencies } = useQuery({
    queryKey: ['agencies'],
    queryFn: async () => (await agenciesApi.list()).data.agencies as Agency[],
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      usersApi.updateRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Administracion de Usuarios</h1>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Rol</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-center px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <tr key={user.id} className="border-b">
                <td className="px-4 py-3 font-medium">{user.display_name}</td>
                <td className="px-4 py-3 text-gray-600">{user.email}</td>
                <td className="px-4 py-3">
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={user.role}
                    onChange={(e) => roleMutation.mutate({ userId: user.id, role: e.target.value })}
                  >
                    <option value="ADMIN">Administrador</option>
                    <option value="CONCILIADOR">Conciliador</option>
                    <option value="AUDITOR">Auditor</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingUser(editingUser === user.id ? null : user.id)}
                  >
                    Asignar Agencias
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
