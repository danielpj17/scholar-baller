import { neon } from '@neondatabase/serverless';
import { ScholarshipSource } from '@/constants/sources';

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
        ai_policy TEXT DEFAULT 'Unsure',
        generation_preference TEXT DEFAULT 'Full Draft',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Add missing columns if they don't exist (for existing tables)
    await sql`
      ALTER TABLE scholarships 
      ADD COLUMN IF NOT EXISTS ai_policy TEXT DEFAULT 'Unsure'
    `;
    
    await sql`
      ALTER TABLE scholarships 
      ADD COLUMN IF NOT EXISTS generation_preference TEXT DEFAULT 'Full Draft'
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

    // Create custom_sources table for user-defined scholarship sources
    await sql`
      CREATE TABLE IF NOT EXISTS custom_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        search_url TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
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

// Custom Sources CRUD operations
export async function getCustomSources(): Promise<ScholarshipSource[]> {
  try {
    const result = await sql`
      SELECT id, name, base_url, search_url, enabled 
      FROM custom_sources 
      ORDER BY created_at DESC
    ` as any[];
    return result.map((row: any) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      searchUrl: row.search_url,
      enabled: row.enabled,
    }));
  } catch (error) {
    console.error('Error fetching custom sources:', error);
    return [];
  }
}

export async function addCustomSource(source: {
  name: string;
  baseUrl: string;
  searchUrl: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Generate a unique ID
    const id = `custom-${Date.now()}`;
    
    await sql`
      INSERT INTO custom_sources (id, name, base_url, search_url, enabled)
      VALUES (${id}, ${source.name}, ${source.baseUrl}, ${source.searchUrl}, true)
    `;
    
    return { success: true, id };
  } catch (error) {
    console.error('Error adding custom source:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function updateCustomSource(
  id: string, 
  updates: Partial<{ name: string; baseUrl: string; searchUrl: string; enabled: boolean }>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Build dynamic update query
    const setClauses: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) {
      await sql`UPDATE custom_sources SET name = ${updates.name}, updated_at = NOW() WHERE id = ${id}`;
    }
    if (updates.baseUrl !== undefined) {
      await sql`UPDATE custom_sources SET base_url = ${updates.baseUrl}, updated_at = NOW() WHERE id = ${id}`;
    }
    if (updates.searchUrl !== undefined) {
      await sql`UPDATE custom_sources SET search_url = ${updates.searchUrl}, updated_at = NOW() WHERE id = ${id}`;
    }
    if (updates.enabled !== undefined) {
      await sql`UPDATE custom_sources SET enabled = ${updates.enabled}, updated_at = NOW() WHERE id = ${id}`;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating custom source:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function deleteCustomSource(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await sql`DELETE FROM custom_sources WHERE id = ${id}`;
    return { success: true };
  } catch (error) {
    console.error('Error deleting custom source:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function toggleCustomSourceEnabled(id: string): Promise<{ success: boolean; enabled?: boolean; error?: string }> {
  try {
    const current = await sql`SELECT enabled FROM custom_sources WHERE id = ${id}` as any[];
    if (current.length === 0) {
      return { success: false, error: 'Source not found' };
    }
    
    const newEnabled = !current[0].enabled;
    await sql`UPDATE custom_sources SET enabled = ${newEnabled}, updated_at = NOW() WHERE id = ${id}`;
    
    return { success: true, enabled: newEnabled };
  } catch (error) {
    console.error('Error toggling custom source:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
