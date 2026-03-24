import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('accounts').del();

  // Transitory accounts — NORMAL type
  const normalAccounts = [
    { account_number: '10501', name: 'Bancos Moneda Nacional - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '10502', name: 'Bancos Moneda Extranjera - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '11301', name: 'Clientes Nacionales - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '11302', name: 'Clientes Extranjeros - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '21101', name: 'Proveedores Nacionales - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '21102', name: 'Proveedores Extranjeros - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '40501', name: 'Ingresos por Servicios - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '50101', name: 'Costos de Operación - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '11901', name: 'Deudores Diversos - Transitoria', reconciliation_type: 'NORMAL' },
    { account_number: '21901', name: 'Acreedores Diversos - Transitoria', reconciliation_type: 'NORMAL' },
  ];

  // Related accounts — RELATED type (82009.X and 92009.X)
  const relatedAccounts = [
    { account_number: '82009', name: 'Ingresos Relacionadas', reconciliation_type: 'RELATED' },
    { account_number: '92009', name: 'Costos Relacionadas', reconciliation_type: 'RELATED' },
  ];

  await knex('accounts').insert([...normalAccounts, ...relatedAccounts]);
}
