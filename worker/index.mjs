const default_status = 301;

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
  const parts = hostname.split('.');
  if (parts[0] === 'www') {
    parts.splice(0, 1);
  }
  const len = parts.length;
  for (let i = 0; i < len; i += 1) {
    const zone = parts.slice(i, len).join('.');
    // don't output last element (i.e. the TLD) - this can be ignored
    if (len - i > 1) {
      // NOTE: we need to process this synchronously, hence the await
      /* eslint no-await-in-loop: 0 */
      const zoneJson = await descriptions.get(zone, 'json');
      if (zoneJson) return zoneJson;
    }
  }
  // always return empty redirects array
  return { redirects: [] };
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const zone = await getValuesForHostname(url.hostname, env.descriptions);
  const found = zone.redirects.find((r) => {
    // we've got a regex! (N.B. Regexes must be prefixed by '^')
    if (r.from[0] === '^') {
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
    return Response.redirect(redir_to, ('status' in found ? found.status : default_status));
  }
  if (zone.fallthrough === true) {
    // fall through to the origin server
    return fetch(request);
  }
  // default behaviour - no fallthrough
  return respondWith404();
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
