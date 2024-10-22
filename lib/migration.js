import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const getLocalYamlZone = (zone, configDir) => {
  const redir_filename = configDir.contents
    .filter((f) => f.substr(0, zone.length) === zone)[0];

  if (undefined === redir_filename) {
    // console.log(`No redirect description for ${zone.name} was found.`);
    return null;
  }

  const redir_filepath = path.join(process.cwd(), configDir.name, redir_filename);
  const json = yaml.load(fs.readFileSync(redir_filepath));
  return json;
};

// see `sync-shared.js`
// const getLocalYamlZones = async (configDir) => {};

export {
  getLocalYamlZone
};
