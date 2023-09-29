import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import * as YAML from 'js-yaml';

/**
 * Describe a redirect as a YAML file
 */
const command = ['describe <domain> <destination>'];
const describe = 'Describe a redirect as a YAML file';
const builder = (yargs) => yargs.demandOption('configDir')
  .positional('domain', {
    describe: 'Domain to redirect',
    type: 'string'
  })
  .positional('destination', {
    describe: 'Destination URL for this redirect',
    type: 'string'
  });
const handler = (argv) => {
  const { configDir, domain, destination } = argv;
  const redirect = YAML.dump({
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

export {
  command, describe, builder, handler
};
