/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

/* eslint no-console: "off" */
import inquirer from 'inquirer';
import { diffString } from 'json-diff';
import {
  orange,
  createDNSRecords,
  error,
  getDefaultDnsRecords,
  green,
  lightblue,
  yellow
} from '../lib/shared.js';
import {
  deleteDnsRecord,
  getDnsRecordsByZoneId,
  getZonesByName
} from '../lib/cloudflare.js';

/**
 * Manage the DNS records for <domain>
 */
const command = 'dns <domain>';
const describe = 'Mange the DNS records for <domain>';
const builder = (yargs) => {
  yargs
    // TODO: implement this feature
    .option('export', {
      description: 'Output BIND file of current DNS records to the console.',
      type: 'boolean',
      default: false
    })
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name',
      demandOption: true
    });
};

const handler = async (argv) => {
  // check for single zone argument
  if (!('domain' in argv)) {
    // NOTE: this should be redundant as yargs treats 'domain' as required argument
    error('Which domain were you wanting to compare redirects for?');
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
  console.log(lightblue(`Current DNS for zone: ${argv.domain} (${zone.id}):`));

  // get dns
  const dns = await getDnsRecordsByZoneId(zone.id);
  const dnsSimple = dns.map((e) =>
    JSON.parse(`{ "name": "${e.name}", "type": "${e.type}", "content": "${e.content}", "ttl": ${e.ttl}, "proxied": ${e.proxied} }`));

  console.log(dnsSimple);

  // get standard dns
  const expectedDns = getDefaultDnsRecords(zone.name);

  // show differences
  const result = diffString(dnsSimple, expectedDns);
  if (result.length === 0) {
    console.log(`${green('✓')} ${zone.name} DNS matches the standard configuration.`);
    return;
  }

  console.log(orange('The current DNS records are not standard (see differences below):'));
  console.log(result);
  const replaceDNS = await inquirer.prompt({
    type: 'confirm',
    name: 'confirmReplace',
    message: yellow('Do you want to update the DNS to the standard configuration?'),
    default: false
  });
  if (!replaceDNS.confirmReplace) {
    console.warn(lightblue('Exiting without update.'));
    return;
  }

  // remove current dns and replace with standard configuration
  if (dns.length > 0) {
    const deleteResources = await inquirer.prompt({
      type: 'confirm',
      name: 'confirmDelete',
      message: yellow(`${zone.name} has existing DNS records! Delete these before updating?`),
      default: false
    });
    if (!deleteResources.confirmDelete) {
      console.warn(lightblue('Exiting zone creation before complete! Check zone manually.'));
      return;
    }
    const promises = dns.map((record) => deleteDnsRecord(zone.id, record.id));
    await Promise.allSettled(promises);
  }

  await createDNSRecords(zone.id, getDefaultDnsRecords(zone.name));
};

export {
  command, describe, builder, handler
};
