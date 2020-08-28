const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const SimpleTable = require('cli-simple-table');
const inquirer = require('inquirer');
const level = require('level');
const YAML = require('js-yaml');

const { error, convertPageRulesToRedirects,
  outputPageRulesAsText } = require('../lib/shared.js');

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Mange the DNS records for <domain>
 **/
exports.command = 'dns <domain>';
exports.describe = 'Mange the DNS records for <domain>';
exports.builder = (yargs) => {
  yargs
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
        axios.get(`/zones/${val}/dns_records`)
          .then((resp) => {
            if (resp.data.success) {
              const table = new SimpleTable();
              table.header('Type', 'Name', 'Content', 'TTL', 'Proxy Status');
              resp.data.result.forEach((line) => {
                if ((line.name === argv.domain || line.name === `www.${argv.domain}`)
                    && line.content === '1.2.3.4' && line.proxied) {
                  table.row(...[line.type, line.name, line.content, line.ttl, line.proxied].map((i) => chalk.green(i)));
                } else {
                  table.row(...[line.type, line.name, line.content, line.ttl, line.proxied].map((i) => chalk.white(i)));
                }
              });
              // removing the annoying extra line under the header
              let output_array = table.toString().split('\n')
              output_array.splice(1,1);
              console.log(output_array.join('\n'));
            }
          })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
