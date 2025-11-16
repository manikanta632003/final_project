// Vercel catch-all serverless function for all API routes
// This handles all /api/* requests

const app = require('../server/index.js');

// Export as Vercel serverless function
// Vercel will pass the Express app handler directly
module.exports = app;

