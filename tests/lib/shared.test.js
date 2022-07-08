/* globals describe, expect, it */
/* eslint-disable quotes, quote-props */

const {
  collectReplacementRecords,
  convertPageRulesToRedirects,
  hasConflictingDNSRecord,
  hasDNSRecord
} = require('../../lib/shared');

// expects the value of `results` from the output of
// https://api.cloudflare.com/#page-rules-for-a-zone-list-page-rules
const pagerules = [
  {
    "id": "9a7806061c88ada191ed06f989cc3dac",
    "targets": [
      {
        "target": "url",
        "constraint": {
          "operator": "matches",
          "value": "*example.com/images/*"
        }
      }
    ],
    "actions": [
      {
        "id": "forwarding_url",
        "value": {
          "url": "https://images.example.com/",
          "status_code": 301
        }
      }
    ],
    "priority": 1,
    "status": "active",
    "modified_on": "2014-01-01T05:20:00.12345Z",
    "created_on": "2014-01-01T05:20:00.12345Z"
  }
];

describe('converting Page Rules to Redirects', () => {
  it('handles forwarding_url page rules', () => {
    expect(convertPageRulesToRedirects(pagerules)).toEqual(expect.arrayContaining([
      {
        base: '*example.com',
        from: '/images/*',
        to: 'https://images.example.com/',
        status: 301
      }
    ]));
  });
  // TODO: it('ignores other types of rules')
});

const required_dns_records = [
  {
    type: 'A',
    name: 'example.com',
    content: '192.0.2.0',
    ttl: 1,
    proxied: true
  },
  {
    type: 'CNAME',
    name: 'www.example.com',
    content: 'example.com',
    ttl: 1,
    proxied: true
  }
];

const dns_line = {
  id: '2d5307c7e907aa9ce3966751cbf8c7b2',
  zone_id: '343640b7a11e6ae721a33d8cc0eba7e9',
  zone_name: 'example.com',
  name: 'example.com',
  type: 'A',
  content: '192.0.2.0',
  proxiable: true,
  proxied: true,
  ttl: 1,
  locked: false,
  meta: {
    auto_added: false,
    managed_by_apps: false,
    managed_by_argo_tunnel: false,
    source: 'primary'
  },
  created_on: '2021-02-09T16:23:09.16238Z',
  modified_on: '2021-02-09T16:23:09.16238Z'
};

describe('has Conflicting DNS Records', () => {
  it('should return false if everything matches', () => {
    const result = hasConflictingDNSRecord(required_dns_records, dns_line);
    expect(result).toEqual(false);
  });
});

describe('has DNS Record', () => {
  it('should return true if the record exists in the current DNS', () => {
    const result = hasDNSRecord(required_dns_records, dns_line);
    console.log(result);
    expect(result).toEqual(true);
  });
});

describe('collect replacement records', () => {
  it('should return only the record that needs replacing', () => {
    const conflicting_dns_line = dns_line;
    conflicting_dns_line.content = '1.2.3.4';
    const result = collectReplacementRecords(required_dns_records, [conflicting_dns_line]);
    expect(result).toEqual([
      {
        type: 'A',
        name: 'example.com',
        content: '192.0.2.0',
        ttl: 1,
        proxied: true
      }]);
  });
});
