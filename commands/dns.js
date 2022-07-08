/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */

const axios = require('axios');
const chalk = require('chalk');
const SimpleTable = require('cli-simple-table');
const inquirer = require('inquirer');
const level = require('level');

const {
  collectReplacementRecords,
  error, buildRequiredDNSRecordsForPagerules, createTheseDNSRecords,
  deleteTheseDNSRecords, hasDNSRecord, hasConflictingDNSRecord,
  outputDNSRecordsTable, outputPageRulesAsText, warn
} = require('../lib/shared');

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Mange the DNS records for <domain>
 */
exports.command = 'dns <domain>';
exports.describe = 'Mange the DNS records for <domain>';
exports.builder = (yargs) => {
  yargs
    // TODO: implement this feature
    .option('export', {
      description: 'Output BIND file of current DNS records to the console.',
      type: 'boolean',
      default: false
    })
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name'
    });
};
exports.handler = (argv) => {
  axios.defaults.headers.common.Authorization = `Bearer ${argv.cloudflareToken}`;
  if (!('domain' in argv)) {
    error('Which domain where you wanting to work on?');
  } else {
    // setup a local level store for key/values (mostly)
    const db = level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((zone_id) => {
        Promise.all([
          axios.get(`/zones/${zone_id}/dns_records`),
          axios.get(`/zones/${zone_id}/pagerules`)
        ]).then((results) => {
          const [dns_records, pagerules] = results.map((resp) => {
            if (resp.data.success) {
              return resp.data.result;
            }
            return false;
          });

          console.log(chalk.bold('Current Page Rules:'));
          outputPageRulesAsText(pagerules);
          const required_dns_records = buildRequiredDNSRecordsForPagerules(pagerules);

          if (dns_records.length > 0) {
            const properly_proxied = [];
            const conflicts = [];
            console.log(chalk.bold('Current DNS records:'));
            const table = new SimpleTable();
            table.header('Type', 'Name', 'Content', 'TTL', 'Proxy Status');
            dns_records.forEach((line) => {
              const line_array = [line.type, line.name, line.content, line.ttl,
                line.proxied ? chalk.keyword('orange')(line.proxied) : line.proxied];
              if (hasDNSRecord(required_dns_records, line)) {
                properly_proxied.push(line);
                table.row(...line_array.map((i) => chalk.green(i)));
              } else if (hasConflictingDNSRecord(required_dns_records, line)) {
                conflicts.push(line);
                table.row(...line_array.map((i) => chalk.keyword('orange')(i)));
              } else {
                table.row(...line_array.map((i) => chalk.white(i)));
              }
            });

            // make sure all required dns records are present
            // TODO: this will add any unknown/unlisted DNS to the conflicts list
            // ...which means they'll get deleted...when they should likely be
            // preserved...i.e. if they're not in direct conflicts with a requirement
            // they should stay.
            required_dns_records.forEach((line) => {
              const line_array = [line.type, line.name, line.content, line.ttl,
                line.proxied ? chalk.keyword('orange')(line.proxied) : line.proxied];
              if (!hasDNSRecord(dns_records, line) && !hasConflictingDNSRecord(dns_records, line)) {
                conflicts.push(line);
                table.row(...line_array.map((i) => chalk.keyword('orange')(i)));
              }
            });

            // removing the annoying extra line under the header
            const output_array = table.toString().split('\n');
            output_array.splice(1, 1);
            console.log(output_array.join('\n'));
            console.log();
            if (properly_proxied.length === 0 || conflicts.length > 0) {
              error('The current DNS records will not work with the current Page Rules.');

              warn('At least these DNS records MUST be added:');
              const replacements = collectReplacementRecords(required_dns_records, conflicts);
              outputDNSRecordsTable(replacements);

              inquirer.prompt({
                type: 'list',
                name: 'whichApproach',
                message: 'How do you want to add these DNS records?',
                choices: [
                  { name: `Replace ${chalk.bold('only')} the required ones.`, value: 'required' },
                  { name: `Replace them ${chalk.bold('all')}`, value: 'all' },
                  { name: 'Do nothing at this time.', value: 'skip' }
                ]
              }).then((answers) => {
                switch (answers.whichApproach) {
                  case 'all':
                    // delete each of the existing DNS records
                    deleteTheseDNSRecords(zone_id, dns_records);
                    console.log();
                    createTheseDNSRecords(zone_id, required_dns_records);
                    break;
                  case 'required':
                    // delete the ones in the way
                    deleteTheseDNSRecords(zone_id, conflicts);
                    console.log();
                    // put in the replacements and any new records
                    createTheseDNSRecords(zone_id, replacements);
                    break;
                  default:
                    break;
                }
              });
            } else {
              console.log(chalk.green('Congrats! Page Rules should all work as expected.'));
            }
          } else {
            // there are no existing DNS records, so let's make the new ones
            // TODO: make this part of the initial zone creation process
            console.log('There are no DNS records currently. Here is what they should be:');
            outputDNSRecordsTable(required_dns_records);
            inquirer.prompt({
              type: 'confirm',
              name: 'confirmCreateIntent',
              message: 'Are you ready to create the missing DNS records on Cloudflare?',
              default: false
            }).then((answers) => {
              if (answers.confirmCreateIntent) {
                createTheseDNSRecords(zone_id, required_dns_records);
              }
            });
          }
        })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
