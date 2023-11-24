/*
 * @copyright 2023 John Wiley & Sons, Inc.
 * @license MIT
 */
import lodash from 'lodash';
import {
  green, blue, red, orange, purple, lightblue,
  getLocalYamlSettings,
  getLocalYamlZones
} from '../lib/sync-shared.js';
import {
  getZonesByAccount,
  getZoneSettingsById
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

let localZoneSettings;

const { isEqual } = lodash;

const insertValue = (map, key, value) => {
  const currentData = map.get(key);
  if (currentData) {
    map.set(key, { ...currentData, ...value });
  } else {
    map.set(key, value);
  }
  return null;
};

const areZoneSettingsValid = async (zoneId) => {
  const cfSettings = await getZoneSettingsById(zoneId);
  let valid = true;
  Object.keys(localZoneSettings).forEach((setting) => {
    const localValue = localZoneSettings[setting];
    const remoteValue = cfSettings.filter((prop) => prop.id === setting);
    if (!isEqual(localValue, remoteValue[0].value)) {
      valid = false;
      console.log(`${setting} | ${JSON.stringify(localValue)} | ${JSON.stringify(remoteValue[0].value)}`);
    }
  });
  return valid;
};

const processZone = async (key, data) => {

  // 1. is zone in yaml, cloudflare or both?
  if (data.yaml && data.cloudflare) {
    const result = await areZoneSettingsValid(data.cloudflare.id);
    if (result) {
      console.log(green(`${key}`));
    } else {
      console.log(orange(`${key} [incorrect settings]`));
    }
  } else if (data.yaml) {
    console.log(blue(`${key} [Not in Cloudflare yet!]`));
  } else if (data.cloudflare) {
    console.log(purple(`${key} [No YAML defined!]`));
  } else {
    console.log(red(`ERROR: ${key}`));
  }


  // compare data (pluggable modules - interface to be defined)

  // output results (pluggable modules - interface to be defined)

  // update cloudflare (pluggable modules - interface to be defined)

  // opt. persist remote config (pluggable modules - interface to be defined)

};

const handler = async (argv) => {
  // console.debug('argv', argv);

  // load local config to cache (fail on error - e.g. missing params)
  localZoneSettings = await getLocalYamlSettings(argv.configDir);

  const zoneData = new Map();

  // fetch list of all zones defined in yaml configuration
  const yamlZones = await getLocalYamlZones(argv.configDir);
  yamlZones.map((data) => insertValue(zoneData, data.zone, { yaml: data }));

  // load remote config to cache (fail on error - e.g. missing params/credentials)
  const cfZones = await getZonesByAccount(argv.accountId);
  cfZones.map((data) => insertValue(zoneData, data.name, { cloudflare: data }));

  Array.from(zoneData.keys()).forEach((zone) => processZone(zone, zoneData.get(zone)));
};

export {
  command, describe, builder, handler
};
