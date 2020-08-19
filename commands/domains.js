const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const level = require('level');

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

// check if local redirect description exists
function findDescription(domain, dir) {
  // create file path for both available formats
  let redir_filepath_json = path.join(process.cwd(), dir, `${domain}.json`);
  let redir_filepath_yaml = path.join(process.cwd(), dir, `${domain}.yaml`);
  // check if file exists
  if (fs.existsSync(redir_filepath_json)) {
    return path.relative(process.cwd(), redir_filepath_json);
  }
  if (fs.existsSync(redir_filepath_yaml)) {
    return path.relative(process.cwd(), redir_filepath_yaml);
  }
  return false;
}

/**
 * Lists available Zones/Sites in Cloudflare
 **/
exports.command = ['domains', 'zones'];
exports.describe = 'List domains in the current Cloudflare account';
exports.builder = (yargs) => {
  yargs.option('cloudflareToken', {
    describe: `API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)`,
    demandOption: true,
    type: 'string'
  }).option('configDir', {
    type: 'string',
    describe: 'directory containing the redirect descriptions (WR_CONFIG_DIR)',
    default: '.',
    coerce(v) {
      return {
        name: v,
        contents: fs.readdirSync(v, 'utf8')
      };
    }
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
      let zone_names = [];
      resp.data.result.forEach((zone) => {
        zone_names.push(zone.name);
        console.log(`
  ${chalk.bold(zone.name)} - ${zone.id} in ${zone.account.name}
  ${zone.status === 'active' ? chalk.green('✓') : chalk.blue('🕓')} ${chalk.green(zone.plan.name)} - ${zone.meta.page_rule_quota} Page Rules available.`);
        let description_file = findDescription(zone.name, argv.configDir.name);
        if (description_file) {
          console.log(chalk.keyword('purple')(`  Redirect description exists: ${description_file}`));
        }
        db.put(zone.name, zone.id)
          .catch(console.error);
      });
      db.close();

      // list any redirect descriptions available which do not appear in Cloudflare
      let missing = argv.configDir.contents.filter((filename) => {
        return filename[0] !== '.'
          && zone_names.indexOf(filename.substr(0, filename.length-5)) === -1;
      });

      if (missing.length > 0) {
        console.log(`\nThe following ${chalk.bold(missing.length)} domains are not yet in Cloudflare:`);
        missing.forEach((li) => {
          console.log(` - ${li.substr(0, li.length-5)} (see ${path.join(argv.configDir.name, li)})`);
        });
      }
    })
    .catch((err) => {
      console.error(err);
      console.error(err.response.data);
    });
};
