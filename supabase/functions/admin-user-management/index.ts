import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Role = 'admin' | 'clinician' | 'cashier';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || serviceKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller) return json({ error: 'Unauthorized' }, 401);
  const { data: callerProfile } = await admin.from('profiles').select('id,role,status').eq('id', caller.id).single();
  if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'active') return json({ error: 'Administrator privileges required.' }, 403);
  const body = await req.json();
  const operation = String(body.operation || '');
  try {
    if (operation === 'create') {
      const input = body as { name: string; username: string; email: string; phone?: string; role: Role; password: string; licenseNumber?: string };
      if (!input.name?.trim() || !input.username?.trim() || !input.email?.trim() || !input.password || !['admin','clinician','cashier'].includes(input.role)) return json({ error: 'Invalid user data.' }, 400);
      if (input.password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      const { data: authCreated, error: authError } = await admin.auth.admin.createUser({ email: input.email.trim().toLowerCase(), password: input.password, email_confirm: true });
      if (authError || !authCreated.user) return json({ error: authError?.message || 'Unable to create auth user.' }, 400);
      const userId = authCreated.user.id;
      const { data: profile, error: profileError } = await admin.from('profiles').insert({ id: userId, username: input.username.trim().toLowerCase(), full_name: input.name.trim(), email: input.email.trim().toLowerCase(), phone: input.phone?.trim() || null, role: input.role, status: 'active', license_number: input.licenseNumber?.trim() || null }).select('*').single();
      if (profileError || !profile) { await admin.auth.admin.deleteUser(userId); return json({ error: profileError?.message || 'Unable to create profile.' }, 400); }
      return json({ user: toClientUser(profile) });
    }
    const userId = String(body.userId || '');
    if (!userId) return json({ error: 'User ID is required.' }, 400);
    const { data: target } = await admin.from('profiles').select('*').eq('id', userId).single();
    if (!target) return json({ error: 'User not found.' }, 404);
    if (target.id === caller.id && ['delete','status'].includes(operation)) return json({ error: 'You cannot disable or delete your own account through this operation.' }, 400);
    if (operation === 'update') {
      const updates = body.updates || {};
      if (updates.role && !['admin','clinician','cashier'].includes(updates.role)) return json({ error: 'Invalid role.' }, 400);
      const { data: admins } = await admin.from('profiles').select('id').eq('role','admin').eq('status','active');
      if (target.role === 'admin' && ((updates.role && updates.role !== 'admin') || updates.status === 'inactive') && (admins || []).length <= 1) return json({ error: 'Cannot remove the last active administrator.' }, 400);
      const safe: Record<string, unknown> = { full_name: updates.name?.trim(), email: updates.email?.trim()?.toLowerCase(), phone: updates.phone?.trim(), license_number: updates.licenseNumber?.trim(), role: updates.role, status: updates.status, updated_at: new Date().toISOString() };
      Object.keys(safe).forEach(k => { if (safe[k] === undefined) delete safe[k]; });
      if (safe.email) { const { error } = await admin.auth.admin.updateUserById(userId, { email: safe.email as string }); if (error) return json({ error: error.message }, 400); }
      const { data: profile, error } = await admin.from('profiles').update(safe).eq('id', userId).select('*').single();
      if (error || !profile) return json({ error: error?.message || 'Update failed.' }, 400);
      return json({ user: toClientUser(profile) });
    }
    if (operation === 'status') {
      const status = body.status;
      if (status !== 'active' && status !== 'inactive') return json({ error: 'Invalid status.' }, 400);
      const { data: admins } = await admin.from('profiles').select('id').eq('role','admin').eq('status','active');
      if (target.role === 'admin' && status === 'inactive' && (admins || []).length <= 1) return json({ error: 'Cannot deactivate the last active administrator.' }, 400);
      const { data: profile, error } = await admin.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', userId).select('*').single();
      if (error || !profile) return json({ error: error?.message || 'Status update failed.' }, 400);
      return json({ user: toClientUser(profile) });
    }
    if (operation === 'reset-password') {
      const password = String(body.password || '');
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    if (operation === 'delete') {
      const { data: admins } = await admin.from('profiles').select('id').eq('role','admin');
      if (target.role === 'admin' && (admins || []).length <= 1) return json({ error: 'Cannot delete the last administrator.' }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: 'Unknown operation.' }, 400);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500); }
});

function toClientUser(profile: Record<string, unknown>) {
  return { id: String(profile.id), username: String(profile.username || ''), email: String(profile.email || ''), name: String(profile.full_name || ''), role: profile.role as Role, status: profile.status === 'inactive' ? 'inactive' : 'active', createdAt: String(profile.created_at || new Date().toISOString()), lastLogin: profile.last_login_at ? String(profile.last_login_at) : undefined, phone: profile.phone ? String(profile.phone) : undefined, licenseNumber: profile.license_number ? String(profile.license_number) : undefined, avatarColor: String(profile.avatar_color || 'bg-teal-700') };
}
