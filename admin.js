let allSkills = [];
let loadedStudents = [];
let currentAdminSkillSlug = '';
let currentStaffUser = null;
let cachedHistory = [];

const ROLE_NAMES = {
  super_admin: 'مدیر ارشد سامانه',
  counselor: 'مشاور تخصصی',
  principal: 'مدیر مدرسه',
  vice_principal: 'معاون مدرسه'
};

window.addEventListener('DOMContentLoaded', async () => {
  checkAuthSession();
});

function checkAuthSession() {
  const savedUser = sessionStorage.getItem('staffUser');
  if (savedUser) {
    try {
      currentStaffUser = JSON.parse(savedUser);
      showDashboard();
      return;
    } catch (e) {
      sessionStorage.removeItem('staffUser');
    }
  }
  showLoginForm();
}

function showLoginForm() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('admin-dashboard').classList.remove('hidden');

  document.getElementById('user-display-name').innerText = currentStaffUser.fullName || currentStaffUser.username;
  document.getElementById('user-display-role').innerText = ROLE_NAMES[currentStaffUser.role] || currentStaffUser.role;

  const addStaffBox = document.getElementById('add-staff-container');
  if (addStaffBox) {
    if (currentStaffUser.role === 'super_admin') {
      addStaffBox.classList.remove('hidden');
    } else {
      addStaffBox.classList.add('hidden');
    }
  }

  loadInitialMetadata();
  loadStudentsList();
}

async function handleStaffLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errBox = document.getElementById('login-error');
  errBox.classList.add('hidden');

  if (!username || !password) {
    errBox.innerText = 'نام کاربری و رمز عبور را وارد کنید.';
    errBox.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'staff-login', username, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      errBox.innerText = data.error || 'نام کاربری یا رمز نادرست است.';
      errBox.classList.remove('hidden');
      return;
    }

    sessionStorage.setItem('staffUser', JSON.stringify(data.user));
    currentStaffUser = data.user;
    showDashboard();

  } catch (err) {
    errBox.innerText = 'خطا در ارتباط با سرور.';
    errBox.classList.remove('hidden');
  }
}

function handleStaffLogout() {
  sessionStorage.removeItem('staffUser');
  currentStaffUser = null;
  location.reload();
}

function openChangePassModal() {
  document.getElementById('modal-old-pass').value = '';
  document.getElementById('modal-new-pass').value = '';
  document.getElementById('change-pass-modal').classList.remove('hidden');
}

function closeChangePassModal() {
  document.getElementById('change-pass-modal').classList.add('hidden');
}

async function submitChangePassword() {
  const oldPassword = document.getElementById('modal-old-pass').value.trim();
  const newPassword = document.getElementById('modal-new-pass').value.trim();

  if (!oldPassword || !newPassword) return alert('لطفاً هر دو فیلد رمز را پر کنید.');
  if (newPassword.length < 5) return alert('رمز جدید باید حداقل ۵ کاراکتر باشد.');

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'change-staff-password',
        username: currentStaffUser.username,
        oldPassword,
        newPassword
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('رمز عبور شما تغییر کرد.');
      closeChangePassModal();
    } else {
      alert(data.error || 'خطا در تغییر رمز عبور.');
    }
  } catch (e) {
    alert('خطا در ارتباط با سرور.');
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 transition';
  });

  const activeContent = document.getElementById(`tab-content-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeContent) activeContent.classList.remove('hidden');
  if (activeBtn) activeBtn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white transition';

  if (tabId === 'manage') {
    const manageSelect = document.getElementById('manage-skill-select');
    if (manageSelect && manageSelect.value) loadQuestionsForAdmin(manageSelect.value);
  } else if (tabId === 'staff') {
    loadStaffList();
  }
}

async function loadStaffList() {
  try {
    const res = await fetch('/api/auth');
    const staffList = await res.json();
    const tbody = document.getElementById('staff-table-body');

    if (!staffList || staffList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">هیچ پرسنلی یافت نشد.</td></tr>';
      return;
    }

    const isSuperAdmin = currentStaffUser && currentStaffUser.role === 'super_admin';

    tbody.innerHTML = staffList.map(s => `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 font-bold text-slate-800">${s.full_name}</td>
        <td class="p-3 text-slate-600 font-mono">${s.username}</td>
        <td class="p-3"><span class="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg text-[11px] font-bold">${ROLE_NAMES[s.role] || s.role}</span></td>
        <td class="p-3 text-left">
          ${(isSuperAdmin && s.role !== 'super_admin') 
            ? `<button onclick="deleteStaff(${s.id})" class="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 px-2 py-1 rounded-lg">حذف دسترسی</button>` 
            : '<span class="text-slate-400 text-[11px]">-</span>'}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('خطا در لیست پرسنل:', e);
  }
}

async function handleCreateStaff() {
  const full_name = document.getElementById('staff-name').value.trim();
  const username = document.getElementById('staff-username').value.trim();
  const password = document.getElementById('staff-password').value.trim();
  const role = document.getElementById('staff-role').value;

  if (!full_name || !username || !password) return alert('تمام فیلدها را پر کنید.');
  if (password.length < 5) return alert('رمز عبور باید حداقل ۵ رقم باشد.');

  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add-staff',
      requesterRole: currentStaffUser.role,
      full_name,
      username,
      password,
      role
    })
  });

  if (res.ok) {
    alert(`حساب کاربری برای ${full_name} ساخته شد.`);
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-username').value = '';
    document.getElementById('staff-password').value = '';
    loadStaffList();
  } else {
    const d = await res.json();
    alert(d.error || 'خطا در ثبت کادر جدید.');
  }
}

async function deleteStaff(staffId) {
  if (!confirm('آیا از حذف دسترسی این کاربر اطمینان دارید؟')) return;
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-staff', requesterRole: currentStaffUser.role, staffId })
  });
  if (res.ok) loadStaffList();
}

async function loadStudentsList() {
  const grade = document.getElementById('filter-grade').value;
  const classroom = document.getElementById('filter-classroom').value;

  try {
    const res = await fetch(`/api/students?grade=${encodeURIComponent(grade)}&classroom=${encodeURIComponent(classroom)}`);
    const data = await res.json();
    loadedStudents = data.students || [];

    if (data.stats) updateFilterDropdowns(data.stats);

    const tbody = document.getElementById('students-table-body');
    document.getElementById('students-count-badge').innerText = `تعداد: ${loadedStudents.length}`;

    if (loadedStudents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">دانش‌آموزی یافت نشد.</td></tr>';
      return;
    }

    const isSuperAdmin = currentStaffUser && currentStaffUser.role === 'super_admin';

    tbody.innerHTML = loadedStudents.map(s => `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 font-bold text-slate-600">${s.id}</td>
        <td class="p-3 font-bold text-slate-800">${s.student_name}</td>
        <td class="p-3"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px]">${s.grade}</span></td>
        <td class="p-3 text-slate-600">${s.classroom || '-'}</td>
        <td class="p-3 text-slate-500 font-mono">${s.parent_phone || '-'}</td>
        <td class="p-3 text-left space-x-2 space-x-reverse">
          ${isSuperAdmin ? `
            <button onclick="resetStudentPass('${s.id}')" title="بازنشانی رمز به ۴ رقم آخر" class="text-amber-600 hover:text-amber-800 text-xs font-bold bg-amber-50 px-2 py-1 rounded-lg">
              ریست رمز
            </button>
            <button onclick="deleteStudent('${s.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 px-2 py-1 rounded-lg">
              حذف
            </button>
          ` : '<span class="text-slate-400 text-[11px]">-</span>'}
        </td>
      </tr>
    `).join('');

    const studentSelect = document.getElementById('student-select');
    if (studentSelect) {
      const currentSelected = studentSelect.value;
      studentSelect.innerHTML = '<option value="">انتخاب پرونده...</option>' +
        loadedStudents.map(s => `<option value="${s.id}" ${s.id === currentSelected ? 'selected' : ''}>${s.student_name} (${s.id}) - پایه ${s.grade}</option>`).join('');
    }

  } catch (err) {
    console.error('خطا در لیست دانش‌آموزان:', err);
  }
}

function updateFilterDropdowns(stats) {
  const gradeSelect = document.getElementById('filter-grade');
  const classSelect = document.getElementById('filter-classroom');
  const currentGrade = gradeSelect.value;
  const currentClass = classSelect.value;

  const grades = [...new Set(stats.map(s => s.grade).filter(Boolean))];
  const classes = [...new Set(stats.map(s => s.classroom).filter(Boolean))];

  gradeSelect.innerHTML = '<option value="">همه پایه‌ها</option>' + grades.map(g => `<option value="${g}" ${g === currentGrade ? 'selected' : ''}>${g}</option>`).join('');
  classSelect.innerHTML = '<option value="">همه کلاس‌ها</option>' + classes.map(c => `<option value="${c}" ${c === currentClass ? 'selected' : ''}>${c}</option>`).join('');
}

async function saveSingleStudent() {
  const id = document.getElementById('std-id').value.trim();
  const student_name = document.getElementById('std-name').value.trim();
  const grade = document.getElementById('std-grade').value.trim();
  const classroom = document.getElementById('std-class').value.trim();
  const parent_phone = document.getElementById('std-phone').value.trim();

  if (!id || !student_name || !grade) return alert('کد ملی، نام و پایه الزامی هستند.');

  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save-single', id, student_name, grade, classroom, parent_phone })
  });

  if (res.ok) {
    document.getElementById('std-id').value = '';
    document.getElementById('std-name').value = '';
    document.getElementById('std-grade').value = '';
    document.getElementById('std-class').value = '';
    document.getElementById('std-phone').value = '';
    await loadStudentsList();
  } else {
    alert('خطا در ذخیره پرونده.');
  }
}

async function resetStudentPass(studentId) {
  const last4 = studentId.slice(-4);
  if (!confirm(`آیا رمز پرونده ${studentId} به (${last4}) بازنشانی شود؟`)) return;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset-student-password', requesterRole: currentStaffUser.role, studentId })
    });
    const data = await res.json();
    if (res.ok && data.success) alert(data.message);
    else alert(data.error || 'خطا در بازنشانی رمز.');
  } catch (e) {
    alert('خطا در ارتباط با سرور.');
  }
}

function handleBatchImport() {
  const fileInput = document.getElementById('csv-file-input');
  const file = fileInput.files[0];
  if (!file) return alert('لطفاً فایل CSV را انتخاب کنید.');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async function(results) {
      if (!results.data || results.data.length === 0) return alert('فایل داده‌ای ندارد.');
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import-batch', list: results.data })
      });
      if (res.ok) {
        const out = await res.json();
        alert(`${out.count} پرونده وارد شد.`);
        fileInput.value = '';
        await loadStudentsList();
      } else {
        alert('خطا در ورود داده‌ها.');
      }
    }
  });
}

async function deleteStudent(id) {
  if (!confirm(`آیا از حذف کامل پرونده ${id} اطمینان دارید؟`)) return;
  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id })
  });
  if (res.ok) await loadStudentsList();
}

function exportFilteredStudentsCSV() {
  if (!loadedStudents || loadedStudents.length === 0) return alert('دانش‌آموزی وجود ندارد.');
  const gradeVal = document.getElementById('filter-grade')?.value || 'همه';
  const classVal = document.getElementById('filter-classroom')?.value || 'همه';

  const headers = ['کد ملی', 'نام و نام خانوادگی', 'پایه', 'کلاس', 'شماره تماس ولی'];
  const rows = loadedStudents.map(s => [
    `"${String(s.id ?? '').replace(/"/g, '""')}"`,
    `"${String(s.student_name ?? '').replace(/"/g, '""')}"`,
    `"${String(s.grade ?? '').replace(/"/g, '""')}"`,
    `"${String(s.classroom ?? '').replace(/"/g, '""')}"`,
    `"${String(s.parent_phone ?? '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `لیست_دانش‌آموزان_${gradeVal}_${classVal}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadSampleCSV() {
  const csvContent = "\uFEFFid,student_name,grade,classroom,parent_phone\n101,علی رضایی,چهارم,=\"۴/۱\",=\"09123456789\"\n";
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'نمونه_دانش_آموزان.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function loadInitialMetadata() {
  try {
    const res = await fetch('/api/admin-reports?type=all-skills');
    allSkills = await res.json();

    const groupSelect = document.getElementById('skill-filter-select');
    if (groupSelect) {
      groupSelect.innerHTML = '<option value="">انتخاب مهارت...</option>' +
        allSkills.map(s => `<option value="${s.slug}">${s.title}</option>`).join('');
    }

    const manageSelect = document.getElementById('manage-skill-select');
    if (manageSelect) {
      manageSelect.innerHTML = allSkills.map(s => `<option value="${s.slug}">${s.title}</option>`).join('');
      if (allSkills.length > 0 && !currentAdminSkillSlug) {
        currentAdminSkillSlug = allSkills[0].slug;
        loadQuestionsForAdmin(allSkills[0].slug);
      }
    }
  } catch (e) {
    console.error('خطا در دریافت مهارت‌ها:', e);
  }
}

// تب ۲: مدیریت گزارش‌های فردی و سوابق هوش مصنوعی
function onStudentSelectChanged() {
  const studentId = document.getElementById('student-select').value;
  const btnAI = document.getElementById('btn-generate-ai');
  const historyCard = document.getElementById('ai-history-card');

  if (!studentId) {
    btnAI.classList.add('hidden');
    historyCard.classList.add('hidden');
    document.getElementById('student-report-results').innerHTML = '';
    return;
  }

  btnAI.classList.remove('hidden');
  historyCard.classList.remove('hidden');
  fetchStudentReport(studentId);
  loadRoadmapHistory(studentId);
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
        <td class="p-3 font-bold text-slate-400">#${i + 1}</td>
        <td class="p-3 font-bold text-slate-800">${r.skill_title}</td>
        <td class="p-3 font-black text-indigo-600">${r.total_score}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-md text-[11px] font-bold ${r.total_score >= 45 ? 'bg-emerald-100 text-emerald-700' : r.total_score >= 30 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}">${r.total_score >= 45 ? 'اولویت طلایی (A1)' : r.total_score >= 30 ? 'اولویت رشد (A)' : 'پتانسیل ثانویه'}</span></td>
      </tr>
    `).join('');
  } catch (e) {
    container.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">خطا در بارگذاری کارنامه.</td></tr>';
  }
}

async function loadRoadmapHistory(studentId) {
  const box = document.getElementById('history-container');
  box.innerHTML = '<span class="text-slate-400">در حال دریافت سوابق...</span>';

  try {
    const res = await fetch(`/api/generate-roadmap?studentId=${encodeURIComponent(studentId)}`);
    cachedHistory = await res.json();

    if (!cachedHistory || cachedHistory.length === 0) {
      box.innerHTML = '<span class="text-slate-500 italic">هنوز سندی صادر نشده است. با زدن دکمه بنفش بالا اولین نسخه را صادر کنید.</span>';
      return;
    }

    box.innerHTML = cachedHistory.map((item, idx) => `
      <button onclick="viewHistoricalRoadmap(${idx})" class="bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-600 hover:text-white transition flex items-center gap-1">
        <span>📄 نسخه ${item.version}</span>
        <span class="text-[10px] opacity-70">(${new Date(item.created_at).toLocaleDateString('fa-IR')})</span>
      </button>
    `).join('');
  } catch (e) {
    box.innerHTML = '<span class="text-red-500">خطا در دریافت سوابق.</span>';
  }
}

function viewHistoricalRoadmap(index) {
  const item = cachedHistory[index];
  const select = document.getElementById('student-select');
  const sName = select.options[select.selectedIndex]?.text || '';

  document.getElementById('modal-title').innerText = `کارنامه و نقشه راه رشد هوش مصنوعی - ${sName}`;
  document.getElementById('modal-subtitle').innerText = `نسخه شماره ${item.version} (ثبت شده در: ${new Date(item.created_at).toLocaleString('fa-IR')})`;
  document.getElementById('modal-content').innerText = item.analysis;
  document.getElementById('roadmap-modal').classList.remove('hidden');
}

async function generateNewRoadmapAnalysis() {
  const studentId = document.getElementById('student-select').value;
  const btn = document.getElementById('btn-generate-ai');
  if (!studentId) return alert('ابتدا دانش‌آموز را انتخاب کنید.');

  btn.disabled = true;
  btn.innerText = 'در حال تحلیل با جمنای و ذخیره نسخه جدید...';

  try {
    const res = await fetch('/api/generate-roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطا در صدور سند');

    await loadRoadmapHistory(studentId);
    viewHistoricalRoadmap(0);
  } catch (e) {
    alert('خطا: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = '✨ صدور کارنامه و تحلیل جدید هوش مصنوعی';
  }
}

function closeRoadmapModal() {
  document.getElementById('roadmap-modal').classList.add('hidden');
}

// تب ۳: گزارش گروهی
async function fetchSkillGroupReport(skillSlug) {
  const container = document.getElementById('skill-group-results');
  if (!skillSlug) { container.innerHTML = ''; return; }
  container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال رتبه‌بندی...</p>';

  try {
    const res = await fetch(`/api/admin-reports?type=by-skill&skill=${encodeURIComponent(skillSlug)}`);
    const records = await res.json();

    if (!records || records.length === 0) {
      container.innerHTML = '<p class="p-4 text-xs text-amber-600 text-center">داده‌ای برای این مهارت ثبت نشده است.</p>';
      return;
    }

    container.innerHTML = `
      <table class="w-full text-right text-xs">
        <thead class="bg-slate-50 text-slate-500 border-b">
          <tr>
            <th class="p-3">رتبه</th>
            <th class="p-3">کد ملی</th>
            <th class="p-3">نام دانش‌آموز</th>
            <th class="p-3">پایه</th>
            <th class="p-3 text-left">امتیاز</th>
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
    container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">خطا در دریافت گزارش.</p>';
  }
}

// تب ۴: مدیریت مهارت‌ها و سوالات
async function loadQuestionsForAdmin(slug) {
  currentAdminSkillSlug = slug;
  const listContainer = document.getElementById('admin-questions-list');
  if (!listContainer) return;
  listContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال دریافت سوالات...</p>';

  try {
    const res = await fetch(`/api/questions?skill=${encodeURIComponent(slug)}`);
    const questions = await res.json();

    if (!questions || questions.length === 0) {
      listContainer.innerHTML = '<p class="text-xs text-amber-600 text-center py-4">سوالی برای این مهارت ثبت نشده است.</p>';
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
    listContainer.innerHTML = '<p class="text-xs text-red-500 text-center py-4">خطا در بارگذاری سوالات.</p>';
  }
}

async function addQuestionToSkill() {
  const text = document.getElementById('new-question-text').value.trim();
  if (!text) return alert('متن سوال را وارد کنید.');

  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', skillSlug: currentAdminSkillSlug, questionText: text, displayOrder: 99 })
  });

  if (res.ok) {
    document.getElementById('new-question-text').value = '';
    loadQuestionsForAdmin(currentAdminSkillSlug);
  } else {
    alert('خطا در ثبت سوال.');
  }
}

async function updateQuestion(id, order) {
  const newText = document.getElementById(`q-text-${id}`).value.trim();
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'edit', id, questionText: newText, displayOrder: order })
  });
  if (res.ok) alert('تغییرات ذخیره شد.');
}

async function deleteQuestion(id) {
  if (!confirm('آیا از حذف این گویه مطمئن هستید؟')) return;
  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id })
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
    alert('خطا در ثبت مهارت.');
  }
}

async function deleteSelectedSkill() {
  if (!confirm(`آیا از حذف کامل مهارت "${currentAdminSkillSlug}" اطمینان دارید؟`)) return;
  const res = await fetch('/api/admin-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-skill', slug: currentAdminSkillSlug })
  });
  if (res.ok) await loadInitialMetadata();
}
