'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Scholarship, EligibilityStatus, GenerationPreference } from '@/types';
import { useProfile } from '@/contexts/ProfileContext';
import { analyzeScholarship } from '@/app/actions/analyzeScholarship';
import { discoverScholarships, SourceStats } from '@/app/actions/discoverScholarships';
import { ScholarshipSource } from '@/constants/sources';
import { insertScholarship, getScholarshipCounts, getAllScholarships, updateGenerationPreference } from '@/app/actions/scholarshipActions';
import { getAllSources, addCustomSource, deleteCustomSource } from '@/app/actions/sourceActions';

export default function Dashboard() {
  const { profile, addQuestions, unansweredCount } = useProfile();
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ total: 0, saved: 0, applied: 0 });
  
  // Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<string>('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [sourceStats, setSourceStats] = useState<SourceStats[]>([]);
  
  // Custom source state
  const [allSources, setAllSources] = useState<ScholarshipSource[]>([]);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [addingSource, setAddingSource] = useState(false);

  // Load scholarships, counts, and sources on mount
  useEffect(() => {
    loadScholarships();
    loadCounts();
    loadSources();
  }, []);

  const loadSources = async () => {
    const sources = await getAllSources();
    setAllSources(sources);
    // Update selected sources to include any new custom sources
    setSelectedSources(sources.filter((s) => s.enabled).map((s) => s.id));
  };

  const loadScholarships = async () => {
    const data = await getAllScholarships();
    setScholarships(data.slice(0, 10)); // Show top 10 on dashboard
  };

  const loadCounts = async () => {
    const data = await getScholarshipCounts();
    setCounts(data);
  };

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await analyzeScholarship(url, profile);

      if (result.success) {
        // Save to database
        await insertScholarship(result.scholarship);
        
        // Reload scholarships and counts
        await loadScholarships();
        await loadCounts();
        
        setUrl('');
        
        // Store any questions that need answering
        if (result.scholarship.questionsForUser.length > 0) {
          addQuestions(
            result.scholarship.id,
            result.scholarship.name,
            result.scholarship.questionsForUser
          );
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze scholarship');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEssayChange = (id: string, newEssay: string) => {
    setScholarships((prev) =>
      prev.map((s) => (s.id === id ? { ...s, draftedEssay: newEssay } : s))
    );
  };

  const handleCopyEssay = async (id: string, essay: string) => {
    try {
      await navigator.clipboard.writeText(essay);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      console.error('Failed to copy essay');
    }
  };

  const handleGenerationPreferenceChange = async (id: string, preference: GenerationPreference) => {
    // Update local state immediately for responsiveness
    setScholarships((prev) =>
      prev.map((s) => (s.id === id ? { ...s, generationPreference: preference } : s))
    );
    // Persist to database
    await updateGenerationPreference(id, preference);
  };

  const handleAddSource = async () => {
    if (!newSourceName.trim() || !newSourceUrl.trim()) {
      setError('Please enter both name and URL');
      return;
    }

    setAddingSource(true);
    setError(null);

    try {
      // Parse the URL to get base URL
      const url = new URL(newSourceUrl);
      const baseUrl = `${url.protocol}//${url.hostname}`;
      
      const result = await addCustomSource({
        name: newSourceName.trim(),
        baseUrl,
        searchUrl: newSourceUrl.trim(),
      });

      if (result.success) {
        await loadSources();
        setNewSourceName('');
        setNewSourceUrl('');
        setShowAddSource(false);
      } else {
        setError(result.error || 'Failed to add source');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid URL');
    } finally {
      setAddingSource(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    const result = await deleteCustomSource(id);
    if (result.success) {
      await loadSources();
    } else {
      setError(result.error || 'Failed to delete source');
    }
  };

  const handleDiscover = async () => {
    if (selectedSources.length === 0) {
      setError('Please select at least one source');
      return;
    }

    setIsDiscovering(true);
    setError(null);
    setSourceStats([]);
    setDiscoveryProgress('Searching scholarship sources (scanning up to 10 pages per source)...');

    try {
      // Step 1: Discover scholarship URLs (with pagination and duplicate checking)
      // Limited to 10 pages per source for Bold.org and Scholarships360
      // Target 15 new scholarships with interleaved page-by-page scraping
      const discoveryResult = await discoverScholarships(profile, selectedSources, 10, 15);

      // Store source stats for display
      setSourceStats(discoveryResult.sourceStats);

      if (!discoveryResult.success && discoveryResult.scholarships.length === 0) {
        setError(discoveryResult.errors.join('; ') || 'No scholarships found');
        setIsDiscovering(false);
        setDiscoveryProgress('');
        return;
      }

      const discovered = discoveryResult.scholarships;
      
      // Check if scholarships were already analyzed during discovery
      let analyzedCount = 0;
      const errors: string[] = [];
      
      // #region agent log
      if (typeof window !== 'undefined') {
        fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:handleDiscover',message:'Checking analyzedScholarships',data:{hasAnalyzedScholarships:!!discoveryResult.analyzedScholarships,isArray:Array.isArray(discoveryResult.analyzedScholarships),length:discoveryResult.analyzedScholarships?.length || 0,isUndefined:discoveryResult.analyzedScholarships === undefined,willUseIntegrated:discoveryResult.analyzedScholarships && discoveryResult.analyzedScholarships.length > 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      }
      // #endregion
      
      if (discoveryResult.analyzedScholarships && discoveryResult.analyzedScholarships.length > 0) {
        // Scholarships were already analyzed during discovery
        setDiscoveryProgress(
          `Found ${discovered.length} new scholarships. ${discoveryResult.analyzedScholarships.length} were already analyzed. Saving to database...`
        );
        
        // Save analyzed scholarships to database
        for (const scholarship of discoveryResult.analyzedScholarships) {
          try {
            const insertResult = await insertScholarship(scholarship);
            
            if (insertResult.success) {
              analyzedCount++;
              
              // Store any questions that need answering
              if (scholarship.questionsForUser.length > 0) {
                addQuestions(
                  scholarship.id,
                  scholarship.name,
                  scholarship.questionsForUser
                );
              }
            } else {
              errors.push(`${scholarship.name}: Failed to save to database`);
              console.error(`Failed to insert ${scholarship.url}`);
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`${scholarship.name}: ${errorMsg}`);
            console.error(`Failed to save ${scholarship.url}:`, err);
          }
        }
      } else {
        // Fallback: Analyze discovered scholarships (if not already analyzed)
        // #region agent log
        if (typeof window !== 'undefined') {
          fetch('http://127.0.0.1:7245/ingest/ab30dae8-343a-41dc-b78c-5ced78e59758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:handleDiscover',message:'Using fallback manual analysis',data:{discoveredCount:discovered.length,reason:!discoveryResult.analyzedScholarships ? 'analyzedScholarships is undefined' : 'analyzedScholarships is empty array'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion
        setDiscoveryProgress(
          `Found ${discovered.length} new scholarships (${discoveryResult.duplicateCount} duplicates skipped). Analyzing...`
        );

        // Step 2: Analyze each discovered scholarship with proper rate limiting
        // Limit to 15 scholarships per run to stay within Gemini API free tier (5 RPM)
        // At 13 seconds per request, 15 requests = ~3.25 minutes, well within limits
        const MAX_ANALYSIS_PER_RUN = 15;
        const scholarshipsToAnalyze = discovered.slice(0, MAX_ANALYSIS_PER_RUN);
        const skippedCount = discovered.length - scholarshipsToAnalyze.length;
        let quotaExceeded = false;
        
        if (skippedCount > 0) {
          setDiscoveryProgress(
            `Found ${discovered.length} scholarships. Analyzing first ${MAX_ANALYSIS_PER_RUN} to stay within API quota (${skippedCount} will be analyzed on next run)...`
          );
        } else {
          setDiscoveryProgress(
            `Found ${discovered.length} scholarships. Analyzing (limited to ${MAX_ANALYSIS_PER_RUN} per run to stay within API quota)...`
          );
        }
        
        // Rate limit: 13 seconds between requests for Gemini 2.5 Pro (5 RPM = 1 per 12 seconds)
        // Using 13 seconds to be safe
        const RATE_LIMIT_DELAY_MS = 13000;
        
        for (let i = 0; i < scholarshipsToAnalyze.length; i++) {
          const scholarship = scholarshipsToAnalyze[i];
          setDiscoveryProgress(
            `Analyzing ${i + 1}/${scholarshipsToAnalyze.length}: ${scholarship.name.substring(0, 40)}... (${analyzedCount} saved, ${errors.length} failed)`
          );

          try {
            const result = await analyzeScholarship(scholarship.url, profile);

            if (result.success) {
              // Save to database
              const insertResult = await insertScholarship(result.scholarship);
              
              if (insertResult.success) {
                analyzedCount++;
                
                // Store any questions that need answering
                if (result.scholarship.questionsForUser.length > 0) {
                  addQuestions(
                    result.scholarship.id,
                    result.scholarship.name,
                    result.scholarship.questionsForUser
                  );
                }
              } else {
                errors.push(`${scholarship.name}: Failed to save to database`);
                console.error(`Failed to insert ${scholarship.url}`);
              }
            } else {
              errors.push(`${scholarship.name}: ${result.error}`);
              console.error(`Analysis failed for ${scholarship.url}: ${result.error}`);
              
              // If it's a quota error, stop processing to avoid more failures
              const errorLower = result.error.toLowerCase();
              const isQuotaError = errorLower.includes('quota') || 
                                  result.error.includes('429') || 
                                  errorLower.includes('quota exceeded') ||
                                  errorLower.includes('rate limit') ||
                                  errorLower.includes('too many requests');
              
              if (isQuotaError) {
                console.warn('API quota exceeded. Stopping analysis to avoid further errors.');
                quotaExceeded = true;
                break;
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`${scholarship.name}: ${errorMsg}`);
            console.error(`Failed to analyze ${scholarship.url}:`, err);
            
            // If it's a quota error, stop processing
            const errorLower = errorMsg.toLowerCase();
            const isQuotaError = errorLower.includes('quota') || 
                                errorMsg.includes('429') || 
                                errorLower.includes('quota exceeded') ||
                                errorLower.includes('rate limit') ||
                                errorLower.includes('too many requests');
            
            if (isQuotaError) {
              console.warn('API quota exceeded. Stopping analysis to avoid further errors.');
              quotaExceeded = true;
              break;
            }
          }

          // Rate limiting: Wait 13 seconds between API calls to stay within 5 RPM limit
          // Only delay if processing more than 15 scholarships (for larger batches)
          if (i < scholarshipsToAnalyze.length - 1 && scholarshipsToAnalyze.length > 15) {
            setDiscoveryProgress(
              `Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before next analysis (rate limiting)...`
            );
            await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
          }
        }
      }

      // Reload scholarships and counts from database
      await loadScholarships();
      await loadCounts();

      setDiscoveryProgress('');
      
      // Show detailed results
      let resultMsg = '';
      if (analyzedCount > 0) {
        resultMsg = `✓ Successfully analyzed and saved ${analyzedCount} new scholarships!`;
      } else {
        resultMsg = `No scholarships were analyzed.`;
      }
      
      if (errors.length > 0) {
        resultMsg += `\n\n⚠️ ${errors.length} failed to analyze:\n`;
        // Show first 5 errors in detail
        resultMsg += errors.slice(0, 5).map(e => `• ${e}`).join('\n');
        if (errors.length > 5) {
          resultMsg += `\n• ... and ${errors.length - 5} more`;
        }
      }
      
      if (discoveryResult.errors.length > 0) {
        resultMsg += `\n\n⚠️ Source errors: ${discoveryResult.errors.join('; ')}`;
      }
      
      setError(resultMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover scholarships');
    } finally {
      setIsDiscovering(false);
      setDiscoveryProgress('');
    }
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSources((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const getRowClass = (scholarship: Scholarship) => {
    if (scholarship.eligibilityStatus === EligibilityStatus.Ineligible) {
      return 'row-ineligible';
    }
    if (scholarship.fitScore > 80 && scholarship.eligibilityStatus === EligibilityStatus.Eligible) {
      return 'row-eligible';
    }
    if (scholarship.eligibilityStatus === EligibilityStatus.Unsure) {
      return 'row-unsure';
    }
    return '';
  };

  const getFitScoreClass = (score: number) => {
    if (score >= 80) return 'fit-score-high';
    if (score >= 50) return 'fit-score-medium';
    return 'fit-score-low';
  };

  const getStatusClass = (status: EligibilityStatus) => {
    switch (status) {
      case EligibilityStatus.Eligible:
        return 'status-eligible';
      case EligibilityStatus.Ineligible:
        return 'status-ineligible';
      default:
        return 'status-unsure';
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                }}
              >
                S
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                  Scholar Baller
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Scholarship Intelligence Dashboard
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{counts.total}</span> total
                <span style={{ color: 'var(--border)' }}>|</span>
                <span className="font-semibold" style={{ color: 'var(--warning)' }}>{counts.saved}</span> saved
                <span style={{ color: 'var(--border)' }}>|</span>
                <span className="font-semibold" style={{ color: 'var(--success)' }}>{counts.applied}</span> applied
              </div>
              <Link
                href="/scholarships"
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
              >
                View All Scholarships
              </Link>
              <Link
                href="/settings"
                className="relative p-2.5 rounded-xl transition-all hover:scale-[1.05]"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)' }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                {unansweredCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white"
                    style={{ background: 'var(--warning)' }}
                  >
                    {unansweredCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Input Section */}
      <div
        className="border-b"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleAnalyze()}
                placeholder="Paste a scholarship URL to analyze..."
                className="w-full h-12 px-4 rounded-xl text-sm transition-all"
                style={{
                  background: 'var(--background)',
                  border: '2px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                disabled={isLoading}
              />
              {url && (
                <button
                  onClick={() => setUrl('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  style={{ color: 'var(--muted)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={handleAnalyze}
              disabled={isLoading || isDiscovering}
              className="h-12 px-8 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: isLoading
                  ? 'var(--muted)'
                  : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                boxShadow: isLoading ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.3)',
              }}
            >
              {isLoading ? (
                <>
                  <div className="spinner" />
                  Analyzing...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  Analyze URL
                </>
              )}
            </button>
          </div>

          {/* Auto-Discover Section */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDiscover}
                    disabled={isDiscovering || isLoading || selectedSources.length === 0}
                    className="h-12 px-6 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: isDiscovering
                        ? 'var(--muted)'
                        : 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                      boxShadow: isDiscovering ? 'none' : '0 4px 14px rgba(5, 150, 105, 0.3)',
                    }}
                  >
                    {isDiscovering ? (
                      <>
                        <div className="spinner" />
                        Discovering...
                      </>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 11-6.219-8.56" />
                          <path d="M12 3v9l4 2" />
                        </svg>
                        Find Scholarships
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setShowSourceSelector(!showSourceSelector)}
                    className="h-12 px-4 rounded-xl font-medium transition-all flex items-center gap-2 hover:scale-[1.02]"
                    style={{
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v18M3 12h18" />
                    </svg>
                    Sources ({selectedSources.length})
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{
                        transform: showSourceSelector ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>

                {discoveryProgress && (
                  <div
                    className="mt-3 flex items-center gap-2 text-sm"
                    style={{ color: 'var(--accent)' }}
                  >
                    <div className="spinner" style={{ width: '14px', height: '14px' }} />
                    {discoveryProgress}
                  </div>
                )}
              </div>
            </div>

            {/* Source Selector */}
            {showSourceSelector && (
              <div
                className="mt-4 p-4 rounded-xl animate-fade-in"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Select scholarship sources to search:
                  </div>
                  <button
                    onClick={() => setShowAddSource(!showAddSource)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02]"
                    style={{
                      background: 'var(--accent-bg)',
                      border: '1px solid var(--accent)',
                      color: 'var(--accent)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Source
                  </button>
                </div>

                {/* Add Source Form */}
                {showAddSource && (
                  <div
                    className="mb-4 p-3 rounded-lg animate-fade-in"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        placeholder="Source name (e.g., MyScholarships)"
                        className="flex-1 px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      />
                      <input
                        type="url"
                        value={newSourceUrl}
                        onChange={(e) => setNewSourceUrl(e.target.value)}
                        placeholder="Scholarship listing URL"
                        className="flex-[2] px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      />
                      <button
                        onClick={handleAddSource}
                        disabled={addingSource}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                        style={{ background: 'var(--accent)' }}
                      >
                        {addingSource ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                    <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                      Enter the URL of a page that lists multiple scholarships. The scraper will try to find scholarship links on that page.
                    </div>
                  </div>
                )}

                {/* Source List */}
                <div className="flex flex-wrap gap-3">
                  {allSources
                    .filter((source) => source.enabled)
                    .map((source) => {
                      const stats = sourceStats.find(s => s.sourceId === source.id);
                      const isCustom = source.id.startsWith('custom-');
                      
                      return (
                        <div
                          key={source.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
                          style={{
                            background: selectedSources.includes(source.id)
                              ? 'var(--accent-bg)'
                              : 'var(--background)',
                            border: `1px solid ${selectedSources.includes(source.id) ? 'var(--accent)' : 'var(--border)'}`,
                          }}
                        >
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSources.includes(source.id)}
                              onChange={() => toggleSource(source.id)}
                              className="w-4 h-4 rounded accent-current"
                            />
                            <span
                              className="text-sm font-medium"
                              style={{ color: selectedSources.includes(source.id) ? 'var(--accent)' : 'var(--foreground)' }}
                            >
                              {source.name}
                            </span>
                          </label>
                          
                          {/* Show stats if available */}
                          {stats && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                background: stats.status === 'success' 
                                  ? 'var(--success-bg)' 
                                  : stats.status === 'partial' 
                                    ? 'var(--warning-bg)' 
                                    : 'var(--danger-bg)',
                                color: stats.status === 'success' 
                                  ? 'var(--success)' 
                                  : stats.status === 'partial' 
                                    ? 'var(--warning)' 
                                    : 'var(--danger)',
                              }}
                              title={stats.error || `Found ${stats.found}, New: ${stats.new}, Duplicates: ${stats.duplicates}`}
                            >
                              {stats.status === 'failed' ? '0' : stats.new} new
                            </span>
                          )}
                          
                          {/* Delete button for custom sources */}
                          {isCustom && (
                            <button
                              onClick={() => handleDeleteSource(source.id)}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                              title="Delete source"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--danger)' }}>
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Source Stats Summary */}
                {sourceStats.length > 0 && (
                  <div
                    className="mt-4 p-3 rounded-lg"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  >
                    <div className="text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                      Source Performance:
                    </div>
                    <div className="space-y-1">
                      {sourceStats.map((stat) => (
                        <div key={stat.sourceId} className="flex items-center justify-between text-xs">
                          <span style={{ color: 'var(--foreground)' }}>{stat.sourceName}</span>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--success)' }}>{stat.new} new</span>
                            <span style={{ color: 'var(--muted)' }}>|</span>
                            <span style={{ color: 'var(--warning)' }}>{stat.duplicates} dup</span>
                            <span style={{ color: 'var(--muted)' }}>|</span>
                            <span
                              style={{
                                color: stat.status === 'success' 
                                  ? 'var(--success)' 
                                  : stat.status === 'partial' 
                                    ? 'var(--warning)' 
                                    : 'var(--danger)',
                              }}
                            >
                              {stat.status === 'success' ? '✓' : stat.status === 'partial' ? '⚠' : '✗'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                  Tip: Scans up to 20 pages per source using Puppeteer (handles JavaScript-rendered content). Will continue through up to 20 consecutive pages of duplicates and up to 3 consecutive empty pages to find new scholarships. May take 5-15 minutes depending on sources selected.
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              className="mt-4 p-4 rounded-xl flex items-center gap-3 animate-fade-in"
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Table Section */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {scholarships.length === 0 ? (
          <div
            className="text-center py-20 rounded-2xl"
            style={{
              background: 'var(--surface)',
              border: '2px dashed var(--border)',
            }}
          >
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--background)' }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: 'var(--muted)' }}
              >
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              No scholarships yet
            </h3>
            <p style={{ color: 'var(--muted)' }}>
              Click "Find Scholarships" above to automatically discover and analyze scholarships, or paste a specific URL
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="scholarship-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Score</th>
                    <th style={{ width: '100px' }}>Status</th>
                    <th style={{ minWidth: '200px' }}>Scholarship</th>
                    <th style={{ width: '120px' }}>Deadline</th>
                    <th style={{ width: '100px' }}>Award</th>
                    <th style={{ minWidth: '250px' }}>AI Analysis</th>
                    <th style={{ minWidth: '300px' }}>Essay Draft</th>
                  </tr>
                </thead>
                <tbody>
                  {scholarships.map((scholarship, index) => (
                    <tr
                      key={scholarship.id}
                      className={`${getRowClass(scholarship)} animate-fade-in`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Fit Score */}
                      <td>
                        <div className={`fit-score ${getFitScoreClass(scholarship.fitScore)}`}>
                          {scholarship.fitScore}
                        </div>
                      </td>

                      {/* Eligibility Status */}
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={`status-badge ${getStatusClass(scholarship.eligibilityStatus)}`}>
                            {scholarship.eligibilityStatus === EligibilityStatus.Eligible && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                            {scholarship.eligibilityStatus === EligibilityStatus.Ineligible && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            )}
                            {scholarship.eligibilityStatus === EligibilityStatus.Unsure && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M12 8v4M12 16h.01" />
                              </svg>
                            )}
                            {scholarship.eligibilityStatus}
                          </span>

                          {/* Questions Warning */}
                          {scholarship.questionsForUser.length > 0 && (
                            <div className="tooltip-container">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center cursor-help"
                                style={{
                                  background: 'var(--warning-bg)',
                                  border: '1px solid var(--warning-border)',
                                  color: 'var(--warning)',
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 8v4M12 16h.01" />
                                </svg>
                              </div>
                              <div className="tooltip-content">
                                <div className="font-semibold mb-2" style={{ color: 'var(--warning)' }}>
                                  Clarifications Needed:
                                </div>
                                <ul className="space-y-1">
                                  {scholarship.questionsForUser.map((q, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm">
                                      <span style={{ color: 'var(--warning)' }}>•</span>
                                      <span style={{ color: 'var(--foreground)' }}>{q}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Scholarship Name & URL */}
                      <td>
                        <a
                          href={scholarship.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold hover:underline block mb-1"
                          style={{ color: 'var(--accent)' }}
                        >
                          {scholarship.name}
                        </a>
                        <div
                          className="text-xs truncate max-w-[200px]"
                          style={{ color: 'var(--muted)' }}
                          title={scholarship.url}
                        >
                          {scholarship.url}
                        </div>
                      </td>

                      {/* Deadline */}
                      <td>
                        <div className="font-medium" style={{ color: 'var(--foreground)' }}>
                          {scholarship.deadline}
                        </div>
                      </td>

                      {/* Award */}
                      <td>
                        <div
                          className="font-bold text-lg"
                          style={{ color: 'var(--success)' }}
                        >
                          {scholarship.awardAmount}
                        </div>
                      </td>

                      {/* AI Analysis */}
                      <td>
                        <div
                          className="text-sm leading-relaxed"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {scholarship.aiAnalysis}
                        </div>
                        {scholarship.essayPrompt && (
                          <details className="mt-3">
                            <summary
                              className="text-xs cursor-pointer hover:underline"
                              style={{ color: 'var(--muted)' }}
                            >
                              View Essay Prompt
                            </summary>
                            <div
                              className="mt-2 p-3 rounded-lg text-xs"
                              style={{
                                background: 'var(--background)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {scholarship.essayPrompt}
                            </div>
                          </details>
                        )}
                      </td>

                      {/* Essay Draft */}
                      <td>
                        <div className="space-y-2">
                          {/* AI Policy Badge & Generation Mode Dropdown */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* AI Policy Badge */}
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                              style={{
                                background: scholarship.aiPolicy === 'Prohibited' 
                                  ? 'var(--danger-bg)' 
                                  : scholarship.aiPolicy === 'Safe' 
                                    ? 'var(--success-bg)' 
                                    : 'var(--warning-bg)',
                                border: `1px solid ${
                                  scholarship.aiPolicy === 'Prohibited' 
                                    ? 'var(--danger-border)' 
                                    : scholarship.aiPolicy === 'Safe' 
                                      ? 'var(--success-border)' 
                                      : 'var(--warning-border)'
                                }`,
                                color: scholarship.aiPolicy === 'Prohibited' 
                                  ? 'var(--danger)' 
                                  : scholarship.aiPolicy === 'Safe' 
                                    ? 'var(--success)' 
                                    : 'var(--warning)',
                              }}
                              title={
                                scholarship.aiPolicy === 'Prohibited'
                                  ? 'This scholarship prohibits AI-generated essays'
                                  : scholarship.aiPolicy === 'Safe'
                                    ? 'AI-generated essays appear to be allowed'
                                    : 'AI policy is unclear for this scholarship'
                              }
                            >
                              {scholarship.aiPolicy === 'Prohibited' ? '⛔' : scholarship.aiPolicy === 'Safe' ? '✅' : '❓'}
                              {scholarship.aiPolicy === 'Prohibited' ? 'AI Prohibited' : scholarship.aiPolicy === 'Safe' ? 'AI Allowed' : 'AI Unsure'}
                            </span>

                            {/* Generation Mode Dropdown */}
                            <select
                              value={scholarship.generationPreference}
                              onChange={(e) => handleGenerationPreferenceChange(scholarship.id, e.target.value as GenerationPreference)}
                              className="px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer"
                              style={{
                                background: 'var(--background)',
                                border: '1px solid var(--border)',
                                color: 'var(--foreground)',
                              }}
                            >
                              <option value="Outline">Generate Outline</option>
                              <option 
                                value="Full Draft" 
                                disabled={scholarship.aiPolicy === 'Prohibited'}
                              >
                                Generate Full Draft {scholarship.aiPolicy === 'Prohibited' ? '(Disabled)' : ''}
                              </option>
                            </select>
                          </div>

                          <textarea
                            value={scholarship.draftedEssay}
                            onChange={(e) => handleEssayChange(scholarship.id, e.target.value)}
                            className="essay-textarea"
                            placeholder="No essay drafted yet..."
                          />
                          <button
                            onClick={() => handleCopyEssay(scholarship.id, scholarship.draftedEssay)}
                            disabled={!scholarship.draftedEssay}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background: copiedId === scholarship.id ? 'var(--success-bg)' : 'var(--background)',
                              border: `1px solid ${copiedId === scholarship.id ? 'var(--success-border)' : 'var(--border)'}`,
                              color: copiedId === scholarship.id ? 'var(--success)' : 'var(--muted)',
                            }}
                          >
                            {copiedId === scholarship.id ? (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                                Copied!
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                                Copy Essay
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
