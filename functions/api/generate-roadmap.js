// functions/api/generate-roadmap.js
import { askGemini } from './_gemini.js';

// نگاشت دسته‌ها به ۸ هوش گاردنر
const CATEGORY_TO_GARDNER = {
  realistic: 'bodily_kinesthetic',
  investigative: 'logical_mathematical',
  artistic: 'spatial_visual',
  social: 'interpersonal',
  enterprising: 'linguistic',
  conventional: 'intrapersonal'
};

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

// صدور کارنامه هوشمند همراه با نمودارهای گاردنر و شاخص‌های برجسته
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { nationalId, studentId } = await request.json();
    const idToSearch = String(nationalId || studentId || '').trim();

    if (!idToSearch) {
      return new Response(JSON.stringify({ error: 'شناسه یا کد ملی دانش‌آموز الزامی است.' }), { status: 400 });
    }

    // ۱. استعلام مشخصات دانش‌آموز
    const student = await env.DB.prepare(
      "SELECT * FROM students WHERE id = ? OR father_phone = ? OR mother_phone = ?"
    ).bind(idToSearch, idToSearch, idToSearch).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموزی با این مشخصات یافت نشد.' }), { status: 404 });
    }

    // ۲. استخراج نمرات ثبت‌شده دانش‌آموز
    const responses = await env.DB.prepare(
      "SELECT skill_slug, total_score FROM responses WHERE student_id = ?"
    ).bind(String(student.id)).all();

    const skills = await env.DB.prepare(
      "SELECT slug, title, category FROM skills ORDER BY display_order ASC"
    ).all();

    const skillList = [];
    const skillMap = {};
    (skills.results || []).forEach(s => {
      skillMap[s.slug] = { title: s.title, category: s.category || 'realistic', score: 0 };
    });

    (responses.results || []).forEach(r => {
      if (skillMap[r.skill_slug]) {
        skillMap[r.skill_slug].score = r.total_score;
      }
    });

    Object.keys(skillMap).forEach(slug => {
      skillList.push({
        slug,
        title: skillMap[slug].title,
        category: skillMap[slug].category,
        score: skillMap[slug].score
      });
    });

    // ۳. محاسبه داده‌های نمودار هوش‌های چندگانه گاردنر (Gardner Radar Data)
    const gardnerTotals = {
      logical_mathematical: { sum: 0, count: 0 },
      spatial_visual: { sum: 0, count: 0 },
      bodily_kinesthetic: { sum: 0, count: 0 },
      musical_rhythmic: { sum: 0, count: 0 },
      linguistic: { sum: 0, count: 0 },
      interpersonal: { sum: 0, count: 0 },
      intrapersonal: { sum: 0, count: 0 },
      naturalist: { sum: 0, count: 0 }
    };

    skillList.forEach(s => {
      const gType = CATEGORY_TO_GARDNER[s.category] || 'logical_mathematical';
      if (gardnerTotals[gType]) {
        gardnerTotals[gType].sum += s.score;
        gardnerTotals[gType].count += 1;
      }
    });

    const gardnerData = Object.keys(gardnerTotals).map(k => {
      const item = gardnerTotals[k];
      // تبدیل امتیاز (حداکثر ۶۰) به درصد (۰ تا ۱۰۰)
      const avgScore = item.count > 0 ? (item.sum / item.count) : 25;
      const percentage = Math.min(100, Math.max(10, Math.round((avgScore / 60) * 100)));
      return {
        gardner_intelligence: k,
        percentage: percentage
      };
    });

    // ۴. محاسبه ۵ شاخص مهارتی برجسته (Requirements Bar Data)
    const sortedSkills = [...skillList].sort((a, b) => b.score - a.score);
    const topRequirementsData = sortedSkills.slice(0, 5).map(s => ({
      requirement: s.title,
      percentage: Math.min(100, Math.max(15, Math.round((s.score / 60) * 100)))
    }));

    // ۵. خلاصه نمرات جهت پرامپت موازی هوش مصنوعی
    const scoresSummary = skillList
      .map(s => `- ${s.title} (${s.category}): امتیاز ${s.score}`)
      .join('\n');

    const sFullName = student.student_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'دانش‌آموز';
    const studentBio = `دانش‌آموز: ${sFullName} | پایه: ${student.grade || 'ابتدایی'}\nنمرات آزمون:\n${scoresSummary}`;

    // ۶. اجرای موازی دو پرامپت برای دریافت سریع متن گزارش
    const [part1Analysis, part2ActionPlan] = await Promise.all([
      askGemini(env, {
        systemPrompt: `تو مشاور ارشد روان‌سنجی و استعدادیابی کودک هستی. بخش تحلیل تشخیصی کارنامه را با تکیه بر مدل هالند (RIASEC) دقیق، علمی و بدون حاشیه بنویس.`,
        userPrompt: `${studentBio}

خروجی باید صرفاً شامل این دو بخش مارک‌داون باشد:
### ۱. تحلیل تیپ شخصیتی و الگوی غالب (RIASEC)
(تحلیل روان‌شناختی تیپ غالب کودک بر اساس نمرات)

### ۲. سه کانون استعدادی برتر با شواهد رفتاری
(معرفی ۳ مهارت برتر کودک به همراه تفسیر شواهد و رفتارهای قابل مشاهده)`
      }),

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

    const fullRoadmapText = `${part1Analysis.trim()}\n\n---\n\n${part2ActionPlan.trim()}`;

    // ۷. بسته‌بندی کامل ساختار دیتای کارنامه طبق انتظار پنل مدیریت
    const finalPayload = {
      text: fullRoadmapText,
      gardner: gardnerData,
      topRequirements: topRequirementsData
    };

    const finalPayloadString = JSON.stringify(finalPayload);

    // ۸. ذخیره نسخه جدید در پایگاه داده
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
      ).bind(String(student.id), currentVersion, finalPayloadString).run();
    } catch (e) {
      try {
        await env.DB.prepare(
          "INSERT INTO student_roadmaps (student_id, version, analysis) VALUES (?, ?, ?)"
        ).bind(String(student.id), currentVersion, finalPayloadString).run();
      } catch (err) {}
    }

    return new Response(JSON.stringify({
      success: true,
      roadmap: finalPayloadString,
      version: currentVersion
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
