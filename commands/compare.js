const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const { diff } = require('deep-object-diff');
const level = require('level');
const YAML = require('js-yaml');

const { error, warn,
  convertPageRulesToRedirects, convertRedirectToPageRule,
  outputPageRulesAsText } = require('../lib/shared.js');

function outputDifferences(updates, current, level = 0) {
  for (let key in updates) {
    if (typeof updates[key] !== 'object') {
      console.log(`${'  '.repeat(level)}${key}: ${chalk.green(updates[key])} (currently ${chalk.keyword('orange')(current[key])})`);
    } else {
      console.log(`${'  '.repeat(level)}${key}:`);
      level++;
      outputDifferences(updates[key], current, level);
    }
  }
}

// foundational HTTP setup to Cloudflare's API
axios.defaults.baseURL = 'https://api.cloudflare.com/client/v4';

/**
 * Compare [dir]'s local redirect descriptions for [domain] with Cloudflare's
 **/
exports.command = 'compare [dir] [domain]';
exports.describe = 'Compare [dir]\'s local redirect descriptions for [domain] with Cloudflare\'s';
exports.builder = (yargs) => {
  yargs.option('cloudflareToken', {
    describe: `API (Bearer) token for the Cloudflare API (WR_CLOUDFLARE_TOKEN)`,
    demandOption: true,
    type: 'string'
  })
  .positional('dir', {
    type: 'string',
    describe: 'directory for redirect definitions',
    coerce(v) {
      return {
        name: v,
        contents: fs.readdirSync(v, 'utf8')
      };
    }
  })
  .positional('domain', {
    type: 'string',
    describe: 'a valid domain name'
  });
};
exports.handler = (argv) => {
  axios.defaults.headers.common['Authorization'] = `Bearer ${argv.cloudflareToken}`;
  if (!('domain' in argv)) {
    // TODO: update this to use inquirer to list available ones to pick from?
    error(`Which domain where you wanting to show redirects for?`);
  } else {
    // setup a local level store for key/values (mostly)
    const db = level(`${process.cwd()}/.cache-db`);

    db.get(argv.domain)
      .then((val) => {
        // read redirect config file for domain
        // gather zone/domain information from Cloudflare
        Promise.all([
          axios.get(`/zones/${val}`),
          axios.get(`/zones/${val}/pagerules`)
        ]).then((results) => {
            let [zone, pagerules] = results.map((resp) => {
              return resp.data.result;
            });

            console.log(
`Zone Health Check:
  ${chalk.bold(zone.name)} - ${zone.id}
  ${chalk.green(zone.plan.name)} - ${pagerules.length} of ${zone.meta.page_rule_quota} Page Rules used.
`);

            if ('dir' in argv && 'contents' in argv.dir) {
              // grab the first on with a matching zone name
              // TODO: throw a warning if we find more than one...'cause that's just confusing...
              let redir_filename = argv.dir.contents.filter((f) => f.substr(0, zone.name.length) === zone.name)[0];
              if (undefined === redir_filename) {
                console.log(chalk.keyword('purple')(`No redirect description for ${chalk.bold(zone.name)} was found.`));
              } else {
                // compare descriptive redirect against current page rule(s)
                let current_redirects = convertPageRulesToRedirects(pagerules);
                let redir_filepath = path.join(process.cwd(), argv.dir.name, redir_filename);
                let described_redirects = YAML.safeLoad(fs.readFileSync(redir_filepath));
                let missing_redirs = diff(current_redirects, described_redirects.redirects);

                if (Object.keys(missing_redirs).length > 0) {
                  warn('These redirects are missing:');
                  Object.values(missing_redirs).forEach((redir) => {
                    outputPageRulesAsText([convertRedirectToPageRule(redir)]);
                  });
                } else {
                  console.log(`${chalk.bold.green('✓')} Current redirect descriptions match the preferred configuration.`);
                }
              }
            }
          })
          .catch(console.error);
      })
      .catch(console.error);
    db.close();
  }
};
