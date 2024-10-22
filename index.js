#!/usr/bin/env node

/* eslint-disable no-unused-expressions */

/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

import * as fs from 'node:fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as describe from './commands/describe.js';
import * as check from './commands/check.js';
import * as dash from './commands/dash.js';
import * as dns from './commands/dns.js';
import * as compare from './commands/compare.js';
import * as domains from './commands/domains.js';
import * as show from './commands/show.js';
import * as worker from './commands/worker.js';
import * as sync from './commands/sync.js';

// page rule migration commands
// import * as migrate from './commands/page-rule-migration.js';
import * as migrateZone from './commands/migrate-page-rule-zone.js';
// import * as yamlCheck1 from './commands/yaml-migration-check-1.js';
// import * as yamlCheck2 from './commands/yaml-migration-check-2.js';

// load environment variables from `.env` file (if any)
import 'dotenv/config';

/**
 * Command handler of awesomeness.
 */
yargs(hideBin(process.argv))
  .scriptName('redirects')
  .env('WR')
  .usage('$0 <cmd> [args]')
  // these options apply to all the commands
  .option('cloudflareToken', {
    describe: 'API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)',
    demandOption: true,
    type: 'string'
  })
  .option('accountId', {
    describe: 'ID of the account for which you are managing redirects',
    demandOption: true,
    type: 'string'
  })
  .option('configDir', {
    type: 'string',
    describe: 'directory containing the `.settings.yaml` default configuration (WR_CONFIG_DIR)',
    demandOption: true,
    coerce(v) {
      return {
        name: v,
        contents: fs.readdirSync(v, 'utf8')
      };
    }
  })
  // Describe a redirect as a YAML file
  .command(describe)
  // List zones in current Cloudflare account, and prompt to add missing zones
  .command(domains)
  // Show current redirects for [domain]
  .command(show)
  // Check [domain]'s settings with Cloudflare's
  .command(check)
  // Compare [dir]'s local redirect descriptions for [domain] with Cloudflare's
  .command(compare)
  // Manage the DNS records for [domain]
  .command(dns)
  // Output a link to the Cloudflare Dashboard
  .command(dash)
  // Setup Worker and KV stuff for large redirects
  .command(worker)
  // WIP Synchronize zones with YAML
  .command(sync)
  // .command(migrate)
  .command(migrateZone)
  // .command(yamlCheck1)
  // .command(yamlCheck2)
  .demandCommand(1, '')
  .alias('h', 'help')
  .alias('v', 'version')
  .default('cacheDir', '.cache')
  .default('cacheId', 'zones')
  .argv;
