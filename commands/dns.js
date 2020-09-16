/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 **/

const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const SimpleTable = require('cli-simple-table');
const inquirer = require('inquirer');
const level = require('level');
const YAML = require('js-yaml');

const { error, buildRequiredDNSRecordsForPagerules, convertPageRulesToRedirects,
  hasDNSRecord, outputDNSRecordsTable, outputPageRulesAsText,
  warn } = require('../lib/shared.js');

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Mange the DNS records for <domain>
 **/
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
  axios.defaults.headers.common['Authorization'] = `Bearer ${argv.cloudflareToken}`;
  if (!('domain' in argv)) {
    error(`Which domain where you wanting to work on?`);
  } else {
    // setup a local level store for key/values (mostly)
    const db = level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((val) => {
        Promise.all([
          axios.get(`/zones/${val}/dns_records`),
          axios.get(`/zones/${val}/pagerules`)
        ]).then((results) => {
            let [dns_records, pagerules] = results.map((resp) => {
              return resp.data.success ? resp.data.result : false;
            });

            console.log(chalk.bold('Current Page Rules:'));
            outputPageRulesAsText(pagerules);
            const required_dns_records = buildRequiredDNSRecordsForPagerules(pagerules);

            if (dns_records.length > 0) {
              const properly_proxied = [];
              console.log(chalk.bold('Current DNS records:'));
              const table = new SimpleTable();
              table.header('Type', 'Name', 'Content', 'TTL', 'Proxy Status');
              dns_records.forEach((line) => {
                const line_array = [line.type, line.name, line.content, line.ttl,
                  line.proxied ? chalk.keyword('orange')(line.proxied) : line.proxied];
                if (hasDNSRecord(required_dns_records, line)) {
                  properly_proxied.push(line_array);
                  table.row(...line_array.map((i) => chalk.green(i)));
                } else {
                  table.row(...line_array.map((i) => chalk.white(i)));
                }
              });
              // removing the annoying extra line under the header
              let output_array = table.toString().split('\n')
              output_array.splice(1,1);
              console.log(output_array.join('\n'));
              console.log()
              if (properly_proxied.length === 0) {
                error('The current DNS records will not work with the current Page Rules.');

                warn('At least these DNS records MUST be added:');
                outputDNSRecordsTable(required_dns_records);
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
                message: `Are you ready to create the missing DNS records on Cloudflare?`,
                default: false
              }).then((answers) => {
                if (answers.confirmCreateIntent) {
                  let promises = required_dns_records.map((r) => {
                    return axios.post(`/zones/${val}/dns_records`, r);
                  });
                  Promise.all(promises)
                    .then((results) => {
                      results.forEach((r) => {
                        if (r.status === 200) {
                          let rec = r.data.result;
                          // TODO: make this a table
                          console.log(chalk.green(`${rec.name} ${r.type} ${r.content} was created successfully!`));
                        }
                      });
                    })
                    .catch(console.error);
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
