import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TYPE user_role AS ENUM ('ADMIN', 'CONCILIADOR', 'AUDITOR');
    CREATE TYPE reconciliation_type AS ENUM ('NORMAL', 'RELATED');
    CREATE TYPE period_status AS ENUM ('OPEN', 'CLOSED');
    CREATE TYPE account_period_state AS ENUM ('PENDING', 'IN_PROGRESS', 'CLOSED');
    CREATE TYPE movement_status AS ENUM ('PENDING', 'RECONCILED_WITH_DIFF', 'RECONCILED_COMPLETE', 'CLOSED');
    CREATE TYPE csv_upload_status AS ENUM ('PROCESSING', 'COMPLETED', 'ERROR');
    CREATE TYPE reconciliation_group_status AS ENUM ('RECONCILED_WITH_DIFF', 'RECONCILED_COMPLETE');
    CREATE TYPE exchange_adjustment_status AS ENUM ('PENDING', 'APPLIED');
    CREATE TYPE audit_action AS ENUM (
      'CREATE', 'UPDATE', 'DELETE', 'RECONCILE', 'UNRECONCILE',
      'SPLIT', 'CLOSE', 'REOPEN', 'UPLOAD', 'APPROVE', 'COMMENT'
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TYPE IF EXISTS audit_action;
    DROP TYPE IF EXISTS exchange_adjustment_status;
    DROP TYPE IF EXISTS reconciliation_group_status;
    DROP TYPE IF EXISTS csv_upload_status;
    DROP TYPE IF EXISTS movement_status;
    DROP TYPE IF EXISTS account_period_state;
    DROP TYPE IF EXISTS period_status;
    DROP TYPE IF EXISTS reconciliation_type;
    DROP TYPE IF EXISTS user_role;
  `);
}
