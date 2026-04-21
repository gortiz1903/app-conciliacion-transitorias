import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { csvApi } from '../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';

export default function CsvUploadPage() {
  const [movementsFile, setMovementsFile] = useState<File | null>(null);
  const [balancesFile, setBalancesFile] = useState<File | null>(null);
  const [period, setPeriod] = useState('');

  const movementsMutation = useMutation({
    mutationFn: () => csvApi.uploadMovements(movementsFile!, period),
  });

  const balancesMutation = useMutation({
    mutationFn: () => csvApi.uploadBalances(balancesFile!, period),
  });

  const handleUploadMovements = () => {
    if (!movementsFile || !period) return;
    movementsMutation.mutate();
  };

  const handleUploadBalances = () => {
    if (!balancesFile || !period) return;
    balancesMutation.mutate();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Carga de Archivos CSV</h1>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Periodo</label>
        <input
          type="month"
          className="border rounded-md px-3 py-2 text-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="YYYY-MM"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Movements CSV */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" />
              CSV de Movimientos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setMovementsFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 mb-4"
            />
            {movementsFile && (
              <p className="text-sm text-gray-600 mb-4">{movementsFile.name} ({(movementsFile.size / 1024).toFixed(1)} KB)</p>
            )}
            <Button
              onClick={handleUploadMovements}
              disabled={!movementsFile || !period || movementsMutation.isPending}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {movementsMutation.isPending ? 'Procesando...' : 'Cargar Movimientos'}
            </Button>

            {movementsMutation.isSuccess && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Carga exitosa</span>
                </div>
                <div className="text-xs text-green-700 mt-1">
                  {movementsMutation.data?.data.processedRows} de {movementsMutation.data?.data.totalRows} filas procesadas
                  {movementsMutation.data?.data.errors?.length > 0 && (
                    <span> | {movementsMutation.data.data.errors.length} errores</span>
                  )}
                </div>
                {movementsMutation.data?.data.reopenedAccounts?.length > 0 && (
                  <div className="text-xs text-amber-700 mt-1">
                    {movementsMutation.data.data.reopenedAccounts.length} cuentas reabiertas
                  </div>
                )}
              </div>
            )}

            {movementsMutation.isError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Error al procesar el archivo</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Balances CSV */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" />
              CSV de Saldos Contables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setBalancesFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 mb-4"
            />
            {balancesFile && (
              <p className="text-sm text-gray-600 mb-4">{balancesFile.name} ({(balancesFile.size / 1024).toFixed(1)} KB)</p>
            )}
            <Button
              onClick={handleUploadBalances}
              disabled={!balancesFile || !period || balancesMutation.isPending}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {balancesMutation.isPending ? 'Procesando...' : 'Cargar Saldos'}
            </Button>

            {balancesMutation.isSuccess && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Saldos cargados</span>
                </div>
                <div className="text-xs text-green-700 mt-1">
                  {balancesMutation.data?.data.processed} registros procesados
                </div>
              </div>
            )}

            {balancesMutation.isError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Error al procesar saldos</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
