/*
 * Cloudflare API client functions
 */
import axios from 'axios';
import chalk from 'chalk';
import 'dotenv/config';

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
const cloudflareGet = async (path, page, results) => {
  const page_number = page || 1;
  const all_results = results || [];

  // set pagination params
  const url = new URL(axios.defaults.baseURL + path);
  url.searchParams.set('page', page_number);
  url.searchParams.set('per_page', RESULTS_PER_PAGE);

  try {
    const response = await axios.get(url.toString());
    // if result is not an array - return now, else check for more pages.
    if (!Array.isArray(response.data.result)) {
      return response.data.result;
    }
    response.data.result.forEach((item) => {
      all_results.push(item);
    });
    // are there more pages of results?
    if ('result_info' in response.data) {
      const { total_pages } = response.data.result_info;
      if (page_number < total_pages) {
        await cloudflareGet(path, page_number + 1, all_results);
      }
    }
  } catch (error) {
    axiosError(error, true);
    process.exit(-1);
  }
  return all_results;
};

// returns a single result or an array of results for a GET request
const cloudflarePatch = async (path, data) => {
  try {
    await axios.patch(path, data);
    // no data needs to be returned
  } catch (error) {
    axiosError(error, true);
    process.exit(-1);
  }
};

const getZonesByAccount = async (accountId) => cloudflareGet(`/zones?account.id=${accountId}`);
const getZoneById = async (zoneId) => cloudflareGet(`/zones/${zoneId}`);
const getZoneSettingsById = async (zoneId) => cloudflareGet(`/zones/${zoneId}/settings`);
const patchZoneSettingsById = async (zoneId, data) => cloudflarePatch(`/zones/${zoneId}/settings`, data);

export {
  getZonesByAccount,
  getZoneById,
  getZoneSettingsById,
  patchZoneSettingsById
};
