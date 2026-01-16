'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Scholarship, EligibilityStatus } from '@/types';
import { 
  getAllScholarships, 
  toggleSaved, 
  markAsApplied,
  getScholarshipCounts 
} from '@/app/actions/scholarshipActions';
import { generateEssay } from '@/app/actions/generateEssay';

export default function AllScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [generatingEssayId, setGeneratingEssayId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ total: 0, saved: 0, applied: 0 });

  useEffect(() => {
    loadScholarships();
    loadCounts();
  }, []);

  const loadScholarships = async () => {
    setIsLoading(true);
    const data = await getAllScholarships();
    setScholarships(data);
    setIsLoading(false);
  };

  const loadCounts = async () => {
    const data = await getScholarshipCounts();
    setCounts(data);
  };

  const handleToggleSaved = async (id: string) => {
    const result = await toggleSaved(id);
    if (result.success) {
      setScholarships((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, isSaved: result.isSaved } : s
        )
      );
      loadCounts();
    }
  };

  const handleMarkAsApplied = async (id: string) => {
    const result = await markAsApplied(id);
    if (result.success) {
      // Remove from current view
      setScholarships((prev) => prev.filter((s) => s.id !== id));
      loadCounts();
    }
  };

  const handleGenerateEssay = async (id: string) => {
    setGeneratingEssayId(id);
    const result = await generateEssay(id);
    
    if (result.success && result.essay) {
      setScholarships((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, draftedEssay: result.essay || '' } : s
        )
      );
    } else {
      alert(result.error || 'Failed to generate essay');
    }
    
    setGeneratingEssayId(null);
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

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <header className="sticky top-0 z-20 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="max-w-[1600px] mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                All Scholarships
              </h1>
              <Link href="/" className="text-sm" style={{ color: 'var(--accent)' }}>
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </header>
        <div className="max-w-[1600px] mx-auto px-6 py-20 text-center">
          <div className="spinner mx-auto mb-4" />
          <p style={{ color: 'var(--muted)' }}>Loading scholarships...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                All Scholarships
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {counts.total} total scholarships found
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/scholarships/saved"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                Saved ({counts.saved})
              </Link>
              <Link
                href="/scholarships/applied"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                Applied ({counts.applied})
              </Link>
              <Link
                href="/"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
              >
                ← Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {scholarships.length === 0 ? (
          <div
            className="text-center py-20 rounded-2xl"
            style={{ background: 'var(--surface)', border: '2px dashed var(--border)' }}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              No scholarships yet
            </h3>
            <p style={{ color: 'var(--muted)' }}>
              Go back to the dashboard and start scanning for scholarships
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)' }}
          >
            <div className="overflow-x-auto">
              <table className="scholarship-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Score</th>
                    <th style={{ width: '100px' }}>Status</th>
                    <th style={{ minWidth: '250px' }}>Scholarship</th>
                    <th style={{ width: '120px' }}>Deadline</th>
                    <th style={{ width: '100px' }}>Award</th>
                    <th style={{ minWidth: '250px' }}>AI Analysis</th>
                    <th style={{ minWidth: '350px' }}>Essay</th>
                    <th style={{ width: '150px' }}>Actions</th>
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

                      {/* Status */}
                      <td>
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
                      </td>

                      {/* Name & URL */}
                      <td>
                        <div className="flex items-center gap-2">
                          <a
                            href={scholarship.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold hover:underline flex-1"
                            style={{ color: 'var(--accent)' }}
                          >
                            {scholarship.name}
                          </a>
                          <a
                            href={scholarship.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            style={{ color: 'var(--muted)' }}
                            title="Open application page"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                            </svg>
                          </a>
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
                        <div className="font-bold text-lg" style={{ color: 'var(--success)' }}>
                          {scholarship.awardAmount}
                        </div>
                      </td>

                      {/* AI Analysis */}
                      <td>
                        <div className="text-sm leading-relaxed" style={{ color: 'var(--foreground)' }}>
                          {scholarship.aiAnalysis}
                        </div>
                      </td>

                      {/* Essay */}
                      <td>
                        <div className="space-y-2">
                          {scholarship.draftedEssay ? (
                            <>
                              <textarea
                                value={scholarship.draftedEssay}
                                readOnly
                                className="essay-textarea"
                                rows={4}
                              />
                              <button
                                onClick={() => handleCopyEssay(scholarship.id, scholarship.draftedEssay)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
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
                                    Copy
                                  </>
                                )}
                              </button>
                            </>
                          ) : scholarship.essayPrompt ? (
                            <button
                              onClick={() => handleGenerateEssay(scholarship.id)}
                              disabled={generatingEssayId === scholarship.id}
                              className="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                              style={{
                                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                                color: 'white',
                              }}
                            >
                              {generatingEssayId === scholarship.id ? (
                                <>
                                  <div className="spinner inline-block mr-2" style={{ width: '14px', height: '14px' }} />
                                  Generating...
                                </>
                              ) : (
                                'Generate Essay'
                              )}
                            </button>
                          ) : (
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              No essay required
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleToggleSaved(scholarship.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                            style={{
                              background: 'var(--warning-bg)',
                              border: '1px solid var(--warning-border)',
                              color: 'var(--warning)',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                            </svg>
                            Save
                          </button>
                          <button
                            onClick={() => handleMarkAsApplied(scholarship.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                            style={{
                              background: 'var(--success-bg)',
                              border: '1px solid var(--success-border)',
                              color: 'var(--success)',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                            Applied
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
