/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import * as YAML from 'js-yaml';
import {
  error,
  green,
  lightblue
} from '../lib/shared.js';
import {
  getWorkerKVValuesByDomain,
  getZonesByName
} from '../lib/cloudflare.js';

/**
 * Show a specific domain name's Zone/Site info from Cloudflare + current Page
 * Rules.
 */
const command = 'show <domain>';
const describe = 'Show current redirects for <domain>';
const builder = (yargs) => {
  yargs
    .option('format', {
      description: 'Output a JSON or YAML description file for all redirects.',
      choices: ['json', 'yaml', 'text'],
      default: 'text'
    })
    .option('export', {
      description: 'Save a JSON or YAML redirects description file to [configDir].',
      type: 'boolean',
      default: false,
      implies: ['configDir']
    })
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name',
      demandOption: true
    });
};
const handler = async (argv) => {
  if (!('domain' in argv)) {
    // NOTE: this should be redundant as yargs treats 'domain' as required argument
    error('Which domain were you wanting to show redirects for?');
  }

  // show zone info
  const zones = await getZonesByName(argv.domain, argv.accountId);
  if (!zones || zones.length < 1) {
    error(`No matching zone found for '${argv.domain}'!`);
  }
  if (zones.length > 1) {
    error(`Multiple matching zones found for ${argv.domain}: ${zones.map((zone) => zone.name)}`);
  }
  const zone = zones[0];
  console.log(lightblue(`Current redirects for zone: ${argv.domain} (${zone.id})`));
  console.log(lightblue(`Worker KV value as YAML:`));
  // get KV value
  const kvValue = await getWorkerKVValuesByDomain(argv.accountId, argv.workerKvNamespace, argv.domain);
  // convert (json) to yaml format
  const redirects = YAML.dump(kvValue);
  console.log(green(redirects));
};

export {
  command, describe, builder, handler
};
