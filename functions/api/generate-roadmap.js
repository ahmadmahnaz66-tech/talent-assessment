export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { nationalId } = await request.json();

    if (!nationalId) {
      return new Response(JSON.stringify({ error: 'کد ملی دانش‌آموز الزامی است.' }), { status: 400 });
    }

    const student = await env.DB.prepare(
      "SELECT * FROM students WHERE national_id = ?"
    ).bind(nationalId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموزی با این مشخصات یافت نشد.' }), { status: 404 });
    }

    const scores = await env.DB.prepare(`
      SELECT 
        s.slug, 
        s.title, 
        s.category,
        COALESCE(SUM(r.score), 0) as total_score,
        COUNT(r.score) as questions_count,
        ROUND(AVG(r.score), 2) as average_score
      FROM skills s
      LEFT JOIN questions q ON s.slug = q.skill_slug
      LEFT JOIN responses r ON q.id = r.question_id AND r.student_national_id = ?
      GROUP BY s.slug
      ORDER BY total_score DESC
    `).bind(nationalId).all();

    const keysRaw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
    const apiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'کلید API هوش مصنوعی در سرور تنظیم نشده است.' }), { status: 500 });
    }

    const systemPrompt = `تو یک مشاور ارشد و متخصص استعدادیابی تحصیلی و رشدی مدارس ابتدایی هستی. 
بر اساس نمرات ارزیابی مهارتی دانش‌آموز، یک نقشه راه رشد فردی جامع، حرفه‌ای، انگیزشی و کاملاً عملیاتی طراحی کن.
خروجی باید صرفاً در قالب ساختار Markdown و شامل بخش‌های زیر باشد:
1. تحلیل تیپ شخصیتی و استعدادهای برتر (بر اساس کدهای ۶ گانه هالند RIASEC)
2. ۳ استعداد طلایی و متمایز کودک با ذکر شواهد رفتاری
3. توصیه‌های اختصاصی به والدین برای تقویت در منزل
4. توصیه‌های راهبردی به آموزگاران مدرسه
5. نقشه راه گام‌به‌گام ۳ ماهه (فازهای ماهانه)`;

    const userPrompt = `اطلاعات دانش‌آموز:
نام: ${student.first_name} ${student.last_name}
کد ملی: ${student.national_id}
پایه تحصیلی: ${student.grade || 'ابتدایی'}

نمرات ارزیابی مهارت‌ها:
${scores.results.map(s => `- مهارت: ${s.title} | دسته: ${s.category} | امتیاز کل: ${s.total_score} | میانگین: ${s.average_score} از ۴`).join('\n')}`;

    const requestBody = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 6000
      }
    });

    const fallbackModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.6-flash'];
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

    await env.DB.prepare(
      "UPDATE students SET ai_roadmap = ?, roadmap_created_at = datetime('now') WHERE national_id = ?"
    ).bind(roadmapMarkdown, nationalId).run();

    return new Response(JSON.stringify({ 
      success: true, 
      roadmap: roadmapMarkdown 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
