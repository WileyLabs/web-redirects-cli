const open = require('open');

/**
 * Output the Cloudflare dashboard URL
 */
exports.command = 'dash <domain>';
exports.aliases = ['dashboard'];
exports.describe = 'Mange the DNS records for <domain>';
exports.builder = (yargs) => {
  yargs
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name'
    });
};
exports.handler = (argv) => {
  const url = `https://dash.cloudflare.com/${argv.accountId}/${argv.domain}`;
  console.log(`Opening ${url}`);
  open(url);
};
