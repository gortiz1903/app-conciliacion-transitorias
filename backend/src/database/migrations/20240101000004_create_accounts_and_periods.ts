import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('accounts', (table) => {
    table.increments('id').primary();
    table.string('account_number').notNullable();
    table.string('name').notNullable();
    table.specificType('reconciliation_type', 'reconciliation_type').notNullable().defaultTo('NORMAL');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['account_number']);
  });

  await knex.schema.createTable('periods', (table) => {
    table.increments('id').primary();
    table.string('code').unique().notNullable(); // e.g. 2025-01
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.specificType('status', 'period_status').notNullable().defaultTo('OPEN');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('account_period_status', (table) => {
    table.increments('id').primary();
    table.integer('account_id').unsigned().notNullable().references('id').inTable('accounts');
    table.integer('agency_id').unsigned().notNullable().references('id').inTable('agencies');
    table.integer('period_id').unsigned().notNullable().references('id').inTable('periods');
    table.specificType('status', 'account_period_state').notNullable().defaultTo('PENDING');
    table.uuid('closed_by').references('id').inTable('users');
    table.timestamp('closed_at');
    table.timestamps(true, true);

    table.unique(['account_id', 'agency_id', 'period_id']);
  });

  await knex.schema.createTable('accounting_balances', (table) => {
    table.increments('id').primary();
    table.integer('account_id').unsigned().notNullable().references('id').inTable('accounts');
    table.integer('agency_id').unsigned().notNullable().references('id').inTable('agencies');
    table.integer('period_id').unsigned().notNullable().references('id').inTable('periods');
    table.decimal('balance', 18, 2).notNullable();
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());

    table.unique(['account_id', 'agency_id', 'period_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('accounting_balances');
  await knex.schema.dropTableIfExists('account_period_status');
  await knex.schema.dropTableIfExists('periods');
  await knex.schema.dropTableIfExists('accounts');
}
