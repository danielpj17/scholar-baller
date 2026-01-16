'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile } from '@/types';
import { userProfile as defaultProfile } from '@/constants/profile';
import { saveUserProfile, getUserProfile } from '@/app/actions/profileActions';

const PROFILE_STORAGE_KEY = 'scholar-baller-profile';
const QUESTIONS_STORAGE_KEY = 'scholar-baller-questions';

export interface UnansweredQuestion {
  id: string;
  scholarshipId: string;
  scholarshipName: string;
  question: string;
  answer?: string;
  answeredAt?: string;
}

interface ProfileContextType {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  setProfile: (profile: UserProfile) => void;
  resetProfile: () => void;
  
  // Questions management
  questions: UnansweredQuestion[];
  addQuestions: (scholarshipId: string, scholarshipName: string, newQuestions: string[]) => void;
  answerQuestion: (questionId: string, answer: string) => void;
  removeQuestion: (questionId: string) => void;
  unansweredCount: number;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(defaultProfile);
  const [questions, setQuestions] = useState<UnansweredQuestion[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from database and localStorage on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Try to load from database first
        const dbProfile = await getUserProfile();
        if (dbProfile) {
          setProfileState(dbProfile);
        } else {
          // Fallback to localStorage
          const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
          if (savedProfile) {
            const parsed = JSON.parse(savedProfile);
            setProfileState(parsed);
            // Save to database for future use
            await saveUserProfile(parsed);
          }
        }

        const savedQuestions = localStorage.getItem(QUESTIONS_STORAGE_KEY);
        if (savedQuestions) {
          const parsed = JSON.parse(savedQuestions);
          setQuestions(parsed);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
      setIsHydrated(true);
    };

    loadProfile();
  }, []);

  // Save profile to both localStorage and database when it changes
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
        // Also save to database
        saveUserProfile(profile).catch((error) => {
          console.error('Error saving profile to database:', error);
        });
      } catch (error) {
        console.error('Error saving profile:', error);
      }
    }
  }, [profile, isHydrated]);

  // Save questions to localStorage when they change
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(questions));
      } catch (error) {
        console.error('Error saving questions to localStorage:', error);
      }
    }
  }, [questions, isHydrated]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfileState((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const setProfile = useCallback((newProfile: UserProfile) => {
    setProfileState(newProfile);
  }, []);

  const resetProfile = useCallback(() => {
    setProfileState(defaultProfile);
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  }, []);

  const addQuestions = useCallback(
    (scholarshipId: string, scholarshipName: string, newQuestions: string[]) => {
      setQuestions((prev) => {
        // Filter out questions that already exist for this scholarship
        const existingQuestionTexts = prev
          .filter((q) => q.scholarshipId === scholarshipId)
          .map((q) => q.question.toLowerCase());

        const questionsToAdd = newQuestions
          .filter((q) => !existingQuestionTexts.includes(q.toLowerCase()))
          .map((question) => ({
            id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            scholarshipId,
            scholarshipName,
            question,
          }));

        return [...prev, ...questionsToAdd];
      });
    },
    []
  );

  const answerQuestion = useCallback((questionId: string, answer: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, answer, answeredAt: new Date().toISOString() }
          : q
      )
    );
  }, []);

  const removeQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  }, []);

  const unansweredCount = questions.filter((q) => !q.answer).length;

  return (
    <ProfileContext.Provider
      value={{
        profile,
        updateProfile,
        setProfile,
        resetProfile,
        questions,
        addQuestions,
        answerQuestion,
        removeQuestion,
        unansweredCount,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
