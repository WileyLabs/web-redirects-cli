/*
 * Common functions added as part of `sync.js` re-factoring.
 */

/* eslint no-console: "off" */
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import * as yaml from 'js-yaml';

// custom chalk colours
const { green } = chalk;
const { blue } = chalk;
const { red } = chalk;
const { yellow } = chalk;
const orange = chalk.hex('#FF8800');
const purple = chalk.hex('#BF40BF');
const lightblue = chalk.hex('#ADD8E6');

const withoutExtension = (filename) => filename.replace(/\.[^/.]+$/, '');

const getLocalYamlSettings = async (configDir) => {
  // settings are in `.settings.yaml` in ${configDir} folder
  if (configDir.contents.indexOf('.settings.yaml') > -1) {
    const settings_path = path.join(process.cwd(), configDir.name, '.settings.yaml');
    try {
      return yaml.load(fs.readFileSync(settings_path));
    } catch (error) {
      console.log(chalk.redBright(`JS_YAML ERROR: Error while attempting to parse ${settings_path}`));
    }
  }
  return {};
};

const getLocalYamlZones = async (configDir) => {
  // fetch list of all zones defined in yaml configuration
  const zoneFiles = configDir.contents.map((filename) => {
    const ext = path.extname(filename);
    if (ext === '.yaml' && filename[0] !== '.') {
      return filename;
    }
    return false;
  }).filter((r) => r);

  // merge the data into array
  const zones = [];
  zoneFiles.forEach((filename) => {
    const zone = withoutExtension(filename);
    const filepath = path.join(process.cwd(), configDir.name, filename);
    const description = yaml.load(
      fs.readFileSync(filepath, 'utf8')
    );
    zones.push({
      zone, yamlPath: filepath, description
    });
  });
  return zones;
};

export {
  green, blue, red, orange, purple, lightblue, yellow,
  getLocalYamlSettings,
  getLocalYamlZones
};
