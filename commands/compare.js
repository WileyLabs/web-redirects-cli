/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 **/

const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
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
                let current_redirects = convertPageRulesToRedirects(pagerules);
                let redir_filepath = path.join(process.cwd(), argv.configDir.name, redir_filename);
                let described_redirects = YAML.safeLoad(fs.readFileSync(redir_filepath));
                let missing_redirs = diff(current_redirects, described_redirects.redirects);
                // filter out missing `base` entries...
                // if there's no from/to it's not an actual redir, just different JSON
                // also converts missing_redirs to an array
                missing_redirs = Object.values(missing_redirs)
                  .filter((redir) => 'from' in redir && 'to' in redir);

                if (Object.keys(missing_redirs).length > 0) {
                  warn('These redirects are missing:');
                  let missing_pagerules = [];
                  missing_redirs.forEach((redir) => {
                    missing_pagerules.push(convertRedirectToPageRule(redir, `*${zone.name}`));
                  });
                  outputPageRulesAsText(missing_pagerules);
                  console.log();
                  inquirer.prompt({
                    type: 'confirm',
                    name: 'confirmUpdates',
                    message: `Update ${zone.name} to add the ${chalk.bold(Object.keys(missing_redirs).length)} redirects?`,
                    default: false,
                  }).then((answers) => {
                    // TODO: handle each update separately
                    if (answers.confirmUpdates) {
                      // add the first page rule (only) to this zone on Cloudflare
                      axios.post(`/zones/${val}/pagerules`, {
                          status: 'active',
                          // splat in `targets` and `actions`
                          ...missing_pagerules[0]
                        })
                        .then((resp) => {
                          if (resp.data.success) {
                            console.log(`Success! The following page rule has been created and enabled:`);
                            outputPageRulesAsText([resp.data.result]);
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
                      // tell the user to tweak permissions if it fails
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
