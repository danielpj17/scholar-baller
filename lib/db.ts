import { neon } from '@neondatabase/serverless';

// Handle missing DATABASE_URL gracefully for build time
const connectionString = process.env.DATABASE_URL || '';

let sql: ReturnType<typeof neon>;

if (connectionString) {
  sql = neon(connectionString);
} else {
  // Provide a mock during build time that throws helpful error at runtime
  sql = (async () => {
    throw new Error('DATABASE_URL environment variable is not set. Please add it to your .env.local file or Vercel environment variables.');
  }) as any;
}

export { sql };

// Initialize database tables
export async function initializeDatabase() {
  try {
    // Create scholarships table
    await sql`
      CREATE TABLE IF NOT EXISTS scholarships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        source TEXT,
        deadline TEXT,
        award_amount TEXT,
        requirements TEXT,
        eligibility_status TEXT,
        fit_score INTEGER,
        ai_analysis TEXT,
        questions_for_user JSONB DEFAULT '[]'::jsonb,
        essay_prompt TEXT,
        drafted_essay TEXT,
        is_saved BOOLEAN DEFAULT false,
        is_applied BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create user_profiles table
    await sql`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create index on url for faster duplicate checking
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scholarships_url ON scholarships(url)
    `;

    // Create index on fit_score for sorting
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scholarships_fit_score ON scholarships(fit_score DESC)
    `;

    // Create indexes for filtering
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scholarships_is_saved ON scholarships(is_saved) WHERE is_saved = true
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_scholarships_is_applied ON scholarships(is_applied) WHERE is_applied = true
    `;

    console.log('Database initialized successfully');
    return { success: true };
  } catch (error) {
    console.error('Error initializing database:', error);
    return { success: false, error };
  }
}

// Helper function to check if URL exists in database
export async function scholarshipUrlExists(url: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM scholarships WHERE url = ${url} LIMIT 1
    ` as any[];
    return result.length > 0;
  } catch (error) {
    console.error('Error checking scholarship URL:', error);
    return false;
  }
}

// Helper function to get all existing URLs (for batch checking)
export async function getAllScholarshipUrls(): Promise<string[]> {
  try {
    const result = await sql`
      SELECT url FROM scholarships
    ` as any[];
    return result.map((row: any) => row.url);
  } catch (error) {
    console.error('Error fetching scholarship URLs:', error);
    return [];
  }
}
