import knex from 'knex';
import { env } from './env';

const db = knex({
  client: 'pg',
  connection: env.db.url || {
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    user: env.db.user,
    password: env.db.password,
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: '../database/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: '../database/seeds',
  },
});

export default db;
