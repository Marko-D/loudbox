// Vercel serverless function: /api/radio (same code the desktop app's local server uses)
const { handleApi } = require('../search');

module.exports = async (req, res) => {
  if (!(await handleApi(req, res))) { res.statusCode = 404; res.end('Not found'); }
};