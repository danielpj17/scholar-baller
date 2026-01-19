'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserProfile } from '@/types';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export interface ProfileUpdateResult {
  success: boolean;
  updatedProfile?: UserProfile;
  changesSummary?: string;
  error?: string;
}

export async function updateProfileWithAI(
  currentProfile: UserProfile,
  userInput: string
): Promise<ProfileUpdateResult> {
  try {
    const prompt = `You are a profile data assistant. Your task is to update a user's profile based on their free-form input.

CURRENT PROFILE (JSON):
${JSON.stringify(currentProfile, null, 2)}

USER'S UPDATE REQUEST:
"${userInput}"

INSTRUCTIONS:
1. Analyze the user's input and determine what changes to make to their profile.
2. Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "updatedProfile": <the complete updated UserProfile object>,
  "changesSummary": "A brief description of what was changed"
}

RULES FOR UPDATES:
- If adding a new experience, add it to the experiences array with proper structure: { role, company OR location, date, description, skills (optional array) }
- If updating demographics, financials, or careerGoals, merge with existing data
- If adding interests, append to the interests array (avoid duplicates)
- If the user mentions answering a scholarship question, update relevant profile fields if applicable
- Keep all existing data unless explicitly being updated
- Maintain proper data types (numbers for age/gpa, arrays for experiences/interests)

PROFILE STRUCTURE REFERENCE:
- name: string
- age: number
- demographics: { ethnicity, gender, maritalStatus, familyStatus }
- university, major, degreeTrack: strings
- gpa: number
- graduationDate, currentLocation, hometown: strings
- financials: { fundingSource, debt, householdIncomeType, upcomingExpenses }
- experiences: array of { role, company?, location?, date, skills?, description }
- careerGoals: { shortTerm, longTerm, narrativeStrategy }
- interests: string array

Respond with ONLY the JSON object.`;

    // Try models in order
    const models = [
      'models/gemini-2.5-flash',
      'models/gemini-flash-latest',
      'models/gemini-2.0-flash',
      'models/gemini-pro-latest',
      'models/gemini-2.5-pro',
    ];

    let responseText = '';
    let lastError: Error | null = null;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        responseText = response.text();
        if (responseText) {
          console.log(`Successfully used model: ${modelName}`);
          break;
        }
      } catch (err) {
        console.log(`Model ${modelName} failed, trying next...`);
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }

    if (!responseText && lastError) {
      throw lastError;
    }

    if (!responseText) {
      return {
        success: false,
        error: 'No response received from AI',
      };
    }

    // Clean up response
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    const result = JSON.parse(cleanedResponse);

    if (!result.updatedProfile) {
      return {
        success: false,
        error: 'AI response did not include updated profile',
      };
    }

    return {
      success: true,
      updatedProfile: result.updatedProfile,
      changesSummary: result.changesSummary || 'Profile updated successfully',
    };
  } catch (error) {
    console.error('Error updating profile with AI:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    };
  }
}
