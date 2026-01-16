'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getScholarshipById, updateEssay } from './scholarshipActions';
import { sql } from '@/lib/db';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

interface GenerateEssayResult {
  success: boolean;
  essay?: string;
  error?: string;
}

export async function generateEssay(scholarshipId: string): Promise<GenerateEssayResult> {
  try {
    // Fetch the scholarship from database
    const scholarship = await getScholarshipById(scholarshipId);
    
    if (!scholarship) {
      return {
        success: false,
        error: 'Scholarship not found',
      };
    }

    if (!scholarship.essayPrompt) {
      return {
        success: false,
        error: 'No essay prompt found for this scholarship',
      };
    }

    // Fetch user profile from database
    const profileResult = await sql`
      SELECT profile_data FROM user_profiles ORDER BY created_at DESC LIMIT 1
    ` as any[];

    if (profileResult.length === 0) {
      return {
        success: false,
        error: 'User profile not found. Please complete your profile in settings.',
      };
    }

    const userProfile = profileResult[0].profile_data;

    // Format experiences for the prompt
    const experiencesText = userProfile.experiences
      .map((exp: any) => {
        const location = exp.company || exp.location || '';
        const skills = exp.skills ? ` (Skills: ${exp.skills.join(', ')})` : '';
        return `• ${exp.role} at ${location} (${exp.date}): ${exp.description}${skills}`;
      })
      .join('\n');

    // Prepare the prompt for Gemini
    const prompt = `You are a professional scholarship essay writer. Your task is to write a compelling, personalized essay for a scholarship application.

SCHOLARSHIP INFORMATION:
- Name: ${scholarship.name}
- Award Amount: ${scholarship.awardAmount}
- Essay Prompt: ${scholarship.essayPrompt}

STUDENT PROFILE:

IDENTITY:
- Name: ${userProfile.name}
- Age: ${userProfile.age}
- Gender: ${userProfile.demographics.gender}
- Ethnicity: ${userProfile.demographics.ethnicity}

ACADEMICS:
- University: ${userProfile.university}
- Major: ${userProfile.major}
- Degree Track: ${userProfile.degreeTrack}
- GPA: ${userProfile.gpa}
- Expected Graduation: ${userProfile.graduationDate}
- Current Location: ${userProfile.currentLocation}
- Hometown: ${userProfile.hometown}

FINANCIAL SITUATION:
- Funding: ${userProfile.financials.fundingSource}
- Debt Status: ${userProfile.financials.debt}
- Family Income Context: ${userProfile.financials.householdIncomeType}
- Upcoming Expenses: ${userProfile.financials.upcomingExpenses}

EXPERIENCES:
${experiencesText}

CAREER GOALS:
- Short-term: ${userProfile.careerGoals.shortTerm}
- Long-term: ${userProfile.careerGoals.longTerm}
- Personal Brand: ${userProfile.careerGoals.narrativeStrategy}

INTERESTS & KEYWORDS:
${userProfile.interests.join(', ')}

INSTRUCTIONS:
1. Write a compelling 300-500 word essay that directly addresses the essay prompt
2. Use specific details from the student's experiences, achievements, and goals
3. Make it personal, authentic, and engaging
4. Show (don't just tell) why the student deserves this scholarship
5. Connect the student's background and goals to the scholarship's purpose
6. Use a professional yet conversational tone
7. Include a strong opening hook and memorable conclusion
8. Do NOT include a title or heading
9. Write in first person from the student's perspective

Write ONLY the essay text, no additional commentary or formatting.`;

    // Call Gemini API (try models in order of preference)
    const models = [
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ];
    
    let essay = '';
    let lastError: Error | null = null;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        essay = response.text().trim();
        
        if (essay) {
          console.log(`Successfully generated essay using model: ${modelName}`);
          break;
        }
      } catch (err) {
        console.log(`Model ${modelName} failed, trying next...`);
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }

    if (!essay && lastError) {
      throw lastError;
    }

    if (!essay) {
      return {
        success: false,
        error: 'No essay generated from AI',
      };
    }

    // Save the essay to the database
    await updateEssay(scholarshipId, essay);

    return {
      success: true,
      essay,
    };
  } catch (error) {
    console.error('Error generating essay:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}
