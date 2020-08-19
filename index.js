#!/usr/bin/env node

/**
 * Command handler of awesomeness.
 **/
require('yargs')
  .scriptName('redirects')
  .env('WR')
  .usage('$0 <cmd> [args]')
  // List zones in current Cloudflare account
  .command(require('./commands/domains.js'))
  // Show current redirects for [domain]
  .command(require('./commands/show.js'))
  // Check [domain]'s settings with Cloudflare's
  .command(require('./commands/check.js'))
  // Compare [dir]'s local redirect descriptions for [domain] with Cloudflare's
  .command(require('./commands/compare.js'))
  .demandCommand(1, '')
  .alias('h', 'help')
  .argv;
