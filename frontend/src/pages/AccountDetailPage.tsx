import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { movementsApi, reconciliationApi, reportsApi } from '../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { formatCurrency, formatDate } from '../components/lib/utils';
import { getAgingColor } from '../types';
import type { Movement, ReconciliationSuggestion, ReconciliationProof } from '../types';
import { useState } from 'react';
import { Check, X, Download, Lock } from 'lucide-react';

const agingDotColors: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
};

export default function AccountDetailPage() {
  const { accountId, agencyId } = useParams();
  const [searchParams] = useSearchParams();
  const periodId = searchParams.get('period');
  const queryClient = useQueryClient();

  const [selectedMovements, setSelectedMovements] = useState<number[]>([]);
  const [reconcileNotes, setReconcileNotes] = useState('');

  const accId = parseInt(accountId!, 10);
  const agcId = parseInt(agencyId!, 10);
  const perId = parseInt(periodId!, 10);

  // Fetch movements
  const { data: movementsData } = useQuery({
    queryKey: ['movements', accId, agcId, perId],
    queryFn: async () => {
      const res = await movementsApi.list({
        account_id: accId,
        agency_id: agcId,
        period_id: perId,
        limit: 500,
      });
      return res.data;
    },
    enabled: !!accId && !!agcId && !!perId,
  });

  // Fetch suggestions
  const { data: suggestionsData } = useQuery({
    queryKey: ['suggestions', accId, agcId, perId],
    queryFn: async () => {
      const res = await reconciliationApi.getSuggestions(accId, agcId, perId);
      return res.data.suggestions as ReconciliationSuggestion[];
    },
    enabled: !!accId && !!agcId && !!perId,
  });

  // Reconciliation proof
  const { data: proof } = useQuery({
    queryKey: ['proof', accId, agcId, perId],
    queryFn: async () => {
      const res = await reportsApi.reconciliationProof(accId, agcId, perId);
      return res.data as ReconciliationProof;
    },
    enabled: !!accId && !!agcId && !!perId,
  });

  // Reconcile mutation
  const reconcileMutation = useMutation({
    mutationFn: (data: { movement_ids: number[]; notes: string }) =>
      reconciliationApi.createGroup({
        movement_ids: data.movement_ids,
        account_id: accId,
        agency_id: agcId,
        period_id: perId,
        notes: data.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['proof'] });
      setSelectedMovements([]);
      setReconcileNotes('');
    },
  });

  // Close account mutation
  const closeMutation = useMutation({
    mutationFn: () =>
      reconciliationApi.closeAccount({
        account_id: accId,
        agency_id: agcId,
        period_id: perId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
    },
  });

  const movements: Movement[] = movementsData?.movements || [];
  const pendingMovements = movements.filter((m) => m.status === 'PENDING');
  const reconciledMovements = movements.filter((m) => m.status !== 'PENDING');

  const toggleMovement = (id: number) => {
    setSelectedMovements((prev) =>
      prev.includes(id) ? prev.filter((mid) => mid !== id) : [...prev, id]
    );
  };

  const handleReconcile = () => {
    if (selectedMovements.length < 2) return;
    reconcileMutation.mutate({ movement_ids: selectedMovements, notes: reconcileNotes });
  };

  const handleExportExcel = async () => {
    const res = await reportsApi.exportExcel(accId, agcId, perId);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `conciliacion_${accId}_${perId}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const applySuggestion = (suggestion: ReconciliationSuggestion) => {
    setSelectedMovements([suggestion.movementId, ...suggestion.matchedMovementIds]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Detalle de Cuenta</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          {proof?.isBalanced && (
            <Button size="sm" onClick={() => closeMutation.mutate()}>
              <Lock className="h-4 w-4 mr-2" />
              Cerrar Cuenta
            </Button>
          )}
        </div>
      </div>

      {/* Reconciliation Proof */}
      {proof && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prueba de Conciliacion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Pendientes</p>
                <p className="text-lg font-bold">{formatCurrency(proof.pendingBalance)}</p>
              </div>
              <div>
                <p className="text-gray-500">Saldo Contable</p>
                <p className="text-lg font-bold">{formatCurrency(proof.systemBalance)}</p>
              </div>
              <div>
                <p className="text-gray-500">Ajustes Diferencial</p>
                <p className="text-lg font-bold">{formatCurrency(proof.adjustments)}</p>
              </div>
              <div>
                <p className="text-gray-500">Diferencia</p>
                <p className={`text-lg font-bold ${proof.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(proof.difference)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {suggestionsData && suggestionsData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sugerencias de Cruce ({suggestionsData.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suggestionsData.slice(0, 10).map((s, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg text-sm">
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      s.confidence === 'high' ? 'bg-green-100 text-green-800' :
                      s.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {s.matchType} ({s.confidence})
                    </span>
                    <span className="ml-2">
                      Mov #{s.movementId} + {s.matchedMovementIds.length} mov(s)
                    </span>
                    {s.difference > 0 && (
                      <span className="ml-2 text-amber-600">Dif: {formatCurrency(s.difference)}</span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => applySuggestion(s)}>
                    Aplicar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected movements for reconciliation */}
      {selectedMovements.length > 0 && (
        <Card className="mb-6 border-blue-300 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{selectedMovements.length} movimientos seleccionados</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Notas (opcional)"
                  className="border rounded px-2 py-1 text-sm"
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={handleReconcile}
                  disabled={selectedMovements.length < 2 || reconcileMutation.isPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Conciliar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedMovements([])}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Movements */}
      <h2 className="text-lg font-semibold mb-3">Movimientos Pendientes ({pendingMovements.length})</h2>
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="text-left px-3 py-2 font-medium">Fecha</th>
              <th className="text-left px-3 py-2 font-medium">Asiento</th>
              <th className="text-left px-3 py-2 font-medium">Tipo</th>
              <th className="text-right px-3 py-2 font-medium">Debe</th>
              <th className="text-right px-3 py-2 font-medium">Haber</th>
              <th className="text-left px-3 py-2 font-medium">Referencia</th>
              <th className="text-left px-3 py-2 font-medium">Documento</th>
              <th className="text-left px-3 py-2 font-medium">Factura</th>
            </tr>
          </thead>
          <tbody>
            {pendingMovements.map((m) => {
              const aging = getAgingColor(m.entry_date);
              return (
                <tr
                  key={m.id}
                  className={`border-b hover:bg-gray-50 cursor-pointer ${
                    selectedMovements.includes(m.id) ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => toggleMovement(m.id)}
                >
                  <td className="px-3 py-2">
                    <div className={`w-3 h-3 rounded-full ${agingDotColors[aging]}`} title={`Antiguedad: ${aging}`} />
                  </td>
                  <td className="px-3 py-2">{formatDate(m.entry_date)}</td>
                  <td className="px-3 py-2 font-mono">{m.entry_number}</td>
                  <td className="px-3 py-2">{m.entry_type}</td>
                  <td className="px-3 py-2 text-right font-mono">{m.debit > 0 ? formatCurrency(m.debit) : ''}</td>
                  <td className="px-3 py-2 text-right font-mono">{m.credit > 0 ? formatCurrency(m.credit) : ''}</td>
                  <td className="px-3 py-2 truncate max-w-[200px]">{m.reference}</td>
                  <td className="px-3 py-2">{m.document_number}</td>
                  <td className="px-3 py-2">{m.invoice}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reconciled Movements */}
      <h2 className="text-lg font-semibold mb-3">Conciliados ({reconciledMovements.length})</h2>
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Fecha</th>
              <th className="text-left px-3 py-2 font-medium">Asiento</th>
              <th className="text-right px-3 py-2 font-medium">Debe</th>
              <th className="text-right px-3 py-2 font-medium">Haber</th>
              <th className="text-left px-3 py-2 font-medium">Referencia</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {reconciledMovements.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="px-3 py-2">{formatDate(m.entry_date)}</td>
                <td className="px-3 py-2 font-mono">{m.entry_number}</td>
                <td className="px-3 py-2 text-right font-mono">{m.debit > 0 ? formatCurrency(m.debit) : ''}</td>
                <td className="px-3 py-2 text-right font-mono">{m.credit > 0 ? formatCurrency(m.credit) : ''}</td>
                <td className="px-3 py-2 truncate max-w-[200px]">{m.reference}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    m.status === 'RECONCILED_COMPLETE' ? 'bg-green-100 text-green-800' :
                    m.status === 'RECONCILED_WITH_DIFF' ? 'bg-amber-100 text-amber-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {m.status === 'RECONCILED_COMPLETE' ? 'Completo' :
                     m.status === 'RECONCILED_WITH_DIFF' ? 'Con diferencial' :
                     m.status === 'CLOSED' ? 'Cerrado' : m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
