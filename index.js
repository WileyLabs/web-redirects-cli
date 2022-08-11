#!/usr/bin/env node

/* eslint-disable no-unused-expressions */

/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

const fs = require('fs');

// load environment variables from `.env` file (if any)
require('dotenv').config();

/**
 * Command handler of awesomeness.
 */
require('yargs')
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
  .command(require('./commands/describe'))
  // List zones in current Cloudflare account
  .command(require('./commands/domains'))
  // Show current redirects for [domain]
  .command(require('./commands/show'))
  // Check [domain]'s settings with Cloudflare's
  .command(require('./commands/check'))
  // Compare [dir]'s local redirect descriptions for [domain] with Cloudflare's
  .command(require('./commands/compare'))
  // Mange the DNS records for [domain]
  .command(require('./commands/dns'))
  // Output a link to the Cloudflare Dashboard
  .command(require('./commands/dash'))
  // Setup Worker and KV stuff for large redirects
  .command(require('./commands/worker'))
  .demandCommand(1, '')
  .alias('h', 'help')
  .argv;
