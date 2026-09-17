// functions/api/generate-roadmap.js
import { askGemini } from './_gemini.js';

// واکشی سوابق کارنامه‌ها
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const nationalId = url.searchParams.get('nationalId') || url.searchParams.get('studentId');

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (!nationalId) {
    return new Response(JSON.stringify([]), { headers: corsHeaders });
  }

  try {
    const cleanId = String(nationalId).trim();
    let results = [];

    try {
      const dbRoadmaps = await env.DB.prepare(
        "SELECT id, version, analysis, created_at FROM roadmaps WHERE student_id = ? ORDER BY version DESC, id DESC"
      ).bind(cleanId).all();
      if (dbRoadmaps?.results?.length > 0) results = dbRoadmaps.results;
    } catch (e) {}

    if (results.length === 0) {
      try {
        const dbStudentRoadmaps = await env.DB.prepare(
          "SELECT id, version, analysis, created_at FROM student_roadmaps WHERE student_id = ? ORDER BY version DESC, id DESC"
        ).bind(cleanId).all();
        if (dbStudentRoadmaps?.results?.length > 0) results = dbStudentRoadmaps.results;
      } catch (e) {}
    }

    return new Response(JSON.stringify(results || []), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

// صدور کارنامه با معماری پردازش موازی (Parallel Generation)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { nationalId, studentId } = await request.json();
    const idToSearch = String(nationalId || studentId || '').trim();

    if (!idToSearch) {
      return new Response(JSON.stringify({ error: 'شناسه یا کد ملی دانش‌آموز الزامی است.' }), { status: 400 });
    }

    // ۱. استعلام پرونده دانش‌آموز
    const student = await env.DB.prepare(
      "SELECT * FROM students WHERE id = ? OR father_phone = ? OR mother_phone = ?"
    ).bind(idToSearch, idToSearch, idToSearch).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموزی با این مشخصات یافت نشد.' }), { status: 404 });
    }

    // ۲. دریافت نمرات و عناوین مهارت‌ها
    const responses = await env.DB.prepare(
      "SELECT skill_slug, total_score FROM responses WHERE student_id = ?"
    ).bind(String(student.id)).all();

    const skills = await env.DB.prepare(
      "SELECT slug, title, category FROM skills ORDER BY display_order ASC"
    ).all();

    const skillMap = {};
    (skills.results || []).forEach(s => {
      skillMap[s.slug] = { title: s.title, category: s.category || 'عمومی', score: 0 };
    });

    (responses.results || []).forEach(r => {
      if (skillMap[r.skill_slug]) skillMap[r.skill_slug].score = r.total_score;
    });

    const scoresSummary = Object.values(skillMap)
      .map(s => `- ${s.title} (${s.category}): امتیاز ${s.score}`)
      .join('\n');

    const sFullName = student.student_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'دانش‌آموز';
    const studentBio = `دانش‌آموز: ${sFullName} | پایه: ${student.grade || 'ابتدایی'}\nنمرات ارزیابی:\n${scoresSummary}`;

    // ۳. اجرای هم‌زمان دو پرامپت موازی جهت کاهش زمان انتظار
    const [part1Analysis, part2ActionPlan] = await Promise.all([
      // درخواست اول: ارزیابی روان‌شناختی و استعدادها
      askGemini(env, {
        systemPrompt: `تو مشاور ارشد روان‌سنجی و استعدادیابی کودک هستی. بخش تحلیل تشخیصی کارنامه را با تکیه بر مدل هالند (RIASEC) دقیق، علمی و بدون حاشیه بنویس.`,
        userPrompt: `${studentBio}

خروجی باید صرفاً شامل این دو بخش مارک‌داون باشد:
### ۱. تحلیل تیپ شخصیتی و الگوی غالب (RIASEC)
(تحلیل روان‌شناختی تیپ غالب کودک بر اساس نمرات)

### ۲. سه کانون استعدادی برتر با شواهد رفتاری
(معرفی ۳ مهارت برتر کودک به همراه تفسیر شواهد و رفتارهای قابل مشاهده)`
      }),

      // درخواست دوم: توصیه‌ها و نقشه راه عملیاتی
      askGemini(env, {
        systemPrompt: `تو مشاور و طراح مسیر رشد کودک دبستان آپادانا هستی. بخش مداخلات کاربردی و نقشه راه اجرایی را کاربردی، دقیق و انگیزشی بنویس.`,
        userPrompt: `${studentBio}

خروجی باید صرفاً شامل این دو بخش مارک‌داون باشد:
### ۳. راهبردهای کلیدی برای خانواده و مربیان
* **توصیه به والدین در منزل:** (راهکارهای ملموس پرورشی)
* **راهکار برای کادر مدرسه:** (نحوه تعامل آموزشی در کلاس)

### ۴. نقشه راه ۳ ماهه شکوفایی (گام‌به‌گام)
* **ماه اول (تثبیت و ایجاد انگیزه):** 
* **ماه دوم (چالش‌ورزی و تقویت مهارت):** 
* **ماه سوم (نمود بیرونی و تلفیق):**`
      })
    ]);

    // ۴. ترکیب هر دو بخش در سند نهایی کارنامه
    const fullRoadmap = `${part1Analysis.trim()}\n\n---\n\n${part2ActionPlan.trim()}`;

    // ۵. ذخیره کارنامه نهایی در دیتابیس
    let currentVersion = 1;
    try {
      const lastVersionRow = await env.DB.prepare(
        "SELECT MAX(version) as max_v FROM roadmaps WHERE student_id = ?"
      ).bind(String(student.id)).first();
      if (lastVersionRow?.max_v) currentVersion = Number(lastVersionRow.max_v) + 1;
    } catch (e) {}

    try {
      await env.DB.prepare(
        "INSERT INTO roadmaps (student_id, version, analysis, report_type) VALUES (?, ?, ?, 'counselor_deep')"
      ).bind(String(student.id), currentVersion, fullRoadmap).run();
    } catch (e) {
      try {
        await env.DB.prepare(
          "INSERT INTO student_roadmaps (student_id, version, analysis) VALUES (?, ?, ?)"
        ).bind(String(student.id), currentVersion, fullRoadmap).run();
      } catch (err) {}
    }

    return new Response(JSON.stringify({
      success: true,
      roadmap: fullRoadmap,
      version: currentVersion
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
