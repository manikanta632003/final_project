// Vercel catch-all serverless function for all API routes
// This handles all /api/* requests

const app = require('../server/index.js');

// Export as Vercel serverless function
// For catch-all routes [...path], Vercel passes path segments differently
// We need to reconstruct the full path
module.exports = (req, res) => {
  // Log for debugging (remove in production if needed)
  console.log('API Request:', req.method, req.url, 'Original URL:', req.originalUrl);
  
  // Get path segments from the catch-all route
  // In Vercel, [...path] makes segments available in different ways
  // Try to get from req.url first (most common)
  let path = req.url || '/';
  
  // Handle Vercel's catch-all route pattern
  // The path might come as just the segments (e.g., "auth/register")
  // or as a full path (e.g., "/api/auth/register")
  if (!path.startsWith('/api')) {
    // If it starts with /, add /api prefix
    if (path.startsWith('/')) {
      path = '/api' + path;
    } else {
      // If it doesn't start with /, it's likely just the segments
      path = '/api/' + path;
    }
  }
  
  // Preserve query string if present
  const originalUrl = req.url || '';
  const queryString = originalUrl.includes('?') ? originalUrl.split('?')[1] : '';
  if (queryString && !path.includes('?')) {
    path = path + '?' + queryString;
  }
  
  // Update request URL to ensure Express routes match
  req.url = path;
  if (!req.originalUrl || !req.originalUrl.startsWith('/api')) {
    req.originalUrl = path;
  }
  
  // Ensure method is preserved (should be automatic, but just in case)
  // req.method should already be set correctly by Vercel
  
  // Pass to Express app
  return app(req, res);
};

