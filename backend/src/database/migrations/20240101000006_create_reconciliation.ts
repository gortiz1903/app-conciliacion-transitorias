import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reconciliation_groups', (table) => {
    table.increments('id').primary();
    table.integer('account_id').unsigned().notNullable().references('id').inTable('accounts');
    table.integer('agency_id').unsigned().notNullable().references('id').inTable('agencies');
    table.integer('period_id').unsigned().notNullable().references('id').inTable('periods');
    table.specificType('reconciliation_type', 'reconciliation_type').notNullable();
    table.specificType('status', 'reconciliation_group_status').notNullable();
    table.decimal('total_debit', 18, 2).notNullable().defaultTo(0);
    table.decimal('total_credit', 18, 2).notNullable().defaultTo(0);
    table.decimal('difference', 18, 2).notNullable().defaultTo(0);
    table.uuid('reconciled_by').notNullable().references('id').inTable('users');
    table.timestamp('reconciled_at').defaultTo(knex.fn.now());
    table.text('notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('movement_splits', (table) => {
    table.increments('id').primary();
    table.integer('movement_id').unsigned().notNullable().references('id').inTable('movements').onDelete('CASCADE');
    table.decimal('amount', 18, 2).notNullable();
    table.text('description');
    table.uuid('created_by').notNullable().references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('reconciliation_items', (table) => {
    table.increments('id').primary();
    table.integer('group_id').unsigned().notNullable().references('id').inTable('reconciliation_groups').onDelete('CASCADE');
    table.integer('movement_id').unsigned().notNullable().references('id').inTable('movements');
    table.integer('split_id').unsigned().references('id').inTable('movement_splits');
    table.decimal('amount', 18, 2).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('exchange_rate_adjustments', (table) => {
    table.increments('id').primary();
    table.integer('group_id').unsigned().notNullable().references('id').inTable('reconciliation_groups').onDelete('CASCADE');
    table.decimal('expected_amount', 18, 2).notNullable();
    table.integer('adjustment_movement_id').unsigned().references('id').inTable('movements');
    table.specificType('status', 'exchange_adjustment_status').notNullable().defaultTo('PENDING');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('exchange_rate_adjustments');
  await knex.schema.dropTableIfExists('reconciliation_items');
  await knex.schema.dropTableIfExists('movement_splits');
  await knex.schema.dropTableIfExists('reconciliation_groups');
}
