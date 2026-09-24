// js/admin/skills.js

async function loadQuestionsForAdmin(slug) {
  currentAdminSkillSlug = slug;
  const listContainer = document.getElementById('admin-questions-list');
  const coachContainer = document.getElementById('admin-coach-questions-list');
  
  if (!listContainer) return;
  listContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال دریافت سوالات...</p>';
  if (coachContainer) coachContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">در حال دریافت...</p>';

  try {
    const res = await fetch(`/api/questions?skill=${encodeURIComponent(slug)}`);
    const questions = await res.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      listContainer.innerHTML = '<p class="text-xs text-amber-600 text-center py-4">سوالی ثبت نشده است.</p>';
      if (coachContainer) coachContainer.innerHTML = '<p class="text-xs text-amber-600 text-center py-4">گویه مربی ثبت نشده است.</p>';
      return;
    }

    const studentQuestions = questions.filter(q => q.question_text.startsWith('[student]'));
    const coachQuestions = questions.filter(q => q.question_text.startsWith('[coach]'));

    const finalStudents = studentQuestions.length > 0 ? studentQuestions : questions.slice(0, 15);
    const finalCoach = coachQuestions.length > 0 ? coachQuestions : questions.slice(15, 25);

    listContainer.innerHTML = finalStudents.map((q, idx) => {
      const cleanText = q.question_text.replace('[student]', '').trim();
      return `
        <div class="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl text-xs shadow-2xs">
          <span class="text-slate-400 font-bold">${idx + 1}.</span>
          <input type="text" id="q-text-${q.id}" value="${cleanText}" class="flex-1 bg-transparent border-b border-transparent focus:border-indigo-500 outline-none text-slate-700 py-0.5">
          <div class="flex gap-1">
            <button onclick="updateQuestion(${q.id}, ${idx + 1})" class="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-100 font-bold transition">ذخیره</button>
            <button onclick="deleteQuestion(${q.id})" class="bg-red-50 text-red-600 px-2 py-1 rounded-lg hover:bg-red-100 font-bold transition">حذف</button>
          </div>
        </div>
      `;
    }).join('');

    if (coachContainer) {
      coachContainer.innerHTML = finalCoach.map((q, idx) => {
        const cleanText = q.question_text.replace('[coach]', '').trim();
        return `
          <div class="p-2.5 bg-white border border-indigo-100 rounded-xl text-xs space-y-1 shadow-2xs">
            <div class="font-bold text-slate-800"><span class="text-indigo-600">گویه ${idx + 1}:</span> ${cleanText}</div>
            <div class="text-[10px] text-slate-400">مقیاس لیکرت (۰ تا ۴) - ارزیابی مربی</div>
          </div>
        `;
      }).join('');
    }

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
    body: JSON.stringify({ action: 'add', skillSlug: currentAdminSkillSlug, questionText: '[student] ' + text, displayOrder: 99 })
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
    body: JSON.stringify({ action: 'edit', id, questionText: '[student] ' + newText, displayOrder: order })
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
  const category = document.getElementById('new-skill-category').value;
  if (!slug || !title) return alert('شناسه و عنوان مهارت الزامی هستند.');

  const res = await fetch('/api/admin-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-skill', slug, title, category })
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

async function exportSkillsAndQuestionsToExcel() {
  try {
    const res = await fetch('/api/questions');
    const questions = await res.json();

    if (!allSkills || allSkills.length === 0) {
      const sRes = await fetch('/api/admin-reports?type=all-skills');
      if (sRes.ok) allSkills = await sRes.json();
    }

    const skillMap = {};
    const categoryMap = {};
    (allSkills || []).forEach(s => {
      skillMap[s.slug] = s.title;
      categoryMap[s.slug] = s.category;
    });

    if (!Array.isArray(questions) || questions.length === 0) {
      return alert('هیچ سوال یا مهارتی برای خروجی گرفتن یافت نشد.');
    }

    const rows = questions.map((q, idx) => ({
      'ردیف': idx + 1,
      'شناسه مهارت (Slug)': q.skill_slug,
      'عنوان فارسی مهارت': skillMap[q.skill_slug] || q.skill_slug,
      'تیپ هالند': categoryMap[q.skill_slug] || 'investigative',
      'متن گویه / سوال': q.question_text,
      'ترتیب نمایش': q.display_order || 1
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!dir'] = 'rtl';

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'مهارت‌ها و گویه‌ها');

    const fileName = `Talent_Assessment_Questions_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

  } catch (err) {
    console.error('Export Error:', err);
    alert('خطا در ایجاد خروجی اکسل: ' + err.message);
  }
}

async function generateSkillWithAI() {
  const slug = document.getElementById('new-skill-slug').value.trim();
  const title = document.getElementById('new-skill-title').value.trim();
  const btn = document.getElementById('btn-ai-skill');

  if (!slug || !title) {
    return alert('لطفاً ابتدا عنوان فارسی و شناسه انگلیسی مهارت را وارد نمایید.');
  }

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span><span>در حال طراحی گویه‌های والدین و مربی با جمنای...</span>';

  try {
    const res = await fetch('/api/ai-skill-generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(data.message);
      document.getElementById('new-skill-slug').value = '';
      document.getElementById('new-skill-title').value = '';
      await loadInitialMetadata();
      loadQuestionsForAdmin(slug);
    } else {
      alert(data.error || 'خطا در تولید گویه‌ها');
    }
  } catch (err) {
    alert('خطا در ارتباط با سرور: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function syncMissingQuestionsWithAI() {
  if (!confirm('آیا می‌خواهید سیستم مهارت‌ها را به صورت دسته‌ای و کنترل‌شده بررسی کرده و گویه‌های والدین و مربی را استانداردسازی کند؟')) {
    return;
  }

  const btn = event.target.closest('button');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;

  let hasMore = true;
  let totalUpdated = 0;

  try {
    while (hasMore) {
      btn.innerHTML = `<span>⏳</span><span>در حال پردازش دسته‌ای مهارت‌ها (${totalUpdated} اصلاح شده)...</span>`;
      
      const res = await fetch('/api/sync-missing-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const errorHtml = await res.text();
        throw new Error(`خطای سرور: ${errorHtml.substring(0, 150)}`);
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطا در سرور');

      if (data.completed || data.updatedCount === 0) {
        hasMore = false;
        alert(`عملیات بررسی و استانداردسازی با موفقیت پایان یافت. مجموعاً ${totalUpdated} مهارت بروزرسانی شدند.`);
      } else {
        totalUpdated += data.updatedCount;
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    await loadInitialMetadata();
    if (currentAdminSkillSlug) {
      loadQuestionsForAdmin(currentAdminSkillSlug);
    }
  } catch (err) {
    alert('خطا در حین فرآیند: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
