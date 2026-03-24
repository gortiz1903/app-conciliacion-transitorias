import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agencies', (table) => {
    table.increments('id').primary();
    table.string('code').unique().notNullable();
    table.string('name').notNullable();
    table.string('suffix').unique().notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('user_agency_assignments', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('agency_id').unsigned().notNullable().references('id').inTable('agencies').onDelete('CASCADE');
    table.primary(['user_id', 'agency_id']);
    table.timestamp('assigned_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_agency_assignments');
  await knex.schema.dropTableIfExists('agencies');
}
