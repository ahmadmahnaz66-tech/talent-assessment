export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }

  const { results } = await env.DB.prepare(
    "SELECT version, analysis, created_at FROM student_roadmaps WHERE student_id = ? ORDER BY version DESC"
  ).bind(studentId).all();

  return new Response(JSON.stringify(results || []), { headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { studentId } = await request.json();

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY تعریف نشده است.' }), { status: 400 });
    }

    // ۱. دریافت نمرات به تفکیک مهارت و تیپ هالند
    const { results: skillScores } = await env.DB.prepare(`
      SELECT 
        s.slug, 
        s.title, 
        s.holland_primary,
        s.holland_secondary,
        SUM(r.score) as total_score
      FROM quiz_responses r
      JOIN skills s ON r.skill_slug = s.slug
      WHERE r.student_id = ?
      GROUP BY s.slug
      ORDER BY total_score DESC
    `).bind(studentId).all();

    if (!skillScores || skillScores.length === 0) {
      return new Response(JSON.stringify({ error: 'ابتدا باید پرسش‌نامه برای این دانش‌آموز ثبت شود.' }), { status: 400 });
    }

    // ۲. محاسبه سرجمع هوش‌های چندگانه گاردنر
    const { results: gardnerScores } = await env.DB.prepare(`
      SELECT 
        q.gardner_intelligence,
        ROUND(SUM(r.score) * 100.0 / (COUNT(r.id) * 4), 1) as percentage
      FROM quiz_responses r
      JOIN questions q ON r.skill_slug = q.skill_slug AND r.question_index = q.display_order
      WHERE r.student_id = ? AND q.gardner_intelligence IS NOT NULL
      GROUP BY q.gardner_intelligence
      ORDER BY percentage DESC
    `).bind(studentId).all();

    // ۳. محاسبه ۳ شاخص رفتاری برتر (Top Requirements)
    const { results: topRequirements } = await env.DB.prepare(`
      SELECT 
        q.requirement,
        s.title as skill_title,
        ROUND(SUM(r.score) * 100.0 / (COUNT(r.id) * 4), 1) as percentage
      FROM quiz_responses r
      JOIN questions q ON r.skill_slug = q.skill_slug AND r.question_index = q.display_order
      JOIN skills s ON r.skill_slug = s.slug
      WHERE r.student_id = ? AND q.requirement IS NOT NULL
      GROUP BY q.requirement
      ORDER BY percentage DESC
      LIMIT 5
    `).bind(studentId).all();

    const topSkillsText = skillScores.slice(0, 5).map(s => 
      `- ${s.title} (کد هالند: ${s.holland_primary || '-'}/${s.holland_secondary || '-'}): ${s.total_score} از ۶۰`
    ).join('\n');

    const gardnerSummaryText = gardnerScores.map(g => 
      `- مولفه ${g.gardner_intelligence}: ${g.percentage}%`
    ).join('\n');

    const reqSummaryText = topRequirements.map(req => 
      `- شاخص رفتاری «${req.requirement}» در مهارت ${req.skill_title}: ${req.percentage}%`
    ).join('\n');

    // ۴. پرامپت اختصاصی روانشناختی
    const systemPrompt = `تو یک روانشناس بالینی کودک و متخصص ارشد استعدادیابی مدارس مهارت‌محور هستی.
بر اساس نظریه هوش‌های چندگانه گاردنر و مدل رغبت‌سنجی هالند (RIASEC)، تحلیلی حرفه‌ای و کاربردی از وضعیت دانش‌آموز ۷ تا ۱۲ سال ارائه بده.
گزارش باید شامل ۴ بخش مشخص باشد:
۱. تحلیل استعدادهای محوری و تیپ غالب هالند (نقطه A).
۲. نقاط قوت رفتاری و هوش‌های شناختی/حرکتی برجسته بر اساس شاخص‌های ثبت‌شده.
۳. مسیر رشد پله‌ای (A به A1) شامل ۲ تا ۳ پروژه عملی یا چالش رشدی کوتاه‌مدت.
۴. توصیه‌های کلیدی ویژه کادر مدرسه و اولیا (نقش تسهیل‌گر بدون مداخله مستقیم).
پاسخ را با لحن بالینی، ساختاریافته، دقیق و کاملاً به زبان فارسی بنویس.`;

    const userPrompt = `داده‌های آزمون دانش‌آموز (کد شناسایی: ${studentId}):

مهارت‌های دارای بالاترین اولویت:
${topSkillsText}

پروفایل هوش‌های گاردنر:
${gardnerSummaryText}

شاخص‌های رفتاری برجسته:
${reqSummaryText}

لطفاً کارنامه تحلیلی رشد را صادر کن.`;

    const gatewayUrl = 'https://gateway.ai.cloudflare.com/v1/4e081705b0a69025a3affdd5ff991364/school-ai/google-ai-studio/v1beta/models/gemini-1.5-flash:generateContent';

    const aiRes = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 2500
        }
      })
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      throw new Error(aiData.error?.message || 'خطا در برقراری ارتباط با جمنای');
    }

    const textOutput = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'تحلیلی دریافت نشد.';

    // ذخیره داده‌های ساختاریافته به همراه تحلیل متنی در دیتابیس
    const lastVer = await env.DB.prepare(
      "SELECT MAX(version) as max_v FROM student_roadmaps WHERE student_id = ?"
    ).bind(studentId).first();
    const nextVersion = (lastVer?.max_v || 0) + 1;

    // بسته‌بندی متنی همراه با تگ‌های داده برای استفاده توسط Chart.js
    const payloadToStore = JSON.stringify({
      text: textOutput,
      gardner: gardnerScores,
      topSkills: skillScores.slice(0, 7),
      topRequirements
    });

    await env.DB.prepare(`
      INSERT INTO student_roadmaps (student_id, version, analysis, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(studentId, nextVersion, payloadToStore).run();

    return new Response(JSON.stringify({ 
      success: true, 
      version: nextVersion, 
      analysis: payloadToStore 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
