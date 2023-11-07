/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { table, getBorderCharacters } from 'table';
import { diff } from 'deep-object-diff';
import inquirer from 'inquirer';
import { Level } from 'level';
import { v4 as uuidv4 } from 'uuid';
import * as YAML from 'js-yaml';
import {
  purple,
  error,
  convertPageRulesToRedirects,
  convertRedirectToPageRule,
  outputPageRulesAsText
} from '../lib/shared.js';
import {
  getZoneById,
  getPageRulesByZoneId,
  createPageRule,
  deletePageRule,
  updatePageRule
} from '../lib/cloudflare.js';

/**
 * Compare [configDir]'s local redirect descriptions for <domain> with Cloudflare's
 */
const command = 'compare <domain>';
const describe = 'Compare [configDir]\'s local redirect descriptions for <domain> with Cloudflare\'s';
const builder = (yargs) => {
  yargs
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name',
      demandOption: true
    })
    .demandOption('configDir');
};
const handler = (argv) => {
  if (!('domain' in argv)) {
    // TODO: update this to use inquirer to list available ones to pick from?
    error('Which domain where you wanting to show redirects for?');
  } else {
    // setup a local level store for key/values (mostly)
    const db = new Level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((zone_id) => {
        // read redirect config file for domain
        // gather zone/domain information from Cloudflare
        Promise.all([
          getZoneById(zone_id),
          getPageRulesByZoneId(zone_id)
        ]).then((results) => {
          const [zone, pagerules] = results;

          console.log(`Zone Health Check:
  ${chalk.bold(zone.name)} - ${zone.id}
  ${chalk.green(zone.plan.name)} - ${pagerules.length} of ${zone.meta.page_rule_quota} Page Rules used.
`);

          if ('contents' in argv.configDir) {
            // grab the first on with a matching zone name
            // TODO: throw a warning if we find more than one...'cause that's just confusing...
            const redir_filename = argv.configDir.contents
              .filter((f) => f.substr(0, zone.name.length) === zone.name)[0];
            if (undefined === redir_filename) {
              console.log(purple(`No redirect description for ${chalk.bold(zone.name)} was found.`));
            } else {
              const redir_filepath = path.join(process.cwd(), argv.configDir.name, redir_filename);
              let future = YAML.load(fs.readFileSync(redir_filepath)).redirects;
              // add defalts into minimal YAMLs
              future = future.map((rule) => {
                const rv = rule;
                if (!('base' in rule)) {
                  rv.base = `*${argv.domain}`;
                }
                if (!('status' in rule)) {
                  rv.status = 301;
                }
                return rv;
              });
              if (future.length > zone.meta.page_rule_quota) {
                console.log(chalk.red(`Sorry, there are ${future.length} and ${chalk.bold('only')} ${zone.meta.page_rule_quota} available.`));
                console.log(`Use the ${chalk.bold('worker')} command to use that instead of Page Rules.`);
                process.exit();
              }
              // compare descriptive redirect against current page rule(s)
              const current = convertPageRulesToRedirects(pagerules);
              const missing = diff(current, future);

              // modifications will be an object key'd by the pagerule ID
              // and the value will contain the change to make
              const modifications = {};
              if (Object.keys(missing).length > 0) {
                console.log('Below are the missing redirects:');
                const diff_rows = [];
                diff_rows.push([chalk.bold('Current'), chalk.bold('Future'), chalk.bold('Difference')]);
                Object.keys(missing).forEach((i) => {
                  if (current[i] === undefined) {
                    // we've got a new rule
                    diff_rows.push([chalk.green('none: will add ->'), YAML.dump(future[i]), '']);
                    modifications[uuidv4()] = {
                      method: 'post',
                      pagerule: {
                        status: 'active',
                        ...convertRedirectToPageRule(future[i], `*${zone.name}`)
                      }
                    };
                  } else if (future[i] === undefined) {
                    diff_rows.push([YAML.dump(current[i]) || '',
                      chalk.red('<-- will remove'), '']);
                    // mark the pagerule for deletion
                    modifications[pagerules[i].id] = { method: 'delete' };
                  } else {
                    // we've got a modification
                    diff_rows.push([YAML.dump(current[i]) || '',
                      YAML.dump(future[i]) || '',
                      YAML.dump(missing[i]) || '']);
                    // replace the current pagerule with the future one
                    // TODO: this doesn't work for reordering...we have to
                    // match rules and change the `priority` value of each
                    modifications[pagerules[i].id] = {
                      method: 'put',
                      pagerule: {
                        status: 'active',
                        ...convertRedirectToPageRule(future[i], `*${zone.name}`)
                      }
                    };
                  }
                });
                console.log(table(diff_rows, {
                  border: getBorderCharacters('void')
                }));

                const available_pagerules = zone.meta.page_rule_quota;
                // count the new redirects
                const new_redirs = Object.values(modifications)
                  .filter((m) => m.method === 'post').length;

                if (available_pagerules < new_redirs) {
                  console.error('Sorry...there aren\'t enough pagerules.');
                }

                inquirer.prompt({
                  type: 'confirm',
                  name: 'confirmUpdates',
                  message: `Update ${zone.name} to make the above modifications?`,
                  default: false,
                }).then((answers) => {
                  if (answers.confirmUpdates) {
                    // TODO: switch this to use Promise.all?
                    Object.keys(modifications).forEach((key) => {
                      const mod = modifications[key];
                      // TODO
                      switch (mod.method) {
                        case 'delete':
                          deletePageRule(zone_id, key)
                            .then(console.log(`Page rule ${key} has been removed.`));
                          break;
                        case 'post':
                          createPageRule(zone_id, mod.pagerule)
                            .then((response) => {
                              console.log('The following page rule was created and enabled:');
                              outputPageRulesAsText([response.data.result]);
                            });
                          break;
                        case 'put':
                          updatePageRule(zone_id, key, mod.pagerule)
                            .then((response) => {
                              console.log(`Page rule ${key} has been updated:`);
                              outputPageRulesAsText([response.data.result]);
                            });
                          break;
                        default:
                          console.error(chalk.yellow('Unhandled pagerule method:'));
                          console.error(mod);
                          break;
                      }
                    });
                    // TODO: tell the user to tweak permissions if it fails
                  }
                });
              } else {
                console.log(`${chalk.bold.green('✓')} Current redirect descriptions match the preferred configuration.`);
                outputPageRulesAsText(pagerules);
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

export {
  command, describe, builder, handler
};
