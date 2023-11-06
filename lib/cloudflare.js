/*
 * Cloudflare API client functions
 */
import axios from 'axios';
import chalk from 'chalk';
import 'dotenv/config';

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';
const CLOUDFLARE_API_HEADER = {
  headers: {
    Authorization: `Bearer ${process.env.WR_CLOUDFLARE_TOKEN}`
  }
};
const RESULTS_PER_PAGE = 50;

const axiosError = (error) => {
  if (error.response) {
    // server responded with a status code that falls out of the range of 2xx
    console.log(chalk.redBright(`Received non-2xx HTTP response: ${error.response.status} ${error.response.statusText}`));
    console.log(error.response.data);
  } else if (error.request) {
    // no response was received
    if (process.env.WR_VERBOSE === true) {
      console.log('AXIOS ERROR (NO RESPONSE)', error.request);
    } else {
      console.log('AXIOS ERROR (NO RESPONSE)');
    }
  } else if (process.env.WR_VERBOSE === true) {
    console.log('AXIOS ERROR (INIT)', error.message);
  } else {
    console.log('AXIOS ERROR (INIT)');
  }
};

// returns a single result or an array of results for a GET request
const cloudflareGet = async (path, singleResult, page, results) => {
  const page_number = page || 1;
  const all_results = results || [];

  // set pagination params
  const url = new URL(CLOUDFLARE_API_URL + path);
  url.searchParams.set('page', page_number);
  url.searchParams.set('per_page', RESULTS_PER_PAGE);

  try {
    const response = await axios.get(url.toString(), CLOUDFLARE_API_HEADER);
    // if result is not an array - return now, else check for more pages.
    if (singleResult) {
      return response.data.result;
    }
    response.data.result.forEach((item) => {
      all_results.push(item);
    });
    // are there more pages of results?
    if ('result_info' in response.data) {
      const { total_pages } = response.data.result_info;
      if (page_number < total_pages) {
        await cloudflareGet(path, singleResult, page_number + 1, all_results);
      }
    }
  } catch (error) {
    axiosError(error, true);
    process.exit(-1);
  }
  return all_results;
};

const cloudflareUpdate = async (method, path, data) => {
  try {
    const url = new URL(CLOUDFLARE_API_URL + path);
    const response = await axios({
      method,
      url,
      data,
      ...CLOUDFLARE_API_HEADER
    });
    return response;
  } catch (error) {
    axiosError(error, true);
    process.exit(-1);
  }
  // should never arrive here...
  return undefined;
};

const getAccountById = async (accountId) => cloudflareGet(`/accounts/${accountId}`, true);
const getZonesByAccount = async (accountId) => cloudflareGet(`/zones?account.id=${accountId}`, false);
const getZoneById = async (zoneId) => cloudflareGet(`/zones/${zoneId}`, true);
const getZonesByName = async (zoneName) => cloudflareGet(`/zones?name=${zoneName}`, false);
const getDnsRecordsByZoneId = async (zoneId) => cloudflareGet(`/zones/${zoneId}/dns_records`, false);
const getPageRulesByZoneId = async (zoneId) => cloudflareGet(`/zones/${zoneId}/pagerules`, false);
const getZoneSettingsById = async (zoneId) => cloudflareGet(`/zones/${zoneId}/settings`, false);
const updateZoneSettingsById = async (zoneId, data) => cloudflareUpdate('patch', `/zones/${zoneId}/settings`, data);
// TODO switch from using routes to custom domains
const createWorkerRoute = async (zoneId, domain, scriptName) => cloudflareUpdate('post', `/zones/${zoneId}/workers/routes`, {
  pattern: `*${domain}/*`,
  script: scriptName
});
const createZone = async (zoneName, accountId) => cloudflareUpdate('post', '/zones', {
  name: zoneName,
  account: { id: accountId }
});
// TODO replace this with existing createPageRule (below)
const postZonePageRulesById = async (zoneId, pageRule) => cloudflareUpdate('post', `/zones/${zoneId}/pagerules`, {
  status: 'active',
  // splat in `targets` and `actions`
  ...pageRule
});
/* eslint-disable max-len */
const putWorkerKVValuesByDomain = async (accountId, workerKvNamespace, domain, json) => cloudflareUpdate(
  'put',
  `/accounts/${accountId}/storage/kv/namespaces/${workerKvNamespace}/values/${domain}`,
  json
);

// starting to rework the naming...
const attachServiceToHost = async (accountId, zoneId, hostname) => cloudflareUpdate(
  'put',
  `/accounts/${accountId}/workers/domains`,
  {
    zoneId,
    hostname,
    service: 'redir', // TODO factor out to .env?
    environment: 'production' // TODO factor out to .env (default 'production')?
  }
);
const createDnsRecord = async (zoneId, dnsJson) => cloudflareUpdate(
  'post',
  `/zones/${zoneId}/dns_records`,
  dnsJson
);
const deleteDnsRecord = async (zoneId, recordId) => cloudflareUpdate(
  'delete',
  `/zones/${zoneId}/dns_records/${recordId}`
);

const createPageRule = async (zoneId, pageRule) => cloudflareUpdate(
  'post',
  `/zones/${zoneId}/pagerules`,
  pageRule
);

const deletePageRule = async (zoneId, ruleId) => cloudflareUpdate(
  'delete',
  `/zones/${zoneId}/pagerules/${ruleId}`
);

const updatePageRule = async (zoneId, ruleId, pageRule) => cloudflareUpdate(
  'put',
  `/zones/${zoneId}/pagerules/${ruleId}`,
  pageRule
);

export {
  attachServiceToHost,
  createDnsRecord,
  createPageRule,
  deleteDnsRecord,
  deletePageRule,
  getAccountById,
  getZonesByAccount,
  getZoneById,
  getZonesByName,
  getDnsRecordsByZoneId,
  getPageRulesByZoneId,
  getZoneSettingsById,
  updateZoneSettingsById,
  createWorkerRoute,
  createZone,
  postZonePageRulesById,
  putWorkerKVValuesByDomain,
  updatePageRule
};
