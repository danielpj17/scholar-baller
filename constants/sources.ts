export interface ScholarshipSource {
  id: string;
  name: string;
  baseUrl: string;
  searchUrl: string;
  enabled: boolean;
}

export const scholarshipSources: ScholarshipSource[] = [
  {
    id: 'bold',
    name: 'Bold.org',
    baseUrl: 'https://bold.org',
    searchUrl: 'https://bold.org/scholarships/',
    enabled: true,
  },
  {
    id: 'scholarships360',
    name: 'Scholarships360',
    baseUrl: 'https://scholarships360.org',
    searchUrl: 'https://scholarships360.org/scholarships/',
    enabled: true,
  },
  {
    id: 'scholarshipscom',
    name: 'Scholarships.com',
    baseUrl: 'https://www.scholarships.com',
    searchUrl: 'https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory',
    enabled: true,
  },
];
