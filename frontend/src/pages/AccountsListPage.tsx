import { useQuery } from '@tanstack/react-query';
import { accountsApi, periodsApi, agenciesApi } from '../services/api';
import type { Account, Period, Agency } from '../types';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function AccountsListPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  const { data: periods } = useQuery({
    queryKey: ['periods'],
    queryFn: async () => (await periodsApi.list()).data.periods as Period[],
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await accountsApi.list()).data.accounts as Account[],
  });

  const { data: agencies } = useQuery({
    queryKey: ['agencies'],
    queryFn: async () => (await agenciesApi.list()).data.agencies as Agency[],
  });

  const periodId = selectedPeriod || periods?.[0]?.id;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cuentas Transitorias</h1>
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={periodId || ''}
          onChange={(e) => setSelectedPeriod(parseInt(e.target.value, 10))}
        >
          {periods?.map((p) => (
            <option key={p.id} value={p.id}>{p.code}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Cuenta</th>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Agencia</th>
              <th className="text-center px-4 py-3 font-medium">Accion</th>
            </tr>
          </thead>
          <tbody>
            {accounts?.map((account) =>
              agencies?.map((agency) => (
                <tr key={`${account.id}-${agency.id}`} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{account.account_number}{agency.suffix}</td>
                  <td className="px-4 py-3">{account.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      account.reconciliation_type === 'RELATED'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {account.reconciliation_type === 'RELATED' ? 'Relacionada' : 'Normal'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{agency.name} ({agency.code})</td>
                  <td className="px-4 py-3 text-center">
                    {periodId && (
                      <Link
                        to={`/accounts/${account.id}/agency/${agency.id}?period=${periodId}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Ver detalle
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
