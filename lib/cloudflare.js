/*
 * Cloudflare API client functions
 */
import axios from 'axios';
import chalk from 'chalk';
import 'dotenv/config';

const RESULTS_PER_PAGE = 50;

const axiosError = (error, verbose) => {
  if (error.response) {
    // server responded with a status code that falls out of the range of 2xx
    console.log(chalk.redBright(`Received non-2xx HTTP response: ${error.response.status} ${error.response.statusText}`));
    console.log(error.response.data);
  } else if (error.request) {
    // no response was received
    if (verbose) {
      console.log('AXIOS ERROR (NO RESPONSE)', error.request);
    } else {
      console.log('AXIOS ERROR (NO RESPONSE)');
    }
  } else if (verbose) {
    console.log('AXIOS ERROR (INIT)', error.message);
  } else {
    console.log('AXIOS ERROR (INIT)');
  }
};

const cloudflareGet = async (path, page, results) => {
  const page_number = page || 1;
  const all_results = results || [];

  // set pagination params
  const url = new URL(axios.defaults.baseURL + path);
  url.searchParams.set('page', page_number);
  url.searchParams.set('per_page', RESULTS_PER_PAGE);

  try {
    const response = await axios.get(url.toString());
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
    axiosError(error);
    process.exit(-1);
  }
  return all_results;
};

const getZonesByAccount = async (accountId) => cloudflareGet(`/zones?account.id=${accountId}`);

export {
  getZonesByAccount
};
