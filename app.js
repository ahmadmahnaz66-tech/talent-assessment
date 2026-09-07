let currentStudent = null;
let skillsList = [];
let currentSkillIndex = 0;
let savedResponsesData = {};

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

    await loadSkillsFromDatabase();
    await loadStudentExistingResponses(currentStudent.id);

    if (!skillsList || skillsList.length === 0) {
      throw new Error('هیچ مهارتی در سیستم تعریف نشده است.');
    }

    document.getElementById('login-box').classList.add('hidden');
    document.getElementById('quiz-box').classList.remove('hidden');

    const studentName = currentStudent.student_name || currentStudent.name || 'دانش‌آموز';
    const studentGrade = currentStudent.grade || '-';
    document.getElementById('student-display').innerText = `${studentName} (پایه: ${studentGrade})`;

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

async function loadSkillsFromDatabase() {
  const res = await fetch('/api/admin-reports?type=all-skills');
  const data = await res.json();
  if (Array.isArray(data)) {
    skillsList = data;
  }
}

async function loadStudentExistingResponses(studentId) {
  try {
    const res = await fetch(`/api/admin-reports?type=by-student&studentId=${studentId}`);
    const data = await res.json();
    savedResponsesData = {};
    if (Array.isArray(data)) {
      data.forEach(item => {
        savedResponsesData[item.skill_slug] = {
          total_score: item.total_score,
          q1: item.q1,
          q2: item.q2,
          q3: item.q3,
          q4: item.q4
        };
      });
    }
  } catch (e) {
    console.error('خطا در دریافت سوابق:', e);
  }
}

function populateSkillDropdown() {
  const select = document.getElementById('skill-jump-select');
  select.innerHTML = skillsList.map((skill, idx) => `
    <option value="${idx}">${idx + 1}. ${skill.title}</option>
  `).join('');
}

function loadSkillQuestion(index) {
  if (index < 0 || index >= skillsList.length) return;

  currentSkillIndex = index;
  const skill = skillsList[index];

  document.getElementById('skill-title').innerText = skill.title;
  document.getElementById('skill-jump-select').value = index;
  document.getElementById('btn-prev').disabled = (index === 0);

  const saved = savedResponsesData[skill.slug] || {};

  const container = document.getElementById('questions-container');
  container.innerHTML = `
    <div class="space-y-5">
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۱. میزان علاقه و اشتیاق خودجوش فرزند به این حوزه:</p>
        ${renderRatingRadio(skill.slug, 'q1', saved.q1)}
      </div>
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۲. تمرکز، استمرار و پیگیری در انجام فعالیت‌های مرتبط:</p>
        ${renderRatingRadio(skill.slug, 'q2', saved.q2)}
      </div>
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۳. خلاقیت و ابتکار عمل نشان داده شده در این زمینه:</p>
        ${renderRatingRadio(skill.slug, 'q3', saved.q3)}
      </div>
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
        <p class="font-bold text-sm text-slate-700 mb-2">۴. سرعت یادگیری و درک مفاهیم مربوط به این مهارت:</p>
        ${renderRatingRadio(skill.slug, 'q4', saved.q4)}
      </div>
    </div>
  `;
}

function renderRatingRadio(slug, qKey, savedVal) {
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
          <input type="radio" name="${slug}_${qKey}" value="${opt.val}" ${savedVal == opt.val ? 'checked' : ''} class="text-indigo-600 focus:ring-0">
          <span>${opt.label}</span>
        </label>
      `).join('')}
    </div>
  `;
}

async function submitCurrentSkill(isFinalizing = false) {
  const skill = skillsList[currentSkillIndex];
  const q1 = document.querySelector(`input[name="${skill.slug}_q1"]:checked`);
  const q2 = document.querySelector(`input[name="${skill.slug}_q2"]:checked`);
  const q3 = document.querySelector(`input[name="${skill.slug}_q3"]:checked`);
  const q4 = document.querySelector(`input[name="${skill.slug}_q4"]:checked`);

  const v1 = Number(q1?.value) || 0;
  const v2 = Number(q2?.value) || 0;
  const v3 = Number(q3?.value) || 0;
  const v4 = Number(q4?.value) || 0;

  if (v1 || v2 || v3 || v4) {
    const total = v1 + v2 + v3 + v4;
    savedResponsesData[skill.slug] = { total_score: total, q1: v1, q2: v2, q3: v3, q4: v4 };

    await saveResponseToDb(skill.slug, total, v1, v2, v3, v4);
  }

  if (isFinalizing) return;

  if (currentSkillIndex < skillsList.length - 1) {
    loadSkillQuestion(currentSkillIndex + 1);
  } else {
    finishAssessment();
  }
}

function jumpToSkill(val) {
  loadSkillQuestion(Number(val));
}

function prevSkill() {
  if (currentSkillIndex > 0) {
    loadSkillQuestion(currentSkillIndex - 1);
  }
}

function skipCurrentSkill() {
  if (currentSkillIndex < skillsList.length - 1) {
    loadSkillQuestion(currentSkillIndex + 1);
  } else {
    finishAssessment();
  }
}

async function saveResponseToDb(skillSlug, totalScore, q1, q2, q3, q4) {
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: currentStudent.id,
        skillSlug: skillSlug,
        totalScore: totalScore,
        q1: q1,
        q2: q2,
        q3: q3,
        q4: q4
      })
    });
    const result = await res.json();
    if (!res.ok) console.error('خطای ذخیره در سرور:', result.error);
  } catch (err) {
    console.error('خطای ارتباط شبکه:', err);
  }
}

async function finishAssessment() {
  await submitCurrentSkill(true);
  document.getElementById('quiz-box').classList.add('hidden');
  document.getElementById('success-box').style.display = 'block';
}
