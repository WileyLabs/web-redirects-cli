#!/usr/bin/env node

/**
 * Command handler of awesomeness.
 **/
require('yargs')
  .scriptName('redirects')
  .env('WR')
  .usage('$0 <cmd> [args]')
  .command(require('./commands/zones.js'))
  .command(require('./commands/show.js'))
  .demandCommand(1, '')
  .alias('h', 'help')
  .argv;
