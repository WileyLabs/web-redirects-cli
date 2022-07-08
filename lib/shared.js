/**
 * @copyright 2020 John Wiley & Sons, Inc.
 * @license MIT
 */
const fs = require('fs');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const isEqual = require('lodash.isequal');
const SimpleTable = require('cli-simple-table');
const uniqWith = require('lodash.uniqwith');

// scary red error message
exports.error = (msg) => {
  console.error(chalk.bold.red(msg));
};

// warn in orange
exports.warn = (msg) => {
  console.log(chalk.keyword('orange')(msg));
};

// convert Cloudflare's Page Rule JSON into descriptive redirect JSON
exports.convertPageRulesToRedirects = (pagerules) => {
  const redirects = [];
  pagerules.forEach((r) => {
    const redirect = {};
    // TODO: the following code assumes these are all
    // `forwarding_url` actions...they may not be...
    r.targets.forEach((t) => {
      const split_at = t.constraint.value.indexOf('/');
      redirect.base = t.constraint.value.substr(0, split_at);
      redirect.from = t.constraint.value.substr(split_at); // TODO: strip domain name?
    });
    r.actions.forEach((a) => {
      redirect.to = a.value.url;
      redirect.status = a.value.status_code;
    });
    redirects.push(redirect);
  });
  return redirects;
};

exports.convertRedirectToPageRule = (redirect, default_base) => ({
  targets: [
    {
      target: 'url',
      constraint: {
        operator: 'matches',
        value: 'base' in redirect
          ? redirect.base + redirect.from
          : default_base + redirect.from
      }
    }
  ],
  actions: [
    {
      id: 'forwarding_url',
      value: {
        url: redirect.to,
        status_code: redirect.status || 301
      }
    }
  ]
});

// console.log pagerule information in simple, human friendly form
exports.outputPageRulesAsText = (pagerules) => {
  pagerules.forEach((r) => {
    if ('status' in r) {
      console.log(`  ${r.status === 'active' ? chalk.green('active') : chalk.keyword('orange')(r.status)} - priority ${chalk.bold(r.priority)}`);
    }
    r.targets.forEach((t) => {
      console.log(`  ${t.target} ${t.constraint.operator} ${chalk.bold(t.constraint.value)}`);
    });
    r.actions.forEach((a) => {
      console.log(`  ${a.id} ${a.value.status_code} ${chalk.bold(a.value.url)}`);
    });
    console.log();
  });
};

// convert {key: value} to {id: key, value: value} because Cloudflare API
// Deliberately is not recursive as the `security_header` value is a key/value
// object--see "Security Header" in https://api.cloudflare.com/#zone-settings-properties
exports.convertToIdValueObjectArray = (o) => {
  const rv = [];
  Object.keys(o).forEach((id) => {
    rv.push({
      id,
      value: o[id]
    });
  });
  return rv;
};

// Given a list of page rules, create a list of required DNS records
exports.buildRequiredDNSRecordsForPagerules = (pagerules) => {
  const records = [];
  pagerules.forEach((rule) => {
    rule.targets.forEach((t) => {
      if (t.target === 'url') {
        // TODO: no idea if this is sufficient for all domain
        // extractions...yet
        const domain = t.constraint.value.split('/')[0];
        if (domain[0] === '*' && domain[1] !== '.') {
          const apex = domain.substr(1, domain.length);
          records.push({
            type: 'A',
            name: apex,
            content: '192.0.2.0',
            ttl: 1,
            proxied: true
          });
          records.push({
            type: 'CNAME',
            name: `www.${apex}`,
            content: apex,
            ttl: 1,
            proxied: true
          });
        } else {
          records.push({
            type: 'A',
            name: domain,
            content: '192.0.2.0',
            ttl: 1,
            proxied: true
          });
        }
      }
    });
  });
  return uniqWith(records, isEqual);
};

// find the DNS record in the DNS records haystack
// ...very un-pythonic code follows...
exports.hasDNSRecord = (haystack, needle) => (
  Boolean(haystack.findIndex((record) => Boolean(
    (record.type === needle.type && record.name === needle.name
      && record.content === needle.content && record.ttl === needle.ttl
      && record.proxied === needle.proxied)
  )) > -1));

// check for conflicts in the DNS records--matching type and name only
// ...very un-pythonic code follows...
exports.hasConflictingDNSRecord = (haystack, needle) => (
  Boolean(haystack.findIndex((record) => {
    if (needle.type === 'A') {
      // confirm that the full A record matches
      return (record.type === needle.type && record.name === needle.name
        && record.content === needle.content);
    }
    return (record.type === needle.type && record.name === needle.name);
  }) === -1));

// output a table displaying DNS records
exports.outputDNSRecordsTable = (dns_records) => {
  const needed_records_table = new SimpleTable();
  needed_records_table.header('Type', 'Name', 'Content', 'TTL', 'Proxy Status');
  if (dns_records.length > 0) {
    dns_records.forEach((record) => {
      needed_records_table.row(record.type, record.name,
        record.content, record.ttl,
        record.proxied);
    });
  }
  console.log(needed_records_table.toString());
};

// create the passed in list of DNS records
exports.createTheseDNSRecords = (zone_id, dns_records) => {
  const promises = dns_records.map((record) => axios.post(`/zones/${zone_id}/dns_records`, record));
  Promise.all(promises)
    .then((results) => {
      results.forEach((r) => {
        if (r.status === 200) {
          const rec = r.data.result;
          // TODO: make this a table
          console.log(chalk.green(`${rec.name} ${rec.type} ${rec.content} was created successfully!`));
        }
      });
    })
    .catch(console.error);
};

// delete the passed in list of DNS records
exports.deleteTheseDNSRecords = (zone_id, dns_records) => {
  const promises = dns_records.map((record) => axios.delete(`/zones/${zone_id}/dns_records/${record.id}`));
  // create an ID based object for easier traversal later
  const records = {};
  dns_records.forEach((r) => {
    records[r.id] = r;
  });
  Promise.all(promises)
    .then((results) => {
      results.forEach((r) => {
        if (r.status === 200) {
          const rec = r.data.result;
          // TODO: make this a table
          console.log(chalk.green(`${records[rec.id].name} ${records[rec.id].type} ${records[rec.id].content} was deleted.`));
        }
      });
    })
    .catch(console.error);
};

// use a list of conflicting records to find their replacements
exports.collectReplacementRecords = (required_dns_records, conflicts) => (
  required_dns_records.filter((r) => (
    conflicts.findIndex((c) => r.type === c.type && r.name === c.name) > -1
  ))
);

// check if local redirect description exists
exports.findDescription = (domain, dir) => {
  // create file path for both available formats
  const redir_filepath_json = path.join(process.cwd(), dir, `${domain}.json`);
  const redir_filepath_yaml = path.join(process.cwd(), dir, `${domain}.yaml`);
  // check if file exists
  if (fs.existsSync(redir_filepath_json)) {
    return path.relative(process.cwd(), redir_filepath_json);
  }
  if (fs.existsSync(redir_filepath_yaml)) {
    return path.relative(process.cwd(), redir_filepath_yaml);
  }
  return false;
};

// output API errors
exports.outputApiError = (err) => {
  console.error(chalk.red(`${err.response.status} ${err.response.statusText}`));
  console.dir(err.response.data, { depth: 5 });
  console.dir(err);
};
