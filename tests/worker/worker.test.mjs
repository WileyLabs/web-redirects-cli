/* globals descriptions getMiniflareBindings */
import yaml from 'js-yaml';
import path from 'path';
import { readFileSync } from 'fs';
import {
  expect, jest, test, beforeAll, describe
} from '@jest/globals';
import { handleRequest } from '../../worker/index';

const okRequests = [
  'https://wiley.com/200',
  'https://wiley.com/204'
];

const loadRedirectData = async (zone) => {
  // load redirects to test KV
  const filepath = path.join('tests', 'worker', `${zone}.yaml`);
  const description = yaml.load(readFileSync(filepath));
  // 'descriptions' namespace defined in jest.config.js
  await descriptions.put(zone, JSON.stringify(description));
};

const makeRequest = async (url) => {
  const env = getMiniflareBindings();
  const req = new Request(url);
  const res = await handleRequest(req, env);
  const result = {};
  result.status = res.status;
  result.location = res.headers.get('Location');
  return result;
};

const redirectTest = async (url, expectedLocation, expectedStatus) => {
  const { status, location } = await makeRequest(url);
  // always check for http status match
  expect(status).toBe(expectedStatus);
  // only check location for 3xx responses
  if (status > 299 && status < 400) {
    expect(location).toBe(expectedLocation);
  }
};

describe('worker tests', () => {
  beforeAll(async () => {
    loadRedirectData('foo.com');
    loadRedirectData('bar.com');
    loadRedirectData('wiley.com');

    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockImplementation((input) => {
      const found = okRequests.find((url) => url === input.url);
      if (found) {
        return new Response('Mocked success!', { status: 200 });
      }
      return new Response('Mocked not found!', { status: 404 });
    });
  });

  // simple matching tests

  test('simple redirect - default case-sensitivity', async () => {
    await redirectTest(
      'http://www.foo.com/1234A.html',
      'https://bar.com/1234a.html',
      301
    );
  });

  test('simple redirect - case-sensitive false', async () => {
    await redirectTest(
      'http://www.foo.com/1234B.html',
      'https://bar.com/1234b.html',
      301
    );
  });

  test('simple redirect - case-sensitive true', async () => {
    await redirectTest(
      'http://www.foo.com/1234C.html',
      'https://www.bar.com/',
      301
    );
  });

  test('302 redirect - default case-sensitivity', async () => {
    await redirectTest(
      'http://www.foo.com/1234D.html',
      'https://bar.com/1234d.html',
      302
    );
  });

  test('302 redirect - case-sensitive false', async () => {
    await redirectTest(
      'http://www.foo.com/1234E.html',
      'https://bar.com/1234e.html',
      302
    );
  });

  test('302 redirect - case-sensitive true', async () => {
    await redirectTest(
      'http://www.foo.com/1234F.html',
      'https://www.bar.com/',
      301
    );
  });

  // regex tests

  test('regex redirect - default case-sensitivity', async () => {
    await redirectTest(
      'http://www.foo.com/testA/xyz',
      'https://bar.com/testa/xyz',
      301
    );
  });

  test('regex redirect - case-sensitive false', async () => {
    await redirectTest(
      'http://www.foo.com/testB/xyz',
      'https://bar.com/testb/xyz',
      301
    );
  });

  test('regex redirect - case-sensitive true', async () => {
    await redirectTest(
      'http://www.foo.com/testC/xyz',
      'https://www.bar.com/',
      301
    );
  });

  // request doesn't match any domains
  test('no matching domain = 404', async () => {
    await redirectTest(
      'http://random.com/xyz/',
      null,
      404
    );
  });

  // request doesn't match any rules
  test('no matching rule in domain = 404', async () => {
    await redirectTest(
      'http://bar.com/xyz/',
      null,
      404
    );
  });

  // check sub-domain matches next (sub-)domain level up...
  test('check sub-domain matches next (sub-)domain level up', async () => {
    await redirectTest(
      'http://www.foo.com/1234a.html',
      'https://bar.com/1234a.html',
      301
    );
  });

  // // ...but not the level after that [old behaviour]
  // test('check sub-domain doesn\'t match (sub-)domain 2 levels up', async () => {
  //   await redirectTest(
  //     'http://www.test.foo.com/1234a.html',
  //     null,
  //     404
  //   );
  // });

  // ...and will match all levels [new behaviour]
  test('check multiple sub-domains match zone', async () => {
    await redirectTest(
      'http://www.eu.test.foo.com/1234a.html',
      'https://bar.com/1234a.html',
      301
    );
  });

  // TODO
  // test('check short hostname', async () => {
  //   await redirectTest(
  //     'http://localhost/1234a.html',
  //     null,
  //     404
  //   );
  // });

  // by default the query string isn't added to the request pathname for comparision
  test('matching without query string - simple match', async () => {
    await redirectTest(
      'http://www.foo.com/params1a.html',
      'https://bar.com/params1a.html',
      301
    );
  });

  // by default the query string isn't added to the request pathname for comparision
  test('matching without query string - failed match', async () => {
    await redirectTest(
      'http://www.foo.com/params1.htmlx',
      'https://www.bar.com/',
      301
    );
  });

  // by default the query string isn't added to the request pathname for comparision
  test('matching without query string - query string ignored #1', async () => {
    await redirectTest(
      'http://www.foo.com/params1a.html?foo=bar',
      'https://bar.com/params1a.html',
      301
    );
  });

  // by default the query string isn't added to the request pathname for comparision
  test('matching without query string - query string ignored #1', async () => {
    await redirectTest(
      'http://www.foo.com/params1a.html?foo=123&bar=456',
      'https://bar.com/params1a.html',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('matching with query string - simple match', async () => {
    await redirectTest(
      'http://www.foo.com/params1b.html',
      'https://bar.com/params1b.html',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('matching with query string - query string preventing match #1', async () => {
    await redirectTest(
      'http://www.foo.com/params1b.html?foo=bar',
      'https://www.bar.com/',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('matching with query string - query string preventing match #2', async () => {
    await redirectTest(
      'http://www.foo.com/params1b.html?foo=123&bar=456',
      'https://www.bar.com/',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('matching with query string - query string preventing match #2', async () => {
    await redirectTest(
      'http://www.foo.com/params1b.html?foo=123&bar=456',
      'https://www.bar.com/',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('ignoring query string in regex - simple match', async () => {
    await redirectTest(
      'http://www.foo.com/params1c.html',
      'https://bar.com/params1c.html',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('ignoring query string in regex - failed match', async () => {
    await redirectTest(
      'http://www.foo.com/params1c.htmlx',
      'https://www.bar.com/',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('ignoring query string in regex - outputting query string #1', async () => {
    await redirectTest(
      'http://www.foo.com/params1c.html?foo=bar',
      'https://bar.com/params1c.html?foo=bar',
      301
    );
  });

  // adding query string to the request pathname for comparision
  test('ignoring query string in regex - outputting query string #1', async () => {
    await redirectTest(
      'http://www.foo.com/params1c.html?foo=123&bar=456',
      'https://bar.com/params1c.html?foo=123&bar=456',
      301
    );
  });

  // adding query string to the request pathname for comparision, and matching on query parameter
  test('match on query parameter #1', async () => {
    await redirectTest(
      'http://www.foo.com/params2a.html?foo=123&bar=456',
      'https://bar.com/params2a/foo/123',
      301
    );
  });

  // adding query string to the request pathname for comparision, and matching on query parameter
  test('match on query parameter #2', async () => {
    await redirectTest(
      'http://www.foo.com/params2a.html?bar=456&foo=123&something=else',
      'https://bar.com/params2a/foo/123',
      301
    );
  });

  // adding query string to the request pathname for comparision, and matching on query parameter
  test('match on query parameter failed', async () => {
    await redirectTest(
      'http://www.foo.com/params2a.html?bar=456&food=123',
      'https://www.bar.com/',
      301
    );
  });

  // adding query string to the request pathname for comparision,
  // and case-sensitive matching on query parameter
  test('case-sensitive match on query parameter - match #1', async () => {
    await redirectTest(
      'http://www.foo.com/params2a.html?BAR=456&foo=123&something=Else',
      'https://bar.com/params2a/foo/123',
      301
    );
  });

  // adding query string to the request pathname for comparision,
  // and case-sensitive matching on query parameter
  test('case-insensitive match on query parameter - match #1', async () => {
    await redirectTest(
      'http://www.foo.com/params2a.html?BAR=456&FoO=123&something=Else',
      'https://bar.com/params2a/foo/123',
      301
    );
  });

  // adding query string to the request pathname for comparision,
  // and case-sensitive matching on query parameter
  test('case-sensitive match on query parameter - match', async () => {
    await redirectTest(
      'http://www.foo.com/params2b.html?BAR=456&foo=123&something=Else',
      'https://bar.com/params2b/foo/123',
      301
    );
  });

  // adding query string to the request pathname for comparision,
  // and case-sensitive matching on query parameter
  test('case-sensitive match on query parameter - fail', async () => {
    await redirectTest(
      'http://www.foo.com/params2b.html?BAR=456&FoO=123&something=Else',
      'https://www.bar.com/',
      301
    );
  });

  // fallthrough test

  test('fallthrough #1 - default behaviour no fallthrough', async () => {
    await redirectTest(
      'https://bar.com/no/rule/defined',
      '',
      404
    );
  });

  test('fallthrough #2 - fallthrough is true', async () => {
    await redirectTest(
      'https://wiley.com/200',
      '',
      200
    );
  });

  // invalid host test (to test error handling)

  test('invalid host #1', async () => {
    await redirectTest(
      'http://localhost:8080/',
      '',
      404
    );
  });

  test('invalid host #2', async () => {
    await redirectTest(
      'https://wrox.x',
      '',
      404
    );
  });
});
