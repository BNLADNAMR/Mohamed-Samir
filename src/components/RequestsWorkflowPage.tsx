import React, { useState } from 'react';
import { FileText, Plus, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { Employee, UserProfile, WorkflowRequest, WorkflowRequestType } from '../types';
import { submitWorkflowRequest, reviewWorkflowRequest } from '../services/firestoreService';

interface RequestsWorkflowPageProps {
  currentUser: UserProfile;
  requests: WorkflowRequest[];
  employees: Employee[];
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const RequestsWorkflowPage: React.FC<RequestsWorkflowPageProps> = ({
  currentUser,
  requests,
  employees,
  onNotify,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [requestType, setRequestType] = useState<WorkflowRequestType>('leave');
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [reviewModalReq, setReviewModalReq] = useState<WorkflowRequest | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  const isManagerOrAdmin =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'operations_manager' ||
    currentUser.role === 'supervisor';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    try {
      const newReq: WorkflowRequest = {
        requestId: `req_${Date.now()}`,
        employeeId: currentUser.employeeId || currentUser.uid,
        employeeName: currentUser.name,
        teamId: currentUser.teamId || '',
        submittedBy: currentUser.uid,
        submitterRole: currentUser.role,
        requestType,
        requestDate,
        proposedStartTime: '09:00',
        proposedEndTime: '17:00',
        description: description.trim(),
        evidenceUrl: '',
        status: 'pending',
        supervisorRecommendation: '',
        reviewedBy: '',
        reviewerName: '',
        reviewComment: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await submitWorkflowRequest(currentUser, newReq);
      onNotify('تم إرسال طلبك بنجاح وجاري مراجعته من الإدارة.', 'success');
      setDescription('');
      setShowModal(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إرسال الطلب.', 'error');
    }
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!reviewModalReq) return;
    try {
      await reviewWorkflowRequest(currentUser, reviewModalReq.requestId, status, reviewComment);
      onNotify(`تم ${status === 'approved' ? 'اعتماد' : 'رفض'} الطلب بنجاح.`, 'success');
      setReviewModalReq(null);
      setReviewComment('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر مراجعة الطلب.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <FileText className="w-5 h-5 text-indigo-600" />
            <span>طلبات الإجازات وتصحيح الشفتات</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تقديم طلبات الإجازات والأعذار الرسمية مع دورة اعتماد إدارية وتسجيل التوثيق في قاعدة البيانات.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>تقديم طلب جديد</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">صاحب الطلب</th>
                <th className="p-3.5">نوع الطلب</th>
                <th className="p-3.5">تاريخ الطلب</th>
                <th className="p-3.5">التفاصيل والمبرر</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">الاعتماد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا توجد طلبات مسجلة حالياً.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.requestId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{req.employeeName}</div>
                      <span className="text-[10px] text-slate-400 font-mono">{req.submitterRole}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-slate-100 dark:bg-slate-800">
                        {req.requestType === 'leave' ? 'إجازة اعتيادية' : 'تصحيح شفت'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-slate-500">{req.requestDate}</td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {req.description}
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        req.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-600'
                          : req.status === 'rejected'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}>
                        {req.status === 'approved'
                          ? 'معتمد'
                          : req.status === 'rejected'
                          ? 'مرفوض'
                          : 'قيد المراجعة'}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {isManagerOrAdmin && req.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => setReviewModalReq(req)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                        >
                          مراجعة
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[10px]">
                          {req.reviewerName ? `بواسطة: ${req.reviewerName}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 text-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">تقديم طلب إجازة أو تصحيح</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="font-bold block mb-1">نوع الطلب</label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as WorkflowRequestType)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                >
                  <option value="leave">إجازة اعتيادية / عارضة</option>
                  <option value="attendance_correction">تصحيح موعد حضور أو انصراف</option>
                  <option value="shift_modification">طلب تبديل موعد شفت</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">تاريخ اليوم المطلوب</label>
                <input
                  type="date"
                  required
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">المبرر والتفاصيل</label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="اكتب سبب الطلب بوضوح ليظهر للمشرف..."
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
                >
                  إرسال الطلب
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 text-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              اعتماد أو رفض طلب: {reviewModalReq.employeeName}
            </h3>
            <p className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300">
              {reviewModalReq.description}
            </p>
            <div>
              <label className="font-bold block mb-1">ملاحظة الاعتماد أو سبب الرفض</label>
              <textarea
                rows={2}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="ملاحظات تظهر لمقدم الطلب وتوثق في Audit Log..."
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => handleReview('approved')}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
              >
                اعتماد الطلب
              </button>
              <button
                type="button"
                onClick={() => handleReview('rejected')}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold"
              >
                رفض الطلب
              </button>
              <button
                type="button"
                onClick={() => setReviewModalReq(null)}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
