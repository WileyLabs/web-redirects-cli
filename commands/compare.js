/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import { diffString } from 'json-diff';
import {
  error,
  getLocalYamlZone,
  green,
  lightblue
} from '../lib/shared.js';
import {
  getWorkerKVValuesByDomain,
  getZonesByName
} from '../lib/cloudflare.js';

/**
 * Compare [configDir]'s local redirect descriptions for <domain> with Cloudflare's
 */
const command = 'compare <domain>';
const describe = 'Compare [configDir]\'s local redirect descriptions for <domain> with Cloudflare\'s';
const builder = (yargs) => {
  yargs
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name',
      demandOption: true
    })
    .demandOption('configDir');
};
const handler = async (argv) => {
  // check for single zone argument
  if (!('domain' in argv)) {
    // NOTE: this should be redundant as yargs treats 'domain' as required argument
    error('Which domain where you wanting to show redirects for?');
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

  // get yaml file data
  const yamlZone = getLocalYamlZone(zone.name, argv.configDir);

  // get kv value
  const kvValue = await getWorkerKVValuesByDomain(argv.accountId, argv.workerKvNamespace, argv.domain);

  // show differences
  const result = diffString(yamlZone, kvValue);
  if (result.length > 0) {
    console.log(lightblue('Differences between YAML redirects and Cloudflare redirects:'));
    console.log(result);
  } else {
    console.log(green('YAML redirects match redirects in Cloudflare'));
  }
};

export {
  command, describe, builder, handler
};
