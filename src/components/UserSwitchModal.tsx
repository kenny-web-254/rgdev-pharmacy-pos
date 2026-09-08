import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  KeyRound,
  Lock,
  LogIn,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { storageService } from '../services/storage';

interface UserSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSwitchUser: (user: User) => void;
}

export const UserSwitchModal: React.FC<UserSwitchModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSwitchUser,
}) => {
  const [usernameInput, setUsernameInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const usersList = storageService.getUsers();

  const handleApplyUser = (user: User) => {
    if (user.status === 'inactive') {
      setError(`Account for "${user.name}" is deactivated. Please contact an Administrator to restore access.`);
      return;
    }

    // Record login audit event
    storageService.addAuditLog({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'USER_LOGIN',
      details: `User switched/signed in into active session as ${user.role.toUpperCase()}`,
      category: 'AUTH',
    });

    // Update lastLogin on the user
    storageService.updateUser(user, user.id, {
      ...user,
      lastLogin: new Date().toISOString(),
    });

    onSwitchUser(user);
    setError(null);
    setPasswordInput('');
    onClose();
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const enteredUsername = usernameInput.trim().toLowerCase();
    const targetUser = usersList.find((u) => u.username.toLowerCase() === enteredUsername);

    if (!targetUser) {
      setError(`User "${usernameInput}" not found. Verify username spelling.`);
      return;
    }

    if (targetUser.status === 'inactive') {
      setError(`Account for "${targetUser.name}" has been deactivated by an Administrator.`);
      return;
    }

    const expectedPassword = targetUser.password || targetUser.username;
    if (passwordInput !== expectedPassword) {
      setError(`Invalid password for "${targetUser.username}".`);
      return;
    }

    handleApplyUser(targetUser);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-xs">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Switch User / Authenticate</h2>
              <p className="text-xs text-slate-500">Quick demo switch or sign in with credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick 1-Click Profile Switch List */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Quick Account Switch</span>
              <span className="text-[10px] text-teal-700 font-semibold lowercase">tap to activate</span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {usersList.map((user) => {
                const isCurrent = currentUser.id === user.id;
                const isAdmin = user.role === 'admin';
                const isInactive = user.status === 'inactive';
                const normalizedRole = user.role === 'cashier' ? 'staff' : user.role;

                return (
                  <div
                    key={user.id}
                    onClick={() => handleApplyUser(user)}
                    className={`p-3 rounded-2xl border-2 transition cursor-pointer flex items-center justify-between group ${
                      isCurrent
                        ? 'border-teal-600 bg-teal-50/60'
                        : isInactive
                        ? 'border-slate-200 bg-slate-50 opacity-60'
                        : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl text-white font-bold flex items-center justify-center text-xs shadow-xs ${
                          user.avatarColor || (isAdmin ? 'bg-teal-700' : 'bg-emerald-600')
                        }`}
                      >
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">{user.name}</span>
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase tracking-wider ${
                              isAdmin
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {normalizedRole}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                          <span>@{user.username}</span>
                          <span>•</span>
                          <span>pass: {user.password || user.username}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isInactive ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
                          <UserX className="w-3 h-3" />
                          <span>Deactivated</span>
                        </span>
                      ) : isCurrent ? (
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 group-hover:text-teal-700 font-semibold transition">
                          Switch
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manual Login Form */}
          <div className="pt-3 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
              Or Sign In With Credentials
            </div>
            <form onSubmit={handleManualLogin} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="e.g., admin or cashier"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs min-h-[44px] flex items-center justify-center gap-2 transition"
              >
                <LogIn className="w-4 h-4" />
                <span>Authenticate & Switch Session</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
