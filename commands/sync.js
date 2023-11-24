/*
 * @copyright 2023 John Wiley & Sons, Inc.
 * @license MIT
 */
import * as path from 'node:path';
import {
  getLocalYamlSettings,
  getLocalYamlZones
} from '../lib/sync-shared.js';
import {
  getZonesByAccount
} from '../lib/cloudflare.js';

const command = 'sync';
const describe = 'Check and optionally update domains in the current Cloudflare account';
const builder = (yargs) => {
  yargs
    .options({
      update: {
        describe: 'Update Cloudflare configuration from YAML configuration.',
        alias: 'u',
        type: 'boolean',
        default: false
      },
      force: {
        describe: 'Don\'t prompt before making updates - just do it!',
        alias: 'f',
        type: 'boolean',
        default: false
      },
      long: {
        describe: 'Produce \'long\' output regarding differences',
        alias: 'l',
        type: 'boolean',
        default: false
      }
    });
};

const handler = async (argv) => {
  // console.debug('argv', argv);

  // load local config to cache (fail on error - e.g. missing params)
  const localZoneSettings = await getLocalYamlSettings(argv.configDir);

  // fetch list of all zones defined in yaml configuration
  const yamlZones = await getLocalYamlZones(argv.configDir);

  // load remote config to cache (fail on error - e.g. missing params/credentials)
  const cfZones = await getZonesByAccount(argv.accountId);

  const yamlZoneNames = yamlZones.map((yaml) => yaml.zone);
  const cfZoneNames = cfZones.map((zone) => zone.name);
  const mergedNames = [...new Set([...yamlZoneNames, ...cfZoneNames])];
  console.log(mergedNames);

  // need to load other data for pluggable modules? do it now.

  // compare data (pluggable modules - interface to be defined)

  // output results (pluggable modules - interface to be defined)

  // update cloudflare (pluggable modules - interface to be defined)

  // opt. persist remote config (pluggable modules - interface to be defined)
};

export {
  command, describe, builder, handler
};
