'use server';

import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Scholarship, UserProfile, EligibilityStatus } from '@/types';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

async function scrapeWebpage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove script, style, nav, footer, and other non-content elements
  $('script, style, nav, footer, header, aside, iframe, noscript').remove();

  // Extract main content - try common content selectors first
  let content = '';
  const contentSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.post', '.entry'];

  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      content = element.text();
      break;
    }
  }

  // Fallback to body if no main content found
  if (!content) {
    content = $('body').text();
  }

  // Clean up whitespace
  content = content.replace(/\s+/g, ' ').trim();

  // Limit content length to avoid token limits
  const maxLength = 8000;
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '...';
  }

  return content;
}

type AnalyzeScholarshipResult = 
  | { success: true; scholarship: Scholarship }
  | { success: false; error: string };

export async function analyzeScholarship(
  url: string,
  userProfile: UserProfile
): Promise<AnalyzeScholarshipResult> {
  try {
    // Step 1: Scrape the webpage
    const scrapedContent = await scrapeWebpage(url);

    if (!scrapedContent || scrapedContent.length < 50) {
      return {
        success: false,
        error: 'Could not extract meaningful content from the URL. The page might be JavaScript-rendered or blocked.',
      };
    }

    // Step 2: Format experiences for the prompt
    const experiencesText = userProfile.experiences
      .map((exp) => {
        const location = exp.company || exp.location || '';
        const skills = exp.skills ? ` (Skills: ${exp.skills.join(', ')})` : '';
        return `• ${exp.role} at ${location} (${exp.date}): ${exp.description}${skills}`;
      })
      .join('\n');

    // Step 3: Prepare the prompt for Gemini
    const prompt = `You are a scholarship analysis assistant. Your task is to analyze scholarship information and match it against a detailed student profile.

You must respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text) matching this exact structure:
{
  "name": "string - the scholarship name",
  "deadline": "string - deadline date in YYYY-MM-DD format if found, otherwise 'Not specified'",
  "awardAmount": "string - the award amount (e.g., '$5,000' or 'Varies')",
  "requirements": "string - raw text listing all requirements",
  "eligibilityStatus": "Eligible" | "Ineligible" | "Unsure",
  "fitScore": number between 0-100,
  "aiAnalysis": "string - 2-3 sentence explanation of why this scholarship fits or doesn't fit the student",
  "questionsForUser": ["array of clarifying questions needed to determine eligibility"],
  "essayPrompt": "string - the essay prompt if found, otherwise empty string",
  "draftedEssay": "string - a ~300 word draft essay answering the prompt using the student's experiences"
}

Guidelines for analysis:
- fitScore should reflect how well the student's profile matches the scholarship requirements
- 80-100: Excellent match, meets all key requirements
- 60-79: Good match, meets most requirements  
- 40-59: Partial match, meets some requirements
- 0-39: Poor match, missing key requirements
- eligibilityStatus should be "Eligible" if all hard requirements are met, "Ineligible" if any hard requirements are not met, "Unsure" if you need more information
- questionsForUser should ask about any eligibility criteria that cannot be determined from the profile
- draftedEssay should be personalized, compelling, and use specific details from the student's experiences

===== STUDENT PROFILE =====

IDENTITY:
- Name: ${userProfile.name}
- Age: ${userProfile.age}
- Gender: ${userProfile.demographics.gender}
- Ethnicity: ${userProfile.demographics.ethnicity}
- Family: ${userProfile.demographics.familyStatus}
- Status: ${userProfile.demographics.maritalStatus}

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

===== SCHOLARSHIP PAGE CONTENT =====
${scrapedContent}

Respond with ONLY the JSON object, no additional text, no markdown formatting, no code blocks.`;

    // Step 4: Call Gemini API (try models in order of preference)
    const models = [
      'gemini-3-flash',
      'gemini-3.0-flash', 
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-3-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
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
        error: 'No response received from AI analysis',
      };
    }

    // Step 5: Parse the response (clean up any markdown if present)
    let cleanedResponse = responseText.trim();
    // Remove markdown code blocks if present
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    const analysisResult = JSON.parse(cleanedResponse);

    // Step 6: Construct the full Scholarship object
    const scholarship: Scholarship = {
      id: `sch-${Date.now()}`,
      name: analysisResult.name || 'Unknown Scholarship',
      url: url,
      deadline: analysisResult.deadline || 'Not specified',
      awardAmount: analysisResult.awardAmount || 'Not specified',
      requirements: analysisResult.requirements || '',
      eligibilityStatus: parseEligibilityStatus(analysisResult.eligibilityStatus),
      fitScore: Math.min(100, Math.max(0, analysisResult.fitScore || 0)),
      aiAnalysis: analysisResult.aiAnalysis || '',
      questionsForUser: analysisResult.questionsForUser || [],
      essayPrompt: analysisResult.essayPrompt || '',
      draftedEssay: analysisResult.draftedEssay || '',
    };

    return {
      success: true,
      scholarship,
    };
  } catch (error) {
    console.error('Error analyzing scholarship:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
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
