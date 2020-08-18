const axios = require('axios');
const chalk = require('chalk');
const level = require('level');

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Lists available Zones/Sites in Cloudflare
 **/
exports.command = 'zones';
exports.describe = 'List zones in current Cloudflare account';
exports.builder = (yargs) => {
  yargs.option('cloudflareToken', {
    describe: `API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)`,
    demandOption: true,
    type: 'string'
  });
};
exports.handler = (argv) => {
  axios.defaults.headers.common['Authorization'] = `Bearer ${argv.cloudflareToken}`;
  axios.get('/zones')
    .then((resp) => {
      // setup a local level store for key/values (mostly)
      const db = level(`${process.cwd()}/.cache-db`);

      console.log(`${chalk.bold(resp.data.result.length)} Zones:`);
      // loop through the returned zones and store a domain => id mapping
      resp.data.result.forEach((zone) => {
        console.log(`
  ${chalk.bold(zone.name)} - ${zone.id} in ${zone.account.name}
  ${zone.status === 'active' ? chalk.green('✓') : chalk.blue('🕓')} ${chalk.green(zone.plan.name)} - ${zone.meta.page_rule_quota} Page Rules available.`);
        db.put(zone.name, zone.id)
          .catch(console.error);
      });
      db.close();
    })
    .catch((err) => {
      console.error(err);
      console.error(err.response.data);
    });
};
