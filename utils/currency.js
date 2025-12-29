const https = require('https');

/**
 * Fetches the current USD to CDF exchange rate.
 * Uses a free API with a fallback mechanism.
 * @returns {Promise<number>} The exchange rate (1 USD = X CDF)
 */
const getExchangeRate = () => {
    return new Promise((resolve) => {
        const url = 'https://open.er-api.com/v6/latest/USD';

        https.get(url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json && json.rates && json.rates.CDF) {
                        console.log(`Fetched Exchange Rate: 1 USD = ${json.rates.CDF} CDF`);
                        resolve(json.rates.CDF);
                    } else {
                        console.warn('API response did not contain CDF rate. Using fallback.');
                        resolve(2850);
                    }
                } catch (error) {
                    console.error('Error parsing exchange rate API response:', error.message);
                    resolve(2850);
                }
            });
        }).on('error', (error) => {
            console.error('Error fetching exchange rate:', error.message);
            resolve(2850);
        });
    });
};

module.exports = { getExchangeRate };
