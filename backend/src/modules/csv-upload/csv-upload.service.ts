import { parse } from 'csv-parse';
import { Readable } from 'stream';
import db from '../../config/database';
import logger from '../../config/logger';

interface CsvRow {
  AGENCIA: string;
  'Fecha asiento': string;
  PERIODO: string;
  ASIENTO: string;
  TIPO: string;
  CUENTA_CONTABLE: string;
  NOMBRE_CUENTA: string;
  DEBE: string;
  HABER: string;
  'Referencia registro': string;
  Numero_Documento: string;
  CLIENTE_PROVEEDOR: string;
  ORDEN_COMPRA: string;
  FACTURA: string;
}

interface ProcessingResult {
  uploadId: number;
  totalRows: number;
  processedRows: number;
  errors: Array<{ row: number; message: string }>;
  reopenedAccounts: Array<{ accountId: number; agencyId: number }>;
}

export async function processMovementsCsv(
  buffer: Buffer,
  filename: string,
  periodCode: string,
  userId: string
): Promise<ProcessingResult> {
  // Get or create period
  let period = await db('periods').where('code', periodCode).first();
  if (!period) {
    const [year, month] = periodCode.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    [period] = await db('periods')
      .insert({
        code: periodCode,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      })
      .returning('*');
  }

  // Create upload record
  const [upload] = await db('csv_uploads')
    .insert({
      filename,
      file_type: 'movements',
      period_id: period.id,
      uploaded_by: userId,
      status: 'PROCESSING',
    })
    .returning('*');

  const errors: Array<{ row: number; message: string }> = [];
  const reopenedAccounts: Array<{ accountId: number; agencyId: number }> = [];
  let processedRows = 0;
  let totalRows = 0;

  // Parse CSV
  const rows: CsvRow[] = await new Promise((resolve, reject) => {
    const results: CsvRow[] = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
        })
      )
      .on('data', (row: CsvRow) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });

  totalRows = rows.length;

  // Pre-load lookup maps
  const agencies = await db('agencies').select('*');
  const agencyMap = new Map(agencies.map((a) => [a.code, a]));

  const accounts = await db('accounts').select('*');
  const accountMap = new Map(accounts.map((a) => [a.account_number, a]));

  // Process in batches of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const movementsToInsert = [];

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const rowNum = i + j + 2; // +2 for header row and 1-based index

      try {
        // Resolve agency
        const agency = agencyMap.get(row.AGENCIA);
        if (!agency) {
          errors.push({ row: rowNum, message: `Unknown agency: ${row.AGENCIA}` });
          continue;
        }

        // Parse account number: extract base (e.g. 40501 from 40501.3)
        const fullAccount = row.CUENTA_CONTABLE;
        const baseAccount = fullAccount.split('.')[0];
        let account = accountMap.get(baseAccount);

        if (!account) {
          // Auto-create account if unknown
          [account] = await db('accounts')
            .insert({
              account_number: baseAccount,
              name: row.NOMBRE_CUENTA || `Cuenta ${baseAccount}`,
              reconciliation_type: ['82009', '92009'].includes(baseAccount) ? 'RELATED' : 'NORMAL',
            })
            .returning('*');
          accountMap.set(baseAccount, account);
        }

        // Parse amounts — handle commas and empty values
        const debit = parseAmount(row.DEBE);
        const credit = parseAmount(row.HABER);

        movementsToInsert.push({
          agency_id: agency.id,
          period_id: period.id,
          account_id: account.id,
          entry_date: row['Fecha asiento'],
          entry_number: row.ASIENTO || null,
          entry_type: row.TIPO || null,
          full_account_number: fullAccount,
          account_name: row.NOMBRE_CUENTA || null,
          debit,
          credit,
          reference: row['Referencia registro'] || null,
          document_number: row.Numero_Documento || null,
          client_vendor: row.CLIENTE_PROVEEDOR || null,
          purchase_order: row.ORDEN_COMPRA || null,
          invoice: row.FACTURA || null,
          status: 'PENDING',
          csv_upload_id: upload.id,
          original_csv_row: rowNum,
        });

        // Check if this account+agency+period was CLOSED — reopen it
        const accountPeriodStatus = await db('account_period_status')
          .where({
            account_id: account.id,
            agency_id: agency.id,
            period_id: period.id,
          })
          .first();

        if (accountPeriodStatus?.status === 'CLOSED') {
          await db('account_period_status')
            .where({ id: accountPeriodStatus.id })
            .update({ status: 'IN_PROGRESS', closed_by: null, closed_at: null });

          reopenedAccounts.push({ accountId: account.id, agencyId: agency.id });

          logger.info(`Reopened account ${baseAccount} for agency ${row.AGENCIA} in period ${periodCode}`);
        } else if (!accountPeriodStatus) {
          await db('account_period_status').insert({
            account_id: account.id,
            agency_id: agency.id,
            period_id: period.id,
            status: 'PENDING',
          });
        }

        processedRows++;
      } catch (err: any) {
        errors.push({ row: rowNum, message: err.message });
      }
    }

    // Bulk insert batch
    if (movementsToInsert.length > 0) {
      await db('movements').insert(movementsToInsert);
    }
  }

  // Update upload record
  await db('csv_uploads').where('id', upload.id).update({
    row_count: totalRows,
    processed_count: processedRows,
    error_count: errors.length,
    errors: JSON.stringify(errors.slice(0, 100)), // Cap stored errors
    status: errors.length > totalRows * 0.1 ? 'ERROR' : 'COMPLETED',
  });

  return {
    uploadId: upload.id,
    totalRows,
    processedRows,
    errors: errors.slice(0, 50),
    reopenedAccounts,
  };
}

export async function processBalancesCsv(
  buffer: Buffer,
  filename: string,
  periodCode: string,
  userId: string
): Promise<{ uploadId: number; processed: number; errors: Array<{ row: number; message: string }> }> {
  let period = await db('periods').where('code', periodCode).first();
  if (!period) {
    throw new Error(`Period ${periodCode} not found. Upload movements CSV first.`);
  }

  const [upload] = await db('csv_uploads')
    .insert({
      filename,
      file_type: 'balances',
      period_id: period.id,
      uploaded_by: userId,
      status: 'PROCESSING',
    })
    .returning('*');

  const rows: any[] = await new Promise((resolve, reject) => {
    const results: any[] = [];
    Readable.from(buffer)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }))
      .on('data', (row: any) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });

  const errors: Array<{ row: number; message: string }> = [];
  let processed = 0;

  const agencies = await db('agencies').select('*');
  const agencySuffixMap = new Map(agencies.map((a) => [a.suffix, a]));
  const accounts = await db('accounts').select('*');
  const accountMap = new Map(accounts.map((a) => [a.account_number, a]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const fullAccount = row.CUENTA_CONTABLE || row.cuenta_contable || row.account;
      const balance = parseAmount(row.SALDO || row.saldo || row.balance || '0');
      const baseAccount = fullAccount.split('.')[0];
      const suffix = '.' + fullAccount.split('.')[1];

      const account = accountMap.get(baseAccount);
      const agency = agencySuffixMap.get(suffix);

      if (!account) {
        errors.push({ row: rowNum, message: `Unknown account: ${baseAccount}` });
        continue;
      }
      if (!agency) {
        errors.push({ row: rowNum, message: `Unknown agency suffix: ${suffix}` });
        continue;
      }

      await db('accounting_balances')
        .insert({
          account_id: account.id,
          agency_id: agency.id,
          period_id: period.id,
          balance,
        })
        .onConflict(['account_id', 'agency_id', 'period_id'])
        .merge({ balance, uploaded_at: db.fn.now() });

      processed++;
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message });
    }
  }

  await db('csv_uploads').where('id', upload.id).update({
    row_count: rows.length,
    processed_count: processed,
    error_count: errors.length,
    errors: JSON.stringify(errors.slice(0, 100)),
    status: errors.length > rows.length * 0.1 ? 'ERROR' : 'COMPLETED',
  });

  return { uploadId: upload.id, processed, errors: errors.slice(0, 50) };
}

function parseAmount(value: string): number {
  if (!value || value.trim() === '') return 0;
  // Remove thousand separators and normalize decimal
  const cleaned = value.replace(/,/g, '').replace(/\s/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
