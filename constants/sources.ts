export interface ScholarshipSource {
  id: string;
  name: string;
  baseUrl: string;
  searchUrl: string;
  enabled: boolean;
}

export const scholarshipSources: ScholarshipSource[] = [];
