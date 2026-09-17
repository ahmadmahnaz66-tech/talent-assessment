// ۱. دریافت تاریخچه کارنامه‌ها و تحلیل‌های صادرشده (متد GET)
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
    let cleanId = String(nationalId).trim();
    let results = [];

    // واکشی سوابق از جدول roadmaps
    try {
      const dbRoadmaps = await env.DB.prepare(
        "SELECT id, version, analysis, created_at FROM roadmaps WHERE student_id = ? ORDER BY version DESC, id DESC"
      ).bind(cleanId).all();
      if (dbRoadmaps && dbRoadmaps.results && dbRoadmaps.results.length > 0) {
        results = dbRoadmaps.results;
      }
    } catch (e) {}

    // در صورت استفاده از جدول student_roadmaps
    if (results.length === 0) {
      try {
        const dbStudentRoadmaps = await env.DB.prepare(
          "SELECT id, version, analysis, created_at FROM student_roadmaps WHERE student_id = ? ORDER BY version DESC, id DESC"
        ).bind(cleanId).all();
        if (dbStudentRoadmaps && dbStudentRoadmaps.results && dbStudentRoadmaps.results.length > 0) {
          results = dbStudentRoadmaps.results;
        }
      } catch (e) {}
    }

    return new Response(JSON.stringify(results || []), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

// ۲. صدور کارنامه و نقشه راه جدید هوش مصنوعی (متد POST)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { nationalId } = await request.json();

    if (!nationalId) {
      return new Response(JSON.stringify({ error: 'کد ملی یا شناسه دانش‌آموز الزامی است.' }), { status: 400 });
    }

    const cleanId = String(nationalId).trim();

    // جستجوی پرونده دانش‌آموز بر اساس id (کد ملی) یا شماره‌های همراه
    const student = await env.DB.prepare(
      "SELECT * FROM students WHERE id = ? OR father_phone = ? OR mother_phone = ? OR parent_phone = ?"
    ).bind(cleanId, cleanId, cleanId, cleanId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموزی با این مشخصات یافت نشد.' }), { status: 404 });
    }

    // استخراج نمرات دانش‌آموز از جدول responses
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
      if (skillMap[r.skill_slug]) {
        skillMap[r.skill_slug].score = r.total_score;
      }
    });

    const scoresSummary = Object.values(skillMap)
      .map(s => `- مهارت: ${s.title} | حوزه: ${s.category} | نمره کل مکتسبه: ${s.score}`)
      .join('\n');

    const keysRaw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
    const apiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'کلید API هوش مصنوعی در سرور تنظیم نشده است.' }), { status: 500 });
    }

    const systemPrompt = `تو مشاور ارشد و متخصص استعدادیابی تحصیلی و روان‌شناسی رشد دبستان آپادانا هستی. 
بر اساس نمرات ارزیابی مهارتی و غربالگری دانش‌آموز، یک نقشه راه رشد فردی جامع، حرفه‌ای، انگیزشی و کاملاً عملیاتی بنویس.
خروجی باید صرفاً در قالب ساختار Markdown و شامل بخش‌های زیر باشد:
1. تحلیل تیپ شخصیتی و استعدادهای برتر (بر اساس کدهای ۶ گانه هالند RIASEC)
2. ۳ استعداد طلایی و متمایز کودک با ذکر شواهد رفتاری
3. توصیه‌های اختصاصی به والدین برای تقویت در منزل
4. توصیه‌های راهبردی و مهارتی به آموزگاران و کادر مدرسه
5. نقشه راه گام‌به‌گام ۳ ماهه (فازهای ماهانه)`;

    const sFullName = student.student_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'دانش‌آموز';
    const userPrompt = `اطلاعات دانش‌آموز:
نام: ${sFullName}
شناسه/کد ملی: ${student.id}
پایه تحصیلی: پایه ${student.grade || 'ابتدایی'} - کلاس ${student.classroom || '-'}

نمرات ارزیابی مهارت‌ها:
${scoresSummary}`;

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

    // مدل‌های فعال و پیشنهادی رسمی گوگل
    const fallbackModels = [
      'gemini-3.1-pro-preview',
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    ];
    const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);

    let aiRes = null;
    let lastError = '';

    outerLoop:
    for (const key of shuffledKeys) {
      for (const model of fallbackModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        try {
          aiRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key
            },
            body: requestBody
          });

          if (aiRes.ok) {
            break outerLoop;
          }

          lastError = await aiRes.text();
        } catch (e) {
          lastError = e.message;
        }
      }
    }

    if (!aiRes || !aiRes.ok) {
      return new Response(JSON.stringify({ error: `خطای دریافت پاسخ هوش مصنوعی: ${lastError}` }), { status: 500 });
    }

    const aiData = await aiRes.json();
    const roadmapMarkdown = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!roadmapMarkdown) {
      return new Response(JSON.stringify({ error: 'پاسخی از مدل هوش مصنوعی تولید نشد.' }), { status: 500 });
    }

    // محاسبه شماره نسخه گزارش
    let currentVersion = 1;
    try {
      const lastVersionRow = await env.DB.prepare(
        "SELECT MAX(version) as max_v FROM roadmaps WHERE student_id = ?"
      ).bind(String(student.id)).first();
      if (lastVersionRow && lastVersionRow.max_v) {
        currentVersion = Number(lastVersionRow.max_v) + 1;
      }
    } catch (e) {}

    // ذخیره در جدول تاریخچه سوابق (roadmaps)
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
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
