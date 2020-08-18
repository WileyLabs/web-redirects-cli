const chalk = require('chalk');

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
  let redirects = [];
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
    redirects.push(redirect);
  });
  return redirects;
};

exports.convertRedirectToPageRule = (redirect, default_base) => {
  return {
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
          status_code: redirect.status
        }
      }
    ]
  };
};
