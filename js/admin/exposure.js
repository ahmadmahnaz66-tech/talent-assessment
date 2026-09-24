// js/admin/exposure.js

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

  const specializedAnswers = {};
  const questionElements = document.querySelectorAll('#exposure-specialized-questions-container input[type="radio"]:checked');
  questionElements.forEach(input => {
    specializedAnswers[input.name] = input.value;
  });

  const isEditing = Boolean(editingTrialId);
  const payload = {
    id: editingTrialId,
    student_id: studentId,
    skill_slug: skillSlug,
    learning_speed: speed,
    resilience: resilience,
    engagement: engagement,
    mentor_note: notes,
    trial_verdict: verdict,
    specialized_answers: specializedAnswers
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

async function loadCoachSpecializedQuestionsForExposure(skillSlug) {
  const container = document.getElementById('exposure-specialized-questions-container');
  if (!container) return;

  if (!skillSlug) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">لطفاً ابتدا مهارت مورد آزمایش را انتخاب کنید.</p>';
    return;
  }

  container.innerHTML = '<p class="text-xs text-indigo-600 text-center py-4 animate-pulse">در حال دریافت گویه‌های تخصصی مربی...</p>';

  try {
    const res = await fetch(`/api/questions?skill=${encodeURIComponent(skillSlug)}`);
    const questions = await res.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      container.innerHTML = '<p class="text-xs text-amber-600 text-center py-4">گویه تخصصی ثبت‌شده‌ای برای این مهارت یافت نشد.</p>';
      return;
    }

    const coachQuestions = questions.filter(q => q.question_text.startsWith('[coach]'));
    const specializedQuestions = coachQuestions.length > 0 ? coachQuestions : questions.slice(0, 10);

    container.innerHTML = specializedQuestions.map((q, idx) => {
      const cleanText = q.question_text.replace('[coach]', '').trim();
      return `
        <div class="bg-white p-3 rounded-xl border border-indigo-100 space-y-2 shadow-2xs">
          <p class="text-xs font-bold text-slate-800 leading-relaxed">
            <span class="text-indigo-600 ml-1">${idx + 1}.</span> ${cleanText}
          </p>
          <div class="grid grid-cols-5 gap-1.5 text-center text-xs">
            ${[0, 1, 2, 3, 4].map(val => `
              <label class="cursor-pointer border border-slate-200 rounded-lg p-1.5 hover:bg-indigo-50 transition flex flex-col items-center select-none">
                <input type="radio" name="coach_q_${q.id || idx}" value="${val}" ${val === 2 ? 'checked' : ''} class="text-indigo-600 mb-0.5">
                <span class="text-[9px] text-slate-500">${['هرگز', 'به‌ندرت', 'گاهی', 'معمولاً', 'همیشه'][val]}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">خطا در بارگذاری گویه‌های تخصصی.</p>';
  }
}
