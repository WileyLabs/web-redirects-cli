const fs = require('fs');
const path = require('path');

const chalk = require('chalk');
const YAML = require('js-yaml');

/**
 * Describe a redirect as a YAML file
 */
exports.command = ['describe <from> <to>'];
exports.describe = 'Describe a redirect as a YAML file';
exports.builder = (yargs) => yargs.demandOption('configDir')
  .positional('from', {
    describe: 'Domain to redirect',
    type: 'string'
  })
  .positional('to', {
    describe: 'Destination URL for this redirect',
    type: 'string'
  });
exports.handler = (argv) => {
  const { configDir, from, to } = argv;
  const redirect = YAML.safeDump({
    name: from,
    redirects: [{ from: '/*', to }]
  });
  const filepath = path.join(configDir.name, `${from}.yaml`);

  fs.writeFile(filepath, redirect, (err) => {
    if (err) throw err;

    console.log(chalk.green(`The following redirect description was saved into ${filepath}:`));
    console.log(redirect);
  });
};
