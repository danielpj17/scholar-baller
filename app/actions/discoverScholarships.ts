'use server';

import * as cheerio from 'cheerio';
import { UserProfile } from '@/types';
import { ScholarshipSource, scholarshipSources } from '@/constants/sources';
import { getAllScholarshipUrls, getCustomSources } from '@/lib/db';
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
  scholarships: DiscoveredScholarship[];
  errors: string[];
  newCount: number;
  duplicateCount: number;
  sourceStats: SourceStats[];
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
async function scrapeBold(maxPages: number = 10, existingUrls: Set<string> = new Set()): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  let consecutiveDuplicatePages = 0;
  const maxConsecutiveDuplicatePages = 20;
  const minPagesToScan = 15;
  const maxConsecutiveEmptyPages = 3;
  let totalNewFound = 0;
  let totalPagesScanned = 0;
  let consecutiveEmptyPages = 0;
  
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Starting Bold.org scrape',data:{maxPages,existingUrlsCount:existingUrls.size},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const browser = await getBrowser();
  if (!browser) {
    console.error('Bold.org: Puppeteer browser not available, falling back to regular fetch');
    // Fall back to old method
    return scrapeBoldFallback(maxPages, existingUrls);
  }

  try {
    const pageInstance = await browser.newPage();
    await pageInstance.setViewport({ width: 1920, height: 1080 });
    await pageInstance.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Navigate directly to paginated URLs
    for (let page = 1; page <= maxPages; page++) {
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
        console.warn(`Bold.org: Stopping due to redirect detection on page ${page}`);
        break;
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
          scholarships.push({
            url: fullUrl,
            name: name.substring(0, 100),
            source: 'Bold.org',
          });
          foundOnPage++;
          
          // Track if this is new (not in database)
          if (!existingUrls.has(fullUrl)) {
            newOnPage++;
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

    totalPagesScanned++;
    console.log(`Bold.org page ${page}: Found ${foundOnPage} scholarships (${newOnPage} new, ${foundOnPage - newOnPage} duplicates)`);
    
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Link processing summary',data:{page,totalLinks:links.length,processedCount,filteredCount,foundOnPage},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'K'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Page scan complete',data:{page,foundOnPage,newOnPage,duplicatesOnPage:foundOnPage-newOnPage,consecutiveDuplicatePages,totalNewFound},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // If we found no scholarships at all on this page, track consecutive empty pages
    if (foundOnPage === 0) {
      consecutiveEmptyPages++;
      console.log(`Bold.org: Page ${page} was empty (${consecutiveEmptyPages}/${maxConsecutiveEmptyPages} consecutive empty pages)`);
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Empty page encountered',data:{page,consecutiveEmptyPages,maxConsecutiveEmptyPages,willStop:consecutiveEmptyPages>=maxConsecutiveEmptyPages},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Only stop if we've hit multiple consecutive empty pages (site might have gaps in pagination)
      if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
        console.log(`Bold.org: Stopping after ${maxConsecutiveEmptyPages} consecutive empty pages (scanned ${totalPagesScanned} pages total)`);
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Stopping: too many consecutive empty pages',data:{consecutiveEmptyPages,totalPagesScanned},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        break;
      }
      // Reset duplicate counter when we hit an empty page (it's not a duplicate page)
      consecutiveDuplicatePages = 0;
      await randomDelay();
      continue; // Skip to next page
    } else {
      consecutiveEmptyPages = 0; // Reset empty page counter when we find scholarships
    }
    
    // Track consecutive pages with only duplicates
    if (newOnPage === 0) {
      consecutiveDuplicatePages++;
      console.log(`Bold.org: Page ${page} had only duplicates (${consecutiveDuplicatePages}/${maxConsecutiveDuplicatePages} consecutive, ${totalPagesScanned} total pages scanned)`);
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Duplicate page encountered',data:{page,consecutiveDuplicatePages,maxConsecutiveDuplicatePages,willStop:consecutiveDuplicatePages>=maxConsecutiveDuplicatePages},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Only stop if we've scanned minimum pages AND hit the consecutive duplicate threshold
      if (consecutiveDuplicatePages >= maxConsecutiveDuplicatePages && totalPagesScanned >= minPagesToScan) {
        console.log(`Bold.org: Stopping after ${maxConsecutiveDuplicatePages} consecutive pages with no new scholarships (scanned ${totalPagesScanned} pages total, found ${scholarships.length} scholarships, ${totalNewFound} new)`);
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Stopping: too many consecutive duplicate pages',data:{consecutiveDuplicatePages,totalPagesScanned,totalFound:scholarships.length,totalNewFound},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        break;
      } else if (consecutiveDuplicatePages >= maxConsecutiveDuplicatePages) {
        console.log(`Bold.org: Found ${consecutiveDuplicatePages} consecutive duplicate pages, but only scanned ${totalPagesScanned}/${minPagesToScan} minimum pages. Continuing...`);
      }
    } else {
      totalNewFound += newOnPage;
      consecutiveDuplicatePages = 0; // Reset counter when we find new ones
      console.log(`Bold.org: Found ${newOnPage} NEW scholarships on page ${page} (${totalNewFound} total new so far)`);
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'New scholarships found',data:{page,newOnPage,totalNewFound},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
    }

    // Rate limiting between pages
    await randomDelay();
  }

  await pageInstance.close();
  } catch (error) {
    console.error('Bold.org: Error during Puppeteer scraping:', error);
  }

  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'discoverScholarships.ts:scrapeBold',message:'Scrape complete',data:{totalPagesScanned,totalFound:scholarships.length,totalNewFound,consecutiveDuplicatePages},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  console.log(`Bold.org scrape complete: Scanned ${totalPagesScanned} pages, found ${scholarships.length} total scholarships (${totalNewFound} new, ${scholarships.length - totalNewFound} duplicates)`);
  return scholarships;
}

// Fallback scraper for Bold.org (if Puppeteer not available)
async function scrapeBoldFallback(maxPages: number = 10, existingUrls: Set<string> = new Set()): Promise<DiscoveredScholarship[]> {
  // Use the old URL-based pagination method as fallback
  const scholarships: DiscoveredScholarship[] = [];
  let foundOnPage = 0;
  
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 
      ? 'https://bold.org/scholarships/' 
      : `https://bold.org/scholarships/${page}/`;
    
    const result = await fetchWithRetry(url);
    if (!result) break;
    
    const html = result.html;
    const finalUrl = result.finalUrl;
    
    // Check for redirect detection
    if (checkRedirect(url, finalUrl, page, 'Bold.org')) {
      console.warn(`Bold.org (fallback): Stopping due to redirect detection on page ${page}`);
      break;
    }
    
    foundOnPage = 0;
    const $ = cheerio.load(html);
    $('a[href*="/scholarships/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href.includes('/scholarships/') && !href.endsWith('/scholarships/')) {
        const fullUrl = href.startsWith('http') 
          ? (href.includes('bold.org') ? href : null)
          : `https://bold.org${href}`;
        
        if (fullUrl && !scholarships.some((s) => s.url === fullUrl) && !existingUrls.has(fullUrl)) {
          let name = $(element).text().trim();
          if (!name || name.length < 10) {
            const urlParts = href.split('/').filter(Boolean);
            name = urlParts[urlParts.length - 1]?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
          }
          
          if (isValidScholarshipUrl(fullUrl, name)) {
            scholarships.push({ url: fullUrl, name: name.substring(0, 100), source: 'Bold.org' });
            foundOnPage++;
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
    
    if (foundOnPage === 0 && page > 1) break;
    await randomDelay();
  }
  
  return scholarships;
}

// Scraper for Scholarships360 with pagination
async function scrapeScholarships360(maxPages: number = 10, existingUrls: Set<string> = new Set()): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  let consecutiveDuplicatePages = 0;
  const maxConsecutiveDuplicatePages = 20; // Keep searching through 20 pages of duplicates before giving up
  const minPagesToScan = 15; // Always scan at least 15 pages before stopping
  const maxConsecutiveEmptyPages = 3; // Continue through up to 3 consecutive empty pages before stopping
  let totalNewFound = 0;
  let totalPagesScanned = 0;
  let consecutiveEmptyPages = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1
      ? 'https://scholarships360.org/scholarships/search/'
      : `https://scholarships360.org/scholarships/search/?search=&sidebar_academic_interest=&sidebar_state=&sidebar_grade=&sidebar_background=&sidebar_sort=relevant&current_page=${page}`;
    
    // Use Puppeteer for Scholarships360 (JavaScript-rendered pagination)
    let result = await fetchWithPuppeteer(url);
    let html: string | null = null;
    let finalUrl: string = url;
    
    // If Puppeteer fails, fall back to regular fetch
    if (!result || result.html.length < 100) {
      console.log(`Scholarships360: Puppeteer failed for page ${page}, trying regular fetch`);
      result = await fetchWithRetry(url);
    }
    
    if (result) {
      html = result.html;
      finalUrl = result.finalUrl;
    }
    
    // Check for redirect detection
    if (html && checkRedirect(url, finalUrl, page, 'Scholarships360')) {
      console.warn(`Scholarships360: Stopping due to redirect detection on page ${page}`);
      break;
    }
    
    if (!html) {
      console.log(`Scholarships360: Failed to fetch page ${page}`);
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
        break;
      }
      await randomDelay();
      continue;
    }

    const $ = cheerio.load(html);
    let foundOnPage = 0;
    let newOnPage = 0;

    // Look for scholarship links
    $('a[href*="/scholarships/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (
        href &&
        href.includes('/scholarships/') &&
        !href.endsWith('/scholarships/') &&
        !href.includes('/category/') &&
        !href.includes('/tag/') &&
        !href.includes('/page/') &&
        !href.includes('/type/') &&
        !href.includes('/state/') &&
        !href.match(/\/[a-z-]+-scholarships\/?$/) // Skip index pages like "nursing-scholarships"
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

        // Use enhanced validation
        if (!isValidScholarshipUrl(fullUrl, name)) {
          return;
        }

        if (!scholarships.some((s) => s.url === fullUrl) && name.length > 2) {
          scholarships.push({
            url: fullUrl,
            name: name.substring(0, 100),
            source: 'Scholarships360',
          });
          foundOnPage++;
          
          if (!existingUrls.has(fullUrl)) {
            newOnPage++;
          }
        }
      }
    });

    // Content verification: Log first 3 scholarship names found on this page
    const pageScholarships = scholarships.slice(-foundOnPage); // Get scholarships added on this page
    if (pageScholarships.length > 0) {
      const firstThree = pageScholarships.slice(0, 3).map(s => s.name);
      console.log(`Scholarships360 page ${page}: First 3 scholarships: ${firstThree.join(', ')}`);
    }

    totalPagesScanned++;
    console.log(`Scholarships360 page ${page}: Found ${foundOnPage} scholarships (${newOnPage} new, ${foundOnPage - newOnPage} duplicates)`);
    
    // If we found no scholarships at all on this page, track consecutive empty pages
    if (foundOnPage === 0) {
      consecutiveEmptyPages++;
      console.log(`Scholarships360: Page ${page} was empty (${consecutiveEmptyPages}/${maxConsecutiveEmptyPages} consecutive empty pages)`);
      // Only stop if we've hit multiple consecutive empty pages
      if (consecutiveEmptyPages >= maxConsecutiveEmptyPages) {
        console.log(`Scholarships360: Stopping after ${maxConsecutiveEmptyPages} consecutive empty pages (scanned ${totalPagesScanned} pages total)`);
        break;
      }
      // Reset duplicate counter when we hit an empty page
      consecutiveDuplicatePages = 0;
      await randomDelay();
      continue; // Skip to next page
    } else {
      consecutiveEmptyPages = 0; // Reset empty page counter when we find scholarships
    }
    
    if (newOnPage === 0) {
      consecutiveDuplicatePages++;
      console.log(`Scholarships360: Page ${page} had only duplicates (${consecutiveDuplicatePages}/${maxConsecutiveDuplicatePages} consecutive, ${totalPagesScanned} total pages scanned)`);
      // Only stop if we've scanned minimum pages AND hit the consecutive duplicate threshold
      if (consecutiveDuplicatePages >= maxConsecutiveDuplicatePages && totalPagesScanned >= minPagesToScan) {
        console.log(`Scholarships360: Stopping after ${maxConsecutiveDuplicatePages} consecutive pages with no new scholarships (scanned ${totalPagesScanned} pages total, found ${scholarships.length} scholarships, ${totalNewFound} new)`);
        break;
      } else if (consecutiveDuplicatePages >= maxConsecutiveDuplicatePages) {
        console.log(`Scholarships360: Found ${consecutiveDuplicatePages} consecutive duplicate pages, but only scanned ${totalPagesScanned}/${minPagesToScan} minimum pages. Continuing...`);
      }
    } else {
      totalNewFound += newOnPage;
      consecutiveDuplicatePages = 0;
      console.log(`Scholarships360: Found ${newOnPage} NEW scholarships on page ${page} (${totalNewFound} total new so far)`);
    }

    await randomDelay();
  }

  console.log(`Scholarships360 scrape complete: Scanned ${totalPagesScanned} pages, found ${scholarships.length} total scholarships (${totalNewFound} new, ${scholarships.length - totalNewFound} duplicates)`);
  return scholarships;
}

// Scraper for Scholarships.com with pagination
async function scrapeScholarshipsCom(maxPages: number = 10, existingUrls: Set<string> = new Set()): Promise<DiscoveredScholarship[]> {
  const scholarships: DiscoveredScholarship[] = [];
  let consecutiveDuplicatePages = 0;
  const maxConsecutiveDuplicatePages = 10; // Keep searching through 10 pages of duplicates before giving up
  let totalNewFound = 0;

  for (let page = 1; page <= maxPages; page++) {
    // Scholarships.com uses a different pagination - let's try their actual directory
    const url = page === 1
      ? 'https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory'
      : `https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory?page=${page}`;
    
    const result = await fetchWithRetry(url);
    if (!result) {
      console.log(`Scholarships.com: Failed to fetch page ${page}`);
      break;
    }
    
    const html = result.html;
    const finalUrl = result.finalUrl;
    
    // Check for redirect detection
    if (checkRedirect(url, finalUrl, page, 'Scholarships.com')) {
      console.warn(`Scholarships.com: Stopping due to redirect detection on page ${page}`);
      break;
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
          scholarships.push({
            url: fullUrl,
            name: name.substring(0, 100),
            source: 'Scholarships.com',
          });
          foundOnPage++;
          
          if (!existingUrls.has(fullUrl)) {
            newOnPage++;
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
      break;
    }
    
    if (newOnPage === 0) {
      consecutiveDuplicatePages++;
      console.log(`Scholarships.com: Page ${page} had only duplicates (${consecutiveDuplicatePages}/${maxConsecutiveDuplicatePages} consecutive)`);
      if (consecutiveDuplicatePages >= maxConsecutiveDuplicatePages) {
        console.log(`Scholarships.com: Stopping after ${maxConsecutiveDuplicatePages} consecutive pages with no new scholarships`);
        break;
      }
    } else {
      totalNewFound += newOnPage;
      consecutiveDuplicatePages = 0;
      console.log(`Scholarships.com: Found ${newOnPage} NEW scholarships on page ${page} (${totalNewFound} total new so far)`);
    }

    await randomDelay();
  }

  return scholarships;
}

export async function discoverScholarships(
  userProfile: UserProfile,
  sourceIds: string[] = ['bold', 'scholarships360', 'scholarshipscom'],
  maxPagesPerSource: number = 10
): Promise<DiscoveryResult> {
  const allScholarships: DiscoveredScholarship[] = [];
  const errors: string[] = [];
  const sourceStats: SourceStats[] = [];

  // Get existing URLs from database to prevent duplicates
  const existingUrls = await getAllScholarshipUrls();
  const existingUrlSet = new Set(existingUrls);

  // Get custom sources from database
  let customSources: ScholarshipSource[] = [];
  try {
    customSources = await getCustomSources();
  } catch (err) {
    console.error('Failed to load custom sources:', err);
  }

  // Combine built-in and custom sources
  const allSources = [...scholarshipSources, ...customSources];

  // Filter to enabled sources
  const enabledSources = allSources.filter(
    (s) => s.enabled && sourceIds.includes(s.id)
  );

  for (const source of enabledSources) {
    const stats: SourceStats = {
      sourceId: source.id,
      sourceName: source.name,
      found: 0,
      new: 0,
      duplicates: 0,
      status: 'success',
    };

    try {
      console.log(`Scraping ${source.name} (up to ${maxPagesPerSource} pages)...`);
      let scholarships: DiscoveredScholarship[] = [];

      switch (source.id) {
        case 'bold':
          scholarships = await scrapeBold(maxPagesPerSource, existingUrlSet);
          break;
        case 'scholarships360':
          scholarships = await scrapeScholarships360(maxPagesPerSource, existingUrlSet);
          break;
        case 'scholarshipscom':
          scholarships = await scrapeScholarshipsCom(maxPagesPerSource, existingUrlSet);
          break;
        default:
          // Custom source - use generic scraper
          if (source.id.startsWith('custom-')) {
            scholarships = await scrapeGenericSource(source, maxPagesPerSource, existingUrlSet);
          }
          break;
      }

      stats.found = scholarships.length;
      
      // Count new vs duplicates for this source
      const newFromSource = scholarships.filter(s => !existingUrlSet.has(s.url));
      stats.new = newFromSource.length;
      stats.duplicates = scholarships.length - newFromSource.length;
      
      if (scholarships.length === 0) {
        stats.status = 'failed';
        stats.error = 'No scholarships found (site may be blocking or changed structure)';
      } else if (stats.new === 0) {
        stats.status = 'partial';
        stats.error = 'All found scholarships were duplicates';
      }

      allScholarships.push(...scholarships);
      console.log(`Found ${scholarships.length} scholarships from ${source.name} (${stats.new} new, ${stats.duplicates} duplicates)`);

      // Rate limiting between sources
      await delay(1000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      stats.status = 'failed';
      stats.error = errorMsg;
      errors.push(`Failed to scrape ${source.name}: ${errorMsg}`);
      console.error(`Failed to scrape ${source.name}:`, error);
    }

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

  console.log(`Total found: ${uniqueScholarships.length}, New: ${newScholarships.length}, Duplicates: ${duplicateCount}`);

  return {
    success: uniqueScholarships.length > 0 || errors.length === 0,
    scholarships: newScholarships,
    errors,
    newCount: newScholarships.length,
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
  return scholarshipSources.filter((s) => s.enabled);
}
