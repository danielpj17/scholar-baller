'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProfile, UnansweredQuestion } from '@/contexts/ProfileContext';
import { updateProfileWithAI } from '@/app/actions/updateProfile';
import { Experience } from '@/types';

export default function SettingsPage() {
  const {
    profile,
    setProfile,
    resetProfile,
    questions,
    answerQuestion,
    removeQuestion,
    unansweredCount,
  } = useProfile();

  const [aiInput, setAiInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['identity', 'academics', 'experiences'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleAIUpdate = async () => {
    if (!aiInput.trim()) return;

    setIsUpdating(true);
    setUpdateMessage(null);

    try {
      const result = await updateProfileWithAI(profile, aiInput);

      if (result.success && result.updatedProfile) {
        setProfile(result.updatedProfile);
        setUpdateMessage({ type: 'success', text: result.changesSummary || 'Profile updated!' });
        setAiInput('');
      } else {
        setUpdateMessage({ type: 'error', text: result.error || 'Failed to update profile' });
      }
    } catch (error) {
      setUpdateMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAnswerQuestion = (questionId: string, answer: string) => {
    answerQuestion(questionId, answer);
  };

  const unansweredQuestions = questions.filter((q) => !q.answer);
  const answeredQuestions = questions.filter((q) => q.answer);

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{ color: 'var(--muted)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                  Profile Settings
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Manage your profile and answer scholarship questions
                </p>
              </div>
            </div>
            {unansweredCount > 0 && (
              <div
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}
              >
                {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} pending
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* AI Assistant Section */}
        <section
          className="rounded-2xl p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
                <circle cx="7.5" cy="14.5" r="1.5" />
                <circle cx="16.5" cy="14.5" r="1.5" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>
                AI Profile Assistant
              </h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Describe changes in plain English and AI will update your profile
              </p>
            </div>
          </div>

          <textarea
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="e.g., Add my new internship at Microsoft starting Summer 2028, I'll be working on cloud infrastructure..."
            className="w-full h-24 p-4 rounded-xl text-sm resize-none"
            style={{
              background: 'var(--background)',
              border: '2px solid var(--border)',
              color: 'var(--foreground)',
            }}
            disabled={isUpdating}
          />

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={handleAIUpdate}
              disabled={isUpdating || !aiInput.trim()}
              className="px-6 py-2.5 rounded-xl font-semibold text-white transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: isUpdating ? 'var(--muted)' : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              }}
            >
              {isUpdating ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px' }} />
                  Processing...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
                  </svg>
                  Update with AI
                </>
              )}
            </button>

            {updateMessage && (
              <div
                className="px-4 py-2 rounded-lg text-sm animate-fade-in"
                style={{
                  background: updateMessage.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                  color: updateMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  border: `1px solid ${updateMessage.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`,
                }}
              >
                {updateMessage.text}
              </div>
            )}
          </div>
        </section>

        {/* Unanswered Questions Section */}
        {unansweredQuestions.length > 0 && (
          <section
            className="rounded-2xl p-6"
            style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--warning)', color: 'white' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>
                  Questions Needing Answers
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Answer these to improve scholarship matching accuracy
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {unansweredQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  onAnswer={handleAnswerQuestion}
                  onRemove={removeQuestion}
                />
              ))}
            </div>
          </section>
        )}

        {/* Profile Sections */}
        <div className="space-y-4">
          {/* Identity Section */}
          <ProfileSection
            title="Identity"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
            expanded={expandedSections.has('identity')}
            onToggle={() => toggleSection('identity')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileField label="Name" value={profile.name} />
              <ProfileField label="Age" value={profile.age.toString()} />
              <ProfileField label="Gender" value={profile.demographics.gender} />
              <ProfileField label="Ethnicity" value={profile.demographics.ethnicity} />
              <ProfileField label="Marital Status" value={profile.demographics.maritalStatus} />
              <ProfileField label="Family Status" value={profile.demographics.familyStatus} />
            </div>
          </ProfileSection>

          {/* Academics Section */}
          <ProfileSection
            title="Academics"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            }
            expanded={expandedSections.has('academics')}
            onToggle={() => toggleSection('academics')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileField label="University" value={profile.university} />
              <ProfileField label="Major" value={profile.major} />
              <ProfileField label="Degree Track" value={profile.degreeTrack} />
              <ProfileField label="GPA" value={profile.gpa.toString()} />
              <ProfileField label="Expected Graduation" value={profile.graduationDate} />
              <ProfileField label="Current Location" value={profile.currentLocation} />
              <ProfileField label="Hometown" value={profile.hometown} />
            </div>
          </ProfileSection>

          {/* Financials Section */}
          <ProfileSection
            title="Financial Situation"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            }
            expanded={expandedSections.has('financials')}
            onToggle={() => toggleSection('financials')}
          >
            <div className="space-y-4">
              <ProfileField label="Funding Source" value={profile.financials.fundingSource} />
              <ProfileField label="Debt Status" value={profile.financials.debt} />
              <ProfileField label="Household Income" value={profile.financials.householdIncomeType} />
              <ProfileField label="Upcoming Expenses" value={profile.financials.upcomingExpenses} />
            </div>
          </ProfileSection>

          {/* Experiences Section */}
          <ProfileSection
            title="Experiences"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
              </svg>
            }
            expanded={expandedSections.has('experiences')}
            onToggle={() => toggleSection('experiences')}
          >
            <div className="space-y-4">
              {profile.experiences.map((exp, index) => (
                <ExperienceCard key={index} experience={exp} />
              ))}
            </div>
          </ProfileSection>

          {/* Career Goals Section */}
          <ProfileSection
            title="Career Goals"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            expanded={expandedSections.has('career')}
            onToggle={() => toggleSection('career')}
          >
            <div className="space-y-4">
              <ProfileField label="Short-term Goal" value={profile.careerGoals.shortTerm} />
              <ProfileField label="Long-term Goal" value={profile.careerGoals.longTerm} />
              <ProfileField label="Personal Brand / Narrative" value={profile.careerGoals.narrativeStrategy} />
            </div>
          </ProfileSection>

          {/* Interests Section */}
          <ProfileSection
            title="Interests & Keywords"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            }
            expanded={expandedSections.has('interests')}
            onToggle={() => toggleSection('interests')}
          >
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                  {interest}
                </span>
              ))}
            </div>
          </ProfileSection>
        </div>

        {/* Answered Questions (Collapsed by default) */}
        {answeredQuestions.length > 0 && (
          <ProfileSection
            title={`Answered Questions (${answeredQuestions.length})`}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            expanded={expandedSections.has('answered')}
            onToggle={() => toggleSection('answered')}
          >
            <div className="space-y-3">
              {answeredQuestions.map((question) => (
                <div
                  key={question.id}
                  className="p-3 rounded-lg"
                  style={{ background: 'var(--background)' }}
                >
                  <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
                    {question.scholarshipName}
                  </div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
                    {question.question}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--success)' }}>
                    ✓ {question.answer}
                  </div>
                </div>
              ))}
            </div>
          </ProfileSection>
        )}

        {/* Reset Button */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => {
              if (confirm('Are you sure you want to reset your profile to defaults? This cannot be undone.')) {
                resetProfile();
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-950"
            style={{ color: 'var(--danger)' }}
          >
            Reset Profile to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function ProfileSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--background)', color: 'var(--accent)' }}
          >
            {icon}
          </div>
          <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
            {title}
          </span>
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            color: 'var(--muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 pb-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="text-sm" style={{ color: 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  );
}

function ExperienceCard({ experience }: { experience: Experience }) {
  const location = experience.company || experience.location || '';

  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold" style={{ color: 'var(--foreground)' }}>
            {experience.role}
          </div>
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            {location} • {experience.date}
          </div>
        </div>
      </div>
      <p className="text-sm mb-2" style={{ color: 'var(--foreground)' }}>
        {experience.description}
      </p>
      {experience.skills && experience.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {experience.skills.map((skill, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded text-xs"
              style={{ background: 'var(--surface)', color: 'var(--muted)' }}
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  onAnswer,
  onRemove,
}: {
  question: UnansweredQuestion;
  onAnswer: (id: string, answer: string) => void;
  onRemove: (id: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = () => {
    if (answer.trim()) {
      onAnswer(question.id, answer.trim());
      setAnswer('');
      setIsExpanded(false);
    }
  };

  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--accent)' }}>
            {question.scholarshipName}
          </div>
          <div className="font-medium" style={{ color: 'var(--foreground)' }}>
            {question.question}
          </div>
        </div>
        <button
          onClick={() => onRemove(question.id)}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          style={{ color: 'var(--muted)' }}
          title="Dismiss question"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="mt-3 text-sm font-medium"
          style={{ color: 'var(--accent)' }}
        >
          + Answer this question
        </button>
      ) : (
        <div className="mt-3 space-y-2 animate-fade-in">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer..."
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!answer.trim()}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--success)' }}
            >
              Save Answer
            </button>
            <button
              onClick={() => {
                setIsExpanded(false);
                setAnswer('');
              }}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ color: 'var(--muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
