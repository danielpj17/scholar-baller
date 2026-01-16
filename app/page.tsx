'use client';

import { useState } from 'react';
import { Scholarship, EligibilityStatus } from '@/types';
import { mockScholarships } from '@/data/mockData';
import { userProfile } from '@/constants/profile';
import { analyzeScholarship } from '@/app/actions/analyzeScholarship';
import { discoverScholarships, DiscoveredScholarship } from '@/app/actions/discoverScholarships';
import { scholarshipSources } from '@/constants/sources';

export default function Dashboard() {
  const [scholarships, setScholarships] = useState<Scholarship[]>(mockScholarships);
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<string>('');
  const [selectedSources, setSelectedSources] = useState<string[]>(
    scholarshipSources.filter((s) => s.enabled).map((s) => s.id)
  );
  const [showSourceSelector, setShowSourceSelector] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await analyzeScholarship(url, userProfile);

      if (result.success) {
        setScholarships((prev) => [result.scholarship, ...prev]);
        setUrl('');
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

  const handleDiscover = async () => {
    if (selectedSources.length === 0) {
      setError('Please select at least one source');
      return;
    }

    setIsDiscovering(true);
    setError(null);
    setDiscoveryProgress('Searching scholarship sources...');

    try {
      // Step 1: Discover scholarship URLs
      const discoveryResult = await discoverScholarships(userProfile, selectedSources, 10);

      if (!discoveryResult.success && discoveryResult.scholarships.length === 0) {
        setError(discoveryResult.errors.join('; ') || 'No scholarships found');
        setIsDiscovering(false);
        return;
      }

      const discovered = discoveryResult.scholarships;
      setDiscoveryProgress(`Found ${discovered.length} scholarships. Analyzing...`);

      // Step 2: Analyze each discovered scholarship
      for (let i = 0; i < discovered.length; i++) {
        const scholarship = discovered[i];
        setDiscoveryProgress(
          `Analyzing ${i + 1}/${discovered.length}: ${scholarship.name.substring(0, 40)}...`
        );

        try {
          const result = await analyzeScholarship(scholarship.url, userProfile);

          if (result.success) {
            setScholarships((prev) => {
              // Avoid duplicates by URL
              if (prev.some((s) => s.url === result.scholarship.url)) {
                return prev;
              }
              return [result.scholarship, ...prev];
            });
          }
        } catch (err) {
          console.error(`Failed to analyze ${scholarship.url}:`, err);
        }

        // Small delay between analyses to avoid rate limiting
        if (i < discovered.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      setDiscoveryProgress('');
      if (discoveryResult.errors.length > 0) {
        setError(`Completed with warnings: ${discoveryResult.errors.join('; ')}`);
      }
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
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <span className="px-3 py-1 rounded-full" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                {scholarships.length} scholarship{scholarships.length !== 1 ? 's' : ''}
              </span>
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
                <div className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
                  Select scholarship sources to search:
                </div>
                <div className="flex flex-wrap gap-3">
                  {scholarshipSources
                    .filter((source) => source.enabled)
                    .map((source) => (
                      <label
                        key={source.id}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all hover:scale-[1.02]"
                        style={{
                          background: selectedSources.includes(source.id)
                            ? 'var(--accent-bg)'
                            : 'var(--background)',
                          border: `1px solid ${selectedSources.includes(source.id) ? 'var(--accent)' : 'var(--border)'}`,
                          color: selectedSources.includes(source.id)
                            ? 'var(--accent)'
                            : 'var(--foreground)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSources.includes(source.id)}
                          onChange={() => toggleSource(source.id)}
                          className="w-4 h-4 rounded accent-current"
                        />
                        <span className="text-sm font-medium">{source.name}</span>
                      </label>
                    ))}
                </div>
                <div className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                  Tip: The search may take 30-60 seconds as we scan each source and analyze found scholarships.
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
              Paste a scholarship URL above to get started
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
