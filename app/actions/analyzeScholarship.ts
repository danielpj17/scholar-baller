'use server';

import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Scholarship, UserProfile, EligibilityStatus, AIPolicy, GenerationPreference } from '@/types';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.error('⚠️ WARNING: No Gemini API key found! Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local');
}

const genAI = new GoogleGenerativeAI(apiKey);

async function scrapeWebpage(url: string, retries: number = 2): Promise<string> {
  let lastError: Error | null = null;
  const isBoldOrg = url.includes('bold.org');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retry ${attempt}/${retries} for ${url} after ${delay}ms`);
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'Retry attempt',data:{url,attempt,retries,delay,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'Starting fetch',data:{url,attempt,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30 seconds for Bold.org

      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      };

      if (isBoldOrg) {
        headers['Referer'] = 'https://bold.org/scholarships/';
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);

      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'Fetch response received',data:{url,status:response.status,statusText:response.statusText,ok:response.ok,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'HTTP error response',data:{url,status:response.status,statusText:response.statusText,isBlocked:response.status===403||response.status===429,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (response.status === 403 || response.status === 429) {
          // Rate limited or blocked, don't retry immediately
          throw error;
        }
        lastError = error;
        continue;
      }

      const html = await response.text();
      
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'HTML received',data:{url,htmlLength:html?.length||0,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      if (!html || html.length < 100) {
        lastError = new Error('Page content too short or empty');
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'HTML too short',data:{url,htmlLength:html?.length||0,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        continue;
      }

      // Success! Parse and return content
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
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'Content extracted from selector',data:{url,selector,contentLength:content?.length||0,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
          break;
        }
      }

      // Fallback to body if no main content found
      if (!content) {
        content = $('body').text();
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'Content extracted from body fallback',data:{url,contentLength:content?.length||0,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
      }

      // Clean up whitespace
      content = content.replace(/\s+/g, ' ').trim();

      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'Content after cleanup',data:{url,contentLength:content?.length||0,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'I'})}).catch(()=>{});
      // #endregion

      // Limit content length to avoid token limits
      const maxLength = 8000;
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + '...';
      }

      return content;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message;
      const isTimeout = errorMsg.includes('aborted') || errorMsg.includes('timeout');
      const isNetwork = errorMsg.includes('fetch') || errorMsg.includes('network');
      const isBlocked = errorMsg.includes('403') || errorMsg.includes('429');
      
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'Fetch error caught',data:{url,attempt,errorMsg,isTimeout,isNetwork,isBlocked,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      if (attempt === retries) {
        console.error(`Failed to scrape ${url} after ${retries + 1} attempts:`, lastError.message);
      }
    }
  }
  
  // All retries failed
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:scrapeWebpage',message:'All retries failed',data:{url,lastError:lastError?.message,isBoldOrg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  throw lastError || new Error('Failed to scrape webpage');
}

type AnalyzeScholarshipResult = 
  | { success: true; scholarship: Scholarship }
  | { success: false; error: string };

export async function analyzeScholarship(
  url: string,
  userProfile: UserProfile
): Promise<AnalyzeScholarshipResult> {
  try {
    // Validate URL - skip category/index pages
    const urlLower = url.toLowerCase();
    if (
      urlLower.includes('/by-demographics/') ||
      urlLower.includes('/by-state/') ||
      urlLower.includes('/by-field/') ||
      urlLower.includes('/by-type/') ||
      urlLower.includes('/by-year/') ||
      urlLower.includes('/category/') ||
      urlLower.includes('/tag/') ||
      urlLower.endsWith('/seniors/') ||
      urlLower.endsWith('/juniors/') ||
      urlLower.endsWith('/high-school/') ||
      urlLower.endsWith('/women/') ||
      urlLower.endsWith('/men/') ||
      urlLower.match(/\/[a-z-]+-scholarships\/?$/)
    ) {
      return {
        success: false,
        error: 'URL appears to be a category/index page, not a scholarship detail page',
      };
    }
    
    // Skip external affiliate/tracking links
    if (urlLower.includes('utm_source=') || urlLower.includes('utm_medium=')) {
      return {
        success: false,
        error: 'External affiliate link, skipping',
      };
    }
    
    // Step 1: Scrape the webpage
    const scrapedContent = await scrapeWebpage(url);

    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:analyzeScholarship',message:'Scraped content check',data:{url,contentLength:scrapedContent?.length||0,isBoldOrg:url.includes('bold.org')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'J'})}).catch(()=>{});
    // #endregion

    if (!scrapedContent || scrapedContent.length < 50) {
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:analyzeScholarship',message:'Content too short after scraping',data:{url,contentLength:scrapedContent?.length||0,isBoldOrg:url.includes('bold.org')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'J'})}).catch(()=>{});
      // #endregion
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
  "draftedEssay": "string - a ~300 word draft essay answering the prompt using the student's experiences",
  "aiPolicy": "Safe" | "Prohibited" | "Unsure"
}

AI POLICY DETECTION (CRITICAL):
Carefully scan the scholarship text for ANY language that prohibits or restricts AI-generated content. Look for phrases like:
- "no AI", "no artificial intelligence", "AI-free", "without AI assistance"
- "must be written by the student", "written by student without assistance"
- "zero tolerance for AI", "AI-generated content will be disqualified"
- "hand-written", "handwritten", "in your own words"
- "original work only", "no AI tools", "no ChatGPT", "no machine-generated"
- "authentic student voice", "plagiarism includes AI", "AI detection"

If ANY such language is found, set aiPolicy to "Prohibited".
If you're uncertain whether AI is allowed, set aiPolicy to "Unsure".
If no restrictions are mentioned and AI appears to be allowed, set aiPolicy to "Safe".

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
    // Using models that exist with your API key
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
          console.log(`✓ Successfully used model: ${modelName}`);
          break;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`✗ Model ${modelName} failed: ${errorMsg.substring(0, 100)}`);
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
    const aiPolicy = parseAIPolicy(analysisResult.aiPolicy);
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
      aiPolicy: aiPolicy,
      generationPreference: aiPolicy === 'Prohibited' ? 'Outline' : 'Full Draft',
    };

    return {
      success: true,
      scholarship,
    };
  } catch (error) {
    console.error('Error analyzing scholarship:', error);
    
    // #region agent log
    const errorDetails = error instanceof Error ? {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 500)
    } : { message: String(error) };
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'analyzeScholarship.ts:analyzeScholarship',message:'Error caught in analyzeScholarship',data:{url,errorDetails,isBoldOrg:url.includes('bold.org')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'K'})}).catch(()=>{});
    // #endregion
    
    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Provide more helpful error messages
      // Check for API quota errors first (before generic "fetch" check)
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Quota exceeded')) {
        errorMessage = 'Gemini API quota exceeded - you have reached your free tier limit. Please check your API usage or upgrade your plan.';
      } else if (errorMessage.includes('GoogleGenerativeAI Error') && errorMessage.includes('429')) {
        errorMessage = 'Gemini API quota exceeded - you have reached your free tier limit. Please check your API usage or upgrade your plan.';
      } else if (errorMessage.includes('timeout')) {
        errorMessage = 'Page took too long to load';
      } else if (errorMessage.includes('HTTP') && !errorMessage.includes('generativelanguage')) {
        errorMessage = `Page access denied: ${errorMessage}`;
      } else if (errorMessage.includes('JSON')) {
        errorMessage = 'AI response format error';
      } else if (errorMessage.includes('API') || errorMessage.includes('generativelanguage')) {
        errorMessage = 'Gemini API error - check your API key and quota';
      } else if (errorMessage.includes('fetch') && !errorMessage.includes('generativelanguage')) {
        errorMessage = 'Failed to load page (network error or blocked)';
      }
    }
    
    return {
      success: false,
      error: errorMessage,
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
