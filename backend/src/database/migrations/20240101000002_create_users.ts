import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('azure_oid').unique().notNullable();
    table.string('email').unique().notNullable();
    table.string('display_name').notNullable();
    table.specificType('role', 'user_role').notNullable().defaultTo('CONCILIADOR');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
