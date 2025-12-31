const express = require('express');
const cors = require('cors');
const http = require('http');

// MOCKING SERVER.JS STRUCTURE
const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MOCKING PAYMENT ROUTE MOUNTING
const paymentRouter = express.Router();

// PASTE EXACT CONTENT OF THE ROUTE HERE (Simulated)
paymentRouter.get('/maishapay/callback*', (req, res) => {
    console.log('HIT!');
    res.send('MATCHED');
});

app.use('/api/payment', paymentRouter);

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(0, () => {
    const port = server.address().port;
    console.log(`Test server on port ${port}`);

    // THE EXACT FAILING URL
    const path = '/api/payment/maishapay/callback/?status=400&description=CANCELED&transactionRefId=YL0X-1767173887&operatorRefId=N/A';

    http.get(`http://localhost:${port}${path}`, (res) => {
        console.log(`Request to: ${path}`);
        console.log(`Status Code: ${res.statusCode}`);
        res.on('data', (d) => process.stdout.write(d));
        server.close();
    });
});
