/* eslint no-console: "off" */
import inquirer from 'inquirer';
// import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
// import * as path from 'node:path';

import {
  getLocalYamlZone
} from '../lib/migration.js';
import {
  blue, orange, yellow, lightblue
} from '../lib/sync-shared.js';
import {
  createDNSRecords
} from '../lib/shared.js'
import {
  createWorkerRoute,
  deleteDnsRecord,
  deletePageRule,
  deleteWorkerDomain,
  getDnsRecordsByZoneId,
  getPageRulesByZoneId,
  getWorkerRoutesByZoneId,
  getZonesByName,
  listWorkerDomains,
  putWorkerKVValuesByDomain
} from '../lib/cloudflare.js';

// load environment variables from .env
import 'dotenv/config';

// implement internal functions - START //

const getDefaultDnsRecords = (zoneName) => [
  {
    name: zoneName,
    type: 'A',
    content: '192.0.2.0',
    ttl: 1, // 1 = auto
    proxied: true
  },
  {
    name: `www.${zoneName}`,
    type: 'CNAME',
    content: zoneName,
    ttl: 1, // 1 = auto
    proxied: true
  }
];

const getCloudflareZone = async (zone_name, account_id) => {
  const zones = await getZonesByName(zone_name, account_id);
  if (zones.length !== 1) {
    console.log(yellow(`Expecting a single matching zone: ${zones}`));
    return undefined;
  }
  return zones[0];
};

const isValidRedirectConfiguration = async (yaml_data, zone_name, zone_id) => {
  // Has 1 yaml rule (standard catch-all pattern)
  if (!yaml_data || !yaml_data.redirects || yaml_data.redirects.length !== 1) {
    console.log(yellow('Single YAML redirect rule expected'));
    return false;
  }
  if (!yaml_data.redirects[0].from || !yaml_data.redirects[0].to || yaml_data.redirects[0].from !== '/*') {
    console.log(yellow('Single catch-all (`/*`) redirect rule expected'));
    return false;
  }
  // Fetch page rules
  const result = await getPageRulesByZoneId(zone_id);
  // Check for single rule and single standard 'catch-all' target
  if (!result || result.length !== 1) {
    console.log(yellow('Single Page Rule redirect rule expected'));
    return false;
  }
  if (!result[0].targets || result[0].targets.length !== 1) {
    console.log(yellow('Single Page Rule target expected'));
    return false;
  }
  if (result[0].targets[0].target !== 'url'
    || result[0].targets[0].constraint.operator !== 'matches'
    || result[0].targets[0].constraint.value !== `*${zone_name}/*`) {
    console.log(yellow('Unexpected Page Rule target'));
    return false;
  }

  // pass
  return true;
};

const isValidWorkerConfiguration = async (zone_name, zone_id, account_id) => {
  // No worker route or custom domain
  const existingWorkerRoutes = await getWorkerRoutesByZoneId(zone_id);
  if (existingWorkerRoutes && existingWorkerRoutes.length > 0) {
    console.log(yellow('Worker routes found: ') + JSON.stringify(existingWorkerRoutes));
    return false;
  }

  const workerDomainsForAccount = await listWorkerDomains(account_id);
  const existingCustomDomains = workerDomainsForAccount
    .filter((workerDomain) => workerDomain.zone_name === zone_name);
  if (existingCustomDomains && existingCustomDomains.length > 0) {
    console.log(yellow('Custom domains found: ') + JSON.stringify(existingCustomDomains));
    return false;
  }

  // pass
  return true;
};

const writeFile = (newFilePath, data) => {
  try {
    fs.writeFileSync(newFilePath, data);
    console.log(blue(`..New YAML file created: ${newFilePath}`));
  } catch (err) {
    console.error(yellow(`Error writing YAML file: ${err}`));
    throw err;
  }
};

// implement internal functions - END //

// implement `yargs` functions - START //

const command = 'migrateZone2 <domain>';
const describe = '**EXP** Migration of zone from page rules to worker.';
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
  if (!('domain' in argv)) {
    // initially only process zones individually
    console.log(yellow('Please supply a single zone name...'));
  } else {
    const zone_name = argv.domain;
    const account_id = argv.accountId;
    const config_dir = argv.configDir;

    console.log(blue(`Migrate zone: ${zone_name}`));

    const zone = await getCloudflareZone(zone_name, account_id);
    if (!zone) {
      console.warn(orange('ZONE NOT IN CLOUDFLARE!'));
      return;
    }

    const yaml_data = getLocalYamlZone(zone_name, config_dir);
    if (!yaml_data) {
      console.warn(orange('ZONE NOT IN LOCAL YAML!'));
      return;
    }

    console.log(blue('UPDATING...'));

    // Add worker route
    const workerName = argv.workerName ? argv.workerName : 'redir';
    const workerResponse = await createWorkerRoute(zone.id, zone_name, workerName);
    if (workerResponse.data.success) {
      console.info(blue('..Worker Route configured successfully.'));
    }

    // Remove custom domains
    const cfWorkerDomains = await listWorkerDomains(account_id);
    const customDomains = cfWorkerDomains.filter((d) => zone_name === d.zone_name);
    if (customDomains.length !== 2) {
      console.warn(orange('NOT 2 CUSTOM DOMAINS!'));
      return;
    }
    await deleteWorkerDomain(account_id, customDomains[0].id);
    await deleteWorkerDomain(account_id, customDomains[1].id);
    // customDomains.forEach(async (d) => {
    //   const deleteResponse = await deleteWorkerDomain(account_id, d.id);
    //   // console.log(deleteResponse);
    // });
    // if (customDomains.data.success) {
    //   console.info(blue('..Custom domains removed successfully.'));
    // }

    // Add standard DNS
    // const existingDns = await getDnsRecordsByZoneId(zone.id);
    // if (existingDns.length > 0) {
    //   const deleteResources = await inquirer.prompt({
    //     type: 'confirm',
    //     name: 'confirmDelete',
    //     message: yellow(`${zone} has existing DNS records! Delete these before continuing?`),
    //     default: false
    //   });
    //   if (!deleteResources.confirmDelete) {
    //     console.warn(lightblue('Exiting zone creation before complete! Check zone manually.'));
    //     return;
    //   }
    //   const promises = existingDns.map((record) => deleteDnsRecord(zone.id, record.id));
    //   await Promise.allSettled(promises);
    // }

    await createDNSRecords(zone.id, getDefaultDnsRecords(zone.name));

    // Output note to user that updated yaml will need to be checked in
  }
};

// implement yargs functions - END //

export {
  command, describe, builder, handler
};
