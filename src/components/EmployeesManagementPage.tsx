import React, { useState } from 'react';
import { UserCheck, Plus, Search, Edit2, Trash2, Phone, Calendar, Hash } from 'lucide-react';
import { Employee, Team, UserProfile } from '../types';
import { createEmployee, updateEmployee, deleteEmployee } from '../services/firestoreService';

interface EmployeesManagementPageProps {
  currentUser: UserProfile;
  employees: Employee[];
  teams: Team[];
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const EmployeesManagementPage: React.FC<EmployeesManagementPageProps> = ({
  currentUser,
  employees,
  teams,
  onNotify,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // حقول الإضافة والتعديل
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [teamId, setTeamId] = useState('');
  const [notes, setNotes] = useState('');

  const filteredEmployees = employees.filter((emp) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      emp.fullName.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q) ||
      emp.phone.includes(q);

    const matchTeam = teamFilter === 'all' || emp.teamId === teamFilter;
    return matchSearch && matchTeam;
  });

  const handleOpenAdd = () => {
    setCode(`EMP_${Math.floor(1000 + Math.random() * 9000)}`);
    setName('');
    setPhone('');
    setHireDate(new Date().toISOString().slice(0, 10));
    setTeamId('');
    setNotes('');
    setShowAddModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    try {
      if (editingEmp) {
        await updateEmployee(currentUser, editingEmp.id, {
          employeeCode: code.trim(),
          fullName: name.trim(),
          phone: phone.trim(),
          hireDate,
          teamId,
          notes: notes.trim(),
        });
        onNotify('تم تحديث بيانات المندوب بنجاح.', 'success');
        setEditingEmp(null);
      } else {
        const newEmp: Employee = {
          id: `emp_${Date.now()}`,
          employeeCode: code.trim(),
          fullName: name.trim(),
          phone: phone.trim(),
          hireDate,
          status: 'active',
          externalId: `EXT_${code.trim()}`,
          teamId,
          notes: notes.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await createEmployee(currentUser, newEmp);
        onNotify('تم إضافة المندوب الجديد بنجاح.', 'success');
        setShowAddModal(false);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ البيانات.', 'error');
    }
  };

  const handleDelete = async (emp: Employee) => {
    if (window.confirm(`هل أنت متأكد من حذف سجل المندوب (${emp.fullName})؟`)) {
      try {
        await deleteEmployee(currentUser, emp.id);
        onNotify('تم حذف سجل المندوب.', 'success');
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'فشل حذف المندوب.', 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            <span>سجل المندوبين الميدانيين (Employees)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            إدارة المندوبين، الأكواد الوظيفية، تعيين الفرق، وأرقام التواصل الفعلية.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مندوب جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم أو الكود الوظيفي..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
        </div>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
        >
          <option value="all">جميع الفرق ({employees.length})</option>
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.teamName}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">الكود</th>
                <th className="p-3.5">اسم المندوب</th>
                <th className="p-3.5">الهاتف</th>
                <th className="p-3.5">الفريق</th>
                <th className="p-3.5">تاريخ التعيين</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا يوجد مندوبون مسجلون بعد. اضغط "إضافة مندوب جديد" لإدخال أول سجل.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {emp.employeeCode}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      {emp.fullName}
                    </td>
                    <td className="p-3.5 font-mono text-slate-500" dir="ltr">
                      {emp.phone || '—'}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">
                      {teams.find((t) => t.teamId === emp.teamId)?.teamName || 'بدون فريق'}
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                      {emp.hireDate || '—'}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEmp(emp);
                            setCode(emp.employeeCode);
                            setName(emp.fullName);
                            setPhone(emp.phone);
                            setHireDate(emp.hireDate);
                            setTeamId(emp.teamId || '');
                            setNotes(emp.notes || '');
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 cursor-pointer"
                          title="تعديل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(emp)}
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 hover:bg-rose-50 text-rose-600 cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة الإضافة أو التعديل */}
      {(showAddModal || editingEmp) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 text-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {editingEmp ? 'تعديل بيانات المندوب' : 'إضافة مندوب جديد'}
            </h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="font-bold block mb-1">الكود الوظيفي</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسم المندوب الرباعي"
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">رقم الهاتف</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01012345678"
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">الفريق التابع له</label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                >
                  <option value="">بدون فريق</option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEmp(null);
                  }}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
