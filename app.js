let currentStudent = null;
let skillsList = [];
let currentSkillIndex = 0;
let currentSkillQuestions = [];
let savedAnswersMap = {};

const RATING_OPTIONS = [
  { label: 'همیشگی', val: 4 },
  { label: 'اغلب', val: 3 },
  { label: 'گاهی', val: 2 },
  { label: 'به‌ندرت', val: 1 },
  { label: 'اصلاً', val: 0 }
];

// تبدیل اعداد فارسی و عربی به انگلیسی
function toEnglishDigits(str) {
  if (!str) return '';
  return str.toString()
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// ۱. ورود دانش‌آموز (کد ملی + رمز عبور)
async function handleStudentLogin() {
  const idInput = document.getElementById('input-student-id');
  const passInput = document.getElementById('input-student-pass');
  const errBox = document.getElementById('student-login-err');

  errBox.classList.add('hidden');
  const studentId = toEnglishDigits(idInput.value.trim());
  const password = toEnglishDigits(passInput.value.trim());

  if (!studentId || !password) {
    errBox.innerText = 'لطفاً کد ملی و رمز عبور را وارد کنید.';
    errBox.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'student-login',
        studentId,
        password
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      errBox.innerText = data.error || 'کد ملی یا رمز عبور اشتباه است.';
      errBox.classList.remove('hidden');
      return;
    }

    currentStudent = data.student;

    // بررسی الزام تغییر رمز در اولین ورود
    if (currentStudent.mustChangePassword) {
      document.getElementById('first-login-modal').classList.remove('hidden');
    } else {
      await initializeStudentQuiz();
    }

  } catch (err) {
    errBox.innerText = 'خطا در ارتباط با سرور.';
    errBox.classList.remove('hidden');
  }
}

// ۲. ثبت رمز جدید در ورود اول
async function submitFirstPasswordChange() {
  const newPass = toEnglishDigits(document.getElementById('first-new-pass').value.trim());
  const confirmPass = toEnglishDigits(document.getElementById('first-confirm-pass').value.trim());
  const errBox = document.getElementById('first-change-err');
  errBox.classList.add('hidden');

  if (newPass.length < 5) {
    errBox.innerText = 'رمز عبور جدید باید حداقل ۵ کاراکتر باشد.';
    errBox.classList.remove('hidden');
    return;
  }

  if (newPass !== confirmPass) {
    errBox.innerText = 'تکرار رمز عبور یکسان نیست.';
    errBox.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'change-student-password',
        studentId: currentStudent.id,
        newPassword: newPass
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById('first-login-modal').classList.add('hidden');
      await initializeStudentQuiz();
    } else {
      errBox.innerText = data.error || 'خطا در ذخیره رمز جدید.';
      errBox.classList.remove('hidden');
    }
  } catch (e) {
    errBox.innerText = 'خطا در اتصال به سرور.';
    errBox.classList.remove('hidden');
  }
}

// ۳. آغاز آزمون و دریافت سوابق و مهارت‌ها
async function initializeStudentQuiz() {
  try {
    // دریافت پاسخ‌های ثبت‌شده قبلی
    const res = await fetch(`/api/students?id=${encodeURIComponent(currentStudent.id)}`);
    const data = await res.json();

    savedAnswersMap = {};
    if (data && Array.isArray(data.previousResponses)) {
      data.previousResponses.forEach(item => {
        try {
          const arr = typeof item.answers === 'string' ? JSON.parse(item.answers) : item.answers;
          if (Array.isArray(arr)) {
            savedAnswersMap[item.skill_slug] = arr.map(Number);
          }
        } catch (e) {}
      });
    }

    await loadSkillsFromDatabase();

    if (!skillsList || skillsList.length === 0) {
      alert('هنوز مهارتی در سامانه تعریف نشده است.');
      return;
    }

    // بستن فرم لاگین و نمایش آزمون
    document.getElementById('student-login-box').classList.add('hidden');
    const quizBox = document.getElementById('quiz-box');
    if (quizBox) quizBox.classList.remove('hidden');

    const sName = currentStudent.name || currentStudent.student_name || 'دانش‌آموز';
    const sGrade = currentStudent.grade || '-';
    const displayEl = document.getElementById('student-display');
    if (displayEl) {
      displayEl.innerText = `${sName} (پایه: ${sGrade})`;
    }

    populateSkillDropdown();
    await loadSkillQuestion(0);

  } catch (err) {
    alert('خطا در بارگذاری سامانه آزمون: ' + err.message);
  }
}

async function loadSkillsFromDatabase() {
  const res = await fetch('/api/admin-reports?type=all-skills');
  const data = await res.json();
  if (Array.isArray(data)) {
    skillsList = data;
  }
}

function populateSkillDropdown() {
  const select = document.getElementById('skill-jump-select');
  if (!select) return;
  select.innerHTML = skillsList.map((skill, idx) => `
    <option value="${idx}">${idx + 1}. ${skill.title}</option>
  `).join('');
}

async function loadSkillQuestion(index) {
  if (index < 0 || index >= skillsList.length) return;

  currentSkillIndex = index;
  const currentSkill = skillsList[index];

  const titleEl = document.getElementById('skill-title');
  if (titleEl) titleEl.innerText = currentSkill.title;

  const jumpSelect = document.getElementById('skill-jump-select');
  if (jumpSelect) jumpSelect.value = index;

  const btnPrev = document.getElementById('btn-prev');
  if (btnPrev) btnPrev.disabled = (index === 0);

  const container = document.getElementById('questions-container');
  container.innerHTML = '<div class="text-center py-6 text-slate-400 text-sm">در حال بارگذاری سوالات...</div>';

  try {
    const qRes = await fetch(`/api/questions?skill=${encodeURIComponent(currentSkill.slug)}`);
    currentSkillQuestions = await qRes.json();
  } catch (e) {
    currentSkillQuestions = [];
  }

  const saved = savedAnswersMap[currentSkill.slug] || [];

  if (!currentSkillQuestions || currentSkillQuestions.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-amber-600 text-sm">هنوز سوالی برای این مهارت تعریف نشده است.</div>';
    return;
  }

  container.innerHTML = currentSkillQuestions.map((q, qIdx) => `
    <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
      <p class="font-bold text-sm text-slate-700 mb-2.5">${qIdx + 1}. ${q.question_text}</p>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        ${RATING_OPTIONS.map(opt => `
          <label class="border p-2.5 rounded-lg flex items-center gap-2 cursor-pointer hover:bg-white hover:border-indigo-300 transition">
            <input type="radio" name="${currentSkill.slug}_q${qIdx}" value="${opt.val}" ${saved[qIdx] === opt.val ? 'checked' : ''} class="text-indigo-600 focus:ring-0">
            <span>${opt.label} (${opt.val})</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function collectCurrentSkillAnswers() {
  const skill = skillsList[currentSkillIndex];
  const answers = [];
  let hasChecked = false;

  for (let i = 0; i < currentSkillQuestions.length; i++) {
    const checked = document.querySelector(`input[name="${skill.slug}_q${i}"]:checked`);
    if (checked) {
      answers.push(Number(checked.value));
      hasChecked = true;
    } else {
      answers.push(0);
    }
  }

  return { skillSlug: skill.slug, answers, hasChecked };
}

async function submitCurrentSkill(isFinalizing = false) {
  const { skillSlug, answers, hasChecked } = collectCurrentSkillAnswers();

  if (hasChecked) {
    savedAnswersMap[skillSlug] = answers;
    const totalScore = answers.reduce((a, b) => a + b, 0);
    await saveResponseToDb(skillSlug, answers, totalScore);
  }

  if (isFinalizing) return;

  if (currentSkillIndex < skillsList.length - 1) {
    await loadSkillQuestion(currentSkillIndex + 1);
  } else {
    finishAssessment();
  }
}

async function jumpToSkill(val) {
  await submitCurrentSkill(true);
  await loadSkillQuestion(Number(val));
}

async function prevSkill() {
  await submitCurrentSkill(true);
  if (currentSkillIndex > 0) {
    await loadSkillQuestion(currentSkillIndex - 1);
  }
}

function skipCurrentSkill() {
  if (currentSkillIndex < skillsList.length - 1) {
    loadSkillQuestion(currentSkillIndex + 1);
  } else {
    finishAssessment();
  }
}

async function saveResponseToDb(skillSlug, answers, totalScore) {
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: currentStudent.id,
        skillSlug: skillSlug,
        answers: answers,
        totalScore: totalScore
      })
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('خطای ذخیره:', err);
    }
  } catch (err) {
    console.error('خطای شبکه:', err);
  }
}

async function finishAssessment() {
  await submitCurrentSkill(true);
  document.getElementById('quiz-box').classList.add('hidden');
  const successBox = document.getElementById('success-box');
  if (successBox) successBox.style.display = 'block';
}
