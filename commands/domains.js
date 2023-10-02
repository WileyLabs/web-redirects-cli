/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Level } from 'level';
import * as YAML from 'js-yaml';
import {
  purple,
  lightblue,
  convertRedirectToPageRule,
  convertToIdValueObjectArray,
  createTheseDNSRecords,
  buildRequiredDNSRecordsForPagerules,
  error,
  outputPageRulesAsText,
  warn
} from '../lib/shared.js';
import { getZonesByAccount, patchZoneSettingsById } from '../lib/cloudflare.js';

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

// load the `.settings.yaml` file for secuirty defaults
function setSecuritySettings(argv, zone_id) {
  console.log(chalk.gray('  Setting security settings...'));
  const settings_path = path.join(process.cwd(), argv.configDir.name,
    '.settings.yaml');
  try {
    const settings = YAML.load(fs.readFileSync(settings_path));
    patchZoneSettingsById(zone_id, { items: convertToIdValueObjectArray(settings) })
      .catch((err) => {
        console.error(`Caught error: ${err}`);
      });
  } catch (e) {
    console.error(e);
  }
}

// now loop through each domain and offer to create it and add redirs
function confirmDomainAdditions(domains_to_add, account_name, account_id, argv) {
  if (domains_to_add.length === 0) return;
  const filename = domains_to_add.shift();
  const domain = path.parse(filename).name;

  const redir_filepath = path.join(process.cwd(),
    argv.configDir.name,
    filename);

  let description = '';
  try {
    description = YAML.load(fs.readFileSync((redir_filepath)));
  } catch (err) {
    console.error(chalk.red(`${err.name}: ${err.reason}`));
    console.log(`Skipping ${domain} for now.`);
    confirmDomainAdditions(domains_to_add, account_name, account_id, argv);
  }

  if (description !== '') {
    inquirer.prompt({
      type: 'confirm',
      name: 'confirmCreate',
      message: `Add ${domain} with ${description.redirects.length} redirects to ${account_name}?`,
      default: false
    }).then((answers) => {
      if (answers.confirmCreate) {
        console.log(chalk.gray('  Creating the zone...'));
        axios.post('/zones', {
          name: domain,
          account: { id: account_id }
        })
          .then((resp) => {
            if (resp.data.success) {
              const zone = resp.data.result;
              const pagerules = description.redirects.map((redir) => convertRedirectToPageRule(redir, `*${domain}`));

              // update domain to zone.id map in local database
              const db = new Level(`${process.cwd()}/.cache-db`);
              db.put(domain, zone.id)
                .catch(console.error);
              db.close();

              console.log(`  ${chalk.bold(resp.data.result.name)} has been created and is ${chalk.bold(resp.data.result.status)}`);

              // set the security settings to the defaults
              setSecuritySettings(argv, zone.id);

              // TODO: we need to wait until the security settings are complete before we continue
              if (description.redirects.length > 3) {
                // There are too many redirects for the Free Website plan,
                // so let's setup a Worker Route...
                axios
                  .post(`/zones/${zone.id}/workers/routes`, {
                    pattern: `*${domain}/*`,
                    script: 'redir' // TODO: make this configurable!!
                  })
                  .then(({ data }) => {
                    if (data.success) {
                      console.log('  Worker Route configured successfully!');
                    }
                  })
                  .catch(console.error);
                // ...and put the redirect description in the Worker KV storage.
                // TODO: check (earlier than here!) whether WR_WORKER_KV_NAMESPACE is set
                axios.put(`/accounts/${argv.accountId}/storage/kv/namespaces/${argv.workerKvNamespace}/values/${domain}`, description)
                  .then(({ data }) => {
                    if (data.success) {
                      console.log('  Redirect Description stored in Key Value storage successfully!');
                    }
                  })
                  .catch(console.error);
              } else {
                // TODO: we should do all the redirect display in one go,
                // and get confirmation on the lot of them...not one at a time
                pagerules.forEach((pagerule) => {
                  console.log();
                  console.log(chalk.gray('  Adding these Page Rules...'));
                  outputPageRulesAsText([pagerule]);

                  axios.post(`/zones/${zone.id}/pagerules`, {
                    status: 'active',
                    // splat in `targets` and `actions`
                    ...pagerule
                  })
                    .then(({ data }) => {
                      if (data.success) {
                        console.log('  Page rule successfully created!');
                        confirmDomainAdditions(domains_to_add, account_name, account_id, argv);
                      }
                    })
                    .catch((err) => {
                      // TODO: handle errors better... >_<
                      if ('response' in err
                          && 'status' in err.response
                          && err.response.status >= 400) {
                        const { data } = err.response;
                        if (data.errors.length > 0) {
                          // collect error/message combos and display those
                          for (let i = 0; i < data.errors.length; i += 1) {
                            error(data.errors[i].message.split(':')[0]);
                            if ('messages' in data) {
                              warn(data.messages[i].message.split(':')[1]);
                            }
                          }
                        } else {
                          // assume we have something...else...
                          console.dir(data, { depth: 5 });
                        }
                      } else {
                        console.dir(err, { depth: 5 });
                      }
                    });
                });
              }

              // same DNS records for both worker and page rules
              createTheseDNSRecords(zone.id, buildRequiredDNSRecordsForPagerules(pagerules));

              console.log('  To activate this site, change the name servers to:');
              console.log(`    ${chalk.bold(resp.data.result.name_servers.join('\n    '))}`);
            }
          })
          .catch((err) => {
            // TODO: handle errors better... >_<
            if ('response' in err
                && 'status' in err.response
                && err.response.status === 403) {
              error(`The API token needs the ${chalk.bold('#zone.edit')} permissions enabled.`);
            } else {
              // console.error(`${err.response.status} ${err.response.statusText}`);
              console.error(err);
            }
          });
      } else {
        // no on the current one, but let's keep going
        confirmDomainAdditions(domains_to_add, account_name, account_id, argv);
      }
    });
  }
}

/**
 * Lists available Zones/Sites in Cloudflare
 */
const command = ['domains', 'zones'];
const describe = 'List domains in the current Cloudflare account';
// exports.builder = (yargs) => {};
const handler = (argv) => {
  axios.defaults.headers.common.Authorization = `Bearer ${argv.cloudflareToken}`;
  getZonesByAccount(argv.accountId)
    .then((all_zones) => {
      // setup a local level store for key/values (mostly)
      const db = new Level(`${process.cwd()}/.cache-db`);

      console.log(`${chalk.bold(all_zones.length)} Zones:`);
      // loop through the returned zones and store a domain => id mapping
      all_zones.forEach((zone) => {
        let status_icon = chalk.green('✓ ');
        if (zone.status !== 'active') status_icon = chalk.blue('🕓');
        if (zone.paused) status_icon = chalk.blue('⏸️');

        console.log(`${status_icon} ${chalk.bold(zone.name)} - ${chalk[zone.plan.name === 'Enterprise Website' ? 'red' : 'green'](zone.plan.name)}`);
        if (zone.status === 'pending' && !zone.paused && zone.type !== 'partial') {
          console.log(lightblue(`Update the nameservers to: ${zone.name_servers.join(', ')}`));
        }
        if (zone.status === 'pending' && !zone.paused && zone.type === 'partial') {
          console.log(lightblue('CNAME Setup required. See Cloudflare UX.'));
        }
        // output a warning if there is no local description
        const redir_filename = argv.configDir.contents
          .filter((f) => f.substr(0, zone.name.length) === zone.name)[0];
        if (undefined === redir_filename) {
          console.log(purple(`No redirect description for ${chalk.bold(zone.name)} was found.`));
        }
        db.put(zone.name, zone.id)
          .catch(console.error);
      });
      db.close();

      const all_zone_names = all_zones.map((z) => z.name);

      const described_zone_names = argv.configDir.contents.map((filename) => {
        if (filename[0] !== '.') {
          return filename;
        }
        return false;
      }).filter((r) => r);

      // list of any zones on Cloudflare that lack a description file
      const zone_but_no_description = all_zone_names
        .filter((el) => !described_zone_names.includes(`${el}.yaml`)
               && !described_zone_names.includes(`${el}.json`));

      // list of any redirect descriptions available which do not appear in Cloudflare
      const described_but_no_zone = described_zone_names
        .filter((el) => !all_zone_names.includes(path.parse(el).name));

      // list zones without descriptions
      if (zone_but_no_description.length > 0) {
        console.log(`\nThe following ${chalk.bold(zone_but_no_description.length)} domains are not yet described locally:`);
        zone_but_no_description.forEach((zone_name) => {
          console.log(` - ${zone_name}`);
        });
      }

      if (described_but_no_zone.length > 0) {
        console.log(`\nThe following ${chalk.bold(described_but_no_zone.length)} domains are not yet in Cloudflare:`);
        described_but_no_zone.forEach((li) => {
          console.log(` - ${li.substr(0, li.length - 5)} (see ${path.join(argv.configDir.name, li)})`);
        });

        // ask if the user is ready to create the above missing zones
        console.log();
        inquirer.prompt({
          type: 'confirm',
          name: 'confirmCreateIntent',
          message: 'Are you ready to create the missing zones on Cloudflare?',
          default: false
        }).then((answers) => {
          if (answers.confirmCreateIntent) {
            // first, confirm which Cloudflare account (there should only be one)
            // ...so for now we just grab the first one...
            axios.get(`/accounts/${argv.accountId}`)
              .then((account_resp) => {
                if (account_resp.data.success) {
                  const account_id = account_resp.data.result.id;
                  const account_name = account_resp.data.result.name;
                  // TODO: get confirmation on the account found?
                  console.log(`We'll be adding these to ${account_name}.`);

                  // recursive function that will add each in sequence (based
                  // on positive responses of course)
                  confirmDomainAdditions(described_but_no_zone, account_name, account_id, argv);
                }
              })
              .catch((err) => {
                console.log(err);
                console.dir(err.response.data, { depth: 5 });
              });
          }
        });
      }
    })
    .catch((err) => {
      if ('response' in err && 'status' in err.response) {
        console.error(chalk.red(`${err.response.status} ${err.response.statusText}`));
        console.dir(err.response.data, { depth: 5 });
      } else {
        console.error(err);
      }
    });
};

export {
  command, describe, handler
};
