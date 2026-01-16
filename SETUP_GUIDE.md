# Scholar Baller - Setup Guide

## Quick Start (5 minutes)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Get Your Neon Database URL

1. Go to [https://neon.tech](https://neon.tech)
2. Sign up for a free account
3. Click "Create Project"
4. Give it a name (e.g., "scholar-baller")
5. Copy the connection string that looks like:
   ```
   postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 3: Get Your Gemini API Key

1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key

### Step 4: Create Environment File

Create a file named `.env.local` in the root directory and add:

```env
DATABASE_URL=your-neon-connection-string-here
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key-here
```

Replace the placeholder values with your actual credentials.

### Step 5: Start the Application

```bash
npm run dev
```

### Step 6: Initialize Database

1. Open your browser to `http://localhost:3000/api/init-db`
2. You should see: `{"success":true,"message":"Database initialized successfully"}`
3. Now go to `http://localhost:3000`

### Step 7: Set Up Your Profile

1. Click the gear icon (⚙️) in the top right
2. Fill in your information:
   - Basic info (name, age, university, major, GPA)
   - Experiences (internships, projects, activities)
   - Career goals
   - Financial information
3. Click "Save Profile"

## You're Ready! 🎉

### Try These Features:

1. **Automatic Discovery**:
   - Click "Find Scholarships" on the dashboard
   - Select sources to scan
   - Wait 2-5 minutes for results

2. **Manual Analysis**:
   - Paste a scholarship URL in the input box
   - Click "Analyze URL"
   - Get instant AI analysis

3. **Essay Generation**:
   - Go to "View All Scholarships"
   - Find a scholarship with an essay requirement
   - Click "Generate Essay"
   - Copy and customize the AI-generated essay

4. **Organization**:
   - Click "Save" to bookmark scholarships
   - Click "Applied" when you submit an application
   - View organized lists in separate pages

## Troubleshooting

### Database Connection Error

If you see database errors:
1. Check that your `DATABASE_URL` in `.env.local` is correct
2. Make sure you visited `/api/init-db` to create tables
3. Restart the dev server: `Ctrl+C` then `npm run dev`

### AI Analysis Not Working

If scholarship analysis fails:
1. Verify your `GOOGLE_GENERATIVE_AI_API_KEY` is correct
2. Check you have API quota remaining (free tier: 60 requests/minute)
3. Try a different scholarship URL

### No Scholarships Found

If discovery returns no results:
1. Check your internet connection
2. Try selecting different sources
3. Some scholarship sites may block scraping - this is normal

## Tips for Best Results

1. **Complete Your Profile**: The more detailed your profile, the better the AI analysis and essay generation
2. **Run Scans Regularly**: New scholarships are added daily - scan weekly for fresh opportunities
3. **Review AI Essays**: Always customize generated essays to add your personal touch
4. **Track Deadlines**: Sort by deadline in the All Scholarships page
5. **Focus on High Scores**: Prioritize scholarships with fit scores above 80

## Need Help?

- Check the main [README.md](README.md) for more details
- Review your profile in Settings if analysis seems off
- Restart the app if you encounter issues

Happy scholarship hunting! 🎓💰
