'use server';

import * as cheerio from 'cheerio';
import { UserProfile, Scholarship } from '@/types';
import { ScholarshipSource } from '@/constants/sources';
import { getAllScholarshipUrls, getCustomSources } from '@/lib/db';
import { analyzeScholarship } from '@/app/actions/analyzeScholarship';
import puppeteer from 'puppeteer-core';
import { install } from '@puppeteer/browsers';

export interface DiscoveredScholarship {
  url: string;
  name: string;
  source: string;
}

export interface SourceStats {
  sourceId: string;
  sourceName: string;
  found: number;
  new: number;
  duplicates: number;
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

export interface DiscoveryResult {
  success: boolean;
  scholarships: DiscoveredScholarship[];  // Keep for backward compatibility
  analyzedScholarships?: Scholarship[];   // New: scholarships with AI analysis
  errors: string[];
  newCount: number;
  duplicateCount: number;
  sourceStats: SourceStats[];
}

// Shared state for tracking target count across all scrapers
interface SharedScrapingState {
  targetCount: number;
  newCount: number;
  shouldStop: () => boolean;
}

// Patterns that indicate a page is NOT a scholarship detail page
const EXCLUDE_URL_PATTERNS = [
  // Category/index pages
  /\/by-demographics\//i,
  /\/by-state\//i,
  /\/by-field\//i,
  /\/by-type\//i,
  /\/by-year\//i,
  /\/category\//i,
  /\/tag\//i,
  /\/page\/\d+/i,
  /\/type\//i,
  /\/state\//i,
  /[a-z-]+-scholarships\/?$/i,
  // FAQ and article pages
  /\/faq\//i,
  /\/blog\//i,
  /\/article\//i,
  /\/news\//i,
  /\/resources\//i,
  /\/tips\//i,
  /\/guide\//i,
  /\/how-to\//i,
  /\/what-is\//i,
  /\/what-are\//i,
  /\/best-\w+\//i,
  // Search and utility pages
  /\/search\/?$/i,
  /\/search\//i,
  /\/login\//i,
  /\/register\//i,
  /\/account\//i,
  /\/about\//i,
  /\/contact\//i,
  /\/privacy\//i,
  /\/terms\//i,
  /\/terms-of-use\//i,
  /\/terms-of-service\//i,
  // Phone numbers (often appear as links)
  /^\d{3}[\s-]?\d{3}[\s-]?\d{4}$/i,
  /^tel:/i,
  // Tracking links
  /utm_source=/i,
  /utm_medium=/i,
  /\?ref=/i,
];

// Patterns in names that indicate FAQ/article content
const EXCLUDE_NAME_PATTERNS = [
  /^how (do|to|can|does)/i,
  /^what (is|are|do|does)/i,
  /^why (do|are|is)/i,
  /^when (do|to|should)/i,
  /^where (can|do|to)/i,
  /best scholarship/i,
  /scholarship tips/i,
  /scholarship guide/i,
  /scholarship search/i,
  /avoid scams/i,
  /common mistakes/i,
  /frequently asked/i,
  /faq/i,
  /terms of (use|service)/i,
  /^terms$/i,
  /^privacy policy$/i,
  /^contact (us|information)?$/i,
  // Phone number patterns
  /^\d{3}[\s.-]?\d{3}[\s.-]?\d{4}$/,
  /^\(\d{3}\)\s?\d{3}[\s.-]?\d{4}$/,
  /^1?[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{4}$/,
];

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random delay helper for anti-bot protection (2000-5000ms)
function randomDelay(): Promise<void> {
  const ms = Math.random() * (5000 - 2000) + 2000;
  return delay(ms);
}

// Redirect detection helper - checks if a requested paginated page was redirected to the first page
function checkRedirect(requestedUrl: string, finalUrl: string, page: number, source: string): boolean {
  if (page <= 1) {
    return false; // No redirect check needed for first page
  }

  // Normalize URLs for comparison
  const normalizedRequested = requestedUrl.toLowerCase();
  const normalizedFinal = finalUrl.toLowerCase();

  // Check for redirect patterns specific to each source
  if (source === 'Bold.org') {
    // For Bold.org, if we requested /scholarships/X/ but ended up on /scholarships/ (first page)
    // Check if we requested a numbered page but got redirected to the base page
    if (normalizedRequested.includes(`/scholarships/${page}/`) && 
        (normalizedFinal.endsWith('/scholarships/') || normalizedFinal.endsWith('/scholarships'))) {
      console.warn(`⚠️ Bold.org: Redirect detected! Requested page ${page} (${requestedUrl}) but got redirected to first page (${finalUrl})`);
      return true;
    }
  } else if (source === 'Scholarships360') {
    // For Scholarships360, if we requested current_page=X but ended up on /scholarships/search/ without current_page parameter
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:checkRedirect',message:'Scholarships360 redirect check',data:{page,requestedUrl,finalUrl,normalizedRequested,normalizedFinal,requestedHasCurrentPage:normalizedRequested.includes(`current_page=${page}`),finalHasCurrentPage:normalizedFinal.includes(`current_page=${page}`),finalIsSearchPage:normalizedFinal.includes('/scholarships/search')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    
    if (normalizedRequested.includes(`current_page=${page}`) && 
        normalizedFinal.includes('/scholarships/search') &&
        !normalizedFinal.includes(`current_page=${page}`)) {
      console.warn(`⚠️ Scholarships360: Redirect detected! Requested page ${page} (${requestedUrl}) but got redirected to first page (${finalUrl})`);
      return true;
    }
  } else if (source === 'Scholarships.com') {
    // For Scholarships.com, if we requested ?page=X but ended up on directory without page parameter
    if (normalizedRequested.includes('?page=') && 
        normalizedFinal.includes('/scholarship-directory') &&
        !normalizedFinal.includes('?page=')) {
      console.warn(`⚠️ Scholarships.com: Redirect detected! Requested page ${page} (${requestedUrl}) but got redirected to first page (${finalUrl})`);
      return true;
    }
  }

  return false;
}

// Puppeteer browser instance (singleton)
let browserInstance: any = null;

// Get or create Puppeteer browser instance
async function getBrowser() {
  if (browserInstance) {
    return browserInstance;
  }

  try {
    // Try to find Chrome/Chromium in common locations
    const executablePaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean);

    let executablePath: string | undefined;
    
    // Try to find an existing browser
    for (const path of executablePaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(path)) {
          executablePath = path;
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    // Launch browser
    if (!executablePath) {
      console.warn('No Chrome/Chromium executable found. Puppeteer features will be limited. Install Chrome or set PUPPETEER_EXECUTABLE_PATH.');
      return null;
    }

    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath: executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    return browserInstance;
  } catch (error) {
    console.error('Failed to launch Puppeteer browser:', error);
    console.log('Will fall back to regular HTML fetching (may not work for JavaScript-rendered pages)');
    // Fall back to regular fetch if Puppeteer fails
    return null;
  }
}

// Fetch HTML using Puppeteer (for JavaScript-rendered pages)
// Returns both HTML and final URL for redirect detection
async function fetchWithPuppeteer(url: string, retries = 2): Promise<{ html: string; finalUrl: string } | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delayTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Puppeteer retry ${attempt}/${retries} for ${url} after ${delayTime}ms`);
        await delay(delayTime);
      }

      const browser = await getBrowser();
      if (!browser) {
        throw new Error('Puppeteer browser not available');
      }

      const page = await browser.newPage();
      
      // Set a reasonable viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Set user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );

      // Navigate to page and wait for content
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Get final URL after navigation (may differ if redirected)
      const finalUrl = page.url();

      // Wait a bit more for any lazy-loaded content
      await randomDelay();

      // Scroll multiple times to trigger infinite scroll / lazy loading
      // Some sites load content as you scroll
      for (let scroll = 0; scroll < 5; scroll++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await randomDelay();
        
        // Check if content height increased (more content loaded)
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (scroll > 0 && newHeight === await page.evaluate(() => document.body.scrollHeight)) {
          // Height didn't change, probably done loading
          break;
        }
      }
      
      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await delay(500);

      // Get the HTML content
      const html = await page.content();
      
      await page.close();

      if (!html || html.length < 100) {
        lastError = new Error('Page content too short or empty');
        continue;
      }

      return { html, finalUrl };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === retries) {
        console.error(`Failed to fetch ${url} with Puppeteer after ${retries + 1} attempts:`, lastError.message);
      }
    }
  }

  return null;
}

// Cleanup browser on process exit
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
    }
  });
  process.on('SIGTERM', async () => {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
    }
  });
}

// Check if a URL should be excluded (FAQ, article, category page, etc.)
function shouldExcludeUrl(url: string): boolean {
  return EXCLUDE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

// Check if a name indicates FAQ/article content
function shouldExcludeName(name: string): boolean {
  return EXCLUDE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

// Validate that this looks like a scholarship detail page
function isValidScholarshipUrl(url: string, name: string): boolean {
  if (shouldExcludeUrl(url)) return false;
  if (shouldExcludeName(name)) return false;
  // Name should be a reasonable length for a scholarship name
  if (name.length < 5 || name.length > 150) return false;
  return true;
}

async function fetchWithRetry(url: string, retries = 2): Promise<{ html: string; finalUrl: string } | null> {
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
        redirect: 'follow', // Follow redirects
      });

      if (!response.ok) {
        if (i === retries) {
          console.error(`Failed to fetch ${url}: ${response.status}`);
          return null;
        }
        await randomDelay();
        continue;
      }

      // response.url contains the final URL after redirects
      const finalUrl = response.url;
      const html = await response.text();

      return { html, finalUrl };
    } catch (error) {
      if (i === retries) {
        console.error(`Error fetching ${url}:`, error);
        return null;
      }
      await randomDelay();
    }
  }
  return null;
}

// Scraper for Bold.org with proper navigation
async function scrapeBold(
  currentPage: number,
  maxPages: number = 10,
  existingUrls: Set<string> = new Set(),
  sharedState?: SharedScrapingState
): Promise<DiscoveredScholarship[]> {
  // For interleaved scraping, only scrape the specific currentPage
  const scholarships: DiscoveredScholarship[] = [];
  
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Starting Bold.org scrape',data:{currentPage,maxPages,existingUrlsCount:existingUrls.size},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const browser = await getBrowser();
  if (!browser) {
    console.error('Bold.org: Puppeteer browser not available, falling back to regular fetch');
    // Fall back to old method
    return scrapeBoldFallback(currentPage, maxPages, existingUrls, sharedState);
  }

  let foundOnPage = 0;
  let newOnPage = 0;
  
  try {
    const pageInstance = await browser.newPage();
    await pageInstance.setViewport({ width: 1920, height: 1080 });
    await pageInstance.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Scrape only the specified page
    const page = currentPage;
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Scraping page',data:{page},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
      // #endregion

      // Build URL for this page
      const url = page === 1 
        ? 'https://bold.org/scholarships/' 
        : `https://bold.org/scholarships/${page}/`;

      console.log(`Bold.org: Navigating to page ${page} (${url})...`);
      
      // Navigate to the page
      await pageInstance.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for content with random delay
      await randomDelay();
      
      // Check for redirect detection
      const finalUrl = pageInstance.url();
      if (checkRedirect(url, finalUrl, page, 'Bold.org')) {
        console.warn(`Bold.org: Redirect detected on page ${page}`);
        await pageInstance.close();
        return scholarships;
      }
      
      // Get HTML content
      const html = await pageInstance.content();
      
      // Parse with cheerio
      const $ = cheerio.load(html);
      let foundOnPage = 0;
      let newOnPage = 0;
      
      // Try to find total scholarship count on first page
      if (page === 1) {
        const countText = $('body').text().match(/(\d+)\s+scholarships?/i);
        if (countText) {
          console.log(`Bold.org: Page suggests there are ${countText[1]} total scholarships`);
        }
      }

    // Bold.org uses card-style layouts for scholarships
    // First try specific selectors, fall back to general if nothing found
    let selector = 'article a[href*="/scholarships/"], .scholarship-card a[href*="/scholarships/"]';
    let links = $(selector);
    if (links.length === 0) {
      // Fallback to more general selector
      selector = 'a[href*="/scholarships/"]';
      links = $(selector);
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Links found on page',data:{page,totalLinks:links.length,htmlLength:html.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    
    // Log how many links we found (for debugging)
    console.log(`Bold.org page ${page}: Found ${links.length} total links matching scholarship pattern`);
    
    // Track why links are being filtered out
    let filteredCount = 0;
    let processedCount = 0;
    
    // If page 1 has very few results, try to find category pages
    if (page === 1 && links.length < 30) {
      console.log(`Bold.org: Only ${links.length} links found on page 1. This might be a limited view.`);
    }
    
    links.each((_, element) => {
      processedCount++;
      const href = $(element).attr('href');
      if (href && href.includes('/scholarships/') && !href.endsWith('/scholarships/')) {
        // Skip category/index pages and external links
        if (href.includes('/by-demographics/') || 
            href.includes('/by-state/') || 
            href.includes('/by-field/') ||
            href.includes('/by-type/') ||
            href.includes('/by-year/') ||
            href.includes('/category/') ||
            href.includes('utm_source=') || // Skip affiliate/tracking links
            href.includes('utm_medium=') ||
            !href.includes('bold.org') && href.startsWith('http') || // Skip external links
            href.endsWith('/women/') ||
            href.endsWith('/men/') ||
            href.endsWith('/seniors/') ||
            href.endsWith('/juniors/') ||
            href.endsWith('/high-school/') ||
            href.match(/\/[a-z-]+-scholarships\/?$/)) {
          return; // Skip category pages and external links
        }
        
        // Ensure it's a bold.org URL (not external)
        const fullUrl = href.startsWith('http') 
          ? (href.includes('bold.org') ? href : null)
          : `https://bold.org${href}`;
        
        if (!fullUrl) return; // Skip external links
        
        // Only include URLs with at least 4 path segments (more specific URLs)
        // e.g., /scholarships/something-specific-scholarship
        const pathSegments = fullUrl.split('/').filter(Boolean);
        if (pathSegments.length < 3) return; // Too generic
        
        // Get scholarship name from the link text or parent card
        let name = $(element).text().trim();
        if (!name || name.length < 10) {
          name = $(element).find('h2, h3, h4, .title, .name').first().text().trim();
        }
        if (!name || name.length < 10) {
          name = $(element).closest('article, .card').find('h2, h3, h4, .title').first().text().trim();
        }
        if (!name || name.length < 10) {
          // Extract name from URL
          const urlParts = href.split('/').filter(Boolean);
          name = urlParts[urlParts.length - 1]
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
        }
        
        // Skip if name still looks like a category
        if (name.toLowerCase().includes('scholarships for') || 
            name.toLowerCase().includes('scholarship by') ||
            name.length < 10) {
          return;
        }

        // Use enhanced validation
        if (!isValidScholarshipUrl(fullUrl, name)) {
          return;
        }

        // Avoid duplicates within this scrape
        if (!scholarships.some((s) => s.url === fullUrl)) {
          const isNew = !existingUrls.has(fullUrl);
          scholarships.push({
            url: fullUrl,
            name: name.substring(0, 100),
            source: 'Bold.org',
          });
          foundOnPage++;
          
          // Track if this is new (not in database)
          if (isNew) {
            newOnPage++;
            // Update shared state if provided (for interleaved scraping)
            if (sharedState) {
              sharedState.newCount++;
            }
          }
        }
      } else {
        filteredCount++;
      }
    });

    // Log processing summary
    if (page <= 2 || foundOnPage === 0) {
      console.log(`Bold.org page ${page}: Processed ${processedCount} links, filtered out ${filteredCount}, found ${foundOnPage} valid scholarships`);
    }

    // Content verification: Log first 3 scholarship names found on this page
    const pageScholarships = scholarships.slice(-foundOnPage); // Get scholarships added on this page
    if (pageScholarships.length > 0) {
      const firstThree = pageScholarships.slice(0, 3).map(s => s.name);
      console.log(`Bold.org page ${page}: First 3 scholarships: ${firstThree.join(', ')}`);
    }

    console.log(`Bold.org page ${page}: Found ${foundOnPage} scholarships (${newOnPage} new, ${foundOnPage - newOnPage} duplicates)`);
    
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Link processing summary',data:{page,totalLinks:links.length,processedCount,filteredCount,foundOnPage},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'K'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Page scan complete',data:{page,foundOnPage,newOnPage,duplicatesOnPage:foundOnPage-newOnPage},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Check if we should stop early (target reached)
    if (sharedState?.shouldStop()) {
      console.log(`Bold.org: Target reached, stopping after page ${page}`);
    }

  await pageInstance.close();
  } catch (error) {
    console.error('Bold.org: Error during Puppeteer scraping:', error);
  }

  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Scrape complete',data:{page:currentPage,totalFound:scholarships.length,newOnPage},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  console.log(`Bold.org page ${currentPage}: Found ${scholarships.length} total scholarships (${newOnPage} new, ${scholarships.length - newOnPage} duplicates)`);
  return scholarships;
}

// Fallback scraper for Bold.org (if Puppeteer not available)
async function scrapeBoldFallback(
  currentPage: number,
  maxPages: number = 10,
  existingUrls: Set<string> = new Set(),
  sharedState?: SharedScrapingState
): Promise<DiscoveredScholarship[]> {
  // Use the old URL-based pagination method as fallback (scrape only currentPage)
  const scholarships: DiscoveredScholarship[] = [];
  let foundOnPage = 0;
  
  const page = currentPage;
  const url = page === 1 
    ? 'https://bold.org/scholarships/' 
    : `https://bold.org/scholarships/${page}/`;
  
  const result = await fetchWithRetry(url);
  if (!result) {
    return scholarships;
  }
  
  const html = result.html;
  const finalUrl = result.finalUrl;
  
  // Check for redirect detection
  if (checkRedirect(url, finalUrl, page, 'Bold.org')) {
    console.warn(`Bold.org (fallback): Redirect detected on page ${page}`);
    return scholarships;
  }
  
  foundOnPage = 0;
  const $ = cheerio.load(html);
  $('a[href*="/scholarships/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && href.includes('/scholarships/') && !href.endsWith('/scholarships/')) {
      const fullUrl = href.startsWith('http') 
        ? (href.includes('bold.org') ? href : null)
        : `https://bold.org${href}`;
      
      if (fullUrl && !scholarships.some((s) => s.url === fullUrl)) {
        const isNew = !existingUrls.has(fullUrl);
        let name = $(element).text().trim();
        if (!name || name.length < 10) {
          const urlParts = href.split('/').filter(Boolean);
          name = urlParts[urlParts.length - 1]?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
        }
        
        if (isValidScholarshipUrl(fullUrl, name)) {
          scholarships.push({ url: fullUrl, name: name.substring(0, 100), source: 'Bold.org' });
          foundOnPage++;
          // Update shared state if provided
          if (isNew && sharedState) {
            sharedState.newCount++;
          }
        }
      }
    }
  });
  
  // Content verification: Log first 3 scholarship names found on this page
  const pageScholarships = scholarships.slice(-foundOnPage);
  if (pageScholarships.length > 0) {
    const firstThree = pageScholarships.slice(0, 3).map(s => s.name);
    console.log(`Bold.org (fallback) page ${page}: First 3 scholarships: ${firstThree.join(', ')}`);
  }
  
  return scholarships;
}

// Scraper for Scholarships360 with pagination
async function scrapeScholarships360(
  currentPage: number,
  maxPages: number = 10,
  existingUrls: Set<string> = new Set(),
  sharedState?: SharedScrapingState
): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  const page = currentPage;
  let foundOnPage = 0;
  let newOnPage = 0;
  const sampleFilteredHrefs: string[] = [];
  
  const url = page === 1
      ? 'https://scholarships360.org/scholarships/search/'
      : `https://scholarships360.org/scholarships/search/?search=&sidebar_academic_interest=&sidebar_state=&sidebar_grade=&sidebar_background=&sidebar_sort=relevant&current_page=${page}`;
  
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Starting page fetch',data:{page,url},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Use Puppeteer for Scholarships360 (JavaScript-rendered pagination)
  // Primarily use direct URL navigation - the URLs should work if we wait properly for AJAX content
  let html: string | null = null;
  let finalUrl: string = url;
  
  try {
    const browser = await getBrowser();
    if (browser) {
      const pageInstance = await browser.newPage();
      await pageInstance.setViewport({ width: 1920, height: 1080 });
      await pageInstance.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
      
      // Navigate directly to the URL
      console.log(`Scholarships360: Navigating to page ${page} URL: ${url}`);
      await pageInstance.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 45000 // Longer timeout for page 2+ to allow AJAX to load
      });
      
      // Wait a bit for initial render
      await delay(2000);
      
      // Wait for scholarship content to load - try multiple selectors
      try {
        await pageInstance.waitForSelector('a[href*="/scholarships/"]', { timeout: 15000 });
      } catch (e) {
        console.log(`Scholarships360: Scholarship links selector not found immediately, continuing...`);
      }
      
      // Additional wait for AJAX/fetch requests to complete
      // Scholarships360 likely loads content via fetch/XHR after page load
      await delay(3000);
      
      // Monitor network activity - wait for fetch/XHR requests to finish
      try {
        await pageInstance.evaluate(async () => {
          // Wait for any pending fetch requests
          if ((window as any).fetch) {
            // Give time for fetch requests to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        });
      } catch (e) {
        // Ignore errors
      }
      
      // Scroll to trigger any lazy loading
      await pageInstance.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await delay(1000);
      
      // Scroll back to top
      await pageInstance.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await delay(1000);
      
      // One more wait after scrolling to ensure content is loaded
      await delay(2000);
      
      finalUrl = pageInstance.url();
      html = await pageInstance.content();
      
      // Log HTML length to verify we got content
      console.log(`Scholarships360 page ${page}: Retrieved HTML length: ${html?.length || 0}`);
      
      await pageInstance.close();
    } else {
      // Fallback to regular fetch
      console.log(`Scholarships360: Puppeteer not available, using regular fetch for page ${page}`);
      const result = await fetchWithRetry(url);
      if (result) {
        html = result.html;
        finalUrl = result.finalUrl;
      }
    }
  } catch (error) {
    console.log(`Scholarships360: Puppeteer error for page ${page}, trying regular fetch: ${error}`);
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Puppeteer error, using fallback',data:{page,url,error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const result = await fetchWithRetry(url);
    if (result) {
      html = result.html;
      finalUrl = result.finalUrl;
    }
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'After fetch',data:{page,requestedUrl:url,finalUrl,htmlLength:html?.length||0,urlsMatch:url===finalUrl},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  // Check for redirect detection
  const redirectDetected = html ? checkRedirect(url, finalUrl, page, 'Scholarships360') : false;
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Redirect check',data:{page,requestedUrl:url,finalUrl,redirectDetected},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  if (html && redirectDetected) {
    console.warn(`Scholarships360: Redirect detected on page ${page}`);
    return scholarships;
  }
  
  if (!html) {
    console.log(`Scholarships360: Failed to fetch page ${page}`);
    return scholarships;
  }

  const $ = cheerio.load(html);
  foundOnPage = 0;
  newOnPage = 0;
  
  // #region agent log
  const totalLinksBeforeFilter = $('a[href*="/scholarships/"]').length;
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Before link parsing',data:{page,htmlLength:html.length,totalLinksBeforeFilter},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  // Look for scholarship links
  // Try to find links in the main content area, not navigation/header
  // Scholarships360 likely has the actual results in a specific container
  const contentSelectors = [
    'main a[href*="/scholarships/"]',
    '[class*="results"] a[href*="/scholarships/"]',
    '[class*="list"] a[href*="/scholarships/"]',
    '[class*="grid"] a[href*="/scholarships/"]',
    'article a[href*="/scholarships/"]',
    '.scholarship-card a[href*="/scholarships/"]',
    'a[href*="/scholarships/"]' // Fallback to all links
  ];
  
  let linksFound = false;
  for (const selector of contentSelectors) {
    const links = $(selector);
    if (links.length > 20) { // Found a good number of links, use this selector
      linksFound = true;
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Using selector for links',data:{page,selector,linkCount:links.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'M'})}).catch(()=>{});
      // #endregion
      break;
    }
  }
  
  // Use the best selector found, or fallback to all links
  const linkSelector = linksFound ? contentSelectors.find(s => $(s).length > 20) || 'a[href*="/scholarships/"]' : 'a[href*="/scholarships/"]';
  
  let linksChecked = 0;
  let linksFilteredByHrefPattern = 0;
  let linksFilteredByDashboard = 0;
  let linksFilteredByValidation = 0;
  
  $(linkSelector).each((_, element) => {
      const href = $(element).attr('href');
      linksChecked++;
      
      // Check each filter condition and log why it's filtered
      if (!href) {
        if (sampleFilteredHrefs.length < 5) sampleFilteredHrefs.push('(no href)');
        linksFilteredByHrefPattern++;
        return;
      }
      
      if (!href.includes('/scholarships/')) {
        if (sampleFilteredHrefs.length < 5) sampleFilteredHrefs.push(href.substring(0, 100));
        linksFilteredByHrefPattern++;
        return;
      }
      
      if (href.endsWith('/scholarships/')) {
        if (sampleFilteredHrefs.length < 5) sampleFilteredHrefs.push(href);
        linksFilteredByHrefPattern++;
        return;
      }
      
      if (href.includes('/category/') || href.includes('/tag/') || href.includes('/page/') || 
          href.includes('/type/') || href.includes('/state/') || href.includes('/search/') ||
          href.match(/\/[a-z-]+-scholarships\/?$/)) {
        if (sampleFilteredHrefs.length < 5) sampleFilteredHrefs.push(href.substring(0, 100));
        linksFilteredByHrefPattern++;
        return;
      }
      
      // If we get here, the href passed the pattern check
      const fullUrl = href.startsWith('http')
        ? href
        : `https://scholarships360.org${href}`;

      // Filter out dashboard/authenticated URLs (app.scholarships360.org)
      if (fullUrl.includes('app.scholarships360.org') || fullUrl.includes('/dashboard/')) {
        linksFilteredByDashboard++;
        return; // Skip authenticated/dashboard URLs
      }

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

      // Use enhanced validation
      if (!isValidScholarshipUrl(fullUrl, name)) {
        linksFilteredByValidation++;
        return;
      }

      // Add the scholarship if it's valid
      if (!scholarships.some((s) => s.url === fullUrl) && name.length > 2) {
        const isNew = !existingUrls.has(fullUrl);
        scholarships.push({
          url: fullUrl,
          name: name.substring(0, 100),
          source: 'Scholarships360',
        });
        foundOnPage++;
        
        if (isNew) {
          newOnPage++;
          // Update shared state if provided
          if (sharedState) {
            sharedState.newCount++;
          }
        }
      }
    });

  // Log filtering statistics
  if (linksChecked > 0) {
    console.log(`Scholarships360 page ${page}: Checked ${linksChecked} links, filtered: ${linksFilteredByHrefPattern} by href pattern, ${linksFilteredByDashboard} by dashboard URL, ${linksFilteredByValidation} by validation`);
    if (sampleFilteredHrefs.length > 0) {
      console.log(`Scholarships360 page ${page}: Sample filtered hrefs: ${sampleFilteredHrefs.slice(0, 5).join(', ')}`);
    }
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Link filtering stats',data:{page,linksChecked,linksFilteredByHrefPattern,linksFilteredByDashboard,linksFilteredByValidation,foundOnPage,sampleFilteredHrefs:sampleFilteredHrefs.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'N'})}).catch(()=>{});
    // #endregion
  }

  // Content verification: Log first 3 scholarship names found on this page
  const pageScholarships = scholarships.slice(-foundOnPage); // Get scholarships added on this page
  const firstThreeNames = pageScholarships.length > 0 ? pageScholarships.slice(0, 3).map(s => s.name) : [];
  const firstThreeUrls = pageScholarships.length > 0 ? pageScholarships.slice(0, 3).map(s => s.url) : [];
  
  if (pageScholarships.length > 0) {
    console.log(`Scholarships360 page ${page}: First 3 scholarships: ${firstThreeNames.join(', ')}`);
  }
  
  // Check if content is the same as previous page (pagination not working)
  // Store first URL from this page to compare with next page
  const firstUrlThisPage = firstThreeUrls.length > 0 ? firstThreeUrls[0] : null;
  
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Page analysis complete',data:{page,foundOnPage,newOnPage,duplicatesOnPage:foundOnPage-newOnPage,firstThreeNames,firstThreeUrls,firstUrlThisPage,totalScholarships:scholarships.length,allUrls:scholarships.map(s=>s.url)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
  // #endregion

  console.log(`Scholarships360 page ${page}: Found ${foundOnPage} scholarships (${newOnPage} new, ${foundOnPage - newOnPage} duplicates)`);
  
  // If we found the same content as page 1 and we're on page 2+, pagination might not be working
  // This is a warning, not an error - we'll continue to see if it resolves
  if (page > 1 && firstUrlThisPage && scholarships.length >= 14) {
    const page1FirstUrl = scholarships.length >= 14 ? scholarships[0]?.url : null;
    if (page1FirstUrl && firstUrlThisPage === page1FirstUrl && newOnPage === 0) {
      console.warn(`⚠️ Scholarships360 page ${page}: Content appears identical to page 1 (first URL matches). Pagination may not be working correctly.`);
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeScholarships360',message:'Possible pagination issue detected',data:{page,firstUrlThisPage,page1FirstUrl,urlsMatch:firstUrlThisPage===page1FirstUrl},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'L'})}).catch(()=>{});
      // #endregion
    }
  }
  
  // Check if we should stop early (target reached)
  if (sharedState?.shouldStop()) {
    console.log(`Scholarships360: Target reached, stopping after page ${page}`);
  }

  console.log(`Scholarships360 page ${page} scrape complete: Found ${scholarships.length} total scholarships`);
  return scholarships;
}

// Scraper for Scholarships.com with pagination
async function scrapeScholarshipsCom(
  currentPage: number,
  maxPages: number = 10,
  existingUrls: Set<string> = new Set(),
  sharedState?: SharedScrapingState
): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  const page = currentPage;
  // Scholarships.com uses a different pagination - let's try their actual directory
  const url = page === 1
    ? 'https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory'
    : `https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory?page=${page}`;
  
  const result = await fetchWithRetry(url);
  if (!result) {
    console.log(`Scholarships.com: Failed to fetch page ${page}`);
    return scholarships;
  }
  
  const html = result.html;
  const finalUrl = result.finalUrl;
  
  // Check for redirect detection
  if (checkRedirect(url, finalUrl, page, 'Scholarships.com')) {
    console.warn(`Scholarships.com: Redirect detected on page ${page}`);
    return scholarships;
  }

    const $ = cheerio.load(html);
    let foundOnPage = 0;
    let newOnPage = 0;

    // Look for scholarship links - try multiple selectors
    const selectors = [
      'a[href*="/scholarship/"]',
      'a[href*="scholarship"]',
      '.scholarship-listing a',
      '.scholarship-item a',
      '.listing-item a',
      'li a[href*="scholarship"]',
      'table a[href*="scholarship"]',
      '.result-item a',
      '.directory-item a',
    ];
    
    let links = $();
    let linksFound = 0;
    for (const selector of selectors) {
      const found = $(selector);
      if (found.length > linksFound) {
        links = found;
        linksFound = found.length;
      }
    }
    
    if (links.length === 0) {
      console.log(`Scholarships.com page ${page}: No scholarship links found with any selector. Page may be blocked or structure changed.`);
      if (page === 1) {
        // Log HTML snippet for debugging on first page
        const bodyText = $('body').text().substring(0, 200);
        console.log(`Scholarships.com page 1 body preview: ${bodyText}...`);
      }
    }
    
    links.each((_, element) => {
      const href = $(element).attr('href');
      if (href && (href.includes('/scholarship/') || href.includes('/scholarships/'))) {
        const fullUrl = href.startsWith('http')
          ? href
          : `https://www.scholarships.com${href}`;

        // Skip if it's not a scholarships.com URL
        if (!fullUrl.includes('scholarships.com')) return;

        let name = $(element).text().trim();
        if (!name || name.length < 3) {
          name = $(element).closest('li, .item, article').find('h2, h3, h4, .title').first().text().trim();
        }
        if (!name || name.length < 3) {
          const urlParts = href.split('/').filter(Boolean);
          name = urlParts[urlParts.length - 1]
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
        }

        // Use enhanced validation
        if (!isValidScholarshipUrl(fullUrl, name)) {
          return;
        }

        if (!scholarships.some((s) => s.url === fullUrl) && name.length > 2) {
          const isNew = !existingUrls.has(fullUrl);
          scholarships.push({
            url: fullUrl,
            name: name.substring(0, 100),
            source: 'Scholarships.com',
          });
          foundOnPage++;
          
          if (isNew) {
            newOnPage++;
            // Update shared state if provided
            if (sharedState) {
              sharedState.newCount++;
            }
          }
        }
      }
    });

    // Content verification: Log first 3 scholarship names found on this page
    const pageScholarships = scholarships.slice(-foundOnPage); // Get scholarships added on this page
    if (pageScholarships.length > 0) {
      const firstThree = pageScholarships.slice(0, 3).map(s => s.name);
      console.log(`Scholarships.com page ${page}: First 3 scholarships: ${firstThree.join(', ')}`);
    }

  console.log(`Scholarships.com page ${page}: Found ${foundOnPage} scholarships (${newOnPage} new)`);
  
  if (foundOnPage === 0) {
    // Try alternate URL structure before giving up
    if (page === 1) {
      console.log('Scholarships.com: Primary URL failed, site may be blocking or changed structure');
    }
  }
  
  // Check if we should stop early (target reached)
  if (sharedState?.shouldStop()) {
    console.log(`Scholarships.com: Target reached, stopping after page ${page}`);
  }

  return scholarships;
}

export async function discoverScholarships(
  userProfile: UserProfile,
  sourceIds: string[] = ['bold', 'scholarships360', 'scholarshipscom'],
  maxPagesPerSource: number = 10,
  targetCount: number = 15
): Promise<DiscoveryResult> {
  const allScholarships: DiscoveredScholarship[] = [];
  const errors: string[] = [];
  const sourceStats: SourceStats[] = [];

  // Get existing URLs from database to prevent duplicates
  const existingUrls = await getAllScholarshipUrls();
  const existingUrlSet = new Set(existingUrls);

  // Get sources from database
  let sources: ScholarshipSource[] = [];
  try {
    sources = await getCustomSources();
  } catch (err) {
    console.error('Failed to load sources from database:', err);
  }

  // Filter to enabled sources
  const enabledSources = sources.filter(
    (s) => s.enabled && sourceIds.includes(s.id)
  );

  // Create shared state for target tracking
  let sharedState: SharedScrapingState = {
    targetCount,
    newCount: 0,
    shouldStop: () => {
      // Hard stop when target reached
      return sharedState.newCount >= sharedState.targetCount;
    },
  };

  // Initialize source stats map
  const sourceStatsMap = new Map<string, SourceStats>();
  for (const source of enabledSources) {
    sourceStatsMap.set(source.id, {
      sourceId: source.id,
      sourceName: source.name,
      found: 0,
      new: 0,
      duplicates: 0,
      status: 'success',
    });
  }

  // Sequential scraping: process one source completely before moving to next
  for (const source of enabledSources) {
    // Check if we should stop before starting this source
    if (sharedState.shouldStop()) {
      console.log(`Target of ${targetCount} new scholarships reached. Stopping scraping.`);
      break;
    }

    const stats = sourceStatsMap.get(source.id)!;
    console.log(`Processing source: ${source.name}...`);

    // Process all pages for this source sequentially
    for (let page = 1; page <= maxPagesPerSource; page++) {
      // Check if we should stop before processing this page
      if (sharedState.shouldStop()) {
        console.log(`Target of ${targetCount} new scholarships reached. Stopping after ${page - 1} pages of ${source.name}.`);
        break;
      }

      try {
        let scholarships: DiscoveredScholarship[] = [];

        // Determine which scraper to use
        if (source.id === 'bold' || source.baseUrl.includes('bold.org')) {
          scholarships = await scrapeBold(page, maxPagesPerSource, existingUrlSet, sharedState);
        } else if (source.id === 'scholarships360' || source.baseUrl.includes('scholarships360.org')) {
          scholarships = await scrapeScholarships360(page, maxPagesPerSource, existingUrlSet, sharedState);
        } else if (source.id === 'scholarshipscom' || source.baseUrl.includes('scholarships.com')) {
          scholarships = await scrapeScholarshipsCom(page, maxPagesPerSource, existingUrlSet, sharedState);
        } else {
          // Default to generic scraper for custom or unknown sources
          // For generic scraper, only scrape on first page (it scrapes all pages at once)
          if (page === 1) {
            scholarships = await scrapeGenericSource(source, maxPagesPerSource, existingUrlSet);
            // Update sharedState with new scholarships from generic source
            const newFromGeneric = scholarships.filter(s => !existingUrlSet.has(s.url));
            sharedState.newCount += newFromGeneric.length;
          }
        }

        // Count new vs duplicates for this page
        const newFromPage = scholarships.filter(s => !existingUrlSet.has(s.url) && 
          !allScholarships.some(existing => existing.url === s.url));
        
        // Update shared state with new count
        sharedState.newCount += newFromPage.length;
        
        // Update source stats
        stats.found += scholarships.length;
        stats.new += newFromPage.length;
        stats.duplicates += scholarships.length - newFromPage.length;

        allScholarships.push(...scholarships);
        
        // Progress logging
        if (scholarships.length > 0) {
          console.log(`Found ${sharedState.newCount}/${targetCount} new scholarships. Still searching...`);
          console.log(`${source.name} page ${page}: Found ${scholarships.length} scholarships (${newFromPage.length} new, ${scholarships.length - newFromPage.length} duplicates)`);
        }
        
        // Check if we should stop after this page
        if (sharedState.shouldStop()) {
          console.log(`Target reached. Stopping after ${source.name} page ${page}.`);
          break;
        }

        // Update status based on results
        if (stats.status === 'success' && scholarships.length === 0 && page > 1) {
          // Might be a temporary empty page, keep status as success
        } else if (scholarships.length === 0 && page === maxPagesPerSource) {
          if (stats.found === 0) {
            stats.status = 'failed';
            stats.error = 'No scholarships found (site may be blocking or changed structure)';
          }
        } else if (stats.status === 'success' && stats.new === 0 && stats.found > 0 && page === maxPagesPerSource) {
          stats.status = 'partial';
          stats.error = 'All found scholarships were duplicates';
        }

        // Rate limiting between pages
        if (page < maxPagesPerSource && !sharedState.shouldStop()) {
          await delay(500);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        stats.status = 'failed';
        stats.error = errorMsg;
        if (!errors.some(e => e.includes(source.name))) {
          errors.push(`Failed to scrape ${source.name}: ${errorMsg}`);
        }
        console.error(`Failed to scrape ${source.name} page ${page}:`, error);
      }
    }

    // Check if we should stop after completing this source
    if (sharedState.shouldStop()) {
      break;
    }
  }

  // Convert stats map to array
  for (const stats of sourceStatsMap.values()) {
    sourceStats.push(stats);
  }

  // Remove duplicates by URL (within this scrape)
  const uniqueScholarships = allScholarships.filter(
    (scholarship, index, self) =>
      index === self.findIndex((s) => s.url === scholarship.url)
  );

  // Filter out scholarships that already exist in database
  const newScholarships = uniqueScholarships.filter(
    (scholarship) => !existingUrlSet.has(scholarship.url)
  );

  const duplicateCount = uniqueScholarships.length - newScholarships.length;

  // Limit to targetCount new scholarships
  const limitedScholarships = newScholarships.slice(0, targetCount);

  console.log(`Total found: ${uniqueScholarships.length}, New: ${newScholarships.length}, Limited to ${limitedScholarships.length}, Duplicates: ${duplicateCount}`);

  // Analyze the discovered scholarships if we found the target count
  let analyzedScholarships: Scholarship[] | undefined = undefined;
  if (limitedScholarships.length === targetCount && limitedScholarships.length > 0) {
    console.log(`Target reached. Starting AI analysis for ${limitedScholarships.length} scholarships.`);
    
    analyzedScholarships = [];
    const analysisErrors: string[] = [];
    
    for (let i = 0; i < limitedScholarships.length; i++) {
      const scholarship = limitedScholarships[i];
      console.log(`Analyzing scholarship ${i + 1}/${limitedScholarships.length}: ${scholarship.name}`);
      
      try {
        const result = await analyzeScholarship(scholarship.url, userProfile);
        
        if (result.success) {
          analyzedScholarships.push(result.scholarship);
        } else {
          analysisErrors.push(`${scholarship.name}: ${result.error}`);
          console.error(`Analysis failed for ${scholarship.url}: ${result.error}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        analysisErrors.push(`${scholarship.name}: ${errorMsg}`);
        console.error(`Failed to analyze ${scholarship.url}:`, error);
      }
      
      // Rate limiting between analysis calls (13 seconds for Gemini API)
      if (i < limitedScholarships.length - 1) {
        await delay(13000);
      }
    }
    
    if (analysisErrors.length > 0) {
      errors.push(...analysisErrors);
    }
    
    console.log(`Analysis complete: ${analyzedScholarships.length}/${limitedScholarships.length} scholarships successfully analyzed.`);
  }

  return {
    success: uniqueScholarships.length > 0 || errors.length === 0,
    scholarships: limitedScholarships,
    analyzedScholarships,
    errors,
    newCount: limitedScholarships.length,
    duplicateCount: duplicateCount,
    sourceStats,
  };
}

// Generic scraper for custom sources
async function scrapeGenericSource(source: ScholarshipSource, maxPages: number = 5, existingUrls: Set<string> = new Set()): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  let newCount = 0;
  
  const result = await fetchWithRetry(source.searchUrl);
  if (!result) {
    console.log(`${source.name}: Failed to fetch`);
    return scholarships;
  }

  const html = result.html;
  const $ = cheerio.load(html);
  
  // Generic approach: find all links that might be scholarships
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    
    // Build full URL
    let fullUrl = href;
    if (href.startsWith('/')) {
      fullUrl = source.baseUrl + href;
    } else if (!href.startsWith('http')) {
      fullUrl = source.baseUrl + '/' + href;
    }
    
    // Skip external links
    try {
      if (!fullUrl.includes(new URL(source.baseUrl).hostname)) {
        return;
      }
    } catch {
      return; // Invalid URL
    }
    
    // Get name from link text
    let name = $(element).text().trim();
    if (!name || name.length < 5) {
      name = $(element).closest('article, .card, li').find('h2, h3, h4, .title').first().text().trim();
    }
    if (!name || name.length < 5) {
      // Extract from URL
      const urlParts = href.split('/').filter(Boolean);
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart) {
        name = lastPart
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    
    // If we still don't have a name, skip this link
    if (!name || name.length < 5) {
      return;
    }
    
    // Validate
    if (!isValidScholarshipUrl(fullUrl, name)) {
      return;
    }
    
    // Avoid duplicates
    if (!scholarships.some((s) => s.url === fullUrl)) {
      scholarships.push({
        url: fullUrl,
        name: name.substring(0, 100),
        source: source.name,
      });
      
      if (!existingUrls.has(fullUrl)) {
        newCount++;
      }
    }
  });

  console.log(`${source.name}: Found ${scholarships.length} scholarships (${newCount} new)`);
  return scholarships;
}

// Get available sources
export async function getAvailableSources(): Promise<ScholarshipSource[]> {
  return getCustomSources();
}
