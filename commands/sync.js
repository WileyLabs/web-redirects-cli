/*
 * @copyright 2023 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import fs from 'fs';
import dateformat from 'dateformat';
import stripAnsi from 'strip-ansi';
import lodash from 'lodash';
import {
  green, blue, orange, purple, lightblue,
  getLocalYamlSettings,
  getLocalYamlZones
} from '../lib/sync-shared.js';
import {
  getDnsRecordsByZoneId,
  getPageRulesByZoneId,
  getWorkerRoutesByZoneId,
  getZonesByAccount,
  getZoneSettingsById,
  listWorkerDomains
} from '../lib/cloudflare.js';

const command = 'sync';

const describe = '** Experimental ** Check domains in the current Cloudflare account and list any differences with the local configuration. Work-in-progress.';
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

const zones = new Map();

let logStream;
const logger = (line, logToConsole = false) => {
  if (!logStream) {
    const filename = `sync-${dateformat(new Date(), 'yyyymmdd-HHMMssL')}.log`;
    logStream = fs.createWriteStream(filename, {});
  }
  logStream.write(`${stripAnsi(line)}\r\n`);
  if (logToConsole) {
    console.log(line);
  }
};

// add value to cache map without wiping existing data
const insertValue = (cache, key, value) => {
  const currentData = cache.get(key);
  if (currentData) {
    cache.set(key, { ...currentData, ...value });
  } else {
    cache.set(key, value);
  }
  return cache.get(key);
};

// variation on insertValue() that adds values to an array
const insertValues = (cache, key, childKey, value) => {
  const currentData = cache.get(key);
  if (currentData) {
    if (currentData[childKey]) {
      currentData[childKey] = currentData[childKey].concat(value);
    } else {
      currentData[childKey] = [value];
    }
    cache.set(key, currentData);
  } else {
    const newData = {};
    newData[childKey] = [value];
    cache.set(key, newData);
  }
  return cache.get(key);
};

const areZoneSettingsValid = async (zoneName) => {
  const data = zones.get(zoneName);
  const cfSettings = await getZoneSettingsById(data.cloudflare.id);
  Object.keys(localZoneSettings).forEach((setting) => {
    const localValue = localZoneSettings[setting];
    const remoteValue = cfSettings.filter((prop) => prop.id === setting);
    if (!isEqual(localValue, remoteValue[0].value)) {
      data.match = false;
      data.messages.push(`Settings: ${setting}`);
    }
  });
  zones.set(zoneName, data);
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
  const data = zones.get(zoneName);
  const dns = await getDnsRecordsByZoneId(data.cloudflare.id);
  const expectedRules = getValidDns(zoneName);
  data.dns = {};
  data.dns.expected = { ...expectedRules }; // create copy of object
  data.dns.actual = [];
  if (dns.length < 1) {
    data.match = false;
    data.messages.push('DNS: no records');
    // zones.set(zoneName, data);
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
  return data;
};

const hasConfiguredRedirects = async (zoneName) => {
  const data = zones.get(zoneName);

  // retrieve yaml redirects
  if (data.yaml.description.redirects && data.yaml.description.redirects.length > 0) {
    data.yaml_redirects = data.yaml.description.redirects;
  } else {
    data.match = false;
    data.messages.push('Redirects: None defined');
  }

  // page rules or worker KV?

  // retrieve page rules
  if (data.cloudflare.id) {
    const pageRules = await getPageRulesByZoneId(data.cloudflare.id);
    data.cf_page_rules = pageRules;
  } else {
    data.match = false;
    data.messages.push('Redirects: No Cloudflare zone');
  }

  // retrieve worker KV

  // compare and log

  return data;
};

const processZone = async (zoneName) => {
  const data = zones.get(zoneName);
  data.match = true; // status starts as true
  data.messages = [];

  // 1. is zone in yaml, cloudflare or both?
  if (data.yaml && data.cloudflare) {
    // is zone full?
    if (data.cloudflare.type !== 'full') {
      data.match = false;
      data.messages.push('Zone not Full');
    }

    // is zone active?
    if (data.cloudflare.status !== 'active') {
      data.match = false;
      data.messages.push('Zone not Active');
    }

    // check zone settings
    await areZoneSettingsValid(zoneName);
    // check DNS
    await isStandardDns(zoneName);
    // TODO check redirects - page rules (?) and worker KV
    await hasConfiguredRedirects(zoneName);

    // TODO check worker routes (custom domains already fetched)
    const existingWorkerRoutes = await getWorkerRoutesByZoneId(data.cloudflare.id);
    if (existingWorkerRoutes && existingWorkerRoutes.length > 0) {
      data.existingWorkerRoutes = existingWorkerRoutes;
    }

    return data;
  }

  if (data.yaml) {
    // TODO option to add zone to Cloudflare
    data.match = false;
    data.messages.push('Not in Cloudflare');
    return data;
  }
  if (data.cloudflare) {
    // TODO option to create YAML file?
    data.match = false;
    data.messages.push('No YAML defined');
    return data;
  }
  if (data.cloudflare_worker) {
    // only worker config
    data.match = false;
    data.messages.push('Cloudflare worker domain defined but no zone');
    return data;
  }
  data.match = false;
  data.messages.push('Script error');
  return data;

  // compare data (pluggable modules - interface to be defined)

  // output results (pluggable modules - interface to be defined)

  // update cloudflare (pluggable modules - interface to be defined)

  // opt. persist remote config (pluggable modules - interface to be defined)
};

const handler = async (argv) => {
  // flatCache.clearAll(cacheDir); // clear cache at start of run
  // const zones = flatCache.load(cacheId, cacheDir);

  logger(`Starting sync at '${dateformat(new Date(), "yyyy-mm-dd HH:MM:ss Z")}'`);
  logger(blue('Fetching local yaml...'), true);

  // load local config to cache (fail on error - e.g. missing params)
  localZoneSettings = await getLocalYamlSettings(argv.configDir);

  // fetch list of all zones defined in yaml configuration
  const yamlZones = await getLocalYamlZones(argv.configDir);
  yamlZones.map((data) => insertValue(zones, data.zone, { yaml: data }));

  logger(blue('Fetching remote zones...'), true);

  // load remote config to cache (fail on error - e.g. missing params/credentials)
  const cfZones = await getZonesByAccount(argv.accountId);
  cfZones.map((data) => insertValue(zones, data.name, { cloudflare: data }));

  logger(blue('Fetching remote worker domains...'), true);

  // load remote config to cache (fail on error - e.g. missing params/credentials)
  const cfWorkerDomains = await listWorkerDomains(argv.accountId);
  cfWorkerDomains.map((data) => insertValues(zones, data.zone_name, 'cloudflare_worker', {
    hostname: data.hostname,
    service: data.service
  }));

  logger(blue('Processing zones...'), true);
  const zoneKeys = Array.from(zones.keys()).sort();
  await Promise.all(zoneKeys.map(async (zone) => {
    await processZone(zone);
  }));

  zoneKeys.forEach(async (key) => {
    const data = zones.get(key);
    const type = [];
    if (data.cf_page_rules && data.cf_page_rules.length > 0) {
      type.push(`Page Rules (${data.cf_page_rules.length})`);
    }
    if (data.existingWorkerRoutes && data.existingWorkerRoutes.length > 0) {
      type.push(`Worker Routes (${data.existingWorkerRoutes.length})`);
    }
    if (data.cloudflare_worker && data.cloudflare_worker.length > 0) {
      type.push(`Custom Domains (${data.cloudflare_worker.length})`);
    }
    if (data.match) {
      logger(`${green(key)} [${green(data.messages.join('; '))}] [${purple(type.toString())}]`, true);
    } else {
      logger(`${lightblue(key)} [${orange(data.messages.join('; '))}] [${purple(type.toString())}]`, true);
      // debug output to log file
      if (data.cloudflare_worker) {
        logger(`CLOUDFLARE_WORKER: ${JSON.stringify(data.cloudflare_worker)}`);
      }
      if (data.existingWorkerRoutes) {
        logger(`WORKER_ROUTES: ${JSON.stringify(data.existingWorkerRoutes)}`);
      }
      if (data.dns) {
        logger(`DNS_CONFIGURED: ${data.dns.expected ? JSON.stringify(data.dns.expected) : ''}`);
        logger(`DNS_CLOUDFLARE: ${data.dns.actual ? JSON.stringify(data.dns.actual) : ''}`);
      }
      if (data.yaml_redirects) {
        logger(`REDIRECTS_CONFIGURED: ${JSON.stringify(data.yaml_redirects)}`);
      }
      if (data.cf_page_rules) {
        logger(`REDIRECTS_PAGERULES: ${JSON.stringify(data.cf_page_rules)}`);
      }
    }
  });
};

export {
  command, describe, builder, handler
};
