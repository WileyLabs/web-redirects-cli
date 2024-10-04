/*
 * @copyright 2023 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import {
  green, blue, orange, purple, lightblue, yellow,
  getLocalYamlZones
} from '../lib/sync-shared.js';

// load environment variables from .env
import 'dotenv/config';

const command = 'yaml';

const describe = '** Experimental ** Migration of zones from using page rules to using worker. Work-in-progress.';
const builder = (yargs) => {
  yargs
    .options({});
};

const cache = new Map(); // empty cache Map()

let count = 0;
let singleRule = 0;
let multipleRule = 0;

// util: add value to cache map without wiping existing data
const insertValue = (key, value) => {
  const currentData = cache.get(key);
  if (currentData) {
    cache.set(key, { ...currentData, ...value });
  } else {
    cache.set(key, value);
  }
  return cache.get(key);
};

const processZone = async (zoneName) => {
  count++;
  const data = cache.get(zoneName);

  // is parked? (no redirects)
  if (data.yaml && data.yaml.description && data.yaml.description.redirects) {
    const { redirects } = data.yaml.description;
    console.log(blue(`${data.yaml.zone}: redirect count = ${redirects.length}`));
    if (redirects.length === 1) {
      if (redirects[0].from !== '/*') {
        console.log(orange(`${redirects[0].from} -> ${redirects[0].to}`));
      } else {
        singleRule++;
        console.log(yellow(`${redirects[0].from} -> ${redirects[0].to}`));
      }
    }
    if (redirects.length > 1) {
      multipleRule++;
    }
  } else {
    console.log(purple(`${data.yaml.zone}: redirect count = 0`));
  }
};

const handler = async (argv) => {
  const yamlZones = await getLocalYamlZones(argv.configDir);
  yamlZones.map((data) => insertValue(data.zone, { yaml: data }));

  const cacheKeys = Array.from(cache.keys());

  await Promise.all(cacheKeys.map(async (zone) => {
    await processZone(zone);
  }));

  console.log(`count = ${count}; single rule = ${singleRule}; multiple rules = ${multipleRule}`);
};

export {
  command, describe, builder, handler
};
