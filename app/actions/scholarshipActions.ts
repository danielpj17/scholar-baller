'use server';

import { sql } from '@/lib/db';
import { Scholarship, EligibilityStatus, AIPolicy, GenerationPreference } from '@/types';

// Convert database row to Scholarship object
function rowToScholarship(row: any): Scholarship {
  const aiPolicy = parseAIPolicy(row.ai_policy);
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    deadline: row.deadline || 'Not specified',
    awardAmount: row.award_amount || 'Not specified',
    requirements: row.requirements || '',
    eligibilityStatus: parseEligibilityStatus(row.eligibility_status),
    fitScore: row.fit_score || 0,
    aiAnalysis: row.ai_analysis || '',
    questionsForUser: Array.isArray(row.questions_for_user) ? row.questions_for_user : [],
    essayPrompt: row.essay_prompt || '',
    draftedEssay: row.drafted_essay || '',
    aiPolicy: aiPolicy,
    generationPreference: parseGenerationPreference(row.generation_preference, aiPolicy),
  };
}

function parseEligibilityStatus(status: string): EligibilityStatus {
  switch (status) {
    case 'Eligible':
      return EligibilityStatus.Eligible;
    case 'Ineligible':
      return EligibilityStatus.Ineligible;
    default:
      return EligibilityStatus.Unsure;
  }
}

function parseAIPolicy(policy: string): AIPolicy {
  switch (policy) {
    case 'Safe':
      return 'Safe';
    case 'Prohibited':
      return 'Prohibited';
    default:
      return 'Unsure';
  }
}

function parseGenerationPreference(preference: string, aiPolicy: AIPolicy): GenerationPreference {
  // If AI is prohibited, always force Outline mode
  if (aiPolicy === 'Prohibited') {
    return 'Outline';
  }
  // Otherwise respect the stored preference
  return preference === 'Outline' ? 'Outline' : 'Full Draft';
}

// Get all scholarships sorted by fit score (highest first)
export async function getAllScholarships(): Promise<Scholarship[]> {
  try {
    const result = await sql`
      SELECT * FROM scholarships 
      ORDER BY fit_score DESC, created_at DESC
    ` as any[];
    return result.map(rowToScholarship);
  } catch (error) {
    console.error('Error fetching all scholarships:', error);
    return [];
  }
}

// Get saved scholarships
export async function getSavedScholarships(): Promise<Scholarship[]> {
  try {
    const result = await sql`
      SELECT * FROM scholarships 
      WHERE is_saved = true 
      ORDER BY fit_score DESC, created_at DESC
    ` as any[];
    return result.map(rowToScholarship);
  } catch (error) {
    console.error('Error fetching saved scholarships:', error);
    return [];
  }
}

// Get applied scholarships
export async function getAppliedScholarships(): Promise<Scholarship[]> {
  try {
    const result = await sql`
      SELECT * FROM scholarships 
      WHERE is_applied = true 
      ORDER BY updated_at DESC
    ` as any[];
    return result.map(rowToScholarship);
  } catch (error) {
    console.error('Error fetching applied scholarships:', error);
    return [];
  }
}

// Toggle saved status
export async function toggleSaved(id: string): Promise<{ success: boolean; isSaved?: boolean }> {
  try {
    // Get current status
    const current = await sql`
      SELECT is_saved FROM scholarships WHERE id = ${id}
    ` as any[];
    
    if (current.length === 0) {
      return { success: false };
    }

    const newStatus = !current[0].is_saved;

    // Toggle the status
    await sql`
      UPDATE scholarships 
      SET is_saved = ${newStatus}, updated_at = NOW() 
      WHERE id = ${id}
    `;

    return { success: true, isSaved: newStatus };
  } catch (error) {
    console.error('Error toggling saved status:', error);
    return { success: false };
  }
}

// Mark as applied
export async function markAsApplied(id: string): Promise<{ success: boolean }> {
  try {
    await sql`
      UPDATE scholarships 
      SET is_applied = true, updated_at = NOW() 
      WHERE id = ${id}
    `;
    return { success: true };
  } catch (error) {
    console.error('Error marking as applied:', error);
    return { success: false };
  }
}

// Unmark as applied
export async function unmarkAsApplied(id: string): Promise<{ success: boolean }> {
  try {
    await sql`
      UPDATE scholarships 
      SET is_applied = false, updated_at = NOW() 
      WHERE id = ${id}
    `;
    return { success: true };
  } catch (error) {
    console.error('Error unmarking as applied:', error);
    return { success: false };
  }
}

// Update essay
export async function updateEssay(id: string, essay: string): Promise<{ success: boolean }> {
  try {
    await sql`
      UPDATE scholarships 
      SET drafted_essay = ${essay}, updated_at = NOW() 
      WHERE id = ${id}
    `;
    return { success: true };
  } catch (error) {
    console.error('Error updating essay:', error);
    return { success: false };
  }
}

// Update generation preference
export async function updateGenerationPreference(
  id: string, 
  preference: GenerationPreference
): Promise<{ success: boolean }> {
  try {
    await sql`
      UPDATE scholarships 
      SET generation_preference = ${preference}, updated_at = NOW() 
      WHERE id = ${id}
    `;
    return { success: true };
  } catch (error) {
    console.error('Error updating generation preference:', error);
    return { success: false };
  }
}

// Insert new scholarship
export async function insertScholarship(scholarship: Scholarship): Promise<{ success: boolean; id?: string }> {
  try {
    const result = await sql`
      INSERT INTO scholarships (
        url, name, source, deadline, award_amount, requirements,
        eligibility_status, fit_score, ai_analysis, questions_for_user,
        essay_prompt, drafted_essay, ai_policy, generation_preference
      ) VALUES (
        ${scholarship.url},
        ${scholarship.name},
        ${''},
        ${scholarship.deadline},
        ${scholarship.awardAmount},
        ${scholarship.requirements},
        ${scholarship.eligibilityStatus},
        ${scholarship.fitScore},
        ${scholarship.aiAnalysis},
        ${JSON.stringify(scholarship.questionsForUser)},
        ${scholarship.essayPrompt},
        ${scholarship.draftedEssay},
        ${scholarship.aiPolicy},
        ${scholarship.generationPreference}
      )
      ON CONFLICT (url) DO UPDATE SET
        name = EXCLUDED.name,
        deadline = EXCLUDED.deadline,
        award_amount = EXCLUDED.award_amount,
        requirements = EXCLUDED.requirements,
        eligibility_status = EXCLUDED.eligibility_status,
        fit_score = EXCLUDED.fit_score,
        ai_analysis = EXCLUDED.ai_analysis,
        questions_for_user = EXCLUDED.questions_for_user,
        essay_prompt = EXCLUDED.essay_prompt,
        ai_policy = EXCLUDED.ai_policy,
        generation_preference = EXCLUDED.generation_preference,
        updated_at = NOW()
      RETURNING id
    ` as any[];
    
    return { success: true, id: result[0]?.id };
  } catch (error) {
    console.error('Error inserting scholarship:', error);
    return { success: false };
  }
}

// Get scholarship by ID
export async function getScholarshipById(id: string): Promise<Scholarship | null> {
  try {
    const result = await sql`
      SELECT * FROM scholarships WHERE id = ${id} LIMIT 1
    ` as any[];
    
    if (result.length === 0) {
      return null;
    }
    
    return rowToScholarship(result[0]);
  } catch (error) {
    console.error('Error fetching scholarship by ID:', error);
    return null;
  }
}

// Get scholarship counts
export async function getScholarshipCounts(): Promise<{
  total: number;
  saved: number;
  applied: number;
}> {
  try {
    const totalResult = await sql`SELECT COUNT(*) as count FROM scholarships` as any[];
    const savedResult = await sql`SELECT COUNT(*) as count FROM scholarships WHERE is_saved = true` as any[];
    const appliedResult = await sql`SELECT COUNT(*) as count FROM scholarships WHERE is_applied = true` as any[];

    return {
      total: parseInt(totalResult[0]?.count || '0'),
      saved: parseInt(savedResult[0]?.count || '0'),
      applied: parseInt(appliedResult[0]?.count || '0'),
    };
  } catch (error) {
    console.error('Error fetching scholarship counts:', error);
    return { total: 0, saved: 0, applied: 0 };
  }
}

// Delete scholarship
export async function deleteScholarship(id: string): Promise<{ success: boolean }> {
  try {
    await sql`DELETE FROM scholarships WHERE id = ${id}`;
    return { success: true };
  } catch (error) {
    console.error('Error deleting scholarship:', error);
    return { success: false };
  }
}
