const axios = require('axios');
const chalk = require('chalk');
const level = require('level');
const YAML = require('json2yaml');

function error(msg) {
  console.error(chalk.bold.red(msg));
}
function warn(msg) {
  console.log(chalk.keyword('orange')(msg));
}

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Show a specific domain name's Zone/Site info from Cloudflare + current Page
 * Rules.
 **/
exports.command = 'show [domain]';
exports.describe = 'Show current redirects for [domain]';
exports.builder = (yargs) => {
  yargs.option('cloudflareToken', {
    describe: 'API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)',
    demandOption: true,
    type: 'string'
  })
  .option('format', {
    description: 'Output a JSON or YAML description file for all redirects.',
    choices: ['json', 'yaml', 'text'],
    default: 'text'
  })
  .positional('domain', {
    type: 'string',
    describe: 'a valid domain name'
  });
};
exports.handler = (argv) => {
  axios.defaults.headers.common['Authorization'] = `Bearer ${argv.cloudflareToken}`;
  if (!('domain' in argv)) {
    error(`Which domain where you wanting to show redirects for?`);
  } else {
    // setup a local level store for key/values (mostly)
    const db = level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((val) => {
        Promise.all([
          axios.get(`/zones/${val}`),
          axios.get(`/zones/${val}/pagerules`)
        ])
          .then((results) => {
            let [zone, pagerules] = results.map((resp) => {
              return resp.data.result;
            });

            switch (argv.format) {
              case 'text':
                console.log(
`Current redirects for ${argv.domain} (${val}):
Zone Info:
  ${chalk.bold(zone.name)} - ${zone.id}
  ${chalk.green(zone.plan.name)} - ${pagerules.length} of ${zone.meta.page_rule_quota} Page Rules used.

Page Rules:`);
                pagerules.forEach((r) => {
                  r.targets.forEach((t) => {
                    console.log(`  ${t.target} ${t.constraint.operator} ${t.constraint.value}`);
                  });
                  r.actions.forEach((a) => {
                    console.log(`  ${a.id} ${a.value.status_code} ${a.value.url}`);
                  });
                  console.log();
                });
                // TODO: check for worker routes also
                break;
              case 'json':
              case 'yaml':
                let output = {};
                output = {
                  'cloudflare:id': zone.id,
                  name: zone.name,
                  redirects: []
                };
                pagerules.forEach((r) => {
                  let redirect = {};
                  // TODO: the following code assumes these are all
                  // `forwarding_url` actions...they may not be...
                  r.targets.forEach((t) => {
                    let split_at = t.constraint.value.indexOf('/');
                    redirect.base = t.constraint.value.substr(0, split_at);
                    redirect.from = t.constraint.value.substr(split_at); // TODO: strip domain name?
                  });
                  r.actions.forEach((a) => {
                    redirect.to = a.value.url;
                    redirect.status = a.value.status_code;
                  });
                  output.redirects.push(redirect);
                });

                if (argv.format === 'json') {
                  console.dir(output, {depth: 5});
                } else {
                  console.log(YAML.stringify(output));
                }
                // TODO: check for worker routes also
                break;
              default:
                error('Sorry, that format is not yet supported.');
                break;
            }
          })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
