import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import * as YAML from 'js-yaml';
import {
  attachServiceToHost,
  getZonesByName,
  putWorkerKVValuesByDomain
} from '../lib/cloudflare.js';

/**
 * Describe a redirect as a YAML file
 */
const command = ['worker <domain>'];
const describe = 'Setup a Cloudflare Worker for these redirects';
const builder = (yargs) => yargs.demandOption('configDir')
  .positional('domain', {
    describe: 'Domain to redirect',
    type: 'string'
  });
const handler = (argv) => {
  const { configDir, domain } = argv;
  // open the redirects file
  const filepath = path.join(configDir.name, `${domain}.yaml`);
  const description = YAML.load(fs.readFileSync(filepath));
  // push it to the KV
  // TODO: check (earlier than here!) whether WR_WORKER_KV_NAMESPACE is set
  putWorkerKVValuesByDomain(argv.accountId, argv.workerKvNamespace, domain, description)
    .then(({ data }) => {
      if (data.success) {
        console.log('Redirect Description stored in Key Value storage successfully!');
      }
    })
    .catch(console.error);
  // get the zone ID for the domain in question
  getZonesByName(domain)
    .then((results) => {
      switch (results.length) {
        case 0:
          throw new Error(`No matching zone found for ${domain}!`);
        case 1:
          return results[0].id;
        default:
          throw new Error(`Multiple matching zones found for ${domain}: ${results.map((result) => result.name)}`);
      }
    })
    .then((zone_id) => {
      // TODO: handle situations where more than just `www` and the apex redirect
      [domain, `www.${domain}`].forEach((hostname) => {
        // setup the Worker route or Worker custom domain
        attachServiceToHost(argv.accountId, zone_id, hostname)
          .then(() => {
            console.log(`Setup ${hostname} to point to the ${chalk.bold('redir')} Worker.`);
          })
          .catch((err) => {
            if (err.response.status === 409) {
              console.error(`Failed to setup ${hostname} due to conflict.`);
              console.error(err.response.data.errors);
            } else {
              console.error(err);
            }
          });
      });
    })
    .catch(console.error);
};

export {
  command, describe, builder, handler
};
