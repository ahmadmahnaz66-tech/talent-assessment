export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return new Response(JSON.stringify({ error: 'کد ملی دانش‌آموز الزامی است.' }), { status: 400 });
    }

    // ۱. دریافت اطلاعات دانش‌آموز
    const student = await env.DB.prepare(
      "SELECT id, student_name, grade, classroom FROM students WHERE id = ?"
    ).bind(studentId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموز یافت نشد.' }), { status: 404 });
    }

    // ۲. دریافت مجموع امتیازات دانش‌آموز مستقیماً بر اساس مهارت‌ها
    const { results: skillScores } = await env.DB.prepare(`
      SELECT 
        s.slug, 
        s.title as skill_title,
        COUNT(r.id) as total_answered,
        COALESCE(SUM(r.score), 0) as raw_score
      FROM skills s
      LEFT JOIN responses r ON s.slug = r.skill_slug AND r.student_id = ?
      GROUP BY s.slug, s.title
      HAVING raw_score > 0
      ORDER BY raw_score DESC
    `).bind(studentId).all();

    if (!skillScores || skillScores.length === 0) {
      return new Response(JSON.stringify({ error: 'هنوز پاسخی برای این دانش‌آموز ثبت نشده است.' }), { status: 400 });
    }

    // ۳. دریافت سوابق جزئیات پاسخ‌ها
    let itemResponses = [];
    try {
      const resItems = await env.DB.prepare(`
        SELECT r.skill_slug, s.title as skill_title, r.score
        FROM responses r
        JOIN skills s ON r.skill_slug = s.slug
        WHERE r.student_id = ?
        ORDER BY r.score DESC
        LIMIT 10
      `).bind(studentId).all();
      itemResponses = resItems.results || [];
    } catch (e) {
      itemResponses = [];
    }

    // ۴. دریافت سوابق آزمایش‌های مجاورت‌سازی (Exposure Trials)
    let exposureSummary = 'هنوز ارزیابی مجاورت‌سازی برای این دانش‌آموز ثبت نشده است.';
    try {
      const { results: exposureData } = await env.DB.prepare(`
        SELECT e.skill_slug, s.title as skill_title, e.learning_speed, e.resilience, e.engagement, e.mentor_note, e.trial_verdict, e.created_at
        FROM exposure_trials e
        JOIN skills s ON e.skill_slug = s.slug
        WHERE e.student_id = ?
        ORDER BY e.id DESC
        LIMIT 3
      `).bind(studentId).all();

      if (exposureData && exposureData.length > 0) {
        exposureSummary = exposureData.map(e => `- مهارت: ${e.skill_title} | سرعت یادگیری: ${e.learning_speed} | تاب‌آوری: ${e.resilience} | اشتیاق: ${e.engagement} | نظر مربی: ${e.mentor_note || 'ندارد'} | نتیجه: ${e.trial_verdict}`).join('\n');
      }
    } catch (e) {
      exposureSummary = 'اطلاعات مجاورت‌سازی در دسترس نیست.';
    }

    // ۵. آماده‌سازی پرامپت هوش مصنوعی
    const topSkillsSummary = skillScores.map(s => `- ${s.skill_title}: امتیاز کل ${s.raw_score}`).join('\n');
    const topItemsSummary = itemResponses.length > 0 
      ? itemResponses.map(i => `- حوزه ${i.skill_title}: نمره ${i.score}`).join('\n')
      : 'در دسترس نیست';

    const systemPrompt = `شما یک روانشناس ارشد بالینی کودک و متخصص برجسته استعدادیابی تحصیلی هستید. وظیفه شما تحلیل داده‌های عملکردی دانش‌آموز بر اساس مدل کدهای رغبتی هالند (RIASEC)، نظریه هوش‌های چندگانه گاردنر و مشاهدات عینی مجاورت‌سازی (Exposure) است.
خروجی باید دقیقاً به فرمت JSON معتبر بدون هیچ مارک‌داون اضافی یا بک‌تیک \`\`\`json باشد تا مستقیماً پارس شود. ساختار دقیق JSON:
{
  "gardner": [
    {"gardner_intelligence": "logical_mathematical", "percentage": 75},
    {"gardner_intelligence": "spatial_visual", "percentage": 80},
    {"gardner_intelligence": "bodily_kinesthetic", "percentage": 60},
    {"gardner_intelligence": "musical_rhythmic", "percentage": 45},
    {"gardner_intelligence": "linguistic", "percentage": 85},
    {"gardner_intelligence": "interpersonal", "percentage": 70},
    {"gardner_intelligence": "intrapersonal", "percentage": 90},
    {"gardner_intelligence": "naturalist", "percentage": 50}
  ],
  "topRequirements": [
    {"requirement": "عنوان شاخص ۱", "percentage": 85},
    {"requirement": "عنوان شاخص ۲", "percentage": 80},
    {"requirement": "عنوان شاخص ۳", "percentage": 75},
    {"requirement": "عنوان شاخص ۴", "percentage": 70},
    {"requirement": "عنوان شاخص ۵", "percentage": 65}
  ],
  "text": "متن کامل گزارش تحلیلی شامل ۴ بخش:\\n\\nبخش ۱: تحلیل استعدادهای محوری و تیپ غالب هالند (ترسیم نقطه A)\\nبخش ۲: تحلیل روان‌شناختی نقاط قوت پروفایل گاردنر و یافته‌های مجاورت‌سازی (Expose)\\nبخش ۳: بسته رشد اختصاصی از نقطه A به A1 (پروتکل‌های اقدام عملیاتی کامل شامل بسته اقدام ۱ و بسته اقدام ۲ با ابزار، تمرین و شاخص اندازه‌گیری)\\nبخش ۴: نقشه راه همراهی والدین و مدرسه"
}`;

    const userPrompt = `اطلاعات دانش‌آموز:
نام: ${student.student_name}
پایه: ${student.grade || '-'}
کلاس: ${student.classroom || '-'}

کارنامه مهارتی:
${topSkillsSummary}

گویه‌های برجسته:
${topItemsSummary}

مشاهدات مجاورت‌سازی مربی:
${exposureSummary}

لطفاً سند بالینی ارتقاء نقطه A به A1 را به طور کامل و تا پایان بخش ۴ صادر کن.`;

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید API هوش مصنوعی در سرور تنظیم نشده است.' }), { status: 500 });
    }

    const requestBody = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 6000
      }
    });

    const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/4e081705b0a69025a3affdd5ff991364/school-ai/google-ai-studio/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    let aiRes = await fetch(directUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody
    });

    if (!aiRes.ok) {
      aiRes = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: `خطای هوش مصنوعی: ${errText}` }), { status: 500 });
    }

    const aiData = await aiRes.json();
    let rawOutput = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    rawOutput = rawOutput.replace(/^```json/gim, '').replace(/^```/gim, '').trim();

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(rawOutput);
    } catch (e) {
      parsedPayload = {
        text: rawOutput,
        gardner: [],
        topRequirements: []
      };
    }

    // ۶. تعیین نسخه جدید سند
    const latest = await env.DB.prepare(
      "SELECT MAX(version) as max_v FROM student_roadmaps WHERE student_id = ?"
    ).bind(studentId).first();
    const nextVersion = (latest && latest.max_v ? Number(latest.max_v) : 0) + 1;

    // ۷. ذخیره در جدول سوابق
    await env.DB.prepare(`
      INSERT INTO student_roadmaps (student_id, version, analysis, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(studentId, nextVersion, JSON.stringify(parsedPayload)).run();

    return new Response(JSON.stringify({ success: true, version: nextVersion, roadmap: parsedPayload }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, student_id, version, analysis, created_at
      FROM student_roadmaps
      WHERE student_id = ?
      ORDER BY version DESC
    `).bind(studentId).all();

    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }
}
