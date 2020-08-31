/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 **/

const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const inquirer = require('inquirer');
const level = require('level');
const YAML = require('js-yaml');

const { error, convertPageRulesToRedirects,
  outputPageRulesAsText } = require('../lib/shared.js');

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Show a specific domain name's Zone/Site info from Cloudflare + current Page
 * Rules.
 **/
exports.command = 'show <domain>';
exports.describe = 'Show current redirects for <domain>';
exports.builder = (yargs) => {
  yargs
  .option('format', {
    description: 'Output a JSON or YAML description file for all redirects.',
    choices: ['json', 'yaml', 'text'],
    default: 'text'
  })
  .option('export', {
    description: 'Save a JSON or YAML redirects description file to [configDir].',
    type: 'boolean',
    default: false,
    implies: ['configDir']
  })
  .positional('domain', {
    type: 'string',
    describe: 'a valid domain name',
    demandOption: true
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
        Promise.all([
          axios.get(`/zones/${val}`),
          axios.get(`/zones/${val}/pagerules`)
        ])
          .then((results) => {
            let [zone, pagerules] = results.map((resp) => {
              return resp.data.result;
            });

            switch (argv.format) {
              case 'text':
                if (!argv.export) {
                  console.log(
  `Current redirects for ${argv.domain} (${val}):
  Zone Info:
    ${chalk.bold(zone.name)} - ${zone.id}
    ${chalk.green(zone.plan.name)} - ${pagerules.length} of ${zone.meta.page_rule_quota} Page Rules used.

  Page Rules:`);
                  outputPageRulesAsText(pagerules);
                }
                // TODO: check for worker routes also
                break;
              case 'json':
              case 'yaml':
                let output = {};
                output = {
                  'cloudflare:id': zone.id,
                  name: zone.name,
                  redirects: convertPageRulesToRedirects(pagerules)
                };

                if (!argv.export) {
                  console.dir(output, {depth: 5});
                } else {
                  let redir_filepath = path.join(process.cwd(),
                                                 argv.configDir.name,
                                                 `${zone.name}.${argv.format}`);
                  let formatForOutput = argv.format === 'json'
                    ? (o) => JSON.stringify(o, null, 2)
                    : YAML.safeDump;
                  // TODO: also check for file in the alternate format (so we don't get dupes)
                  if (fs.existsSync(redir_filepath)) {
                    inquirer.prompt({
                      type: 'confirm',
                      name: 'confirmOverwrite',
                      message: `Hrm. ${redir_filepath} already exists. Overwrite it?`,
                      default: false
                    }).then((answers) => {
                      if (answers.confirmOverwrite) {
                        try {
                          fs.writeFileSync(redir_filepath, formatForOutput(output));
                          console.log(`${path.relative(process.cwd(), redir_filepath)} has been successfully updated.`);
                        } catch(err) {
                          console.error(err);
                        }
                      } else {
                        console.log('Sorry...');
                      }
                    });
                  } else {
                    // TODO: refactor the surrounding mess to avoid this copy/paste
                    try {
                      fs.writeFileSync(redir_filepath, formatForOutput(output));
                      console.log(`${path.relative(process.cwd(), redir_filepath)} has been successfully written.`);
                    } catch(err) {
                      console.error(err);
                    }
                  }
                }
                // TODO: check for worker routes also
                break;
              default:
                error('Sorry, that format is not yet supported.');
                break;
            }
          })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
