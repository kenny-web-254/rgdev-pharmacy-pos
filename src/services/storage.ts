import {
  AuditLog,
  Medication,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  User,
} from '../types';
import {
  DEMO_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_MEDICATIONS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_RECEIPT_SETTINGS,
} from '../data/mockData';

const STORAGE_KEYS = {
  MEDICATIONS: 'pharmapos_medications_v1',
  PRESCRIPTIONS: 'pharmapos_prescriptions_v1',
  TRANSACTIONS: 'pharmapos_transactions_v1',
  OFFLINE_QUEUE: 'pharmapos_offline_queue_v1',
  RECEIPT_SETTINGS: 'pharmapos_receipt_settings_v1',
  ACTIVE_USER: 'pharmapos_active_user_v2',
  USERS: 'pharmapos_users_v2',
  AUDIT_LOGS: 'pharmapos_audit_logs_v1',
  REGISTER_STATE: 'pharmapos_register_state_v1',
};

export const storageService = {
  // Medications (Inventory)
  getMedications(): Medication[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load medications from storage', e);
    }
    this.saveMedications(INITIAL_MEDICATIONS);
    return INITIAL_MEDICATIONS;
  },

  saveMedications(medications: Medication[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify(medications));
    } catch (e) {
      console.error('Failed to save medications', e);
    }
  },

  // Prescriptions
  getPrescriptions(): Prescription[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PRESCRIPTIONS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load prescriptions from storage', e);
    }
    this.savePrescriptions(INITIAL_PRESCRIPTIONS);
    return INITIAL_PRESCRIPTIONS;
  },

  savePrescriptions(prescriptions: Prescription[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PRESCRIPTIONS, JSON.stringify(prescriptions));
    } catch (e) {
      console.error('Failed to save prescriptions', e);
    }
  },

  // Sales Transactions
  getTransactions(): SaleTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load transactions', e);
    }
    return [];
  },

  saveTransactions(transactions: SaleTransaction[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch (e) {
      console.error('Failed to save transactions', e);
    }
  },

  // Offline Sync Queue
  getOfflineQueue(): SaleTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load offline queue', e);
    }
    return [];
  },

  saveOfflineQueue(queue: SaleTransaction[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save offline queue', e);
    }
  },

  addToOfflineQueue(transaction: SaleTransaction): void {
    const queue = this.getOfflineQueue();
    queue.push(transaction);
    this.saveOfflineQueue(queue);
  },

  clearOfflineQueue(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    } catch (e) {
      console.error('Failed to clear offline queue', e);
    }
  },

  // Receipt Settings
  getReceiptSettings(): ReceiptSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RECEIPT_SETTINGS);
      if (data) {
        return { ...INITIAL_RECEIPT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('Failed to load receipt settings', e);
    }
    this.saveReceiptSettings(INITIAL_RECEIPT_SETTINGS);
    return INITIAL_RECEIPT_SETTINGS;
  },

  saveReceiptSettings(settings: ReceiptSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.RECEIPT_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save receipt settings', e);
    }
  },

  // Users & Staff Management
  getUsers(): User[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load users from storage', e);
    }
    this.saveUsers(DEMO_USERS);
    return DEMO_USERS;
  },

  saveUsers(users: User[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch (e) {
      console.error('Failed to save users', e);
    }
  },

  getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  },

  createUser(
    actingUser: User,
    userData: {
      name: string;
      username: string;
      email?: string;
      phone?: string;
      role: 'admin' | 'staff';
      password?: string;
      licenseNumber?: string;
    }
  ): { success: boolean; user?: User; error?: string } {
    if (actingUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only administrators can create new staff accounts.' };
    }

    const currentUsers = this.getUsers();
    const cleanUsername = userData.username.trim().toLowerCase();

    if (!cleanUsername) {
      return { success: false, error: 'Username cannot be blank.' };
    }

    if (currentUsers.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: `Username "${userData.username}" is already taken.` };
    }

    const newUser: User = {
      id: 'user-' + Date.now(),
      username: cleanUsername,
      name: userData.name.trim(),
      email: userData.email?.trim() || `${cleanUsername}@afyacare.co.ke`,
      phone: userData.phone?.trim() || '',
      role: userData.role,
      status: 'active',
      password: userData.password || 'pharmacy123',
      licenseNumber: userData.licenseNumber?.trim() || '',
      avatarColor: userData.role === 'admin' ? 'bg-teal-700' : 'bg-emerald-600',
      createdAt: new Date().toISOString(),
    };

    const updated = [newUser, ...currentUsers];
    this.saveUsers(updated);

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'USER_CREATED',
      details: `Created new ${newUser.role.toUpperCase()} account for ${newUser.name} (@${newUser.username})`,
      category: 'USERS',
    });

    return { success: true, user: newUser };
  },

  updateUser(
    actingUser: User,
    targetUserId: string,
    updates: Partial<User>
  ): { success: boolean; user?: User; error?: string } {
    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);

    if (!target) {
      return { success: false, error: 'Target user account not found.' };
    }

    // Role-based security checks:
    // 1. If acting user is staff: can only edit own profile, and can NEVER alter role, status, id, or permissions
    if (actingUser.role !== 'admin') {
      if (actingUser.id !== targetUserId) {
        return { success: false, error: 'Unauthorized: Staff members cannot edit other user accounts.' };
      }
      // Strip forbidden keys
      if (updates.role && updates.role !== target.role) {
        return { success: false, error: 'Unauthorized: Staff members cannot modify account role.' };
      }
      if (updates.status && updates.status !== target.status) {
        return { success: false, error: 'Unauthorized: Staff members cannot modify account status.' };
      }
    }

    // 2. If acting user is admin:
    if (actingUser.role === 'admin') {
      // Admin cannot change their own role from ADMIN to STAFF
      if (actingUser.id === targetUserId && updates.role && updates.role !== 'admin') {
        return { success: false, error: 'Security restriction: Administrators cannot downgrade their own role.' };
      }

      // Check last remaining admin rule
      if (
        (updates.role && updates.role !== 'admin' && target.role === 'admin') ||
        (updates.status === 'inactive' && target.role === 'admin')
      ) {
        const activeAdmins = currentUsers.filter((u) => u.role === 'admin' && u.status === 'active');
        if (activeAdmins.length <= 1 && activeAdmins.some((u) => u.id === targetUserId)) {
          return {
            success: false,
            error: 'Action prohibited: Cannot downgrade or deactivate the last remaining active Administrator.',
          };
        }
      }
    }

    // Safe updates whitelist
    const updatedUser: User = {
      ...target,
      name: updates.name !== undefined ? updates.name.trim() : target.name,
      email: updates.email !== undefined ? updates.email.trim() : target.email,
      phone: updates.phone !== undefined ? updates.phone.trim() : target.phone,
      licenseNumber: updates.licenseNumber !== undefined ? updates.licenseNumber.trim() : target.licenseNumber,
      password: updates.password !== undefined ? updates.password : target.password,
      // Admin-only fields
      role: actingUser.role === 'admin' && updates.role ? updates.role : target.role,
      status: actingUser.role === 'admin' && updates.status ? updates.status : target.status,
    };

    const updatedList = currentUsers.map((u) => (u.id === targetUserId ? updatedUser : u));
    this.saveUsers(updatedList);

    // If updating current active user, sync active user storage as well
    const active = this.getActiveUser();
    if (active.id === targetUserId) {
      this.saveActiveUser(updatedUser);
    }

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'USER_UPDATED',
      details: `Updated account details for ${updatedUser.name} (@${updatedUser.username})`,
      category: actingUser.id === targetUserId ? 'AUTH' : 'USERS',
    });

    return { success: true, user: updatedUser };
  },

  toggleUserStatus(actingUser: User, targetUserId: string): { success: boolean; user?: User; error?: string } {
    if (actingUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only administrators can modify account statuses.' };
    }

    if (actingUser.id === targetUserId) {
      return { success: false, error: 'Security restriction: You cannot deactivate your own currently active account.' };
    }

    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);
    if (!target) return { success: false, error: 'User not found.' };

    const newStatus = target.status === 'active' ? 'inactive' : 'active';

    // Last admin check
    if (newStatus === 'inactive' && target.role === 'admin') {
      const activeAdmins = currentUsers.filter((u) => u.role === 'admin' && u.status === 'active');
      if (activeAdmins.length <= 1) {
        return {
          success: false,
          error: 'Security restriction: Cannot deactivate the last remaining active Administrator.',
        };
      }
    }

    const updatedUser: User = { ...target, status: newStatus };
    const updatedList = currentUsers.map((u) => (u.id === targetUserId ? updatedUser : u));
    this.saveUsers(updatedList);

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: newStatus === 'active' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      details: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} account of ${target.name} (@${target.username})`,
      category: 'USERS',
    });

    return { success: true, user: updatedUser };
  },

  deleteUser(actingUser: User, targetUserId: string): { success: boolean; error?: string } {
    if (actingUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only administrators can delete staff accounts.' };
    }

    if (actingUser.id === targetUserId) {
      return { success: false, error: 'Security restriction: Administrators cannot delete their own account.' };
    }

    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);
    if (!target) return { success: false, error: 'User not found.' };

    if (target.role === 'admin') {
      const adminCount = currentUsers.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        return {
          success: false,
          error: 'Security restriction: Cannot delete the last remaining Administrator.',
        };
      }
    }

    const updatedList = currentUsers.filter((u) => u.id !== targetUserId);
    this.saveUsers(updatedList);

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'USER_DELETED',
      details: `Permanently removed ${target.role.toUpperCase()} account for ${target.name} (@${target.username})`,
      category: 'USERS',
    });

    return { success: true };
  },

  resetUserPassword(actingUser: User, targetUserId: string, newPassword: string): { success: boolean; error?: string } {
    if (actingUser.role !== 'admin' && actingUser.id !== targetUserId) {
      return { success: false, error: 'Unauthorized: You can only change your own password.' };
    }

    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    const currentUsers = this.getUsers();
    const target = currentUsers.find((u) => u.id === targetUserId);
    if (!target) return { success: false, error: 'User not found.' };

    const updatedUser = { ...target, password: newPassword };
    const updatedList = currentUsers.map((u) => (u.id === targetUserId ? updatedUser : u));
    this.saveUsers(updatedList);

    if (this.getActiveUser().id === targetUserId) {
      this.saveActiveUser(updatedUser);
    }

    this.addAuditLog({
      userId: actingUser.id,
      userName: actingUser.name,
      userRole: actingUser.role,
      action: 'PASSWORD_RESET',
      details: `Password reset performed for ${target.name} (@${target.username})`,
      category: 'AUTH',
    });

    return { success: true };
  },

  // Audit Logs
  getAuditLogs(): AuditLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load audit logs', e);
    }
    this.saveAuditLogs(INITIAL_AUDIT_LOGS);
    return INITIAL_AUDIT_LOGS;
  },

  saveAuditLogs(logs: AuditLog[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 200)));
    } catch (e) {
      console.error('Failed to save audit logs', e);
    }
  },

  addAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      ...entry,
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
    };
    this.saveAuditLogs([newLog, ...logs]);
  },

  // Active User / Auth
  getActiveUser(): User {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load active user', e);
    }
    const all = this.getUsers();
    return all[0] || DEMO_USERS[0];
  },

  saveActiveUser(user: User): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save active user', e);
    }
  },

  // Reset demo data
  resetAllData(): void {
    localStorage.clear();
    this.saveMedications(INITIAL_MEDICATIONS);
    this.savePrescriptions(INITIAL_PRESCRIPTIONS);
    this.saveReceiptSettings(INITIAL_RECEIPT_SETTINGS);
    this.saveUsers(DEMO_USERS);
    this.saveActiveUser(DEMO_USERS[0]);
    this.saveAuditLogs(INITIAL_AUDIT_LOGS);
  },
};
