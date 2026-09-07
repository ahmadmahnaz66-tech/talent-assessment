let allSkills = [];
let allStudents = [];
let currentAdminSkillSlug = '';

document.addEventListener('DOMContentLoaded', async () => {
  await loadInitialMetadata();
});

// مدیریت تب‌ها
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 transition';
  });

  const activeContent = document.getElementById(`tab-content-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeContent) activeContent.classList.remove('hidden');
  if (activeBtn) activeBtn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white transition';

  if (tabId === 'manage' && (!currentAdminSkillSlug || currentAdminSkillSlug === '')) {
    if (allSkills.length > 0) loadQuestionsForAdmin(allSkills[0].slug);
  }
}

// بارگذاری اطلاعات اولیه دانش‌آموزان و مهارت‌ها
async function loadInitialMetadata() {
  try {
    const [skillsRes, studentsRes] = await Promise.all([
      fetch('/api/admin-reports?type=all-skills'),
      fetch('/api/admin-reports?type=all-students')
    ]);

    allSkills = await skillsRes.json();
    allStudents = await studentsRes.json();

    populateSelectBoxes();
  } catch (err) {
    console.error('خطا در دریافت متادیتا:', err);
  }
}

function populateSelectBoxes() {
  // ۱. دراپ‌داون دانش‌آموزان
  const studentSelect = document.getElementById('student-select');
  if (studentSelect) {
    studentSelect.innerHTML = '<option value="">انتخاب پرونده دانش‌آموز...</option>' +
      allStudents.map(s => `<option value="${s.id}">${s.student_name} (${s.id}) - پایه ${s.grade || '-'}</option>`).join('');
  }

  // ۲. دراپ‌داون مهارت‌ها در گزارش گروهی
  const groupSelect = document.getElementById('skill-filter-select');
  if (groupSelect) {
    groupSelect.innerHTML = '<option value="">انتخاب مهارت...</option>' +
      allSkills.map(s => `<option value="${s.slug}">${s.title}</option>`).join('');
  }

  // ۳. دراپ‌داون مهارت‌ها در مدیریت
  const manageSelect = document.getElementById('manage-skill-select');
  if (manageSelect) {
    manageSelect.innerHTML = allSkills.map(s => `<option value="${s.slug}">${s.title}</option>`).join('');
    if (allSkills.length > 0) {
      loadQuestionsForAdmin(allSkills[0].slug);
    }
  }
}

// تب ۱: گزارش فردی
async function fetchStudentReport(studentId) {
  const container = document.getElementById('student-report-results');
  if (!studentId) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال دریافت نتایج...</p>';

  try {
    const res = await fetch(`/api/admin-reports?type=by-student&studentId=${encodeURIComponent(studentId)}`);
    const records = await res.json();

    if (!records || records.length === 0) {
      container.innerHTML = '<div class="p-4 bg-white rounded-xl text-center text-xs text-amber-600 border">هنوز پاسخی برای این دانش‌آموز ثبت نشده است.</div>';
      return;
    }

    container.innerHTML = records.map((r, i) => `
      <div class="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center">${i + 1}</span>
          <span class="text-xs font-bold text-slate-800">${r.skill_title}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400">امتیاز کل:</span>
          <span class="text-sm font-black text-indigo-600">${r.total_score}</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<p class="text-xs text-red-500 text-center">خطا در بارگذاری کارنامه.</p>';
  }
}

// تب ۲: گزارش گروهی
async function fetchSkillGroupReport(skillSlug) {
  const container = document.getElementById('skill-group-results');
  if (!skillSlug) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال محاسبه و رتبه‌بندی...</p>';

  try {
    const res = await fetch(`/api/admin-reports?type=by-skill&skill=${encodeURIComponent(skillSlug)}`);
    const records = await res.json();

    if (!records || records.length === 0) {
      container.innerHTML = '<p class="p-4 text-xs text-amber-600 text-center">هیچ داده‌ای برای این مهارت ثبت نشده است.</p>';
      return;
    }

    container.innerHTML = `
      <table class="w-full text-right text-xs">
        <thead class="bg-slate-50 text-slate-500 border-b">
          <tr>
            <th class="p-3">رتبه</th>
            <th class="p-3">کد</th>
            <th class="p-3">نام دانش‌آموز</th>
            <th class="p-3">پایه</th>
            <th class="p-3 text-left">امتیاز مهارت</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${records.map((r, i) => `
            <tr class="hover:bg-slate-50 transition">
              <td class="p-3 font-bold ${i < 3 ? 'text-indigo-600' : 'text-slate-400'}">${i + 1}</td>
              <td class="p-3">${r.id}</td>
              <td class="p-3 font-bold text-slate-700">${r.student_name}</td>
              <td class="p-3">${r.grade || '-'}</td>
              <td class="p-3 text-left font-black text-indigo-600">${r.total_score}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">خطا در دریافت گزارش مهارت.</p>';
  }
}

// تب ۳: مدیریت مهارت‌ها و سوالات
async function loadQuestionsForAdmin(slug) {
  currentAdminSkillSlug = slug;
  const listContainer = document.getElementById('admin-questions-list');
  listContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال دریافت سوالات...</p>';

  try {
    const res = await fetch(`/api/questions?skill=${encodeURIComponent(slug)}`);
    const questions = await res.json();

    if (!questions || questions.length === 0) {
      listContainer.innerHTML = '<p class="text-xs text-amber-600 text-center py-4">هنوز سوالی برای این مهارت تعریف نشده است.</p>';
      return;
    }

    listContainer.innerHTML = questions.map((q, idx) => `
      <div class="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
        <span class="text-slate-400 font-bold">${idx + 1}.</span>
        <input type="text" id="q-text-${q.id}" value="${q.question_text}" class="flex-1 bg-transparent border-b border-transparent focus:border-indigo-500 outline-none text-slate-700 py-1">
        <div class="flex gap-1.5">
          <button onclick="updateQuestion(${q.id}, ${idx + 1})" class="bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg hover:bg-indigo-100 font-bold transition">ذخیره</button>
          <button onclick="deleteQuestion(${q.id})" class="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-100 font-bold transition">حذف</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    listContainer.innerHTML = '<p class="text-xs text-red-500 text-center py-4">خطا در بارگذاری گویه‌ها.</p>';
  }
}

async function addQuestionToSkill() {
  const textInput = document.getElementById('new-question-text');
  const text = textInput.value.trim();
  if (!text) return alert('لطفاً متن سوال را وارد کنید.');

  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add',
      skillSlug: currentAdminSkillSlug,
      questionText: text,
      displayOrder: 99
    })
  });

  if (res.ok) {
    textInput.value = '';
    loadQuestionsForAdmin(currentAdminSkillSlug);
  } else {
    alert('خطا در ثبت سوال جدید.');
  }
}

async function updateQuestion(id, order) {
  const newText = document.getElementById(`q-text-${id}`).value.trim();
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      id: id,
      questionText: newText,
      displayOrder: order
    })
  });
  if (res.ok) alert('تغییرات با موفقیت ذخیره شد.');
}

async function deleteQuestion(id) {
  if (!confirm('آیا از حذف این گویه مطمئن هستید؟')) return;
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id: id })
  });
  if (res.ok) loadQuestionsForAdmin(currentAdminSkillSlug);
}

async function createNewSkill() {
  const slug = document.getElementById('new-skill-slug').value.trim();
  const title = document.getElementById('new-skill-title').value.trim();
  if (!slug || !title) return alert('هر دو فیلد الزامی هستند.');

  const res = await fetch('/api/admin-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-skill', slug, title })
  });

  if (res.ok) {
    document.getElementById('new-skill-slug').value = '';
    document.getElementById('new-skill-title').value = '';
    await loadInitialMetadata();
  } else {
    alert('خطا در ثبت مهارت (ممکن است شناسه تکراری باشد).');
  }
}

async function deleteSelectedSkill() {
  if (!confirm(`آیا از حذف کامل مهارت "${currentAdminSkillSlug}" و تمام سوالات آن اطمینان دارید؟`)) return;
  const res = await fetch('/api/admin-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-skill', slug: currentAdminSkillSlug })
  });
  if (res.ok) await loadInitialMetadata();
}
