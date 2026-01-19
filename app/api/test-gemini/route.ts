import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    
    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'No API key found. Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local' 
      }, { status: 400 });
    }

    // First, try to list available models
    try {
      const listResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      
      if (listResponse.ok) {
        const data = await listResponse.json();
        const modelNames = data.models?.map((m: any) => m.name) || [];
        
        return NextResponse.json({
          success: true,
          availableModels: modelNames,
          totalModels: modelNames.length,
          note: 'These are the models available with your API key'
        });
      }
    } catch (listError) {
      console.error('Error listing models:', listError);
    }

    // If listing fails, try direct generation with simple model names
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = [
      'gemini-1.5-flash',
      'gemini-1.5-pro', 
      'gemini-pro',
      'models/gemini-1.5-flash',
      'models/gemini-1.5-pro',
    ];
    
    const results = [];

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Say "Hello"');
        const response = await result.response;
        const text = response.text();
        
        return NextResponse.json({ 
          success: true, 
          message: 'Gemini API is working!',
          workingModel: modelName,
          response: text,
          apiKeyPrefix: apiKey.substring(0, 15) + '...'
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({
          model: modelName,
          error: errorMsg.substring(0, 150)
        });
      }
    }

    return NextResponse.json({ 
      success: false, 
      error: 'All models failed',
      attempts: results,
      suggestion: 'Try generating a new API key at https://aistudio.google.com/app/apikey'
    }, { status: 500 });

  } catch (error) {
    console.error('Gemini API test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}
