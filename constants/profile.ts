import { UserProfile } from '@/types';

export const userProfile: UserProfile = {
  // --- Core Identity ---
  name: 'Daniel Paul Johnson',
  age: 23, // Birthday: Jan 15
  demographics: {
    ethnicity: 'White',
    gender: 'Male',
    maritalStatus: 'Engaged (Wedding Date: August 2026)',
    familyStatus: 'Youngest of 6, Fraternal Twin (Twin attends a different university)',
  },

  // --- Academic Stats ---
  university: 'Brigham Young University (BYU)',
  major: 'Accounting (Junior Core)',
  degreeTrack: 'Integrated MAcc (Master of Accountancy)',
  gpa: 3.86,
  graduationDate: 'Spring 2028',
  currentLocation: 'Provo, Utah',
  hometown: 'Farmington, Utah',

  // --- Financial Context (Crucial for Essays) ---
  financials: {
    fundingSource: 'Self-funded via personal savings and part-time work.',
    debt: 'Zero debt (Debt-averse financial philosophy)',
    householdIncomeType: 'Dual-income parents (Mom: CPA, Dad: MBA), but student is financially independent for tuition/living.',
    upcomingExpenses: 'Marriage/Wedding costs in August 2026, Senior Year Tuition.',
  },

  // --- The "Hooks" (Experiences) ---
  experiences: [
    {
      role: 'Incoming Tax/Audit Internship',
      company: 'Deloitte (Boston)',
      date: 'Summer 2027',
      description: 'Selected for competitive internship at Big 4 firm.'
    },
    {
      role: 'Accounting Intern',
      company: 'Clyde Companies',
      date: 'Summer 2026',
      description: 'Gaining practical industry accounting experience before senior year.'
    },
    {
      role: 'Study Abroad Student',
      location: 'Jerusalem, Greece, Turkey',
      date: 'Summer 2025',
      skills: ['Cultural Adaptability', 'Ancient History', 'Basic Hebrew'],
      description: 'Studied ancient Near Eastern history and culture on-site.'
    },
    {
      role: 'Missionary & Leader',
      location: 'Campinas, Brazil',
      date: '2 Years',
      skills: ['Fluent Portuguese', 'Leadership', 'Training'],
      description: 'Served as Zone Leader, District Leader, and Trainer. Managed training and logistics for groups of missionaries.'
    },
    {
      role: 'FSY Counselor',
      location: 'Various Locations',
      date: 'Summer 2024',
      description: 'Mentored youth in a structured faith-based program.'
    }
  ],

  // --- Career Vision (The "AI Instructions") ---
  careerGoals: {
    shortTerm: 'Secure a full-time role at a Big 4 firm (Deloitte) to master high-level accounting standards.',
    longTerm: 'Become a CFO or CEO of a Tech/AI Startup.',
    narrativeStrategy: 'Position myself as a "Tech-Forward Accountant"—someone who understands the numbers (CPA mom/Accounting Major) but builds the systems (AI projects/Cursor interest).',
  },

  // --- Keywords for Matching ---
  interests: [
    'Forensic Accounting',
    'Artificial Intelligence in Business',
    'Startups & Entrepreneurship',
    'Waterskiing & Snow Skiing',
    'Pickleball',
    'Portuguese Language'
  ]
};