/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'js-yaml';
import { updatedDiff } from 'deep-object-diff';
import inquirer from 'inquirer';
import {
  error,
  green,
  orange,
  warn,
  convertToIdValueObjectArray
} from '../lib/shared.js';
import {
  getZonesByName,
  getZoneSettingsById,
  updateZoneSettingsById
} from '../lib/cloudflare.js';

function outputDifferences(updates, current, l = 0) {
  Object.keys(updates).forEach((key) => {
    if (typeof updates[key] !== 'object') {
      console.log(`${'  '.repeat(l)}${key}: ${green(updates[key])} (currently ${orange(current[key])})`);
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
            updateZoneSettingsById(zone.id, { items: convertToIdValueObjectArray(updates) })
              .then(() => {
                console.log(green(`\nSuccess! ${zone.name} settings have been updated.`));
                if (another) another();
              }).catch((err) => {
                console.error(`Caught error: ${err}`);
              });
          } else if (another) {
            another();
          }
        }).catch(console.error);
      } else {
        console.log(`${green('✓')} ${zone.name} settings match the preferred configuration.`);
        if (another) another();
      }
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * Check a [domain]'s settings and redirects
 */
const command = 'check domain';
const describe = 'Check a domain\'s settings with [configDir]\'s default configuration (`.settings.yaml`)';
const builder = (yargs) => {
  yargs
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name',
      demandOption: true
    })
    .demandOption('configDir');
};
const handler = async (argv) => {
  if (!('domain' in argv)) {
    // NOTE: this should be redundant as yargs treats 'domain' as required argument
    error('Which domain do you want to check?');
  }

  // get zone
  const zones = await getZonesByName(argv.domain, argv.accountId);
  if (!zones || zones.length < 1) {
    error(`No matching zone found for '${argv.domain}'!`);
  }
  if (zones.length > 1) {
    error(`Multiple matching zones found for ${argv.domain}: ${zones.map((zone) => zone.name)}`);
  }
  const zone = zones[0];  

  // get settings
  const settings = await getZoneSettingsById(zone.id);
  checkSecurity(argv.configDir, zone, settings);
};

export {
  command, describe, builder, handler
};
