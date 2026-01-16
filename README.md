# Scholar Baller

An intelligent scholarship discovery and application management system powered by AI.

## Features

- 🔍 **Automated Scholarship Discovery**: Scans multiple scholarship sources with pagination (5-10 pages per source)
- 🤖 **AI-Powered Analysis**: Uses Google Gemini to analyze eligibility and fit scores
- ✍️ **Essay Generation**: Automatically generates personalized scholarship essays
- 💾 **Persistent Storage**: Neon PostgreSQL database prevents duplicate discoveries
- 📊 **Organization**: Separate pages for All, Saved, and Applied scholarships
- 🎯 **Smart Sorting**: Scholarships sorted by fit score (best matches first)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Neon Database

1. Create a free account at [Neon](https://neon.tech)
2. Create a new project
3. Copy your connection string

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Neon Database Connection
DATABASE_URL=postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# Google Generative AI (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key-here
```

### 4. Initialize Database

Start the development server:

```bash
npm run dev
```

Then visit `http://localhost:3000/api/init-db` to create the database tables.

### 5. Configure Your Profile

1. Go to Settings (gear icon in header)
2. Fill in your academic information, experiences, and goals
3. Profile is automatically saved to the database

## Usage

### Discovering Scholarships

1. Click "Find Scholarships" on the dashboard
2. Select which sources to scan (Bold.org, Scholarships360, Scholarships.com)
3. Wait 2-5 minutes while the system:
   - Scans 5-10 pages per source
   - Finds ~50-100 scholarships
   - Skips duplicates automatically
   - Analyzes each scholarship with AI

### Managing Scholarships

- **All Scholarships** (`/scholarships`): View all discovered scholarships sorted by fit score
- **Saved** (`/scholarships/saved`): Scholarships you've bookmarked for later
- **Applied** (`/scholarships/applied`): Track your submitted applications

### Generating Essays

1. Navigate to any scholarship with an essay requirement
2. Click "Generate Essay" button
3. AI creates a personalized 300-500 word essay using your profile
4. Copy and customize as needed

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Neon (Serverless PostgreSQL)
- **AI**: Google Gemini API
- **Scraping**: Cheerio
- **Styling**: Tailwind CSS

## Project Structure

```
scholar-baller/
├── app/
│   ├── actions/           # Server actions
│   │   ├── analyzeScholarship.ts
│   │   ├── discoverScholarships.ts
│   │   ├── generateEssay.ts
│   │   ├── scholarshipActions.ts
│   │   └── profileActions.ts
│   ├── scholarships/      # Scholarship pages
│   │   ├── page.tsx       # All scholarships
│   │   ├── saved/
│   │   └── applied/
│   ├── settings/          # Profile settings
│   └── page.tsx           # Dashboard
├── lib/
│   └── db.ts              # Database utilities
├── contexts/
│   └── ProfileContext.tsx # Profile state management
└── types/
    └── index.ts           # TypeScript types
```

## License

MIT
