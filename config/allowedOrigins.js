// Single source of truth for CORS-allowed frontend origins.
// Previously duplicated (and drifting out of sync) across server.js, socket.js,
// and routes/googleAuth.js. Origins never include a trailing slash — browsers
// never send one in the Origin header, so a trailing slash here can never match.

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.FALLBACK_FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'https://elegant-pothos-5c2a00.netlify.app',
  'https://wenze-tii-ndaku.netlify.app',
  'https://wenzetiindaku-marketplace.netlify.app',
  'https://wenzetiindaku.vercel.app',
  'https://www.wenzetiindaku.com'
].filter(Boolean);

const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

module.exports = { allowedOrigins: uniqueAllowedOrigins };
