/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  convertToIdValueObjectArray,
  createDNSRecords,
  getDefaultDnsRecords,
  lightblue,
  purple
} from '../lib/shared.js';
import {
  getLocalYamlSettings,
  getLocalYamlZones
} from '../lib/sync-shared.js';
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
} from '../lib/cloudflare.js';

const cache = new Map(); // empty cache Map()
let localZoneSettings; // empty zone settings object

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

const outputCloudflareZoneDetails = (zones, configDir) => {
  console.info(`${chalk.bold(zones.length)} Zones:`);
  zones.forEach((zone) => {
    let status_icon = chalk.green('✓ ');
    if (zone.status !== 'active') status_icon = chalk.blue('🕓');
    if (zone.paused) status_icon = chalk.blue('⏸️');

    console.info(`${status_icon} ${chalk.bold(zone.name)} - ${chalk[zone.plan.name === 'Enterprise Website' ? 'red' : 'green'](zone.plan.name)}`);
    if (zone.status === 'pending' && !zone.paused && zone.type !== 'partial') {
      console.info(lightblue(`Update the nameservers to: ${zone.name_servers.join(', ')}`));
    }
    if (zone.status === 'pending' && !zone.paused && zone.type === 'partial') {
      console.info(lightblue('CNAME Setup required. See Cloudflare UX.'));
    }
    // output a warning if there is no local description
    const redir_filename = configDir.contents
      .filter((f) => f.substr(0, zone.name.length) === zone.name)[0];
    if (undefined === redir_filename) {
      console.warn(purple(`No redirect description for ${chalk.bold(zone.name)} was found.`));
    }
  });
};

const addZoneToAccount = async (data, account, argv) => {
  if (!data || !data.yaml || !data.yaml.zone || !data.yaml.yamlPath) {
    // this should never happen
    console.error('Invalid zone data! No data found for this zone: ', data);
    return;
  }
  const { zone, yamlPath, description } = data.yaml;

  if (!description || description === '') {
    console.error(lightblue(`No YAML data found for ${zone} [${path.relative(process.cwd(), yamlPath)}], skipping!`));
    return;
  }

  if (zone !== description.name) {
    console.error(lightblue(`Zone name in YAML (${zone}) doesn't match file name [${path.relative(process.cwd(), yamlPath)}], skipping!`));
    return;
  }

  // handle zone with no redirects (e.g. parked domain)
  let redirects = [];
  if (description.redirects && description.redirects.length > 0) {
    redirects = description.redirects;
  }

  const answer = await inquirer.prompt({
    type: 'confirm',
    name: 'confirmCreate',
    message: `Add ${zone} with ${redirects.length} ${redirects.length > 1 ? 'redirects' : 'redirect'} to ${account.name}?`,
    default: false
  });
  if (!answer.confirmCreate) {
    // Do nothing
    return;
  }

  console.info('Creating the zone...');
  // create zone
  const response = await createZone(zone, account.id);
  if (response.data.success) {
    const { id, name, status } = response.data.result;
    console.info(`  ${chalk.bold(name)}${chalk.gray(' has been created and is ')}${lightblue(status)}`);

    // update zone settings
    const settingsResponse = await updateZoneSettingsById(id, {
      items: convertToIdValueObjectArray(localZoneSettings)
    });
    if (settingsResponse.data.success) {
      console.info(chalk.gray('  Updated security settings.'));
    }

    // check for any worker routes that may exist if
    // the zone was previously deleted and re-added
    const existingWorkerRoutes = await getWorkerRoutesByZoneId(id);
    if (existingWorkerRoutes.length > 0) {
      const deleteResources = await inquirer.prompt({
        type: 'confirm',
        name: 'confirmDelete',
        message: chalk.yellow(`${zone} has existing worker routes! Delete these before continuing?`),
        default: false
      });
      if (!deleteResources.confirmDelete) {
        console.warn(lightblue('Exiting zone creation before complete! Check zone manually.'));
        return;
      }
      const promises = existingWorkerRoutes.map((route) => deleteWorkerRouteById(id, route.id));
      await Promise.allSettled(promises);
    }

    /* create worker route
     * NOTE: sticking with worker routes over custom domains for now, to give
     * option of flexibility for domains with 'passthrough' option.
     */
    const workerName = argv.workerName ? argv.workerName : 'redir';
    const workerResponse = await createWorkerRoute(id, name, workerName);
    if (workerResponse.data.success) {
      console.info(chalk.gray('  Worker Route configured successfully.'));
    }
    // add redirects to worker KV
    const kvResponse = await putWorkerKVValuesByDomain(
      account.id,
      argv.workerKvNamespace,
      name,
      description
    );
    if (kvResponse.data.success) {
      console.info(chalk.gray('  Redirect Description stored in Key Value storage successfully.'));
    }

    // check for any dns records that may exist if
    // the zone was previously deleted and re-added
    const existingDns = await getDnsRecordsByZoneId(id);
    if (existingDns.length > 0) {
      const deleteResources = await inquirer.prompt({
        type: 'confirm',
        name: 'confirmDelete',
        message: chalk.yellow(`${zone} has existing DNS records! Delete these before continuing?`),
        default: false
      });
      if (!deleteResources.confirmDelete) {
        console.warn(lightblue('Exiting zone creation before complete! Check zone manually.'));
        return;
      }
      const promises = existingDns.map((record) => deleteDnsRecord(id, record.id));
      await Promise.allSettled(promises);
    }

    await createDNSRecords(id, getDefaultDnsRecords(zone));
  }
};

/**
 * Lists missing zones in Cloudflare, and creates them if desired.
 */
const command = ['domains2', 'zones2'];
const describe = 'List domains in the current Cloudflare account';
// const builder = (yargs) => {};

const handler = async (argv) => {
  // load remote/cloudflare zones and add to cache
  const cfZones = await getZonesByAccount(argv.accountId);
  cfZones.map((data) => insertValue(data.name, { cloudflare: data }));

  outputCloudflareZoneDetails(cfZones, argv.configDir);

  // fetch list of all zones defined in yaml configuration
  const yamlZones = await getLocalYamlZones(argv.configDir);
  yamlZones.map((data) => insertValue(data.zone, { yaml: data }));

  // load local config to cache (fail on error - e.g. missing params)
  localZoneSettings = await getLocalYamlSettings(argv.configDir);

  // get array of cache keys
  const cacheKeys = Array.from(cache.keys());

  // zones in cloudflare but not in yaml
  const zone_but_no_description = cacheKeys.filter((key) => {
    const zone = cache.get(key);
    return zone.cloudflare && !zone.yaml;
  });
  if (zone_but_no_description.length > 0) {
    console.info(`\nThe following ${chalk.bold(zone_but_no_description.length)} domains are not yet described locally:`);
    zone_but_no_description.forEach((zone_name) => {
      console.info(` - ${zone_name}`);
    });
  }

  // zones in yaml but not in cloudflare
  const described_but_no_zone = cacheKeys.filter((key) => {
    const zone = cache.get(key);
    return zone.yaml && !zone.cloudflare;
  });
  if (described_but_no_zone.length > 0) {
    console.info(`\nThe following ${chalk.bold(described_but_no_zone.length)} domains are not yet in Cloudflare:`);
    described_but_no_zone.forEach((zone_name) => {
      const zone = cache.get(zone_name);
      let yaml_name;
      if (zone.yaml && zone.yaml.description) {
        yaml_name = zone.yaml.description.name;
      }
      const yamlFilename = `${zone_name}.yaml`;
      console.info(` - ${yaml_name} (see ${path.join(argv.configDir.name, yamlFilename)})`);
    });

    // ask if the user is ready to create the above missing zones
    console.info();
    const answer = await inquirer.prompt({
      type: 'confirm',
      name: 'confirmCreateIntent',
      message: 'Are you ready to create the missing zones on Cloudflare?',
      default: false
    });
    if (answer.confirmCreateIntent) {
      const account = await getAccountById(argv.accountId);
      console.info(`We'll be adding these to the '${account.name}' Cloudflare account.`);

      /* eslint no-restricted-syntax: ["error"] */
      for await (const zone_name of described_but_no_zone) {
        try {
          const zone = cache.get(zone_name);
          await addZoneToAccount(zone, account, argv);
        } catch (err) {
          console.dir(err);
          process.exit(1);
        }
      }
    }
  }
};

export {
  command, describe, handler
};
