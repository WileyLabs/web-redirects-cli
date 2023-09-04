import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import chalk from 'chalk';
import * as YAML from 'js-yaml';

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

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
  axios.defaults.headers.common.Authorization = `Bearer ${argv.cloudflareToken}`;

  const { configDir, domain } = argv;
  // open the redirects file
  const filepath = path.join(configDir.name, `${domain}.yaml`);
  const description = YAML.load(fs.readFileSync(filepath));
  // push it to the KV
  // TODO: check (earlier than here!) whether WR_WORKER_KV_NAMESPACE is set
  axios.put(`/accounts/${argv.accountId}/storage/kv/namespaces/${argv.workerKvNamespace}/values/${domain}`, description)
    .then(({ data }) => {
      if (data.success) {
        console.log('Redirect Description stored in Key Value storage successfully!');
      }
    })
    .catch(console.error);
  // get the zone ID for the domain in question
  axios.get(`/zones?name=${domain}`)
    .then(({ data }) => {
      if (data.result.length > 0) {
        return data.result[0].id;
      }
      throw JSON.stringify(data.errors);
    })
    .then((zone_id) => {
      // TODO: handle situations where more than just `www` and the apex redirect
      [domain, `www.${domain}`].forEach((hostname) => {
        // setup the Worker route or Worker custom domain
        axios.put(`/accounts/${argv.accountId}/workers/domains`, {
          zone_id,
          hostname,
          service: 'redir',
          environment: 'production'
        }).then(() => {
          console.log(`Setup ${hostname} to point to the ${chalk.bold('redir')} Worker.`);
        }).catch((err) => {
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
