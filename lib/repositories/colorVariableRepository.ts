/**
 * Color Variable Repository
 *
 * Data access layer for color variable operations with Supabase.
 * Color variables are site-wide design tokens stored as CSS custom properties.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server';
import type { ColorVariable } from '@/types';

export interface CreateColorVariableData {
  name: string;
  value: string;
}

export interface UpdateColorVariableData {
  name?: string;
  value?: string;
}

export async function getAllColorVariables(): Promise<ColorVariable[]> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await client
    .from('color_variables')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch color variables: ${error.message}`);
  }

  return data || [];
}

export async function getColorVariableById(id: string): Promise<ColorVariable | null> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await client
    .from('color_variables')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch color variable: ${error.message}`);
  }

  return data;
}

export async function createColorVariable(
  variableData: CreateColorVariableData
): Promise<ColorVariable> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await client
    .from('color_variables')
    .insert(variableData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create color variable: ${error.message}`);
  }

  return data;
}

export async function updateColorVariable(
  id: string,
  updates: UpdateColorVariableData
): Promise<ColorVariable> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await client
    .from('color_variables')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update color variable: ${error.message}`);
  }

  return data;
}

export async function deleteColorVariable(id: string): Promise<void> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase not configured');
  }

  const { error } = await client
    .from('color_variables')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete color variable: ${error.message}`);
  }
}
