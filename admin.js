let allSkills = [];
let loadedStudents = [];
let currentAdminSkillSlug = '';
let currentStaffUser = null;
let cachedHistory = [];
let cachedExposureTrials = [];
let editingTrialId = null;
let gardnerChartInstance = null;
let reqChartInstance = null;

const ROLE_NAMES = {
  super_admin: 'مدیر ارشد سامانه',
  counselor: 'مشاور تخصصی',
  principal: 'مدیر مدرسه',
  vice_principal: 'معاون مدرسه'
};

const GARDNER_LABELS_FA = {
  logical_mathematical: 'منطقی-ریاضی',
  spatial_visual: 'دیداری-فضایی',
  bodily_kinesthetic: 'بدنی-جنبشی',
  musical_rhythmic: 'موسیقایی-ریتمیک',
  linguistic: 'زبانی-کلامی',
  interpersonal: 'میان‌فردی (اجتماعی)',
  intrapersonal: 'درون‌فردی (هیجانی)',
  naturalist: 'طبیعت‌گرا'
};

// تابع اختصاصی تبدیل دقیق تاریخ و ساعت به وقت رسمی ایران
function formatIranDateTime(rawDateStr) {
  if (!rawDateStr) return '-';
  try {
    let s = String(rawDateStr).trim().replace(' ', 'T');
    if (!s.endsWith('Z') && !s.includes('+')) {
      s += 'Z';
    }
    const d = new Date(s);
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d);
  } catch (e) {
    return rawDateStr;
  }
}

// پارسر بومی مارک‌داون بدون وابستگی و پاکسازی هشتگ‌ها و ستاره‌ها
function parseMarkdownToHTML(markdownText) {
  if (!markdownText) return '';

  let html = markdownText
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s*(.*$)/gim, '<h3 class="font-extrabold text-indigo-950 mt-4 mb-2 text-sm md:text-base border-b border-indigo-100 pb-1">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-slate-900 bg-indigo-50/60 px-1 py-0.5 rounded">$1</strong>')
    .replace(/^\* (.*$)/gim, '<li class="mr-4 list-disc leading-relaxed text-slate-700 my-1">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="mr-4 list-disc leading-relaxed text-slate-700 my-1">$1</li>')
    .replace(/\n\n/g, '</p><p class="my-2.5 leading-relaxed text-slate-700 text-justify">')
    .replace(/\n/g, '<br/>');

  html = html.replace(/#{1,6}/g, '').replace(/\*{1,2}/g, '');

  return `<div class="leading-relaxed text-slate-700 space-y-2">${html}</div>`;
}

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

// تب ۱: مدیریت دانش‌آموزان با ستون‌های تفکیک‌شده
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
      tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">دانش‌آموزی یافت نشد.</td></tr>';
      return;
    }

    const isSuperAdmin = currentStaffUser && (currentStaffUser.role === 'super_admin' || currentStaffUser.role === 'principal');

    tbody.innerHTML = loadedStudents.map(s => {
      const fName = s.first_name || (s.student_name ? s.student_name.split(' ')[0] : '-');
      const lName = s.last_name || (s.student_name ? s.student_name.split(' ').slice(1).join(' ') : '-');
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 font-bold text-slate-600 font-mono">${s.id}</td>
          <td class="p-3 font-bold text-slate-800">${fName}</td>
          <td class="p-3 font-bold text-slate-800">${lName}</td>
          <td class="p-3"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px]">${s.grade}</span></td>
          <td class="p-3 text-slate-600">${s.classroom || '-'}</td>
          <td class="p-3 text-slate-500 font-mono">${s.father_phone || s.parent_phone || '-'}</td>
          <td class="p-3 text-slate-500 font-mono">${s.mother_phone || '-'}</td>
    <td class="p-3 text-left space-x-1.5 space-x-reverse whitespace-nowrap">
            ${isSuperAdmin ? `
              <button onclick="editStudentInfo('${s.id}')" title="ویرایش اطلاعات دانش‌آموز" class="text-blue-600 hover:text-blue-800 text-xs font-bold bg-blue-50 px-2 py-1 rounded-lg">
                ویرایش 📝
              </button>
              <button onclick="setCustomStudentPass('${s.id}')" title="تعیین رمز عبور دلخواه" class="text-indigo-600 hover:text-indigo-800 text-xs font-bold bg-indigo-50 px-2 py-1 rounded-lg">
                تعیین رمز ✏️
              </button>
              <button onclick="resetStudentPass('${s.id}')" title="بازنشانی رمز به پیش‌فرض" class="text-amber-600 hover:text-amber-800 text-xs font-bold bg-amber-50 px-2 py-1 rounded-lg">
                ریست
              </button>
              <button onclick="deleteStudent('${s.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 px-2 py-1 rounded-lg">
                حذف
              </button>
            ` : '<span class="text-slate-400 text-[11px]">-</span>'}
          </td>
          
        </tr>
      `;
    }).join('');

    const studentSelect = document.getElementById('student-select');
    if (studentSelect) {
      const currentSelected = studentSelect.value;
      studentSelect.innerHTML = '<option value="">انتخاب پرونده...</option>' +
        loadedStudents.map(s => `<option value="${s.id}" ${s.id === currentSelected ? 'selected' : ''}>${s.student_name || (s.first_name + ' ' + s.last_name)} (${s.id}) - پایه ${s.grade}</option>`).join('');
    }

    const expStudentSelect = document.getElementById('exposure-student-select');
    if (expStudentSelect) {
      const currentExpSelected = expStudentSelect.value;
      expStudentSelect.innerHTML = '<option value="">انتخاب پرونده...</option>' +
        loadedStudents.map(s => `<option value="${s.id}">${s.student_name || (s.first_name + ' ' + s.last_name)} (${s.id}) - پایه ${s.grade}</option>`).join('');
    }

  } catch (err) {
    console.error('خطا در لیست دانش‌آموزان:', err);
  }
}

let allSchoolStats = [];

function updateFilterDropdowns(stats) {
  allSchoolStats = stats || [];
  const gradeSelect = document.getElementById('filter-grade');
  const currentGrade = gradeSelect.value;

  const grades = [...new Set(allSchoolStats.map(s => s.grade).filter(Boolean))];

  gradeSelect.innerHTML = '<option value="">همه پایه‌ها</option>' + 
    grades.map(g => `<option value="${g}" ${g === currentGrade ? 'selected' : ''}>${g}</option>`).join('');

  updateClassDropdown();
}

function updateClassDropdown() {
  const selectedGrade = document.getElementById('filter-grade').value;
  const classSelect = document.getElementById('filter-classroom');
  const currentClass = classSelect.value;

  // فیلتر کردن کلاس‌ها: اگر پایه‌ای انتخاب شده بود فقط کلاس‌های همان پایه، وگرنه همه کلاس‌ها
  const filteredStats = selectedGrade 
    ? allSchoolStats.filter(s => s.grade === selectedGrade)
    : allSchoolStats;

  const availableClasses = [...new Set(filteredStats.map(s => s.classroom).filter(Boolean))];

  // اگر کلاس قبلاً انتخاب‌شده در پایه جدید وجود نداشت، بازنشانی شود
  const isCurrentStillValid = availableClasses.includes(currentClass);
  const activeClassVal = isCurrentStillValid ? currentClass : '';

  classSelect.innerHTML = '<option value="">همه کلاس‌ها</option>' + 
    availableClasses.map(c => `<option value="${c}" ${c === activeClassVal ? 'selected' : ''}>${c}</option>`).join('');

  if (!isCurrentStillValid) {
    classSelect.value = '';
  }
}

function onGradeFilterChanged() {
  updateClassDropdown();
  loadStudentsList();
}

async function saveSingleStudent() {
  const id = document.getElementById('std-id').value.trim();
  const first_name = document.getElementById('std-first-name').value.trim();
  const last_name = document.getElementById('std-last-name').value.trim();
  const grade = document.getElementById('std-grade').value.trim();
  const classroom = document.getElementById('std-class').value.trim();
  const father_phone = document.getElementById('std-father-phone').value.trim();
  const mother_phone = document.getElementById('std-mother-phone').value.trim();

  if (!id || !first_name || !last_name || !grade) {
    return alert('کد ملی، نام، نام خانوادگی و پایه الزامی هستند.');
  }

  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save-single', id, first_name, last_name, grade, classroom, father_phone, mother_phone })
  });

  if (res.ok) {
    document.getElementById('std-id').value = '';
    document.getElementById('std-first-name').value = '';
    document.getElementById('std-last-name').value = '';
    document.getElementById('std-grade').value = '';
    document.getElementById('std-class').value = '';
    document.getElementById('std-father-phone').value = '';
    document.getElementById('std-mother-phone').value = '';
    await loadStudentsList();
  } else {
    alert('خطا در ذخیره پرونده.');
  }
}

// دانلود فایل نمونه (CSV یا XLSX)
function downloadSampleFile(type) {
  if (type === 'xlsx') {
    if (typeof XLSX === 'undefined') {
      return alert('کتابخانه اکسل هنوز لود نشده است. لطفاً صفحه را رفرش فرمایید.');
    }
    const sampleData = [
      {
        'کد ملی': '101',
        'نام': 'علی',
        'نام خانوادگی': 'رضایی',
        'پایه': 'چهارم',
        'کلاس': '۴/۱',
        'شماره تماس پدر': '09123456789',
        'شماره تماس مادر': '09129876543'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'دانش‌آموزان');
    XLSX.writeFile(wb, 'نمونه_دانش_آموزان.xlsx');
  } else {
    const headers = ['کد ملی', 'نام', 'نام خانوادگی', 'پایه', 'کلاس', 'شماره تماس پدر', 'شماره تماس مادر'];
    const row = ['101', 'علی', 'رضایی', 'چهارم', '۴/۱', '09123456789', '09129876543'];
    const csvContent = '\uFEFF' + headers.join(',') + '\r\n' + row.join(',') + '\r\n';
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'نمونه_دانش_آموزان.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

// ایمپورت منعطف انواع فایل‌های اکسل (xlsx, xls) و متنی (csv)
function handleBatchImport() {
  const fileInput = document.getElementById('excel-file-input') || document.getElementById('csv-file-input');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    return alert('لطفاً یک فایل Excel (.xlsx, .xls) یا CSV انتخاب کنید.');
  }

  const file = fileInput.files[0];
  const isCSV = file.name.endsWith('.csv');

  if (isCSV && typeof XLSX === 'undefined') {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        await sendBatchToServer(results.data, fileInput);
      }
    });
    return;
  }

  if (typeof XLSX === 'undefined') {
    return alert('کتابخانه اکسل لود نشده است. لطفاً صفحه را مجدداً بارگذاری کنید.');
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rows || rows.length === 0) {
        return alert('فایل انتخاب‌شده خالی است یا ساختار نامعتبر دارد.');
      }

      await sendBatchToServer(rows, fileInput);
    } catch (err) {
      alert('خطا در خواندن فایل اکسل: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ارسال داده‌ها به سرور و نرمال‌سازی شماره‌های موبایل
async function sendBatchToServer(rows, fileInput) {
  const normalizedRows = rows.map(r => {
    let fPhone = String(r['شماره تماس پدر'] || r.father_phone || '').trim();
    let mPhone = String(r['شماره تماس مادر'] || r.mother_phone || '').trim();
    
    // تصحیح شماره‌های ۱۰ رقمی در صورت افتادن صفر اول در اکسل
    if (fPhone.length === 10 && fPhone.startsWith('9')) fPhone = '0' + fPhone;
    if (mPhone.length === 10 && mPhone.startsWith('9')) mPhone = '0' + mPhone;

    return {
      ...r,
      'شماره تماس پدر': fPhone,
      'شماره تماس مادر': mPhone
    };
  });

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import-batch', list: normalizedRows })
    });

    if (res.ok) {
      const out = await res.json();
      alert(`${out.count} پرونده با موفقیت در دیتابیس ثبت و به‌روزرسانی شد.`);
      fileInput.value = '';
      await loadStudentsList();
    } else {
      const d = await res.json();
      alert(d.error || 'خطا در ثبت اطلاعات پرونده‌ها.');
    }
  } catch (err) {
    alert('خطا در اتصال به سرور جهت آپلود: ' + err.message);
  }
}

// خروجی اکسل رسمی از لیست فیلترشده
function exportStudentsExcel() {
  if (!loadedStudents || loadedStudents.length === 0) return alert('دانش‌آموزی در لیست وجود ندارد.');
  
  const gradeVal = document.getElementById('filter-grade')?.value || 'همه';
  const classVal = document.getElementById('filter-classroom')?.value || 'همه';

  const exportData = loadedStudents.map(s => ({
    'کد ملی': String(s.id),
    'نام': s.first_name || (s.student_name ? s.student_name.split(' ')[0] : ''),
    'نام خانوادگی': s.last_name || (s.student_name ? s.student_name.split(' ').slice(1).join(' ') : ''),
    'پایه': s.grade || '',
    'کلاس': s.classroom || '',
    'شماره تماس پدر': s.father_phone || s.parent_phone || '',
    'شماره تماس مادر': s.mother_phone || ''
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'لیست دانش‌آموزان');
  XLSX.writeFile(wb, `لیست_دانش‌آموزان_${gradeVal}_${classVal}.xlsx`);
}

async function setCustomStudentPass(studentId) {
  const newPass = prompt(`لطفاً رمز عبور جدید برای دانش‌آموز (${studentId}) را وارد کنید:`);
  if (!newPass) return;

  if (newPass.trim().length < 3) {
    return alert('رمز عبور باید حداقل ۳ کاراکتر باشد.');
  }

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set-student-password',
        requesterRole: currentStaffUser.role,
        studentId: studentId,
        newPassword: newPass.trim()
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(data.message);
    } else {
      alert(data.error || 'خطا در تعیین رمز عبور.');
    }
  } catch (e) {
    alert('خطا در ارتباط با سرور.');
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

async function deleteStudent(id) {
  if (!confirm(`آیا از حذف کامل پرونده ${id} اطمینان دارید؟`)) return;
  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id })
  });
  if (res.ok) await loadStudentsList();
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

    const expSkillSelect = document.getElementById('exposure-skill-select');
    if (expSkillSelect) {
      expSkillSelect.innerHTML = allSkills.map(s => `<option value="${s.slug}">${s.title}</option>`).join('');
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
        <td class="p-3 text-center font-bold text-slate-400">#${i + 1}</td>
        <td class="p-3 font-bold text-slate-800">${r.skill_title}</td>
        <td class="p-3 text-center font-black text-indigo-600">${r.total_score}</td>
        <td class="p-3 text-center"><span class="px-2.5 py-1 rounded-md text-[11px] font-bold ${r.total_score >= 45 ? 'bg-emerald-100 text-emerald-700' : r.total_score >= 30 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}">${r.total_score >= 45 ? 'اولویت طلایی (A1)' : r.total_score >= 30 ? 'اولویت رشد (A)' : 'پتانسیل ثانویه'}</span></td>
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
        <span class="text-[10px] opacity-70">(${formatIranDateTime(item.created_at)})</span>
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
  const iranTime = formatIranDateTime(item.created_at);

  document.getElementById('modal-title').innerText = `کارنامه و نقشه راه رشد هوش مصنوعی - ${sName}`;
  document.getElementById('modal-subtitle').innerText = `نسخه شماره ${item.version} (ثبت شده در: ${iranTime})`;

  const headerDateEl = document.getElementById('pdf-header-date');
  if (headerDateEl) {
    headerDateEl.innerHTML = `<div><strong>تاریخ صدور:</strong> ${iranTime}</div>`;
  }

  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(item.analysis);
  } catch (e) {
    parsedPayload = { text: item.analysis, gardner: [], topRequirements: [] };
  }

  const rawMarkdown = parsedPayload.text || item.analysis || '';
  document.getElementById('modal-content').innerHTML = parseMarkdownToHTML(rawMarkdown);

  document.getElementById('roadmap-modal').classList.remove('hidden');

  renderGardnerRadarChart(parsedPayload.gardner || []);
  renderRequirementsBarChart(parsedPayload.topRequirements || []);
}

function downloadDirectPDF() {
  const select = document.getElementById('student-select');
  const sName = select.options[select.selectedIndex]?.text || 'کارنامه_استعدادیابی';
  
  const oldTitle = document.title;
  document.title = `${sName} - گزارش بالینی آپادانا`;
  
  window.print();
  
  setTimeout(() => {
    document.title = oldTitle;
  }, 1000);
}

function renderGardnerRadarChart(gardnerData) {
  const canvas = document.getElementById('gardnerRadarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if (gardnerChartInstance) {
    gardnerChartInstance.destroy();
  }

  if (!gardnerData || gardnerData.length === 0) return;

  const labels = gardnerData.map(g => GARDNER_LABELS_FA[g.gardner_intelligence] || g.gardner_intelligence);
  const scores = gardnerData.map(g => g.percentage);

  gardnerChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: 'درصد تحقق هوش (%)',
        data: scores,
        backgroundColor: 'rgba(99, 102, 241, 0.25)',
        borderColor: '#6366f1',
        borderWidth: 2,
        pointBackgroundColor: '#4f46e5',
        pointBorderColor: '#ffffff',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#4f46e5'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, font: { family: 'Vazirmatn FD', size: 9 } },
          pointLabels: { font: { family: 'Vazirmatn FD', size: 10, weight: 'bold' }, color: '#334155' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderRequirementsBarChart(reqData) {
  const canvas = document.getElementById('reqBarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (reqChartInstance) {
    reqChartInstance.destroy();
  }

  if (!reqData || reqData.length === 0) return;

  const labels = reqData.map(r => r.requirement.length > 22 ? r.requirement.slice(0, 22) + '...' : r.requirement);
  const scores = reqData.map(r => r.percentage);

  reqChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'میزان ظهور رفتاری (%)',
        data: scores,
        backgroundColor: [
          'rgba(168, 85, 247, 0.85)',
          'rgba(99, 102, 241, 0.85)',
          'rgba(59, 130, 246, 0.85)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(245, 158, 11, 0.85)'
        ],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { font: { family: 'Vazirmatn FD', size: 9 } }
        },
        x: {
          ticks: { font: { family: 'Vazirmatn FD', size: 9 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
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

// تب ۳: مجاورت‌سازی ۲ هفته‌ای
async function loadExposureHistory(studentId) {
  const tbody = document.getElementById('exposure-history-body');
  if (!studentId) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">ابتدا دانش‌آموز را انتخاب نمایید.</td></tr>';
    return;
  }

  cancelEditExposureTrial();
  tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">در حال دریافت نتایج مجاورت‌سازی...</td></tr>';

  try {
    const res = await fetch(`/api/exposure?studentId=${encodeURIComponent(studentId)}`);
    cachedExposureTrials = await res.json();

    if (!cachedExposureTrials || cachedExposureTrials.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-amber-600">هنوز ارزیابی ۲ هفته‌ای برای این دانش‌آموز ثبت نشده است.</td></tr>';
      return;
    }

    const verdictBadges = {
      'تایید_استعداد_هدف': '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-bold text-[10px]">✅ تایید استعداد</span>',
      'نیازمند_تمدید_آزمایش': '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-bold text-[10px]">⏳ تمدید آزمایش</span>',
      'عدم_همخوانی_تغییر_مهارت': '<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md font-bold text-[10px]">🔄 تغییر مهارت</span>'
    };

    tbody.innerHTML = cachedExposureTrials.map((t, idx) => `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 text-slate-400 font-mono text-[11px]">${formatIranDateTime(t.created_at)}</td>
        <td class="p-3 font-bold text-slate-800">${t.skill_title}</td>
        <td class="p-3 text-slate-600">${t.learning_speed}</td>
        <td class="p-3 text-slate-600">${t.resilience}</td>
        <td class="p-3 text-slate-600">${t.engagement}</td>
        <td class="p-3">${verdictBadges[t.trial_verdict] || t.trial_verdict}</td>
        <td class="p-3 text-slate-500">${t.mentor_note || '-'}</td>
        <td class="p-3 text-left space-x-1 space-x-reverse whitespace-nowrap">
          <button onclick="editExposureTrial(${idx})" class="text-indigo-600 hover:text-indigo-800 font-bold text-xs bg-indigo-50 px-2 py-1 rounded-lg">ویرایش</button>
          <button onclick="deleteExposureTrial(${t.id})" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-2 py-1 rounded-lg">حذف</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-red-500">خطا در بارگذاری سوابق.</td></tr>';
  }
}

function editExposureTrial(idx) {
  const trial = cachedExposureTrials[idx];
  if (!trial) return;

  editingTrialId = trial.id;
  document.getElementById('exposure-skill-select').value = trial.skill_slug;
  document.getElementById('exp-speed').value = trial.learning_speed;
  document.getElementById('exp-resilience').value = trial.resilience;
  document.getElementById('exp-engagement').value = trial.engagement;
  document.getElementById('exp-notes').value = trial.mentor_note || '';
  document.getElementById('exp-verdict').value = trial.trial_verdict;

  const btnContainer = document.querySelector('#tab-content-exposure button[onclick="saveExposureTrial()"]').parentElement;
  btnContainer.innerHTML = `
    <div class="flex items-center gap-2">
      <button onclick="saveExposureTrial()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition shadow-sm">
        ذخیره تغییرات ارزیابی ✏️
      </button>
      <button onclick="cancelEditExposureTrial()" class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-xl transition">
        انصراف
      </button>
    </div>
  `;

  window.scrollTo({ top: document.getElementById('tab-content-exposure').offsetTop - 20, behavior: 'smooth' });
}

function cancelEditExposureTrial() {
  editingTrialId = null;
  document.getElementById('exp-notes').value = '';

  const expContent = document.getElementById('tab-content-exposure');
  if (!expContent) return;
  const actionDiv = expContent.querySelector('.pt-2 button')?.parentElement;
  if (actionDiv) {
    actionDiv.innerHTML = `
      <button onclick="saveExposureTrial()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition shadow-sm">
        ثبت نتیجه آزمایش مجاورت‌سازی
      </button>
    `;
  }
}

async function saveExposureTrial() {
  const studentId = document.getElementById('exposure-student-select').value;
  const skillSlug = document.getElementById('exposure-skill-select').value;
  const speed = document.getElementById('exp-speed').value;
  const resilience = document.getElementById('exp-resilience').value;
  const engagement = document.getElementById('exp-engagement').value;
  const notes = document.getElementById('exp-notes').value.trim();
  const verdict = document.getElementById('exp-verdict').value;

  if (!studentId || !skillSlug) {
    return alert('لطفاً پرونده دانش‌آموز و مهارت را انتخاب کنید.');
  }

  const isEditing = Boolean(editingTrialId);
  const payload = {
    id: editingTrialId,
    student_id: studentId,
    skill_slug: skillSlug,
    learning_speed: speed,
    resilience: resilience,
    engagement: engagement,
    mentor_note: notes,
    trial_verdict: verdict
  };

  try {
    const res = await fetch('/api/exposure', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(isEditing ? 'تغییرات با موفقیت ذخیره شد.' : 'نتیجه آزمایش مجاورت‌سازی ثبت شد.');
      cancelEditExposureTrial();
      loadExposureHistory(studentId);
    } else {
      alert(data.error || 'خطا در ثبت اطلاعات.');
    }
  } catch (e) {
    alert('خطا در برقراری ارتباط با سرور.');
  }
}

async function deleteExposureTrial(trialId) {
  if (!confirm('آیا از حذف این رکورد ارزیابی مجاورت‌سازی اطمینان دارید؟')) return;

  const studentId = document.getElementById('exposure-student-select').value;

  try {
    const res = await fetch(`/api/exposure?id=${encodeURIComponent(trialId)}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (res.ok && data.success) {
      loadExposureHistory(studentId);
    } else {
      alert(data.error || 'خطا در حذف رکورد.');
    }
  } catch (e) {
    alert('خطا در برقراری ارتباط با سرور.');
  }
}

// تب ۴: گزارش گروهی
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
              <td class="p-3 font-mono">${r.id}</td>
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

// تب ۵: مدیریت مهارت‌ها و سوالات
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

// تب ۶: کادر و پرسنل مدرسه
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

// تابع جستجوی زنده (Live Search) با تایپ هر کاراکتر
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

  // اگر فقط یک نتیجه پیدا شد، خودکار انتخاب و کارنامه‌اش لود شود
  if (filtered.length === 1 && cleanQuery.length >= 2) {
    select.value = filtered[0].id;
    onStudentSelectChanged();
  }
}

// تابع پر کردن فرم جهت ویرایش اطلاعات دانش‌آموز
function editStudentInfo(studentId) {
  const student = loadedStudents.find(s => String(s.id) === String(studentId));
  if (!student) return;

  // پر کردن فیلدهای فرم بالای تب ۱
  document.getElementById('std-id').value = student.id;
  document.getElementById('std-first-name').value = student.first_name || (student.student_name ? student.student_name.split(' ')[0] : '');
  document.getElementById('std-last-name').value = student.last_name || (student.student_name ? student.student_name.split(' ').slice(1).join(' ') : '');
  document.getElementById('std-grade').value = student.grade || '';
  document.getElementById('std-class').value = student.classroom || '';
  document.getElementById('std-father-phone').value = student.father_phone || student.parent_phone || '';
  document.getElementById('std-mother-phone').value = student.mother_phone || '';

  // اسکرول نرم به بالای فرم برای دسترسی آسان کاربر
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

