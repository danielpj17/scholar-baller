'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Scholarship, EligibilityStatus } from '@/types';
import { 
  getAppliedScholarships, 
  unmarkAsApplied,
  deleteScholarship,
  getScholarshipCounts 
} from '@/app/actions/scholarshipActions';

export default function AppliedScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ total: 0, saved: 0, applied: 0 });

  useEffect(() => {
    loadScholarships();
    loadCounts();
  }, []);

  const loadScholarships = async () => {
    setIsLoading(true);
    const data = await getAppliedScholarships();
    setScholarships(data);
    setIsLoading(false);
  };

  const loadCounts = async () => {
    const data = await getScholarshipCounts();
    setCounts(data);
  };

  const handleUnapply = async (id: string) => {
    if (confirm('Mark this scholarship as not applied?')) {
      const result = await unmarkAsApplied(id);
      if (result.success) {
        setScholarships((prev) => prev.filter((s) => s.id !== id));
        loadCounts();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Permanently delete this scholarship? This cannot be undone.')) {
      const result = await deleteScholarship(id);
      if (result.success) {
        setScholarships((prev) => prev.filter((s) => s.id !== id));
        loadCounts();
      }
    }
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
                Applied Scholarships
              </h1>
              <Link href="/scholarships" className="text-sm" style={{ color: 'var(--accent)' }}>
                ← Back to All
              </Link>
            </div>
          </div>
        </header>
        <div className="max-w-[1600px] mx-auto px-6 py-20 text-center">
          <div className="spinner mx-auto mb-4" />
          <p style={{ color: 'var(--muted)' }}>Loading applied scholarships...</p>
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
                Applied Scholarships
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {counts.applied} applications submitted
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/scholarships"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                All ({counts.total})
              </Link>
              <Link
                href="/scholarships/saved"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                Saved ({counts.saved})
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
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              No applications yet
            </h3>
            <p style={{ color: 'var(--muted)' }}>
              Mark scholarships as applied from the All Scholarships page
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
                    <th style={{ minWidth: '350px' }}>Submitted Essay</th>
                    <th style={{ width: '150px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scholarships.map((scholarship, index) => (
                    <tr
                      key={scholarship.id}
                      className="animate-fade-in"
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
                          ) : (
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              No essay on file
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleUnapply(scholarship.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                            style={{
                              background: 'var(--warning-bg)',
                              border: '1px solid var(--warning-border)',
                              color: 'var(--warning)',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 12h18M12 3l9 9-9 9" />
                            </svg>
                            Unapply
                          </button>
                          <button
                            onClick={() => handleDelete(scholarship.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                            style={{
                              background: 'var(--danger-bg)',
                              border: '1px solid var(--danger-border)',
                              color: 'var(--danger)',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                            Delete
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
