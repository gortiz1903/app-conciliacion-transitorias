import { Router, Response } from 'express';
import multer from 'multer';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';
import { processMovementsCsv, processBalancesCsv } from './csv-upload.service';
import db from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Upload movements CSV
router.post(
  '/movements',
  requireAuth,
  requireRole('ADMIN'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    const { period } = req.body;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new AppError(400, 'Period is required in YYYY-MM format');
    }

    try {
      const result = await processMovementsCsv(
        req.file.buffer,
        req.file.originalname,
        period,
        req.userId!
      );

      // Audit log
      await db('audit_log').insert({
        user_id: req.userId,
        action: 'UPLOAD',
        entity_type: 'csv_upload',
        entity_id: result.uploadId,
        details: JSON.stringify({
          filename: req.file.originalname,
          period,
          totalRows: result.totalRows,
          processedRows: result.processedRows,
          errorCount: result.errors.length,
          reopenedAccounts: result.reopenedAccounts,
        }),
        ip_address: req.ip,
      });

      res.json({
        message: 'CSV processed successfully',
        ...result,
      });
    } catch (error: any) {
      logger.error('Error processing movements CSV', error);
      throw new AppError(500, 'Failed to process CSV', error.message);
    }
  }
);

// Upload balances CSV
router.post(
  '/balances',
  requireAuth,
  requireRole('ADMIN'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    const { period } = req.body;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new AppError(400, 'Period is required in YYYY-MM format');
    }

    try {
      const result = await processBalancesCsv(
        req.file.buffer,
        req.file.originalname,
        period,
        req.userId!
      );

      await db('audit_log').insert({
        user_id: req.userId,
        action: 'UPLOAD',
        entity_type: 'csv_upload',
        entity_id: result.uploadId,
        details: JSON.stringify({
          filename: req.file.originalname,
          period,
          processed: result.processed,
          errorCount: result.errors.length,
        }),
        ip_address: req.ip,
      });

      res.json({ message: 'Balances processed successfully', ...result });
    } catch (error: any) {
      logger.error('Error processing balances CSV', error);
      throw new AppError(500, 'Failed to process balances CSV', error.message);
    }
  }
);

// Get upload history
router.get(
  '/history',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { period, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    let query = db('csv_uploads')
      .join('users', 'users.id', 'csv_uploads.uploaded_by')
      .join('periods', 'periods.id', 'csv_uploads.period_id')
      .select(
        'csv_uploads.*',
        'users.display_name as uploaded_by_name',
        'periods.code as period_code'
      )
      .orderBy('csv_uploads.uploaded_at', 'desc')
      .limit(parseInt(limit as string, 10))
      .offset(offset);

    if (period) {
      query = query.where('periods.code', period);
    }

    const uploads = await query;
    res.json({ uploads });
  }
);

export default router;
