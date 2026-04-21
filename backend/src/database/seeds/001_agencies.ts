import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('user_agency_assignments').del();
  await knex('agencies').del();

  // 18 agencies — update codes/names/suffixes as needed
  await knex('agencies').insert([
    { code: 'COMD', name: 'OMD', suffix: '.3' },
    { code: 'CPHD', name: 'PHD', suffix: '.5' },
    { code: 'CHAS', name: 'Havas Media', suffix: '.7' },
    { code: 'CMWL', name: 'Mindshare WL', suffix: '.9' },
    { code: 'CWAV', name: 'Wavemaker', suffix: '.11' },
    { code: 'CGRP', name: 'GroupM', suffix: '.13' },
    { code: 'CZEN', name: 'Zenith', suffix: '.15' },
    { code: 'CSTR', name: 'Starcom', suffix: '.17' },
    { code: 'CDNT', name: 'Dentsu', suffix: '.19' },
    { code: 'CCAR', name: 'Carat', suffix: '.21' },
    { code: 'CIPR', name: 'iProspect', suffix: '.23' },
    { code: 'CMED', name: 'Mediacom', suffix: '.25' },
    { code: 'CBBD', name: 'BBD', suffix: '.27' },
    { code: 'CINV', name: 'Initiative', suffix: '.29' },
    { code: 'CMAG', name: 'Magna', suffix: '.31' },
    { code: 'CUMP', name: 'UM Plus', suffix: '.33' },
    { code: 'C2ND', name: 'Agencia 2ND', suffix: '.35' },
    { code: 'CCOR', name: 'Corporativo', suffix: '.37' },
  ]);
}
