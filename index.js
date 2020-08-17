#!/usr/bin/env node

/**
 * Command handler of awesomeness.
 **/
require('yargs')
  .scriptName('redirects')
  .env('WR')
  .usage('$0 <cmd> [args]')
  // List zones in current Cloudflare account
  .command(require('./commands/zones.js'))
  // Show current redirects for [domain]
  .command(require('./commands/show.js'))
  // Check a [domain]'s settings and redirects
  .command(require('./commands/check.js'))
  .demandCommand(1, '')
  .alias('h', 'help')
  .argv;
