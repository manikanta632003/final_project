// Vercel catch-all serverless function for all API routes
// This handles all /api/* requests
// Using [...slug] pattern which Vercel recognizes

const app = require('../server/index.js');

// Export as Vercel serverless function
module.exports = (req, res) => {
  // Log for debugging - check what Vercel is actually sending
  console.log('=== API Request Debug ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Original URL:', req.originalUrl);
  console.log('Query:', JSON.stringify(req.query));
  console.log('========================');
  
  // Reconstruct the full path from the catch-all route
  // The slug parameter contains the path segments
  let path = '/api';
  
  // Get path segments from query (Vercel's catch-all pattern)
  if (req.query && req.query.slug) {
    const slug = Array.isArray(req.query.slug) 
      ? req.query.slug.join('/') 
      : req.query.slug;
    path = '/api/' + slug;
  } else if (req.url && req.url !== '/') {
    // Fallback: try to get from URL
    let url = req.url;
    if (url.startsWith('/api')) {
      path = url.split('?')[0]; // Remove query string
    } else {
      path = '/api' + (url.startsWith('/') ? url : '/' + url).split('?')[0];
    }
  }
  
  // Preserve query string (excluding slug parameter)
  const queryParams = new URLSearchParams();
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'slug') {
        queryParams.append(key, value);
      }
    }
  }
  const queryString = queryParams.toString();
  const finalUrl = queryString ? `${path}?${queryString}` : path;
  
  // Update request URLs to ensure Express routes match
  req.url = finalUrl;
  req.originalUrl = req.originalUrl || finalUrl;
  
  console.log('Final URL being passed to Express:', finalUrl);
  
  // Pass to Express app
  return app(req, res);
};

