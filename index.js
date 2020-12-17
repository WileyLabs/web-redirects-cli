#!/usr/bin/env node

/* eslint-disable no-unused-expressions */

/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

const fs = require('fs');

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
  .option('configDir', {
    type: 'string',
    describe: 'directory containing the `.settings.yaml` default configuration (WR_CONFIG_DIR)',
    coerce(v) {
      return {
        name: v,
        contents: fs.readdirSync(v, 'utf8')
      };
    }
  })
  // Describe a redirect as a YAML file
  .command(require('./commands/describe.js'))
  // List zones in current Cloudflare account
  .command(require('./commands/domains.js'))
  // Show current redirects for [domain]
  .command(require('./commands/show.js'))
  // Check [domain]'s settings with Cloudflare's
  .command(require('./commands/check.js'))
  // Compare [dir]'s local redirect descriptions for [domain] with Cloudflare's
  .command(require('./commands/compare.js'))
  // Mange the DNS records for [domain]
  .command(require('./commands/dns.js'))
  .demandCommand(1, '')
  .alias('h', 'help')
  .argv;
