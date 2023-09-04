import open from 'open';

/**
 * Output the Cloudflare dashboard URL
 */
const command = 'dash <domain>';
const aliases = ['dashboard'];
const describe = 'Mange the DNS records for <domain>';
const builder = (yargs) => {
  yargs
    .positional('domain', {
      type: 'string',
      describe: 'a valid domain name'
    });
};
const handler = (argv) => {
  const url = `https://dash.cloudflare.com/${argv.accountId}/${argv.domain}`;
  console.log(`Opening ${url}`);
  open(url);
};

export {
  command, aliases, describe, builder, handler
};
