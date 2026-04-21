import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import { AuthenticatedRequest, requireAuth } from '../../middleware/auth';
import db from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// Dashboard summary
router.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { period_id } = req.query;
  if (!period_id) throw new AppError(400, 'period_id is required');

  // Summary by agency
  const agencySummary = await db('account_period_status')
    .join('agencies', 'agencies.id', 'account_period_status.agency_id')
    .where('account_period_status.period_id', period_id)
    .select('agencies.id', 'agencies.code', 'agencies.name')
    .count('* as total_accounts')
    .sum(db.raw("CASE WHEN account_period_status.status = 'CLOSED' THEN 1 ELSE 0 END as closed_count"))
    .sum(db.raw("CASE WHEN account_period_status.status = 'IN_PROGRESS' THEN 1 ELSE 0 END as in_progress_count"))
    .sum(db.raw("CASE WHEN account_period_status.status = 'PENDING' THEN 1 ELSE 0 END as pending_count"))
    .groupBy('agencies.id', 'agencies.code', 'agencies.name');

  // Aging of pending movements
  const aging = await db('movements')
    .where({ period_id: period_id as string, status: 'PENDING' })
    .select(
      db.raw(`
        CASE
          WHEN CURRENT_DATE - entry_date <= 30 THEN 'green'
          WHEN CURRENT_DATE - entry_date <= 60 THEN 'yellow'
          WHEN CURRENT_DATE - entry_date <= 90 THEN 'orange'
          ELSE 'red'
        END as aging_color
      `)
    )
    .count('id as count')
    .sum('debit as total_debit')
    .sum('credit as total_credit')
    .groupBy('aging_color');

  // Pending exchange rate adjustments count
  const [pendingAdjustments] = await db('exchange_rate_adjustments')
    .where('status', 'PENDING')
    .count('id as count');

  res.json({ agencySummary, aging, pendingAdjustments: parseInt(pendingAdjustments.count as string, 10) });
});

// Reconciliation proof for an account
router.get('/reconciliation-proof', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { account_id, agency_id, period_id } = req.query;
  if (!account_id || !agency_id || !period_id) {
    throw new AppError(400, 'account_id, agency_id, and period_id are required');
  }

  // Pending movements sum
  const [pendingSum] = await db('movements')
    .where({ account_id, agency_id, period_id, status: 'PENDING' })
    .select(
      db.raw('COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) as pending_balance')
    );

  // Accounting balance
  const accountingBalance = await db('accounting_balances')
    .where({ account_id, agency_id, period_id })
    .select('balance')
    .first();

  // Exchange rate adjustments
  const [adjustmentSum] = await db('exchange_rate_adjustments')
    .join('reconciliation_groups', 'reconciliation_groups.id', 'exchange_rate_adjustments.group_id')
    .where({
      'reconciliation_groups.account_id': account_id,
      'reconciliation_groups.agency_id': agency_id,
      'reconciliation_groups.period_id': period_id,
      'exchange_rate_adjustments.status': 'PENDING',
    })
    .select(db.raw('COALESCE(SUM(expected_amount), 0) as total_adjustment'));

  const pendingBalance = parseFloat(pendingSum.pending_balance) || 0;
  const systemBalance = parseFloat(accountingBalance?.balance) || 0;
  const adjustments = parseFloat(adjustmentSum.total_adjustment) || 0;
  const difference = pendingBalance + adjustments - systemBalance;

  res.json({
    pendingBalance,
    systemBalance,
    adjustments,
    difference,
    isBalanced: Math.abs(difference) < 0.01,
  });
});

// Export to Excel
router.get('/export/excel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { account_id, agency_id, period_id } = req.query;
  if (!account_id || !agency_id || !period_id) {
    throw new AppError(400, 'account_id, agency_id, and period_id required');
  }

  const movements = await db('movements')
    .where({ account_id, agency_id, period_id })
    .orderBy('entry_date', 'asc');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Conciliación');

  sheet.columns = [
    { header: 'Fecha', key: 'entry_date', width: 12 },
    { header: 'Asiento', key: 'entry_number', width: 12 },
    { header: 'Tipo', key: 'entry_type', width: 8 },
    { header: 'Cuenta', key: 'full_account_number', width: 15 },
    { header: 'Debe', key: 'debit', width: 15 },
    { header: 'Haber', key: 'credit', width: 15 },
    { header: 'Referencia', key: 'reference', width: 30 },
    { header: 'Documento', key: 'document_number', width: 15 },
    { header: 'Cliente/Proveedor', key: 'client_vendor', width: 25 },
    { header: 'Factura', key: 'invoice', width: 15 },
    { header: 'Estado', key: 'status', width: 20 },
  ];

  // Style header
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const m of movements) {
    const row = sheet.addRow(m);
    // Color by aging
    if (m.status === 'PENDING') {
      const days = Math.floor((Date.now() - new Date(m.entry_date).getTime()) / 86400000);
      let color = 'FF92D050'; // green
      if (days > 90) color = 'FFFF0000'; // red
      else if (days > 60) color = 'FFFF8C00'; // orange
      else if (days > 30) color = 'FFFFFF00'; // yellow
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=conciliacion_${account_id}_${period_id}.xlsx`);

  await workbook.xlsx.write(res);
  res.end();
});

export default router;
