/* eslint-disable no-restricted-globals */
/* globals descriptions */

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
function isRedirectEqual(redirEntry, pathname) {
  if (redirEntry.caseSensitive === true) {
    return pathname === redirEntry.from;
  } else {
    return pathname.toUpperCase() === redirEntry.from.toUpperCase();
  }
}

export async function handleRequest(request) {
  const url = new URL(request.url);
  const {
    hostname, pathname, search
  } = url;

  let desc = await descriptions.get(hostname, 'json');
  // hostname may contain subdomain, so strip the first `.` prefix & try again
  if (desc === null) {
    const sans_subdomain = hostname.split('.').slice(1).join('.');
    desc = await descriptions.get(sans_subdomain, 'json');
  }
  // we stop after one check, and 404 otherwise we'd check for `co.uk` and such
  if (desc === null) {
    // no description for this domain, so 404
    console.error(`No descriptions found for ${hostname}`);
    return respondWith404();
  }

  const found = desc.redirects.find((r) => {
    // we've got a regex! (N.B. Regexes must be prefixed by '^')
    if (r.from[0] === '^') {
      const matches = pathname.concat(search).match(getRedirectRegEx(r));
      return matches !== null;
    }
    // otherwise, just do a simple string comparison
    return isRedirectEqual(r, pathname);
  });

  if (found !== undefined) {
    let redir_to = found.to;
    // if we have a regex, though, we need to (possibly) populate replacements
    if (found.from[0] === '^') {
      redir_to = pathname.concat(search).replace(getRedirectRegEx(found), found.to);
    }
    return Response.redirect(redir_to, ('status' in found ? found.status : default_status));
  }
  return respondWith404();
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
