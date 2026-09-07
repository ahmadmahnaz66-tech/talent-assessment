let currentStudent = null;
let skillsList = [];
let currentSkillIndex = 0;
let userAnswers = {}; // ذخیره موقت پاسخ‌ها: { skill_slug: total_score }

// دریافت اطلاعات دانش‌آموز و ورود به سامانه
async function login() {
  const codeInput = document.getElementById('student-code');
  const errorEl = document.getElementById('login-error');
  const code = codeInput.value.trim();

  if (!code) {
    showError('لطفاً کد دانش‌آموز را وارد کنید.');
    return;
  }

  errorEl.classList.add('hidden');

  try {
    const res = await fetch(`/api/students?id=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (!res.ok || !data || !data.id) {
      throw new Error(data.error || 'دانش‌آموزی با این کد پرونده یافت نشد.');
    }

    currentStudent = data;

    // بارگذاری لیست مهارت‌ها مستقیماً از جدول دیتابیس
    await loadSkillsFromDatabase();

    if (!skillsList || skillsList.length === 0) {
      throw new Error('هیچ مهارتی در سیستم تعریف نشده است.');
    }

    // تغییر نما از ورود به آزمون
    document.getElementById('login-box').classList.add('hidden');
    document.getElementById('quiz-box').classList.remove('hidden');
    document.getElementById('student-display').innerText = `${currentStudent.student_name} (پایه: ${currentStudent.grade || '-'})`;

    populateSkillDropdown();
    loadSkillQuestion(0);

  } catch (err) {
    showError(err.message);
  }
}

function showError(msg) {
  const errorEl = document.getElementById('login-error');
  errorEl.innerText = msg;
  errorEl.classList.remove('hidden');
}

// واکشی پویا از جدول skills دیتابیس D1
async function loadSkillsFromDatabase() {
  const res = await fetch('/api/admin-reports?type=all-skills');
  const data = await res.json();
  if (Array.isArray(data)) {
    skillsList = data; // شامل آرایه‌ای از { slug: "...", title: "..." }
  }
}

// پر کردن منوی کشویی پرش سریع
function populateSkillDropdown() {
  const select = document.getElementById('skill-jump-select');
  select.innerHTML = skillsList.map((skill, idx) => `
    <option value="${idx}">${idx + 1}. ${skill.title}</option>
  `).join('');
}

// بارگذاری سوالات یک مهارت بر اساس ایندکس
function loadSkillQuestion(index) {
  if (index < 0 || index >= skillsList.length) return;

  currentSkillIndex = index;
  const skill = skillsList[index];

  document.getElementById('skill-title').innerText = skill.title;
  document.getElementById('skill-jump-select').value = index;

  // تنظیم وضعیت دکمه قبلی
  document.getElementById('btn-prev').disabled = (index === 0);

  // نمایش فرم ۴ سنجه استاندارد ارزیابی مهارت
  const container = document.getElementById('questions-container');
  container.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۱. میزان علاقه و اشتیاق خودجوش فرزند به این حوزه:</p>
        ${renderRatingRadio(skill.slug, 'q1')}
      </div>
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۲. تمرکز، استمرار و پیگیری در انجام فعالیت‌های مرتبط:</p>
        ${renderRatingRadio(skill.slug, 'q2')}
      </div>
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۳. خلاقیت و ابتکار عمل نشان داده شده در این زمینه:</p>
        ${renderRatingRadio(skill.slug, 'q3')}
      </div>
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۴. سرعت یادگیری و درک مفاهیم مربوط به این مهارت:</p>
        ${renderRatingRadio(skill.slug, 'q4')}
      </div>
    </div>
  `;
}

function renderRatingRadio(slug, qKey) {
  const options = [
    { label: 'خیلی کم / بدون تمایل', val: 3 },
    { label: 'متوسط', val: 7 },
    { label: 'زیاد', val: 11 },
    { label: 'بسیار چشمگیر و عالی', val: 15 }
  ];

  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      ${options.map(opt => `
        <label class="border p-2.5 rounded-lg flex items-center gap-2 cursor-pointer hover:bg-white hover:border-indigo-300 transition">
          <input type="radio" name="${slug}_${qKey}" value="${opt.val}" class="text-indigo-600 focus:ring-0">
          <span>${opt.label}</span>
        </label>
      `).join('')}
    </div>
  `;
}

// ثبت پاسخ مهارت فعلی و رفتن به بعدی
async function submitCurrentSkill(isFinalizing = false) {
  const skill = skillsList[currentSkillIndex];
  const q1 = document.querySelector(`input[name="${skill.slug}_q1"]:checked`);
  const q2 = document.querySelector(`input[name="${skill.slug}_q2"]:checked`);
  const q3 = document.querySelector(`input[name="${skill.slug}_q3"]:checked`);
  const q4 = document.querySelector(`input[name="${skill.slug}_q4"]:checked`);

  // اگر حتی یک گزینه انتخاب شده باشد، مجموع محاسبه و ثبت موقت می‌شود
  if (q1 || q2 || q3 || q4) {
    const total = (Number(q1?.value) || 0) + (Number(q2?.value) || 0) + (Number(q3?.value) || 0) + (Number(q4?.value) || 0);
    userAnswers[skill.slug] = total;

    // ارسال مستقیم به API ثبت پاسخ
    await saveResponseToDb(skill.slug, total);
  }

  if (isFinalizing) return;

  if (currentSkillIndex < skillsList.length - 1) {
    loadSkillQuestion(currentSkillIndex + 1);
  } else {
    finishAssessment();
  }
}

// پرش مستقیم از منوی کشویی
function jumpToSkill(val) {
  loadSkillQuestion(Number(val));
}

// رفتن به مهارت قبلی
function prevSkill() {
  if (currentSkillIndex > 0) {
    loadSkillQuestion(currentSkillIndex - 1);
  }
}

// رد کردن مهارت
function skipCurrentSkill() {
  if (currentSkillIndex < skillsList.length - 1) {
    loadSkillQuestion(currentSkillIndex + 1);
  } else {
    finishAssessment();
  }
}

// ارسال پاسخ به سرور برای ذخیره در جدول responses
async function saveResponseToDb(skillSlug, totalScore) {
  try {
    await fetch('/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: currentStudent.id,
        skillSlug: skillSlug,
        totalScore: totalScore
      })
    });
  } catch (err) {
    console.error('خطا در ثبت نمره:', err);
  }
}

// ثبت نهایی و نمایش کارت موفقیت
async function finishAssessment() {
  await submitCurrentSkill(true);
  document.getElementById('quiz-box').classList.add('hidden');
  document.getElementById('success-box').style.display = 'block';
}
