/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 **/

const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const { updatedDiff } = require('deep-object-diff');
const inquirer = require('inquirer');
const level = require('level');
const YAML = require('js-yaml');

const { error, warn, convertToIdValueObjectArray } = require('../lib/shared.js');

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
exports.command = 'check <domain>';
exports.describe = 'Check a <domain>\'s settings with [configDir]\'s default configuration (`.settings.yaml`)';
exports.builder = (yargs) => {
  yargs
  .positional('domain', {
    type: 'string',
    describe: 'a valid domain name',
    demandOption: true
  })
  .demandOption('configDir');
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
            if (argv.configDir.contents.indexOf('.settings.yaml') > -1) {
              let settings_path = path.join(process.cwd(), argv.configDir.name,
                                            '.settings.yaml');
              try {
                let baseline = YAML.safeLoad(fs.readFileSync(settings_path));
                let updates = updatedDiff(current, baseline)
                if (Object.keys(updates).length > 0) {
                  warn('These settings need updating:');
                  outputDifferences(updates, current);
                  console.log()
                  inquirer.prompt({
                    type: 'confirm',
                    name: 'confirmUpdates',
                    // TODO: ask for each setting?
                    message: `Update ${zone.name} to match all these settings?`,
                    default: false
                    }).then((answers) => {
                      if (answers.confirmUpdates) {
                        axios.patch(`/zones/${val}/settings`,
                                    {items: convertToIdValueObjectArray(updates)})
                          .then((resp) => {
                            if (resp.data.success) {
                              console.log(chalk.green('Success! The settings have been updated.'));
                            }
                          }).catch((err) => {
                            if ('response' in err
                                && 'status' in err.response
                                && err.response.status === 403) {
                              error(`The API token needs the ${chalk.bold('#zone_settings.edit')} permissions enabled.`);
                            } else {
                              console.error(err);
                            }
                          });
                      }
                    }).catch(console.error);
                } else {
                  console.log(`${chalk.bold.green('✓')} Current zone settings match the preferred configuration.`);
                }
              } catch(err) {
                console.error(err);
              }
            }
          })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
