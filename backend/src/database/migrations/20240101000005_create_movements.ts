import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('csv_uploads', (table) => {
    table.increments('id').primary();
    table.string('filename').notNullable();
    table.string('file_type').notNullable().defaultTo('movements'); // 'movements' or 'balances'
    table.integer('period_id').unsigned().notNullable().references('id').inTable('periods');
    table.uuid('uploaded_by').notNullable().references('id').inTable('users');
    table.integer('row_count').defaultTo(0);
    table.integer('processed_count').defaultTo(0);
    table.integer('error_count').defaultTo(0);
    table.jsonb('errors').defaultTo('[]');
    table.specificType('status', 'csv_upload_status').notNullable().defaultTo('PROCESSING');
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('movements', (table) => {
    table.increments('id').primary();
    table.integer('agency_id').unsigned().notNullable().references('id').inTable('agencies');
    table.integer('period_id').unsigned().notNullable().references('id').inTable('periods');
    table.integer('account_id').unsigned().notNullable().references('id').inTable('accounts');
    table.date('entry_date').notNullable();
    table.string('entry_number'); // ASIENTO
    table.string('entry_type'); // TIPO
    table.string('full_account_number').notNullable(); // e.g. 40501.3
    table.string('account_name'); // NOMBRE_CUENTA
    table.decimal('debit', 18, 2).notNullable().defaultTo(0);
    table.decimal('credit', 18, 2).notNullable().defaultTo(0);
    table.text('reference'); // Referencia registro
    table.string('document_number');
    table.string('client_vendor');
    table.string('purchase_order');
    table.string('invoice');
    table.specificType('status', 'movement_status').notNullable().defaultTo('PENDING');
    table.integer('csv_upload_id').unsigned().notNullable().references('id').inTable('csv_uploads');
    table.integer('original_csv_row');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes for fast lookups
    table.index(['account_id', 'agency_id', 'period_id', 'status'], 'idx_movements_lookup');
    table.index(['document_number'], 'idx_movements_document');
    table.index(['invoice'], 'idx_movements_invoice');
    table.index(['purchase_order'], 'idx_movements_purchase_order');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('movements');
  await knex.schema.dropTableIfExists('csv_uploads');
}
