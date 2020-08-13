#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const level = require('level');


function error(msg) {
  console.error(chalk.bold.red(msg));
}
function warn(msg) {
  console.log(chalk.keyword('orange')(msg));
}

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

// setup a local level store for key/values (mostly)
let db = level('.cache-db');

const argv = require('yargs')
  .scriptName('redirects')
  .env('WR')
  .usage('$0 <cmd> [args]')
  .command('zones', 'List zones in current Cloudflare account', (yargs) => {
      yargs.option('cloudflareToken', {
        describe: `API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)`,
        demandOption: true,
        type: 'string'
      });
    }, (argv) => {
      axios.defaults.headers.common['Authorization'] = `Bearer ${argv.cloudflareToken}`;
      axios.get('/zones')
        .then((resp) => {
          console.log(`${chalk.bold(resp.data.result.length)} Zones:`);
          // loop through the returned zones and store a domain => id mapping
          resp.data.result.forEach((zone) => {
            console.log(`
  ${chalk.bold(zone.name)} - ${zone.id} in ${zone.account.name}
  ${chalk.green(zone.plan.name)} - ${zone.meta.page_rule_quota} Page Rules available.`);
            db.put(zone.name, zone.id)
              .catch(console.error);
          });
        })
        .catch((err) => {
          console.error(err.response.data);
        });
    }
  )
  .command('show [domain]', 'Show current redirects for [domain]', (yargs) => {
      yargs.option('cloudflareToken', {
        describe: 'API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)',
        demandOption: true,
        type: 'string'
      })
      .positional('domain', {
        type: 'string',
        describe: 'a valid domain name'
      });
    },
    (argv) => {
      axios.defaults.headers.common['Authorization'] = `Bearer ${argv.cloudflareToken}`;
      if (!('domain' in argv)) {
        error(`Which domain where you wanting to show redirects for?`);
      } else {
        db.get(argv.domain)
          .then((val) => {
            console.log(`Current redirects for ${argv.domain} (${val}):`);
            axios.get(`/zones/${val}`)
              .then((resp) => {
                let zone = resp.data.result;
                console.log(
`Zone Info:
  ${chalk.bold(zone.name)} - ${zone.id}
  ${chalk.green(zone.plan.name)} - ${zone.meta.page_rule_quota} Page Rules available.
`);
              })
              .catch((err) => {
                console.error(err.response.data);
              });
            // let's also get the page rules
            axios.get(`/zones/${val}/pagerules`)
              .then((resp) => {
                console.log(`Using ${chalk.bold(resp.data.result.length)} Page Rules:`);
                resp.data.result.forEach((r) => {
                  r.targets.forEach((t) => {
                    console.log(`  ${t.target} ${t.constraint.operator} ${t.constraint.value}`);
                  });
                  r.actions.forEach((a) => {
                    console.log(`  ${a.id} ${a.value.status_code} ${a.value.url}`);
                  });
                  console.log();
                });
              })
              .catch((err) => {
                console.error(err.response.data);
              });
            // TODO: check for worker routes also
          })
          .catch(console.error);
      }
    }
  )
  .demandCommand(1, '')
  .alias('h', 'help')
  .argv;
