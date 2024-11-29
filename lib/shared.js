/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import { createDnsRecord } from './cloudflare.js';

// custom chalk colours
const { green } = chalk;
const { blue } = chalk;
const { red } = chalk;
const { yellow } = chalk;
const orange = chalk.hex('#FF8800');
const purple = chalk.hex('#BF40BF');
const lightblue = chalk.hex('#ADD8E6');

// scary red error message
const error = (msg) => {
  console.error(chalk.bold.red(msg));
  process.exit(1);
};

// warn in orange
const warn = (msg) => {
  console.log(orange(msg));
};

// convert Cloudflare's Page Rule JSON into descriptive redirect JSON
const convertPageRulesToRedirects = (pagerules) => {
  const redirects = [];
  pagerules.forEach((r) => {
    const redirect = {};
    // TODO: the following code assumes these are all
    // `forwarding_url` actions...they may not be...
    r.targets.forEach((t) => {
      const split_at = t.constraint.value.indexOf('/');
      redirect.base = t.constraint.value.substr(0, split_at);
      redirect.from = t.constraint.value.substr(split_at); // TODO: strip domain name?
    });
    r.actions.forEach((a) => {
      redirect.to = a.value.url;
      redirect.status = a.value.status_code;
    });
    redirects.push(redirect);
  });
  return redirects;
};

// convert {key: value} to {id: key, value: value} because Cloudflare API
// Deliberately is not recursive as the `security_header` value is a key/value
// object--see "Security Header" in https://api.cloudflare.com/#zone-settings-properties
const convertToIdValueObjectArray = (o) => {
  const rv = [];
  Object.keys(o).forEach((id) => {
    rv.push({
      id,
      value: o[id]
    });
  });
  return rv;
};

// generate default DNS records for a zone
const getDefaultDnsRecords = (zoneName) => [
  {
    name: zoneName,
    type: 'A',
    content: '192.0.2.0',
    ttl: 1, // 1 = auto
    proxied: true
  },
  {
    name: `www.${zoneName}`,
    type: 'CNAME',
    content: zoneName,
    ttl: 1, // 1 = auto
    proxied: true
  }
];

// find the DNS record in the DNS records haystack
// ...very un-pythonic code follows...
const hasDNSRecord = (haystack, needle) => (
  Boolean(haystack.findIndex((record) => Boolean(
    (record.type === needle.type && record.name === needle.name
      && record.content === needle.content && record.ttl === needle.ttl
      && record.proxied === needle.proxied)
  )) > -1));

// check for conflicts in the DNS records--matching type and name only
// ...very un-pythonic code follows...
const hasConflictingDNSRecord = (haystack, needle) => (
  Boolean(haystack.findIndex((record) => {
    if (needle.type === 'A') {
      // confirm that the full A record matches
      return (record.type === needle.type && record.name === needle.name
        && record.content === needle.content);
    }
    return (record.type === needle.type && record.name === needle.name);
  }) === -1));

// create the supplied list of DNS records
const createDNSRecords = async (zoneId, dnsRecords) => {
  const promises = dnsRecords.map((record) => createDnsRecord(zoneId, record));
  const resolved = await Promise.all(promises);
  resolved.forEach((r) => {
    if (r.status === 200) {
      const rec = r.data.result;
      console.log(chalk.gray(`  ${rec.name} ${rec.type} ${rec.content} was created successfully!`));
    } else {
      console.error(chalk.yellow(`  ${r.data.errors[0].message}`));
    }
  });
};

// use a list of conflicting records to find their replacements
const collectReplacementRecords = (required_dns_records, conflicts) => (
  required_dns_records.filter((r) => (
    conflicts.findIndex((c) => r.type === c.type && r.name === c.name) > -1
  ))
);

const withoutExtension = (filename) => filename.replace(/\.[^/.]+$/, '');

const getLocalYamlSettings = async (configDir) => {
  // settings are in `.settings.yaml` in ${configDir} folder
  if (configDir.contents.indexOf('.settings.yaml') > -1) {
    const settings_path = path.join(process.cwd(), configDir.name, '.settings.yaml');
    return yaml.load(fs.readFileSync(settings_path));
  }
  return {};
};

const getLocalYamlZones = (configDir) => {
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

const getLocalYamlZone = (zoneName, configDir) => {
  const fileName = `${zoneName}.yaml`;
  const filePath = path.join(process.cwd(), configDir.name, fileName);
  const description = yaml.load(
    fs.readFileSync(filePath, 'utf8')
  );
  return description;
};

export {
  blue,
  collectReplacementRecords, // shared.test.js?
  convertPageRulesToRedirects, // shared.test.js?
  convertToIdValueObjectArray,
  createDNSRecords,
  error,
  getDefaultDnsRecords,
  getLocalYamlSettings,
  getLocalYamlZone,
  getLocalYamlZones,
  green,
  hasConflictingDNSRecord, // shared.test.js?
  hasDNSRecord, // shared.test.js?
  lightblue,
  orange,
  purple,
  red,
  warn, // created standard output message formats? 
  yellow
};
