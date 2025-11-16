# Troubleshooting 405 Method Not Allowed Error

## Issue
Getting a 405 error when trying to register with email on Vercel deployment.

## What Was Fixed

1. **Updated API Handler** (`api/[...path].js`):
   - Improved path reconstruction for Vercel's catch-all routes
   - Added proper URL handling to ensure `/api` prefix is included
   - Added request logging for debugging

2. **Updated Vercel Configuration** (`vercel.json`):
   - Added function configuration with maxDuration
   - Ensured proper routing rules

## Steps to Fix

### 1. Redeploy to Vercel

After the changes, you need to redeploy:

```bash
# If using Vercel CLI
vercel --prod

# Or push to Git and let Vercel auto-deploy
git add .
git commit -m "Fix 405 error on API routes"
git push
```

### 2. Check Vercel Function Logs

1. Go to your Vercel dashboard
2. Select your project
3. Go to "Functions" tab
4. Check the logs for the API function
5. Look for the console.log output: `API Request: POST /api/auth/register`

### 3. Verify Environment Variables

Make sure these are set in Vercel:
- `GEMINI_API_KEY`
- `JWT_SECRET`

### 4. Test the Endpoint

You can test the registration endpoint directly:

```bash
curl -X POST https://your-app.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@gmail.com",
    "password": "test123"
  }'
```

## Common Causes of 405 Errors

1. **Incorrect HTTP Method**: Ensure frontend is using POST (not GET)
2. **Route Not Found**: The route might not be matching correctly
3. **CORS Issues**: Preflight OPTIONS requests might be failing
4. **Vercel Routing**: The catch-all route might not be handling paths correctly

## If Issue Persists

1. **Check Browser Network Tab**:
   - Open DevTools → Network
   - Try to register
   - Check the request details:
     - Method should be POST
     - URL should be `/api/auth/register`
     - Status code and error message

2. **Check Vercel Function Logs**:
   - Look for any errors in the function execution
   - Check if the request is reaching the function
   - Verify the path is being reconstructed correctly

3. **Test Locally First**:
   ```bash
   npm run server
   # In another terminal
   cd client && npm run dev
   ```
   - Test registration locally
   - If it works locally but not on Vercel, it's a deployment/routing issue

4. **Alternative: Use Individual Route Files**:
   If the catch-all route continues to have issues, you can create individual route files:
   - `api/auth/register.js`
   - `api/auth/login.js`
   - etc.

## Debugging Tips

The handler now includes logging. Check Vercel function logs to see:
- What method is being received
- What URL path is being processed
- If the path is being reconstructed correctly

If you see logs like:
```
API Request: GET /api/auth/register
```
But you're sending a POST request, there might be a redirect or routing issue.

If you see:
```
API Request: POST /auth/register
```
The path reconstruction is working, but the `/api` prefix might be missing.

## Still Having Issues?

1. Check that `api/[...path].js` exists and is properly formatted
2. Verify `vercel.json` has correct rewrite rules
3. Ensure all dependencies are in `package.json`
4. Check Vercel deployment logs for build errors
5. Try clearing Vercel cache and redeploying

