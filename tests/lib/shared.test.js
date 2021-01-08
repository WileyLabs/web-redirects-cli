/* globals describe, expect, it */
/* eslint-disable quotes, quote-props */

const { convertPageRulesToRedirects } = require('../../lib/shared.js');

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
