/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import * as YAML from 'js-yaml';
import axios from 'axios';
import { updatedDiff } from 'deep-object-diff';
import inquirer from 'inquirer';
import { Level } from 'level';
import {
  orange,
  warn,
  convertToIdValueObjectArray
} from '../lib/shared.js';
import { getZonesByAccount, getZoneById, getZoneSettingsById, patchZoneSettingsById } from '../lib/cloudflare.js';

function outputDifferences(updates, current, l = 0) {
  Object.keys(updates).forEach((key) => {
    if (typeof updates[key] !== 'object') {
      console.log(`${'  '.repeat(l)}${key}: ${chalk.green(updates[key])} (currently ${orange(current[key])})`);
    } else {
      console.log(`${'  '.repeat(l)}${key}:`);
      outputDifferences(updates[key], current[key], l + 1);
    }
  });
}

function checkSecurity(configDir, zone, settings, another) {
  // check security settings against `.settings.yaml` in redirects folder
  const current = {};
  settings.forEach((s) => {
    current[s.id] = s.value;
  });
  if (configDir.contents.indexOf('.settings.yaml') > -1) {
    const settings_path = path.join(process.cwd(), configDir.name, '.settings.yaml');
    try {
      const baseline = YAML.load(fs.readFileSync(settings_path));
      const updates = updatedDiff(current, baseline);
      if (Object.keys(updates).length > 0) {
        warn(`${zone.name} settings need updating:`);
        outputDifferences(updates, current);
        console.log();
        inquirer.prompt({
          type: 'confirm',
          name: 'confirmUpdates',
          // TODO: ask for each setting?
          message: `Update ${zone.name} to match all these settings?`,
          default: false
        }).then((answers) => {
          if (answers.confirmUpdates) {
            patchZoneSettingsById(zone.id, { items: convertToIdValueObjectArray(updates) })
              .then(() => {
                console.log(chalk.green(`\nSuccess! ${zone.name} settings have been updated.`));
                if (another) another();
              }).catch((err) => {
                console.error(`Caught error: ${err}`);
              });
          } else {
            if (another) another();
          }
        }).catch(console.error);
      } else {
        console.log(`${chalk.bold.green('✓')} ${zone.name} settings match the preferred configuration.`);
        if (another) another();
      }
    } catch (err) {
      console.error(err);
    }
  }
}

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Check a [domain]'s settings and redirects
 */
const command = 'check [domain]';
const describe = 'Check a [domain]\'s settings with [configDir]\'s default configuration (`.settings.yaml`)';
const builder = (yargs) => {
  yargs
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name'
    })
    .demandOption('configDir');
};
const handler = (argv) => {
  axios.defaults.headers.common.Authorization = `Bearer ${argv.cloudflareToken}`;
  if (!('domain' in argv)) {
    getZonesByAccount(argv.accountId)
      .then((all_zones) => {
        function another() {
          const zone = all_zones.shift(); // one at a time
          if (zone) {
            // get the settings for the zone
            getZoneSettingsById(zone.id)
              // pass all the details to checkSecurity
              .then(async (data) => {
                checkSecurity(argv.configDir, zone, data, another);
              }).catch((err) => {
                console.error(`Caught error: ${err}`);
              });
          }
        }
        another();
      });
  } else {
    // setup a local level store for key/values (mostly)
    const db = new Level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((zone_id) => {
        // read redirect config file for domain
        // gather zone/domain information from Cloudflare
        Promise.all([
          getZoneById(zone_id),
          getZoneSettingsById(zone_id)
        ]).then((results) => {
          const [zone, settings] = results;
          // the main event
          checkSecurity(argv.configDir, zone, settings);
        }).catch((err) => {
          console.error(`Caught error: ${err}`);
        });
      })
      .catch((err) => {
        console.error(`Caught error: ${err}`);
      });
    db.close();
  }
};

export {
  command, describe, builder, handler
};
