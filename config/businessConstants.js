// Single source of truth for platform-wide financial rates, so VAT and
// commission math can't drift between routes by being redefined separately.

const VAT_RATE = 0.16; // 16% VAT, applied once to vendor-entered base prices (routes/vendor.js)
const COMMISSION_RATE = 0.10; // 10% platform commission on vendor sales, per the vendor contract (locales/*.json "Fees and commission")

module.exports = { VAT_RATE, COMMISSION_RATE };
