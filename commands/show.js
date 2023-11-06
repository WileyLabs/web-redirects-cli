/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Level } from 'level';
import * as YAML from 'js-yaml';
import {
  error,
  convertPageRulesToRedirects,
  outputPageRulesAsText
} from '../lib/shared.js';
import {
  getZoneById,
  getPageRulesByZoneId
} from '../lib/cloudflare.js';

/**
 * Show a specific domain name's Zone/Site info from Cloudflare + current Page
 * Rules.
 */
const command = 'show <domain>';
const describe = 'Show current redirects for <domain>';
const builder = (yargs) => {
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
const handler = (argv) => {
  if (!('domain' in argv)) {
    error('Which domain where you wanting to show redirects for?');
  } else {
    // setup a local level store for key/values (mostly)
    const db = new Level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((zone_id) => {
        Promise.all([
          getZoneById(zone_id),
          getPageRulesByZoneId(zone_id)
        ])
          .then((results) => {
            const [zone, pagerules] = results;
            let output = {};

            switch (argv.format) {
              case 'text':
                if (!argv.export) {
                  console.log(`Current redirects for ${argv.domain} (${zone_id}):
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
                output = {
                  'cloudflare:id': zone.id,
                  name: zone.name,
                  redirects: convertPageRulesToRedirects(pagerules)
                };

                if (!argv.export) {
                  console.dir(output, { depth: 5 });
                } else {
                  const redir_filepath = path.join(
                    process.cwd(),
                    argv.configDir.name,
                    `${zone.name}.${argv.format}`
                  );
                  const formatForOutput = argv.format === 'json'
                    ? (o) => JSON.stringify(o, null, 2)
                    : YAML.dump;
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
                        } catch (err) {
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
                    } catch (err) {
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

export {
  command, describe, builder, handler
};
