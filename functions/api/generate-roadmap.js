import { askGemini } from './_gemini.js';

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

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { nationalId, studentId } = await request.json();
    const idToSearch = String(nationalId || studentId || '').trim();

    if (!idToSearch) {
      return new Response(JSON.stringify({ error: 'شناسه یا کد ملی دانش‌آموز الزامی است.' }), { status: 400 });
    }

    const student = await env.DB.prepare(
      "SELECT * FROM students WHERE id = ? OR father_phone = ? OR mother_phone = ? OR parent_phone = ?"
    ).bind(idToSearch, idToSearch, idToSearch, idToSearch).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموزی با این مشخصات یافت نشد.' }), { status: 404 });
    }

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
      .map(s => `- مهارت: ${s.title} | حوزه: ${s.category} | امتیاز مکتسبه: ${s.score}`)
      .join('\n');

    const systemPrompt = `تو مشاور ارشد و متخصص استعدادیابی تحصیلی دبستان آپادانا هستی. 
بر اساس نمرات ارزیابی مهارتی، یک نقشه راه جامع، کاربردی و انگیزشی بنویس.
ساختار Markdown خروجی باید شامل:
1. تحلیل تیپ شخصیتی و استعدادهای برتر
2. ۳ استعداد طلایی و متمایز کودک با ذکر شواهد رفتاری
3. توصیه‌های اختصاصی به والدین در منزل
4. توصیه‌های مهارتی به کادر مدرسه
5. نقشه راه گام‌به‌گام ۳ ماهه`;

    const sFullName = student.student_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'دانش‌آموز';
    const userPrompt = `اطلاعات دانش‌آموز:
نام: ${sFullName}
شناسه: ${student.id}
پایه: پایه ${student.grade || 'ابتدایی'} - کلاس ${student.classroom || '-'}

نمرات ارزیابی مهارت‌ها:
${scoresSummary}`;

    // فراخوانی مستقیم و ایمن از ماژول واحد جمنای
    const roadmapMarkdown = await askGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.6,
      maxTokens: 6000
    });

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
      ).bind(String(student.id), currentVersion, roadmapMarkdown).run();
    } catch (e) {
      try {
        await env.DB.prepare(
          "INSERT INTO student_roadmaps (student_id, version, analysis) VALUES (?, ?, ?)"
        ).bind(String(student.id), currentVersion, roadmapMarkdown).run();
      } catch (err) {}
    }

    return new Response(JSON.stringify({
      success: true,
      roadmap: roadmapMarkdown,
      version: currentVersion
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
