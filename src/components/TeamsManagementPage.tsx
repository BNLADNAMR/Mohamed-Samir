import React, { useState } from 'react';
import { Users, Plus, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Team, UserProfile } from '../types';
import { createTeam, updateTeam, deleteTeam } from '../services/firestoreService';

interface TeamsManagementPageProps {
  currentUser: UserProfile;
  teams: Team[];
  users: UserProfile[];
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const TeamsManagementPage: React.FC<TeamsManagementPageProps> = ({
  currentUser,
  teams,
  users,
  onNotify,
}) => {
  const [teamName, setTeamName] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const supervisors = users.filter((u) => u.role === 'supervisor' || u.role === 'operations_manager' || u.role === 'super_admin');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    try {
      const newTeam: Team = {
        teamId: `team_${Date.now()}`,
        teamName: teamName.trim(),
        supervisorId,
        status: 'active',
        memberCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await createTeam(currentUser, newTeam);
      onNotify('تم إنشاء الفريق بنجاح.', 'success');
      setTeamName('');
      setSupervisorId('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إنشاء الفريق.', 'error');
    }
  };

  const handleDelete = async (teamId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الفريق؟')) {
      try {
        await deleteTeam(currentUser, teamId);
        onNotify('تم حذف الفريق بنجاح.', 'success');
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'تعذر حذف الفريق.', 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>إدارة فرق العمل والمشرفين</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تنظيم المندوبين في فرق جغرافية وتشغيلية وتعيين مشرف مسؤول لكل فريق.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* نموذج إضافة فريق */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs text-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" />
            <span>إضافة فريق تشغيل جديد</span>
          </h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="font-bold block mb-1">اسم الفريق</label>
              <input
                type="text"
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="مثال: فريق شرق القاهرة - أ"
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">المشرف المسؤول</label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
              >
                <option value="">بدون مشرف حالياً</option>
                {supervisors.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors cursor-pointer"
            >
              حفظ الفريق
            </button>
          </form>
        </div>

        {/* قائمة الفرق */}
        <div className="lg:col-span-2 space-y-3">
          {teams.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-xs">
              لم يتم إنشاء أي فرق تشغيل بعد. استخدم النموذج لإضافة أول فريق.
            </div>
          ) : (
            teams.map((team) => {
              const supervisor = users.find((u) => u.uid === team.supervisorId);
              return (
                <div
                  key={team.teamId}
                  className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{team.teamName}</span>
                      <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-mono">
                        {team.memberCount} مندوب
                      </span>
                    </div>
                    <div className="text-slate-500 mt-1">
                      المشرف:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {supervisor ? supervisor.name : 'غير محدد'}
                      </strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(team.teamId)}
                      className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 dark:border-rose-900 dark:hover:bg-rose-950/50 cursor-pointer"
                      title="حذف الفريق"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
