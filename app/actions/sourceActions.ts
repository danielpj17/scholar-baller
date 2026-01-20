'use server';

import { 
  getCustomSources as dbGetCustomSources,
  addCustomSource as dbAddCustomSource,
  updateCustomSource as dbUpdateCustomSource,
  deleteCustomSource as dbDeleteCustomSource,
  toggleCustomSourceEnabled as dbToggleCustomSourceEnabled,
} from '@/lib/db';
import { ScholarshipSource } from '@/constants/sources';

// Get all sources (now all from database)
export async function getAllSources(): Promise<ScholarshipSource[]> {
  return dbGetCustomSources();
}

// Get only custom sources
export async function getCustomSources(): Promise<ScholarshipSource[]> {
  return dbGetCustomSources();
}

// Add a new custom source
export async function addCustomSource(source: {
  name: string;
  baseUrl: string;
  searchUrl: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  // Validate inputs
  if (!source.name || source.name.trim().length < 2) {
    return { success: false, error: 'Name must be at least 2 characters' };
  }
  
  // Validate URLs
  try {
    new URL(source.baseUrl);
    new URL(source.searchUrl);
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }
  
  return dbAddCustomSource({
    name: source.name.trim(),
    baseUrl: source.baseUrl.trim(),
    searchUrl: source.searchUrl.trim(),
  });
}

// Update a custom source
export async function updateCustomSource(
  id: string,
  updates: Partial<{ name: string; baseUrl: string; searchUrl: string; enabled: boolean }>
): Promise<{ success: boolean; error?: string }> {
  // Don't allow updating built-in sources
  if (!id.startsWith('custom-')) {
    return { success: false, error: 'Cannot modify built-in sources' };
  }
  
  return dbUpdateCustomSource(id, updates);
}

// Delete a custom source
export async function deleteCustomSource(id: string): Promise<{ success: boolean; error?: string }> {
  // Don't allow deleting built-in sources
  if (!id.startsWith('custom-')) {
    return { success: false, error: 'Cannot delete built-in sources' };
  }
  
  return dbDeleteCustomSource(id);
}

// Toggle source enabled status
export async function toggleSourceEnabled(id: string): Promise<{ success: boolean; enabled?: boolean; error?: string }> {
  // Don't allow toggling built-in sources
  if (!id.startsWith('custom-')) {
    return { success: false, error: 'Cannot modify built-in sources' };
  }
  
  return dbToggleCustomSourceEnabled(id);
}
