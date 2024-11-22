/* eslint no-console: "off" */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'js-yaml';
import {
  getWorkerRoutesByZoneId,
  getZonesByName,
  putWorkerKVValuesByDomain
} from '../lib/cloudflare.js';
import {
  lightblue,
  orange
} from '../lib/shared.js';

/**
 * Describe a redirect as a YAML file
 */
const command = ['worker <domain>'];
const describe = 'Update worker redirects';
const builder = (yargs) => yargs.demandOption('configDir')
  .positional('domain', {
    describe: 'Domain to update',
    type: 'string'
  });

const handler = async (argv) => {
  const { configDir, domain } = argv;

  // check zone exists
  const zones = await getZonesByName(domain, argv.accountId);
  if (!zones || zones.length < 1) {
    console.error(orange(`No matching zone found for '${domain}'!`));
    process.exit(1);
  }
  if (zones.length > 1) {
    console.error(orange(`Multiple matching zones found for ${domain}: ${zones.map((zone) => zone.name)}`));
    process.exit(1);
  }

  // check worker route exists
  const existingWorkerRoutes = await getWorkerRoutesByZoneId(zones[0].id);
  if (!existingWorkerRoutes || existingWorkerRoutes.length !== 1) {
    console.error(orange(`Expecting a single worker route to be configured: ${existingWorkerRoutes}`));
    process.exit(1);
  }

  // open the redirects file
  const filepath = path.join(configDir.name, `${domain}.yaml`);
  const description = YAML.load(fs.readFileSync(filepath));

  // add redirects to worker KV
  const kvResponse = await putWorkerKVValuesByDomain(
    argv.accountId,
    argv.workerKvNamespace,
    domain,
    description
  );
  if (kvResponse.data.success) {
    console.info(lightblue('Redirect Description stored in Key Value storage successfully.'));
  }
};

export {
  command, describe, builder, handler
};
