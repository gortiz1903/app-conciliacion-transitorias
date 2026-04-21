import { useQuery } from '@tanstack/react-query';
import { reportsApi, periodsApi } from '../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import {} from '../components/lib/utils';
import { getAgingLabel } from '../types';
import type { DashboardSummary, Period, AgingColor } from '../types';
import { useState } from 'react';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';

const agingBgColors: Record<AgingColor, string> = {
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  orange: 'bg-orange-100 text-orange-800',
  red: 'bg-red-100 text-red-800',
};

export default function DashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  const { data: periodsData } = useQuery({
    queryKey: ['periods'],
    queryFn: async () => {
      const res = await periodsApi.list();
      return res.data.periods as Period[];
    },
  });

  const periodId = selectedPeriod || periodsData?.[0]?.id;

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', periodId],
    queryFn: async () => {
      const res = await reportsApi.dashboard(periodId!);
      return res.data as DashboardSummary;
    },
    enabled: !!periodId,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={periodId || ''}
          onChange={(e) => setSelectedPeriod(parseInt(e.target.value, 10))}
        >
          {periodsData?.map((p) => (
            <option key={p.id} value={p.id}>{p.code}</option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-gray-500">Cargando datos...</p>}

      {dashboard && (
        <>
          {/* Aging summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {(['green', 'yellow', 'orange', 'red'] as AgingColor[]).map((color) => {
              const data = dashboard.aging.find((a) => a.aging_color === color);
              return (
                <Card key={color}>
                  <CardContent className="pt-6">
                    <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${agingBgColors[color]}`}>
                      {getAgingLabel(color)}
                    </div>
                    <p className="text-2xl font-bold mt-2">{data?.count || 0}</p>
                    <p className="text-xs text-gray-500">movimientos pendientes</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pending adjustments alert */}
          {dashboard.pendingAdjustments > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="text-sm text-amber-800">
                {dashboard.pendingAdjustments} ajustes por diferencial cambiario pendientes
              </span>
            </div>
          )}

          {/* Agency cards */}
          <h2 className="text-lg font-semibold mb-4">Estado por Agencia</h2>
          <div className="grid grid-cols-3 gap-4">
            {dashboard.agencySummary.map((agency) => {
              const total = Number(agency.total_accounts);
              const closed = Number(agency.closed_count);
              const progress = total > 0 ? Math.round((closed / total) * 100) : 0;
              return (
                <Card key={agency.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{agency.name}</CardTitle>
                    <p className="text-xs text-gray-500">{agency.code}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        {closed} cerradas
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-blue-500" />
                        {Number(agency.in_progress_count)} en proceso
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-gray-400" />
                        {Number(agency.pending_count)} pendientes
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
