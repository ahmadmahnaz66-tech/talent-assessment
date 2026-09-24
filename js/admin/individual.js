// js/admin/individual.js

function onStudentSelectChanged() {
  const studentSelect = document.getElementById('student-select');
  const studentId = studentSelect ? studentSelect.value.trim() : '';
  const btnAI = document.getElementById('btn-generate-ai');
  const historyCard = document.getElementById('ai-history-card');

  if (!studentId) {
    if (btnAI) btnAI.classList.add('hidden');
    if (historyCard) historyCard.classList.add('hidden');
    const resContainer = document.getElementById('student-report-results');
    if (resContainer) resContainer.innerHTML = '';
    return;
  }

  if (btnAI) btnAI.classList.remove('hidden');
  if (historyCard) historyCard.classList.remove('hidden');
  fetchStudentReport(studentId);
  loadRoadmapHistory(studentId);
  loadStudentHistory(studentId);
}

async function fetchStudentReport(studentId) {
  const container = document.getElementById('student-report-results');
  container.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">در حال دریافت نتایج...</td></tr>';

  try {
    const res = await fetch(`/api/admin-reports?type=by-student&studentId=${encodeURIComponent(studentId)}`);
    const records = await res.json();

    if (!records || records.length === 0) {
      container.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-amber-600">هنوز پاسخی برای این پرونده ثبت نشده است.</td></tr>';
      return;
    }

    container.innerHTML = records.map((r, i) => `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 text-center font-bold text-slate-400">#${i + 1}</td>
        <td class="p-3 font-bold text-slate-800">${r.skill_title}</td>
        <td class="p-3 text-center font-black text-indigo-600">${r.total_score}</td>
        <td class="p-3 text-center">
          ${r.total_score >= 45 
            ? '<span class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-700">اولویت طلایی (A1)</span>'
            : (r.total_score === 30 || r.is_default)
              ? '<span class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">تکمیل‌نشده (رد شده) ⚠️</span>'
              : r.total_score > 30 
                ? '<span class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-700">اولویت رشد (A)</span>'
                : '<span class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600">پتانسیل ثانویه</span>'}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    container.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">خطا در بارگذاری کارنامه.</td></tr>';
  }
}

async function generateNewRoadmapAnalysis() {
  const select = document.getElementById('student-select');
  const nationalId = select ? select.value.trim() : '';
  const btn = document.getElementById('btn-generate-ai');
  if (!nationalId) return alert('ابتدا دانش‌آموز را انتخاب کنید.');

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span><span>در حال تحلیل با جمنای و ذخیره نسخه جدید...</span>';

  try {
    const res = await fetch('/api/generate-roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nationalId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در صدور سند');

    await loadRoadmapHistory(nationalId);
    await loadStudentHistory(nationalId);
    viewHistoricalRoadmap(0);
  } catch (e) {
    alert('خطا: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ صدور کارنامه و تحلیل جدید هوش مصنوعی';
  }
}

function filterStudentDropdown(query) {
  const select = document.getElementById('student-select');
  if (!select) return;

  const cleanQuery = query.trim().toLowerCase();
  const currentVal = select.value;

  const filtered = loadedStudents.filter(s => {
    const fullName = (s.student_name || `${s.first_name || ''} ${s.last_name || ''}`).toLowerCase();
    const id = String(s.id).toLowerCase();
    const grade = String(s.grade || '').toLowerCase();
    return fullName.includes(cleanQuery) || id.includes(cleanQuery) || grade.includes(cleanQuery);
  });

  select.innerHTML = '<option value="">انتخاب پرونده...</option>' +
    filtered.map(s => `
      <option value="${s.id}" ${s.id === currentVal ? 'selected' : ''}>
        ${s.student_name || (s.first_name + ' ' + s.last_name)} (${s.id}) - پایه ${s.grade}
      </option>
    `).join('');

  if (filtered.length === 1 && cleanQuery.length >= 2) {
    select.value = filtered[0].id;
    onStudentSelectChanged();
  }
}
