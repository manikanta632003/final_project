// Vercel serverless function handler
// This wraps the Express app for Vercel deployment

const app = require('../server/index.js');

// Export the Express app as a Vercel serverless function
// Vercel will automatically handle routing based on the file structure
module.exports = app;

