/**
 * DEPRECATED
 * 
 * Please usage services/maishaPayService.js for secure payment handling.
 * This file is kept to prevent import errors but throws errors if used.
 */

module.exports = {
    generatePaymentData: () => { throw new Error('Use MaishaPayService.initiatePayment'); },
    verifyPayment: () => { throw new Error('Use MaishaPayService.verifyTransaction'); }
};
