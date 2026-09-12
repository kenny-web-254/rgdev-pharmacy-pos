import { getSupabase } from './supabase';
import type { User, UserRole, UserStatus } from '../types';

async function invoke<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const { data, error } = await client.functions.invoke('admin-user-management', {
    body: { operation, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function createAuthUser(input: {
  name: string; username: string; email: string; phone?: string; role: UserRole; password: string; licenseNumber?: string;
}): Promise<User> {
  const data = await invoke<{ user: User }>('create', input);
  return data.user;
}

export async function updateAuthUser(target: User, updates: Partial<User>): Promise<User> {
  const data = await invoke<{ user: User }>('update', { userId: target.id, updates });
  return data.user;
}

export async function setAuthUserStatus(targetUserId: string, status: UserStatus): Promise<User> {
  const data = await invoke<{ user: User }>('status', { userId: targetUserId, status });
  return data.user;
}

export async function deleteAuthUser(targetUserId: string): Promise<void> {
  await invoke('delete', { userId: targetUserId });
}

export async function resetAuthUserPassword(targetUserId: string, password: string): Promise<void> {
  await invoke('reset-password', { userId: targetUserId, password });
}
