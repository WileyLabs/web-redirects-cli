/*
 * @copyright 2023 John Wiley & Sons, Inc.
 * @license MIT
 */
import lodash from 'lodash';
import flatCache from 'flat-cache';
import {
  green, blue, red, orange, purple, lightblue,
  getLocalYamlSettings,
  getLocalYamlZones
} from '../lib/sync-shared.js';
import {
  getDnsRecordsByZoneId,
  getZonesByAccount,
  getZoneSettingsById
} from '../lib/cloudflare.js';

const cacheDir = '.cache';
const cacheId = 'zones';

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
flatCache.clearAll(cacheDir); // clear cache at start of run
const zones = flatCache.load(cacheId, cacheDir);

// add value to cache map without wiping existing data
const insertValue = (cache, key, value) => {
  const currentData = cache.getKey(key);
  if (currentData) {
    cache.setKey(key, { ...currentData, ...value });
  } else {
    cache.setKey(key, value);
  }
  return cache.getKey(key);
};

const areZoneSettingsValid = async (zoneName) => {
  const data = zones.getKey(zoneName);
  const cfSettings = await getZoneSettingsById(data.cloudflare.id);
  Object.keys(localZoneSettings).forEach((setting) => {
    const localValue = localZoneSettings[setting];
    const remoteValue = cfSettings.filter((prop) => prop.id === setting);
    if (!isEqual(localValue, remoteValue[0].value)) {
      data.match = false;
      data.messages.push(`Settings: ${setting}`);
    }
  });
  zones.setKey(zoneName, data);
  return data;
};

// generate valid DNS records for a zone
const getValidDns = (zoneName) => [
  {
    name: zoneName,
    type: 'A',
    content: '192.0.2.0'
  },
  {
    name: `www.${zoneName}`,
    type: 'CNAME',
    content: zoneName
  }
];

const isStandardDns = async (zoneName) => {
  const data = zones.getKey(zoneName);
  const dns = await getDnsRecordsByZoneId(data.cloudflare.id);
  const expectedRules = getValidDns(zoneName);
  data.dns = {};
  data.dns.expected = { ...expectedRules }; // create copy of object
  data.dns.actual = [];
  if (dns.length < 1) {
    data.match = false;
    data.messages.push('DNS: no records');
    // zones.setKey(zoneName, data);
    return data;
  }
  const matchedRules = [];
  const unmatchedRules = [];
  dns.forEach((record) => {
    const temp = {
      name: record.name,
      type: record.type,
      content: record.content
    };
    data.dns.actual.push(temp);
    let validRule = false;
    expectedRules.forEach((rule, index, array) => {
      if (isEqual(rule, temp)) {
        matchedRules.push(array.splice(array, 1)); // remove matching item
        validRule = true;
      }
    });
    if (!validRule) {
      unmatchedRules.push(record);
    }
  });
  if (expectedRules.length === 0 && unmatchedRules.length === 0) {
    // matching DNS
    // zones.setKey(zoneName, data);
    return data;
  }
  if (expectedRules.length > 0) {
    data.match = false;
    data.messages.push('DNS: Missing records');
  }
  if (unmatchedRules.length > 0) {
    data.match = false;
    data.messages.push('DNS: Additional records');
  }
  // zones.setKey(zoneName, data);
  return data;
};

const processZone = async (zoneName) => {
  const data = zones.getKey(zoneName);
  data.match = true; // status starts as true
  data.messages = [];

  // 1. is zone in yaml, cloudflare or both?
  if (data.yaml && data.cloudflare) {
    // check zone settings
    await areZoneSettingsValid(zoneName);
    // check DNS
    await isStandardDns(zoneName);
    // TODO check redirects - page rules (?) and worker KV

    // TODO check worker routes/custom domains

    zones.setKey(zoneName, data);
    return data;
  }
  if (data.yaml) {
    // TODO option to add zone to Cloudflare
    data.match = false;
    data.messages.push('Not in Cloudflare');
    zones.setKey(zoneName, data);
    return data;
  }
  if (data.cloudflare) {
    // TODO option to create YAML file?
    data.match = false;
    data.messages.push('No YAML defined');
    zones.setKey(zoneName, data);
    return data;
  }
  data.match = false;
  data.messages.push('Script error');
  zones.setKey(zoneName, data);
  return data;

  // compare data (pluggable modules - interface to be defined)

  // output results (pluggable modules - interface to be defined)

  // update cloudflare (pluggable modules - interface to be defined)

  // opt. persist remote config (pluggable modules - interface to be defined)
};

const handler = async (argv) => {
  // flatCache.clearAll(cacheDir); // clear cache at start of run
  // const zones = flatCache.load(cacheId, cacheDir);

  console.log(blue('Fetching local configuration...'));

  // load local config to cache (fail on error - e.g. missing params)
  localZoneSettings = await getLocalYamlSettings(argv.configDir);

  // fetch list of all zones defined in yaml configuration
  const yamlZones = await getLocalYamlZones(argv.configDir);
  yamlZones.map((data) => insertValue(zones, data.zone, { yaml: data }));

  console.log(blue('Fetching remote configuration...'));

  // load remote config to cache (fail on error - e.g. missing params/credentials)
  const cfZones = await getZonesByAccount(argv.accountId);
  cfZones.map((data) => insertValue(zones, data.name, { cloudflare: data }));

  console.log(blue('Processing zones...'));

  await Promise.all(zones.keys().map(async (zone) => {
    await processZone(zone);
  }));

  zones.keys().forEach((zone) => {
    const data = zones.getKey(zone);
    if (data.match) {
      console.log(`${green(zone)} [${green(data.messages.join('; '))}]`);
    } else {
      console.log(`${lightblue(zone)} [${orange(data.messages.join('; '))}]`);
      // DEBUG
      if (data.dns) {
        console.log(green(data.dns.expected ? JSON.stringify(data.dns.expected) : ''));
        console.log(blue(data.dns.actual ? JSON.stringify(data.dns.actual) : ''));
      }
    }
  });
};

export {
  command, describe, builder, handler
};
