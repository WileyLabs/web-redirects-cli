/*
 * Adapted from existing web-redirects-cli commands as a standalone
 * migration script to handle the migration of page rules to workers.
 *
 */
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import flatCache from 'flat-cache';
import {
  convertToIdValueObjectArray,
  createDNSRecords,
  getDefaultDnsRecords,
  lightblue,
  purple
} from './lib/shared.js';
import {
  getLocalYamlSettings,
  getLocalYamlZones
} from './lib/sync-shared.js';
import {
  deleteDnsRecord,
  deleteWorkerRouteById,
  getAccountById,
  getDnsRecordsByZoneId,
  getWorkerRoutesByZoneId,
  getZonesByAccount,
  updateZoneSettingsById,
  createWorkerRoute,
  createZone,
  putWorkerKVValuesByDomain
} from './lib/cloudflare.js';

// load environment variables from `.env` file (if any)
import 'dotenv/config';

let cache; // empty cache object
let localZoneSettings; // empty zone settings object

// util: add value to cache map without wiping existing data
const insertValue = (key, value) => {
  const currentData = cache.getKey(key);
  if (currentData) {
    cache.setKey(key, { ...currentData, ...value });
  } else {
    cache.setKey(key, value);
  }
  return cache.getKey(key);
};

const outputCloudflareZoneDetails = (zones, configDir) => {
  console.info(`${chalk.bold(zones.length)} Zones:`);
  // need to update active zones with page rules - list which need updating...
  zones.forEach((zone) => {
    let migrate = false;
    if (zone.status === 'active' && !zone.paused) {
      migrate = true;
    }

    console.info(`${zone.name} [plan = ${zone.plan.name}; status = ${zone.status}; paused = ${zone.paused}; type = ${zone.type}]`);

    // if (zone.status === 'pending' && !zone.paused && zone.type !== 'partial') {
    //   console.info(lightblue(`Update the nameservers to: ${zone.name_servers.join(', ')}`));
    // }
    // if (zone.status === 'pending' && !zone.paused && zone.type === 'partial') {
    //   console.info(lightblue('CNAME Setup required. See Cloudflare UX.'));
    // }
    // // output a warning if there is no local description
    // const redir_filename = configDir.contents
    //   .filter((f) => f.substr(0, zone.name.length) === zone.name)[0];
    // if (undefined === redir_filename) {
    //   console.warn(purple(`No redirect description for ${chalk.bold(zone.name)} was found.`));
    // }
  });
};

const handler = async (argv) => {
  // initialize the zone cache
  flatCache.clearAll(argv.cacheDir); // clear cache at start of run
  cache = flatCache.load(argv.cacheId, argv.cacheDir); // initialize cache

  // load remote/cloudflare zones and add to cache
  const cfZones = await getZonesByAccount(argv.accountId);

  console.debug(cfZones.length);

  cfZones.map((data) => insertValue(data.name, { cloudflare: data }));
  outputCloudflareZoneDetails(cfZones, argv.configDir);

  // // fetch list of all zones defined in yaml configuration
  // const yamlZones = await getLocalYamlZones(argv.configDir);
  // yamlZones.map((data) => insertValue(data.zone, { yaml: data }));

  // // load local config to cache (fail on error - e.g. missing params)
  // localZoneSettings = await getLocalYamlSettings(argv.configDir);

  // // list zones without descriptions
  // const zone_but_no_description = cache.keys().filter((key) => {
  //   const zone = cache.getKey(key);
  //   return zone.cloudflare && !zone.yaml;
  // });
  // if (zone_but_no_description.length > 0) {
  //   console.info(`\nThe following ${chalk.bold(zone_but_no_description.length)} domains are not yet described locally:`);
  //   zone_but_no_description.forEach((zone_name) => {
  //     console.info(` - ${zone_name}`);
  //   });
  // }

  // // list zones not in cloudflare
  // const described_but_no_zone = cache.keys().filter((key) => {
  //   const zone = cache.getKey(key);
  //   return zone.yaml && !zone.cloudflare;
  // });
  // if (described_but_no_zone.length > 0) {
  //   console.info(`\nThe following ${chalk.bold(described_but_no_zone.length)} domains are not yet in Cloudflare:`);
  //   described_but_no_zone.forEach((zone_name) => {
  //     const yamlFilename = `${zone_name}.yaml`;
  //     console.info(` - ${zone_name} (see ${path.join(argv.configDir.name, yamlFilename)})`);
  //   });

  //   // ask if the user is ready to create the above missing zones
  //   console.info();
  //   const answer = await inquirer.prompt({
  //     type: 'confirm',
  //     name: 'confirmCreateIntent',
  //     message: 'Are you ready to create the missing zones on Cloudflare?',
  //     default: false
  //   });
  //   if (answer.confirmCreateIntent) {
  //     const account = await getAccountById(argv.accountId);
  //     console.info(`We'll be adding these to the '${account.name}' Cloudflare account.`);

  //     /* eslint no-restricted-syntax: ["error"] */
  //     for await (const zone_name of described_but_no_zone) {
  //       try {
  //         const zone = cache.getKey(zone_name);
  //         await addZoneToAccount(zone, account, argv);
  //       } catch (err) {
  //         console.dir(err);
  //         process.exit(1);
  //       }
  //     }
  //   }
  // }
};

const argv = {
  accountId: process.env.WR_ACCOUNT_ID,
  cacheDir: 'cache',
  cacheId: 'zones',
  configDir: process.env.WR_CONFIG_DIR,
};

handler(argv);
