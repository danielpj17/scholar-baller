import { Scholarship, EligibilityStatus } from '@/types';

export const mockScholarships: Scholarship[] = [
  {
    id: 'sch-001',
    name: 'Future Tech Leaders Scholarship',
    url: 'https://example.com/future-tech-leaders',
    deadline: '2026-03-15',
    awardAmount: '$10,000',
    requirements: `
      - Must be enrolled full-time in an accredited U.S. university
      - Pursuing a degree in Computer Science, Engineering, or related STEM field
      - Minimum GPA of 3.5
      - Demonstrated leadership in technology-related activities
      - U.S. citizen or permanent resident
      - Submit a 500-word essay on "How technology can solve a pressing social issue"
    `.trim(),
    eligibilityStatus: EligibilityStatus.Eligible,
    fitScore: 87,
    aiAnalysis:
      'Strong fit based on your CS major, 3.7 GPA (exceeds 3.5 minimum), and leadership role as ACM President. Your Google internship and ML research demonstrate the technical excellence they seek. EdTech interest aligns well with the essay prompt about technology solving social issues.',
    questionsForUser: [
      'Are you a U.S. citizen or permanent resident?',
      'Are you currently enrolled full-time?',
    ],
    essayPrompt:
      'In 500 words or less, describe how technology can be leveraged to solve a pressing social issue that you are passionate about. Include specific examples of how you would approach this challenge.',
    draftedEssay: '',
    aiPolicy: 'Safe',
    generationPreference: 'Full Draft',
  },
];
