/* eslint no-console: "off" */
import { parseDomain } from 'parse-domain';

const default_status = 301;
const empty_redirects = { redirects: [] };

function respondWith404() {
  return new Response('Not Found', { statusText: 'Not Found', status: 404 });
}

// Regex will default to case-insensitive unless
// redirEntry.caseSensitive property set to true
function getRedirectRegEx(redirEntry) {
  let regex = new RegExp(redirEntry.from, 'i');
  if (redirEntry.caseSensitive === true) {
    regex = new RegExp(redirEntry.from);
  }
  return regex;
}

// String matching will be case-insensitive unless
// redirEntry.caseSensitive property set to true
function isRedirectEqual(redirEntry, requestString) {
  if (redirEntry.caseSensitive === true) {
    return requestString === redirEntry.from;
  }
  return requestString.toUpperCase() === redirEntry.from.toUpperCase();
}

// Will return the request string to be matched, which by default will be path
// only, unless the redirEntry.includeParams property is set to true. If
// 'redirEntry.includeParams: true', then the concatenated path and query
// string (parameters) will be returned.
function getRequestString(url, redirEntry) {
  const { pathname, search } = url;
  let str = pathname;
  if (redirEntry.includeParams === true) {
    str = pathname.concat(search);
  }
  return str;
}

/*
 * Fetch the JSON data for a given hostname. If no data is found, an empty
 * object is returned. Key matching performed on sub-domains of hostname
 * ignoring any 'www' prefix, and the TLD.
 */
async function getValuesForHostname(hostname, descriptions) {
  const { subDomains, domain, topLevelDomains } = parseDomain(hostname);
  // catch unparseable hostnames
  if (!subDomains || !domain || !topLevelDomains) {
    console.error(`INVALID: ${hostname}`);
    return empty_redirects;
  }
  // check each subdomain for matching KV key, plus apex domain,
  // but ignoring first 'www' subdomain if present
  if (subDomains.length > 0 && subDomains[0] === 'www') {
    subDomains.shift();
  }
  const apex = `${domain}.${topLevelDomains.join('.')}`;
  while (subDomains.length > 0) {
    const sub = `${subDomains.join('.')}.${apex}`;
    // NOTE: we need to process subdomains synchronously, hence the await
    /* eslint no-await-in-loop: 0 */
    const json = await descriptions.get(sub, 'json');
    if (json) {
      return json; // return on first match ('deepest' subdomain)
    }
    subDomains.shift();
  }
  // no match  so check apex
  const json = await descriptions.get(apex, 'json');
  if (json) {
    return json;
  }
  // always return empty redirects array, even if no matches
  return { redirects: [] };
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  /* Redirect HTTPS requests only (environment variable configuration): False by default
   * This is added to allow HTTP to HTTPS redirects to be handled via the
   * Cloudflare 'Always Use HTTPS' setting (then the redirect is handled via
   * the worker).
   * Without this enabled, the domain will fail Upguard's 'HTTPS redirect not supported'
   * check - because the domain changes when redirecting to HTTPS.
   *
   * NOTE: This should not actually be required - as 'Always Use HTTPS' visited before 
   * worker called.
   */
  const redirectHttpsOnly = env.HTTPS_ONLY ? env.HTTPS_ONLY : false;
  if (redirectHttpsOnly && url.protocol !== 'https:') {
    // pass through
    console.info('NOT HTTPS PROTOCOL: passthrough');
    return fetch(request);
  }

  const zone = await getValuesForHostname(url.hostname, env.descriptions);
  const found = zone.redirects.find((r) => {
    if (r.from[0] === '^') {
      // we've got a regex! (N.B. Regexes must be prefixed by '^')
      const matches = getRequestString(url, r).match(getRedirectRegEx(r));
      return matches !== null;
    }
    // otherwise, just do a simple string comparison
    return isRedirectEqual(r, getRequestString(url, r));
  });

  if (found !== undefined) {
    let redir_to = found.to;
    // if we have a regex, though, we need to (possibly) populate replacements
    if (found.from[0] === '^') {
      redir_to = getRequestString(url, found).replace(getRedirectRegEx(found), found.to);
    }
    console.info(`REDIRECT: target = ${redir_to}`);
    return Response.redirect(redir_to, ('status' in found ? found.status : default_status));
  }
  if (zone.fallthrough === true) {
    // fall through to the origin server
    console.info('NO MATCH: passthrough');
    return fetch(request);
  }
  // default behaviour - no fallthrough
  console.info('NO MATCH: 404');
  return respondWith404();
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
