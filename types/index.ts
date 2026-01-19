export enum EligibilityStatus {
  Eligible = 'Eligible',
  Ineligible = 'Ineligible',
  Unsure = 'Unsure',
}

export type AIPolicy = 'Safe' | 'Prohibited' | 'Unsure';
export type GenerationPreference = 'Outline' | 'Full Draft';

export interface Scholarship {
  id: string;
  name: string;
  url: string;
  deadline: string;
  awardAmount: string;
  requirements: string;
  eligibilityStatus: EligibilityStatus;
  fitScore: number;
  aiAnalysis: string;
  questionsForUser: string[];
  essayPrompt: string;
  draftedEssay: string;
  aiPolicy: AIPolicy;
  generationPreference: GenerationPreference;
}

export interface Demographics {
  ethnicity: string;
  gender: string;
  maritalStatus: string;
  familyStatus: string;
}

export interface Financials {
  fundingSource: string;
  debt: string;
  householdIncomeType: string;
  upcomingExpenses: string;
}

export interface Experience {
  role: string;
  company?: string;
  location?: string;
  date: string;
  skills?: string[];
  description: string;
}

export interface CareerGoals {
  shortTerm: string;
  longTerm: string;
  narrativeStrategy: string;
}

export interface UserProfile {
  // Core Identity
  name: string;
  age: number;
  demographics: Demographics;

  // Academic Stats
  university: string;
  major: string;
  degreeTrack: string;
  gpa: number;
  graduationDate: string;
  currentLocation: string;
  hometown: string;

  // Financial Context
  financials: Financials;

  // Experiences
  experiences: Experience[];

  // Career Vision
  careerGoals: CareerGoals;

  // Keywords for Matching
  interests: string[];
}
