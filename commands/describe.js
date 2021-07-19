const fs = require('fs');
const path = require('path');

const chalk = require('chalk');
const YAML = require('js-yaml');

/**
 * Describe a redirect as a YAML file
 */
exports.command = ['describe <domain> <destination>'];
exports.describe = 'Describe a redirect as a YAML file';
exports.builder = (yargs) => yargs.demandOption('configDir')
  .positional('domain', {
    describe: 'Domain to redirect',
    type: 'string'
  })
  .positional('destination', {
    describe: 'Destination URL for this redirect',
    type: 'string'
  });
exports.handler = (argv) => {
  const { configDir, domain, destination } = argv;
  const redirect = YAML.safeDump({
    name: domain,
    redirects: [{ from: '/*', to: destination }]
  });
  const filepath = path.join(configDir.name, `${domain}.yaml`);

  fs.writeFile(filepath, redirect, (err) => {
    if (err) throw err;

    console.log(chalk.green(`The following redirect description was saved into ${filepath}:`));
    console.log(redirect);
  });
};
