/*
 * @copyright 2023 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import fs from 'fs';
import dateformat from 'dateformat';
import stripAnsi from 'strip-ansi';
import lodash from 'lodash';
import { diff } from 'deep-object-diff';
import {
  green, blue, orange, purple, lightblue, yellow,
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

// load environment variables from .env
import 'dotenv/config';

const command = 'migrate';

const describe = '** Experimental ** Migration of zones from using page rules to using worker. Work-in-progress.';
const builder = (yargs) => {
  yargs
    .options({});
};

const cache = new Map(); // empty cache Map()
let localZoneSettings;

const { isEqual } = lodash;

let logStream;
const logger = (line, logToConsole = false) => {
  if (!logStream) {
    const filename = `page-rule-migrate-${dateformat(new Date(), 'yyyymmdd-HHMMssL')}.log`;
    logStream = fs.createWriteStream(filename, {});
  }
  logStream.write(`${stripAnsi(line)}\r\n`);
  if (logToConsole) {
    console.log(line);
  }
};

// util: add value to cache map without wiping existing data
const insertValue = (key, value) => {
  const currentData = cache.get(key);
  if (currentData) {
    cache.set(key, { ...currentData, ...value });
  } else {
    cache.set(key, value);
  }
  return cache.get(key);
};

// variation on insertValue() that adds values to an array
const insertValues = (key, childKey, value) => {
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
  const data = cache.get(zoneName);
  const cfSettings = await getZoneSettingsById(data.cloudflare.id);
  data.has_standard_settings = true;
  Object.keys(localZoneSettings).forEach((setting) => {
    const localValue = localZoneSettings[setting];
    const remoteValue = cfSettings.filter((prop) => prop.id === setting);
    if (!isEqual(localValue, remoteValue[0].value)) {
      data.has_standard_settings = false;
      data.messages.push(`Settings: ${setting}`);
    }
  });
  cache.set(zoneName, data);
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
  const data = cache.get(zoneName);
  const dns = await getDnsRecordsByZoneId(data.cloudflare.id);
  const expectedRules = getValidDns(zoneName);
  data.dns = {};
  data.dns.expected = { ...expectedRules }; // create copy of object
  data.dns.actual = [];
  if (dns.length < 1) {
    data.match = false;
    data.isStandardDns = false;
    data.messages.push('No DNS');
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
    data.isStandardDns = true;
    return data;
  }
  data.isStandardDns = false;
  data.match = false;
  data.messages.push('Not standard DNS');
  return data;
};

const hasConfiguredRedirects = async (zoneName) => {
  const data = cache.get(zoneName);

  // retrieve yaml redirects
  if (data.yaml.description.redirects && data.yaml.description.redirects.length > 0) {
    data.yaml_redirects = data.yaml.description.redirects;
  } else {
    data.match = false;
    data.messages.push('Redirects: None defined');
  }

  // retrieve page rules
  if (data.cloudflare.id) {
    const pageRules = await getPageRulesByZoneId(data.cloudflare.id);
    data.cf_page_rules = pageRules;
  } else {
    data.match = false;
    data.messages.push('Redirects: No Cloudflare zone');
  }

  return data;
};

// convert Cloudflare's Page Rule JSON into descriptive redirect JSON
const convertPageRulesToRedirects = (pagerules) => {
  const redirects = [];
  pagerules.forEach((r) => {
    const redirect = {};
    // TODO: the following code assumes these are all
    // `forwarding_url` actions...they may not be...
    r.targets.forEach((t) => {
      const split_at = t.constraint.value.indexOf('/');
      redirect.base = t.constraint.value.substr(0, split_at);
      redirect.from = t.constraint.value.substr(split_at); // TODO: strip domain name?
    });
    r.actions.forEach((a) => {
      redirect.to = a.value.url;
      redirect.status = a.value.status_code;
    });
    redirects.push(redirect);
  });
  return redirects;
};

// const generateRedirect = (redirects) => {
//   // TODO
//   return redirects;
// }

const processZone = async (zoneName) => {
  const data = cache.get(zoneName);

  // status: 0 = Can migrate; -1 = Needs checking; 1 = Complete
  data.status = -1;
  data.messages = [];

  if (!data.yaml) {
    data.messages.push('No YAML defined');
    data.status = -1;
    return data;
  }

  // check that zone not paused and is active
  if (!data.cloudflare || data.cloudflare.paused || data.cloudflare.status !== 'active') {
    data.messages.push('Not in active Cloudflare');
    data.status = -1;
    return data;
  }

  // gather remaining data...

  await hasConfiguredRedirects(zoneName);
  data.has_yaml_redirects = (data.yaml_redirects && data.yaml_redirects.length > 0);
  data.has_cf_page_rules = (data.cf_page_rules && data.cf_page_rules.length > 0);

  const existingWorkerRoutes = await getWorkerRoutesByZoneId(data.cloudflare.id);
  data.cloudflare_routes = existingWorkerRoutes;
  // TODO check routes are standard
  data.has_worker_routes = (data.cloudflare_routes && data.cloudflare_routes.length > 0);
  data.has_standard_worker_routes = (data.cloudflare_routes && data.cloudflare_routes.length === 2);

  data.has_worker_domains = (data.cloudflare_worker && data.cloudflare_worker.length > 0);

  await isStandardDns(zoneName);
  data.has_standard_dns = data.isStandardDns;
  data.has_dns = (data.dns && data.dns.actual && data.dns.actual.length > 0);

  await areZoneSettingsValid(zoneName);
  // data.has_standard_settings = data.has_standard_settings;

  console.log(zoneName);
  data.current_redirects = convertPageRulesToRedirects(data.cf_page_rules);
  data.missing_redirects = diff(data.current_redirects, data.yaml_redirects);
  data.has_matching_redirects = (Object.keys(data.missing_redirects).length === 0);

  data.has_single_catchall_redirect = (data.yaml_redirects.length === 1 && data.yaml_redirects[0].from === '/*');

  // zone that can be updated
  if (data.has_yaml_redirects && data.has_cf_page_rules && !data.has_worker_domains 
  && !data.has_worker_routes && data.has_standard_dns && data.has_single_catchall_redirect
  && data.has_matching_redirects) {
    data.status = 0;
    return data;
  }

  // final checks for complete zones
  // either:
  // - parked. no yaml redirects, no dns, no page rules, no worker routes or domains.
  // - active. yaml redirects, standard dns, no page rules, no worker domains, worker routes.
  if (data.has_yaml_redirects) {
    if (data.has_dns) {
      data.messages.push('Parked zone with DNS records');
      data.status = -1;
      return data;
    }
    if (data.has_cf_page_rules) {
      data.messages.push('Parked zone with Page Rules');
      data.status = -1;
      return data;
    }
    if (data.has_worker_domains) {
      data.messages.push('Parked zone with Worker Domains');
      data.status = -1;
      return data;
    }
    if (data.has_worker_routes) {
      data.messages.push('Parked zone with Worker Routes');
      data.status = -1;
      return data;
    }
    data.status = 1; // complete
    return data;
  }
  // otherwise active redirects
  if (!data.has_standard_dns) {
    data.messages.push('Active zone with non-standard DNS records');
    data.status = -1;
    return data;
  }
  if (data.has_cf_page_rules) {
    data.messages.push('Active zone with Page Rules');
    data.status = -1;
    return data;
  }
  if (data.has_worker_domains) {
    data.messages.push('Active zone with Worker Domains');
    data.status = -1;
    return data;
  }
  if (!data.has_worker_routes) {
    data.messages.push('Active zone with no Worker Routes');
    data.status = -1;
    return data;
  }
  data.status = 1;
  return data;
};

const handler = async (argv) => {
  logger(blue('Fetching local yaml...'), true);
  // fetch local yaml settings
  localZoneSettings = await getLocalYamlSettings(argv.configDir);
  // fetch list of all zones defined in yaml configuration
  const yamlZones = await getLocalYamlZones(argv.configDir);
  yamlZones.map((data) => insertValue(data.zone, { yaml: data }));

  logger(blue('Fetching remote zones...'), true);
  const cfZones = await getZonesByAccount(argv.accountId);
  cfZones.map((data) => insertValue(data.name, { cloudflare: data }));

  logger(blue('Fetching remote worker domains...'), true);
  const cfWorkerDomains = await listWorkerDomains(argv.accountId);
  cfWorkerDomains.map((data) => insertValues(data.zone_name, 'cloudflare_worker', data));

  logger(blue('Processing zones...'), true);

  const cacheKeys = Array.from(cache.keys());

  await Promise.all(cacheKeys.map(async (zone) => {
    await processZone(zone);
  }));

  cacheKeys.forEach((zone) => {
    const data = cache.get(zone);
    //
    let redirectType = 'Parked?';
    if (data.cf_page_rules && data.cf_page_rules.length > 0) {
      redirectType = 'Page Rules';
    }
    if (data.cloudflare_worker && data.cloudflare_worker.length > 0) {
      redirectType = 'Worker Domain ';
    }
    if (data.cloudflare_routes && data.cloudflare_routes.length > 0) {
      redirectType = 'Worker Routes';
    }

    if (data.status === 0) {
      if (data.messages.length === 0) {
        data.messages.push('Migrate');
      }
      logger(`${lightblue(zone)} [${yellow(data.messages.join('; '))}] [${purple(redirectType)}]`, true);
    } else if (data.status > 0) {
      if (data.messages.length === 0) {
        data.messages.push('Complete');
      }
      logger(`${green(zone)} [${green(data.messages.join('; '))}] [${purple(redirectType)}]`, true);
    } else {
      logger(`${lightblue(zone)} [${orange(data.messages.join('; '))}] [${purple(redirectType)}]`, true);
    }

    let debug = `    DNS: ${data.isStandardDns ? 'OK' : 'Not Standard'}; `;
    debug += `Redirects: ${data.yaml_redirects ? data.yaml_redirects.length : undefined}; `;
    debug += `Page Rules: ${data.cf_page_rules ? data.cf_page_rules.length : undefined}; `;
    debug += `Worker Domains: ${data.cloudflare_worker ? data.cloudflare_worker.length : undefined}; `;
    debug += `Worker Routes: ${data.cloudflare_routes ? data.cloudflare_routes.length : undefined}; `;
    console.info(debug);
  });
};

export {
  command, describe, builder, handler
};
