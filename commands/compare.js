/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 **/

const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const { table, getBorderCharacters } = require('table');
const { diff } = require('deep-object-diff');
const inquirer = require('inquirer');
const level = require('level');
const YAML = require('js-yaml');

const { error, warn,
  convertPageRulesToRedirects, convertRedirectToPageRule,
  outputPageRulesAsText } = require('../lib/shared.js');

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
 * Compare [configDir]'s local redirect descriptions for <domain> with Cloudflare's
 **/
exports.command = 'compare <domain>';
exports.describe = 'Compare [configDir]\'s local redirect descriptions for <domain> with Cloudflare\'s';
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
    // TODO: update this to use inquirer to list available ones to pick from?
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
          axios.get(`/zones/${val}/pagerules`)
        ]).then((results) => {
            let [zone, pagerules] = results.map((resp) => {
              return resp.data.result;
            });

            console.log(
`Zone Health Check:
  ${chalk.bold(zone.name)} - ${zone.id}
  ${chalk.green(zone.plan.name)} - ${pagerules.length} of ${zone.meta.page_rule_quota} Page Rules used.
`);

            if ('contents' in argv.configDir) {
              // grab the first on with a matching zone name
              // TODO: throw a warning if we find more than one...'cause that's just confusing...
              let redir_filename = argv.configDir.contents.filter((f) => f.substr(0, zone.name.length) === zone.name)[0];
              if (undefined === redir_filename) {
                console.log(chalk.keyword('purple')(`No redirect description for ${chalk.bold(zone.name)} was found.`));
              } else {
                // compare descriptive redirect against current page rule(s)
                let current = convertPageRulesToRedirects(pagerules);
                let redir_filepath = path.join(process.cwd(), argv.configDir.name, redir_filename);
                let future = YAML.safeLoad(fs.readFileSync(redir_filepath)).redirects;
                let missing = diff(current, future);
                // base being undefined is not an error (as it's optional),
                // so clean that out
                // TODO: set the default pre-comparison?
                if ('0' in missing && 'base' in missing['0'] && missing['0'].base === undefined) {
                  delete missing['0'];
                }
                // modifications will be an object key'd by the pagerule ID
                // and the value will contain the change to make
                let modifications = {};
                if (Object.keys(missing).length > 0) {
                  console.log('Below are the missing redirects:');
                  const diff_rows = [];
                  diff_rows.push([chalk.bold('Current'), chalk.bold('Future'), chalk.bold('Difference')]);
                  Object.keys(missing).forEach((i) => {
                    if (current[i] === undefined) {
                      // we've got a new rule
                      diff_rows.push([chalk.green('none: will add ->'), YAML.safeDump(future[i]), '']);
                      modifications[pagerules[i].id] = {
                        method: 'post',
                        pagerule: {
                          status: 'active',
                          ...convertRedirectToPageRule(future[i])
                        }
                      };
                    } else if (future[i] === undefined) {
                      diff_rows.push([YAML.safeDump(current[i]) || '',
                                     chalk.red('<-- will remove'), '']);
                      // mark the pagerule for deletion
                      modifications[pagerules[i].id] = {method: 'delete'};
                    } else {
                      diff_rows.push([YAML.safeDump(current[i]) || '',
                                      YAML.safeDump(future[i]) || '',
                                      YAML.safeDump(missing[i]) || '']);
                      // replace the current pagerule with the future one
                      modifications[pagerules[i].id] = {
                        method: 'put',
                        pagerule: {
                          status: 'active',
                          ...convertRedirectToPageRule(future[i])
                        }
                      };
                    }
                  });
                  console.log(table(diff_rows, {
                    border: getBorderCharacters('void')
                  }));

                  inquirer.prompt({
                    type: 'confirm',
                    name: 'confirmUpdates',
                    message: `Update ${zone.name} to make the above modifications?`,
                    default: false,
                  }).then((answers) => {
                    if (answers.confirmUpdates) {
                      // TODO: switch this to use Promise.all?
                      Object.keys(modifications).forEach((key) => {
                        let mod = modifications[key];
                        // post doesn't need an ID
                        let url = modifications[key].method === 'post'
                          ? `/zones/${val}/pagerules`
                          : `/zones/${val}/pagerules/${key}`;
                        axios[mod.method](url,
                                          // delete doesn't need a body
                                          mod.method === 'delete' ? {} : mod.pagerule)
                          .then((resp) => {
                            if (resp.data.success) {
                              let msg = '';
                              switch (mod.method) {
                                case 'delete':
                                  msg = `Page rule ${key} has been removed.`;
                                  break;
                                case 'post':
                                  msg = `The following page rule was created and enabled: ${outputPageRulesAsText([resp.data.result])}`;
                                  break;
                                case 'put':
                                  msg = `Page rule ${key} has been updated: ${outputPageRulesAsText([resp.data.result])}`;
                                  break;
                                default:
                                  break;
                              }
                            }
                          })
                          .catch((err) => {
                            // TODO: handle errors better... >_<
                            if ('response' in err
                                && 'status' in err.response
                                && err.response.status === 403) {
                              error(`The API token needs the ${chalk.bold('#zone.edit')} permissions enabled.`);
                            } else {
                              console.error(err);
                            }
                          });
                      });
                      // TODO: tell the user to tweak permissions if it fails
                    }
                  });
                } else {
                  console.log(`${chalk.bold.green('✓')} Current redirect descriptions match the preferred configuration.`);
                }
              }
            }
          })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
