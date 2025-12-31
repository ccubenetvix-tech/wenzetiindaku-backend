const express = require('express');
const http = require('http');

const runTest = async (name, routeSetup) => {
    return new Promise((resolve) => {
        const app = express();
        const router = express.Router();

        routeSetup(router);

        app.use('/api/payment', router);

        const server = app.listen(0, () => {
            const port = server.address().port;
            console.log(`\n--- Test: ${name} ---`);

            const check = (path) => {
                return new Promise(res => {
                    http.get(`http://localhost:${port}${path}`, (resp) => {
                        console.log(`${resp.statusCode === 200 ? '[PASS]' : '[FAIL]'} ${path} -> ${resp.statusCode}`);
                        resp.resume();
                        res();
                    }).on('error', (e) => {
                        console.log(`[ERR] ${path} -> ${e.message}`);
                        res();
                    });
                });
            };

            Promise.all([
                check('/api/payment/maishapay/callback'),
                check('/api/payment/maishapay/callback/')
            ]).then(() => {
                server.close();
                resolve();
            });
        });
    });
};

(async () => {
    // 1. Current Regex Approach
    await runTest('Current Regex', (router) => {
        router.get(/\/maishapay\/callback\/?/, (req, res) => res.send('ok'));
    });

    // 2. String Array Approach
    await runTest('String Array', (router) => {
        router.get(['/maishapay/callback', '/maishapay/callback/'], (req, res) => res.send('ok'));
    });

    // 3. String Wildcard Approach
    await runTest('Wildcard *', (router) => {
        router.get('/maishapay/callback*', (req, res) => res.send('ok'));
    });

    // 4. Strict Exact Match (Control)
    await runTest('Control (No Trailing)', (router) => {
        router.get('/maishapay/callback', (req, res) => res.send('ok'));
    });

})();
