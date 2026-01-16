'use server';

import { sql } from '@/lib/db';
import { UserProfile } from '@/types';

// Save or update user profile
export async function saveUserProfile(profile: UserProfile): Promise<{ success: boolean }> {
  try {
    // Check if profile exists
    const existing = await sql`
      SELECT id FROM user_profiles ORDER BY created_at DESC LIMIT 1
    `;

    if (existing.length > 0) {
      // Update existing profile
      await sql`
        UPDATE user_profiles 
        SET profile_data = ${JSON.stringify(profile)}, updated_at = NOW()
        WHERE id = ${existing[0].id}
      `;
    } else {
      // Insert new profile
      await sql`
        INSERT INTO user_profiles (profile_data)
        VALUES (${JSON.stringify(profile)})
      `;
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving user profile:', error);
    return { success: false };
  }
}

// Get user profile
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const result = await sql`
      SELECT profile_data FROM user_profiles ORDER BY created_at DESC LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0].profile_data as UserProfile;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}
