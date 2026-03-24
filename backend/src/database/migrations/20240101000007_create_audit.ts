import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_log', (table) => {
    table.increments('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.specificType('action', 'audit_action').notNullable();
    table.string('entity_type').notNullable();
    table.integer('entity_id');
    table.jsonb('details');
    table.string('ip_address');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['entity_type', 'entity_id'], 'idx_audit_entity');
    table.index(['user_id', 'created_at'], 'idx_audit_user_time');
  });

  await knex.schema.createTable('movement_comments', (table) => {
    table.increments('id').primary();
    table.integer('movement_id').unsigned().notNullable().references('id').inTable('movements').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.text('comment').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['movement_id'], 'idx_comments_movement');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('movement_comments');
  await knex.schema.dropTableIfExists('audit_log');
}
