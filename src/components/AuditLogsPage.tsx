import React, { useState } from 'react';
import { ShieldAlert, Search, Filter, Clock, CheckCircle, XCircle } from 'lucide-react';
import { AuditLogItem } from '../types';
import { formatFirestoreTimestamp } from '../services/firestoreService';

interface AuditLogsPageProps {
  logs: AuditLogItem[];
}

export const AuditLogsPage: React.FC<AuditLogsPageProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'security' | 'operational'>('all');

  const filteredLogs = logs.filter((log) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      log.actorName.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.targetId.toLowerCase().includes(q) ||
      log.reason.toLowerCase().includes(q);

    const matchCategory = categoryFilter === 'all' || log.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <ShieldAlert className="w-5 h-5 text-indigo-600" />
            <span>سجل الرقابة والعمليات الأمنية (Audit Logs)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            توثيق رقمي فوري لجميع العمليات الإدارية، تعديلات الصلاحيات، وحركات الحسابات في Firestore.
          </p>
        </div>
        <span className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg font-mono">
          إجمالي السجلات: {logs.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالمنفذ، نوع العملية، أو السبب..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | 'security' | 'operational')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
        >
          <option value="all">جميع الفئات</option>
          <option value="security">أمنية (صلاحيات، حسابات، حظر)</option>
          <option value="operational">تشغيلية (حضور، شفتات، فرق)</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">التوقيت</th>
                <th className="p-3.5">المنفّذ (Actor)</th>
                <th className="p-3.5">العملية والهدف</th>
                <th className="p-3.5">الفئة</th>
                <th className="p-3.5">المبرر الإداري</th>
                <th className="p-3.5 text-center">النتيجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا توجد سجلات رقابة مسجلة مطابقة للبحث.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.logId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 font-mono text-[11px] text-slate-400">
                      {formatFirestoreTimestamp(log.timestamp)}
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{log.actorName}</div>
                      <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-indigo-600 dark:text-indigo-400">{log.action}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {log.targetType}: {log.targetId}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.category === 'security'
                          ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600'
                          : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                      }`}>
                        {log.category === 'security' ? 'أمني' : 'تشغيلي'}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {log.reason || '—'}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                        log.result === 'success' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {log.result === 'success' ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" /> ناجح
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> مرفوض
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
