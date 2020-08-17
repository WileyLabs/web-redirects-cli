const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const { updatedDiff } = require('deep-object-diff');
const level = require('level');
const YAML = require('js-yaml');

function error(msg) {
  console.error(chalk.bold.red(msg));
}

function outputDifferences(updates, current, level = 0) {
  for (let key in updates) {
    if (typeof updates[key] !== 'object') {
      console.log(`${'  '.repeat(level)}${key}: ${chalk.green(updates[key])} (currently ${chalk.keyword('orange')(current[key])})`);
    } else {
      console.log(`${'  '.repeat(level)}${key}:`);
      level++;
      outputDifferences(updates[key], current, level);
    }
  }
}

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Check a [domain]'s settings and redirects
 **/
exports.command = 'check [domain] [dir]';
exports.describe = 'Check a [domain]\'s redirects with [dir]\'s descriptions';
exports.builder = (yargs) => {
  yargs.option('cloudflareToken', {
    describe: `API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)`,
    demandOption: true,
    type: 'string'
  })
  .positional('domain', {
    type: 'string',
    describe: 'a valid domain name'
  })
  .positional('dir', {
    type: 'string',
    describe: 'directory for redirect definitions and `.settings.yaml`',
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
  if (!('domain' in argv)) {
    error(`Which domain where you wanting to show redirects for?`);
  } else {
    // setup a local level store for key/values (mostly)
    const db = level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((val) => {
        // read redirect config file for domain
        // gather zone/domain information from Cloudflare
        Promise.all([
          axios.get(`/zones/${val}`),
          axios.get(`/zones/${val}/pagerules`),
          axios.get(`/zones/${val}/settings`)
        ]).then((results) => {
            let [zone, pagerules, settings] = results.map((resp) => {
              return resp.data.result;
            });

            console.log(
`Zone Health Check:
  ${chalk.bold(zone.name)} - ${zone.id}
  ${chalk.green(zone.plan.name)} - ${pagerules.length} of ${zone.meta.page_rule_quota} Page Rules used.
`);
            // check security settings against `.settings.yaml` in redirects folder
            let current = {};
            settings.forEach((s) => {
              current[s.id] = s.value;
            });
            if ('dir' in argv && argv.dir.contents.indexOf('.settings.yaml') > -1) {
              let settings_path = path.join(process.cwd(), argv.dir.name,
                                            '.settings.yaml');
              try {
                let baseline = YAML.safeLoad(fs.readFileSync(settings_path));
                let updates = updatedDiff(current, baseline)
                if (Object.keys(updates).length > 0) {
                  console.log(chalk.keyword('orange')('These settings need updating:'));
                  outputDifferences(updates, current);
                } else {
                  console.log(`${chalk.bold.green('✓')} Current zone settings match the preferred configuration.`);
                }
              } catch(err) {
                console.error(err);
              }
            }

            // TODO:...
            // compare descriptive redirect against current page rule(s)
            // generate matching page rule
            // compare to existing page rule
            // explain difference
          })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
