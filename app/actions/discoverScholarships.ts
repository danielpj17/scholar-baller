'use server';

import * as cheerio from 'cheerio';
import { UserProfile } from '@/types';
import { ScholarshipSource, scholarshipSources } from '@/constants/sources';

export interface DiscoveredScholarship {
  url: string;
  name: string;
  source: string;
}

export interface DiscoveryResult {
  success: boolean;
  scholarships: DiscoveredScholarship[];
  errors: string[];
}

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 2): Promise<string | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        if (i === retries) {
          console.error(`Failed to fetch ${url}: ${response.status}`);
          return null;
        }
        await delay(1000);
        continue;
      }

      return await response.text();
    } catch (error) {
      if (i === retries) {
        console.error(`Error fetching ${url}:`, error);
        return null;
      }
      await delay(1000);
    }
  }
  return null;
}

// Scraper for Bold.org
async function scrapeBold(): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  const html = await fetchWithRetry('https://bold.org/scholarships/');

  if (!html) return scholarships;

  const $ = cheerio.load(html);

  // Bold.org uses card-style layouts for scholarships
  $('a[href*="/scholarships/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && href.includes('/scholarships/') && !href.endsWith('/scholarships/')) {
      const fullUrl = href.startsWith('http') ? href : `https://bold.org${href}`;
      
      // Get scholarship name from the link text or parent card
      let name = $(element).text().trim();
      if (!name || name.length < 3) {
        name = $(element).find('h2, h3, h4').first().text().trim();
      }
      if (!name || name.length < 3) {
        // Extract name from URL
        const urlParts = href.split('/').filter(Boolean);
        name = urlParts[urlParts.length - 1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      // Avoid duplicates
      if (!scholarships.some((s) => s.url === fullUrl) && name.length > 2) {
        scholarships.push({
          url: fullUrl,
          name: name.substring(0, 100),
          source: 'Bold.org',
        });
      }
    }
  });

  return scholarships.slice(0, 10); // Limit to 10 per source
}

// Scraper for Scholarships360
async function scrapeScholarships360(): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  const html = await fetchWithRetry('https://scholarships360.org/scholarships/');

  if (!html) return scholarships;

  const $ = cheerio.load(html);

  // Look for scholarship links
  $('a[href*="/scholarships/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (
      href &&
      href.includes('/scholarships/') &&
      !href.endsWith('/scholarships/') &&
      !href.includes('/category/') &&
      !href.includes('/tag/')
    ) {
      const fullUrl = href.startsWith('http')
        ? href
        : `https://scholarships360.org${href}`;

      let name = $(element).text().trim();
      if (!name || name.length < 3) {
        name = $(element).closest('article, .card, .scholarship-item').find('h2, h3, h4').first().text().trim();
      }
      if (!name || name.length < 3) {
        const urlParts = href.split('/').filter(Boolean);
        name = urlParts[urlParts.length - 1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      if (!scholarships.some((s) => s.url === fullUrl) && name.length > 2) {
        scholarships.push({
          url: fullUrl,
          name: name.substring(0, 100),
          source: 'Scholarships360',
        });
      }
    }
  });

  return scholarships.slice(0, 10);
}

// Scraper for Scholarships.com
async function scrapeScholarshipsCom(): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  const html = await fetchWithRetry(
    'https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory'
  );

  if (!html) return scholarships;

  const $ = cheerio.load(html);

  // Look for scholarship links
  $('a[href*="/scholarship/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && href.includes('/scholarship/')) {
      const fullUrl = href.startsWith('http')
        ? href
        : `https://www.scholarships.com${href}`;

      let name = $(element).text().trim();
      if (!name || name.length < 3) {
        const urlParts = href.split('/').filter(Boolean);
        name = urlParts[urlParts.length - 1]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      if (!scholarships.some((s) => s.url === fullUrl) && name.length > 2) {
        scholarships.push({
          url: fullUrl,
          name: name.substring(0, 100),
          source: 'Scholarships.com',
        });
      }
    }
  });

  return scholarships.slice(0, 10);
}

export async function discoverScholarships(
  userProfile: UserProfile,
  sourceIds: string[] = ['bold', 'scholarships360', 'scholarshipscom'],
  maxResults: number = 15
): Promise<DiscoveryResult> {
  const allScholarships: DiscoveredScholarship[] = [];
  const errors: string[] = [];

  // Filter to enabled sources
  const enabledSources = scholarshipSources.filter(
    (s) => s.enabled && sourceIds.includes(s.id)
  );

  for (const source of enabledSources) {
    try {
      console.log(`Scraping ${source.name}...`);
      let scholarships: DiscoveredScholarship[] = [];

      switch (source.id) {
        case 'bold':
          scholarships = await scrapeBold();
          break;
        case 'scholarships360':
          scholarships = await scrapeScholarships360();
          break;
        case 'scholarshipscom':
          scholarships = await scrapeScholarshipsCom();
          break;
      }

      allScholarships.push(...scholarships);
      console.log(`Found ${scholarships.length} scholarships from ${source.name}`);

      // Rate limiting between sources
      await delay(1000);
    } catch (error) {
      const errorMsg = `Failed to scrape ${source.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  // Remove duplicates by URL
  const uniqueScholarships = allScholarships.filter(
    (scholarship, index, self) =>
      index === self.findIndex((s) => s.url === scholarship.url)
  );

  return {
    success: uniqueScholarships.length > 0 || errors.length === 0,
    scholarships: uniqueScholarships.slice(0, maxResults),
    errors,
  };
}

// Get available sources
export async function getAvailableSources(): Promise<ScholarshipSource[]> {
  return scholarshipSources.filter((s) => s.enabled);
}
