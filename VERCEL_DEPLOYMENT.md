# Vercel Deployment Guide

This guide will help you deploy your AI Conversational Chatbot to Vercel.

## Prerequisites

1. A [Vercel account](https://vercel.com/signup) (free tier is sufficient)
2. [Vercel CLI](https://vercel.com/docs/cli) installed (optional, for CLI deployment)
3. Your project pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Important Notes

### ⚠️ File Storage Limitations

Vercel uses **ephemeral file system** - files written to disk are temporary and will be lost when the serverless function ends. This affects:

- **File uploads**: Files are processed in-memory and cleaned up immediately
- **User data**: The `users.json` file won't persist between deployments
- **Saved chats**: The `saved-chats` folder won't persist

### Recommended Solutions

For production, you should migrate to:

1. **Database for user data**: Use [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres), [MongoDB Atlas](https://www.mongodb.com/cloud/atlas), or [Supabase](https://supabase.com)
2. **Blob storage for files**: Use [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) or [AWS S3](https://aws.amazon.com/s3/)
3. **Database for chat history**: Store conversations in a database instead of JSON files

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub/GitLab/Bitbucket**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import project in Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click "Import Git Repository"
   - Select your repository
   - Click "Import"

3. **Configure environment variables**
   - In the project settings, go to "Environment Variables"
   - Add the following variables:
     - `GEMINI_API_KEY`: Your Google Gemini API key
     - `JWT_SECRET`: A secure random string for JWT token signing
     - `PORT`: (Optional) Leave default or set to 3000

4. **Configure build settings**
   - **Framework Preset**: Other
   - **Root Directory**: `./` (root)
   - **Build Command**: `cd client && npm install && npm run build`
   - **Output Directory**: `client/dist`
   - **Install Command**: `npm install && cd client && npm install`

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete
   - Your app will be live at `https://your-project.vercel.app`

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI** (if not already installed)
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Yes**
   - Which scope? Select your account
   - Link to existing project? **No** (first time) or **Yes** (subsequent deployments)
   - Project name? Enter a name or press Enter for default
   - Directory? Press Enter for current directory
   - Override settings? **No**

4. **Set environment variables**
   ```bash
   vercel env add GEMINI_API_KEY
   vercel env add JWT_SECRET
   ```

5. **Deploy to production**
   ```bash
   vercel --prod
   ```

## Environment Variables

Set these in your Vercel project settings:

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Your Google Gemini API key | Yes |
| `JWT_SECRET` | Secret key for JWT token signing | Yes (use a strong random string) |
| `PORT` | Server port (optional, defaults to 5000) | No |

## Project Structure

```
.
├── api/
│   └── [...path].js          # Vercel serverless function handler
├── client/                    # React frontend
│   ├── src/
│   ├── dist/                  # Build output (generated)
│   └── package.json
├── server/
│   └── index.js              # Express server (used by API handler)
├── vercel.json               # Vercel configuration
└── package.json              # Root package.json
```

## How It Works

1. **Frontend**: The React app is built and served as static files from `client/dist`
2. **Backend**: All `/api/*` requests are routed to the serverless function in `api/[...path].js`
3. **Serverless Function**: The catch-all route handler wraps your Express app

## Troubleshooting

### Build Fails

- **Error: Cannot find module**: Make sure all dependencies are in `package.json`
- **Error: Build command failed**: Check that `client/package.json` has a `build` script
- **Error: Output directory not found**: Ensure `client/dist` is generated after build

### API Routes Not Working

- Check that `api/[...path].js` exists
- Verify `vercel.json` has correct rewrite rules
- Check Vercel function logs in the dashboard

### Environment Variables Not Working

- Ensure variables are set in Vercel project settings
- Redeploy after adding new environment variables
- Check variable names match exactly (case-sensitive)

### File Upload Issues

- Remember: Vercel has ephemeral storage
- Files are processed in-memory and cleaned up
- For persistent storage, use Vercel Blob or external storage

## Post-Deployment

1. **Test your deployment**
   - Visit your Vercel URL
   - Test authentication
   - Test chat functionality
   - Test file uploads

2. **Set up custom domain** (optional)
   - Go to Project Settings → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

3. **Monitor your deployment**
   - Check Vercel dashboard for function logs
   - Monitor API usage and errors
   - Set up alerts if needed

## Migration to Production Storage

For a production-ready deployment, consider migrating:

### 1. User Storage → Database

Replace file-based user storage with a database:

```javascript
// Example: Using Vercel Postgres
const { sql } = require('@vercel/postgres');

async function loadUsers() {
  const { rows } = await sql`SELECT * FROM users`;
  return rows;
}

async function saveUsers(users) {
  // Implement database save logic
}
```

### 2. File Storage → Vercel Blob

```javascript
// Example: Using Vercel Blob
const { put, get } = require('@vercel/blob');

async function saveFile(file) {
  const blob = await put(file.name, file.buffer, {
    access: 'public',
  });
  return blob.url;
}
```

### 3. Chat History → Database

Store conversations in a database table instead of JSON files.

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)

## Support

If you encounter issues:
1. Check Vercel function logs in the dashboard
2. Review the troubleshooting section above
3. Check Vercel's status page
4. Consult Vercel documentation

