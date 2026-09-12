export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }

  const { results } = await env.DB.prepare(
    "SELECT version, analysis, created_at FROM roadmaps WHERE student_id = ? ORDER BY version DESC"
  ).bind(studentId).all();

  return new Response(JSON.stringify(results || []), { headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { studentId } = await request.json();

    const rawKey = env.GEMINI_API_KEY;
    if (!rawKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY در متغیرهای محیطی کلودفلر یافت نشد.' }), { status: 400 });
    }
    const apiKey = rawKey.trim();

    // ۱. دریافت نمرات دانش‌آموز از جدول واقعی responses
    const { results: skillScores } = await env.DB.prepare(`
      SELECT 
        r.skill_slug, 
        s.title, 
        s.holland_primary,
        s.holland_secondary,
        s.gardner_focus,
        r.total_score,
        r.answers
      FROM responses r
      JOIN skills s ON r.skill_slug = s.slug
      WHERE r.student_id = ?
      ORDER BY r.total_score DESC
    `).bind(studentId).all();

    if (!skillScores || skillScores.length === 0) {
      return new Response(JSON.stringify({ error: 'هنوز پاسخی برای این پرونده ثبت نشده است.' }), { status: 400 });
    }

    // ۲. دریافت گویه‌ها جهت محاسبه نمرات گاردنر و شاخص‌های رفتاری
    const { results: allQuestions } = await env.DB.prepare(`
      SELECT skill_slug, display_order, requirement, gardner_intelligence 
      FROM questions
    `).all();

    const gardnerTotals = {};
    const gardnerCounts = {};
    const reqTotals = {};
    const reqCounts = {};
    const reqSkill = {};

    skillScores.forEach(row => {
      let ansList = [];
      try {
        ansList = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
      } catch (e) {
        ansList = [];
      }

      const qList = (allQuestions || []).filter(q => q.skill_slug === row.skill_slug);

      qList.forEach((q, idx) => {
        const score = (Array.isArray(ansList) && ansList[idx] !== undefined)
          ? Number(ansList[idx])
          : Math.round((row.total_score / 60) * 4);

        if (q.gardner_intelligence) {
          gardnerTotals[q.gardner_intelligence] = (gardnerTotals[q.gardner_intelligence] || 0) + score;
          gardnerCounts[q.gardner_intelligence] = (gardnerCounts[q.gardner_intelligence] || 0) + 4;
        }

        if (q.requirement) {
          reqTotals[q.requirement] = (reqTotals[q.requirement] || 0) + score;
          reqCounts[q.requirement] = (reqCounts[q.requirement] || 0) + 4;
          reqSkill[q.requirement] = row.title;
        }
      });
    });

    const gardnerScores = Object.keys(gardnerTotals).map(k => ({
      gardner_intelligence: k,
      percentage: Math.round((gardnerTotals[k] / (gardnerCounts[k] || 1)) * 100)
    })).sort((a, b) => b.percentage - a.percentage);

    const topRequirements = Object.keys(reqTotals).map(k => ({
      requirement: k,
      skill_title: reqSkill[k] || '',
      percentage: Math.round((reqTotals[k] / (reqCounts[k] || 1)) * 100)
    })).sort((a, b) => b.percentage - a.percentage).slice(0, 5);

    const topSkillsText = skillScores.slice(0, 5).map(s => 
      `- ${s.title} (کد هالند: ${s.holland_primary || '-'}/${s.holland_secondary || '-'}): ${s.total_score} از ۶۰`
    ).join('\n');

    const gardnerSummaryText = gardnerScores.map(g => 
      `- مولفه ${g.gardner_intelligence}: ${g.percentage}%`
    ).join('\n');

    const reqSummaryText = topRequirements.map(req => 
      `- شاخص رفتاری «${req.requirement}» در مهارت ${req.skill_title}: ${req.percentage}%`
    ).join('\n');

    // ۳. پرامپت تحلیلی رشد کودک
    const systemPrompt = `تو یک روانشناس بالینی کودک و متخصص ارشد استعدادیابی مدارس مهارت‌محور هستی.
بر اساس نظریه هوش‌های چندگانه گاردنر و مدل رغبت‌سنجی هالند (RIASEC)، تحلیلی حرفه‌ای و کاربردی از وضعیت دانش‌آموز ۷ تا ۱۲ سال ارائه بده.
گزارش باید شامل ۴ بخش مشخص باشد:
۱. تحلیل استعدادهای محوری و تیپ غالب هالند (نقطه A).
۲. نقاط قوت رفتاری و هوش‌های شناختی/حرکتی برجسته بر اساس شاخص‌های ثبت‌شده.
۳. مسیر رشد پله‌ای (A به A1) شامل ۲ تا ۳ چالش و بازی عملی کوتاه‌مدت.
۴. توصیه‌های کلیدی ویژه کادر مدرسه و اولیا به عنوان تسهیل‌گر رشد.
پاسخ را با لحن بالینی، شیوا، دقیق و کاملاً به زبان فارسی بنویس.`;

    const userPrompt = `داده‌های آزمون دانش‌آموز (کد شناسایی: ${studentId}):

مهارت‌های دارای بالاترین اولویت:
${topSkillsText}

پروفایل هوش‌های گاردنر:
${gardnerSummaryText}

شاخص‌های رفتاری برجسته:
${reqSummaryText}

لطفاً کارنامه تحلیلی رشد را صادر کن.`;

    const requestBody = JSON.stringify({
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
    });

    // آدرس مستقیم گوگل با مدل پایدار ۲.۵
    const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    // آدرس گیت‌وی کلودفلر با مدل ۲.۵
    const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/4e081705b0a69025a3affdd5ff991364/school-ai/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    let aiRes = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody
    });

    if (!aiRes.ok) {
      aiRes = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });
    }

    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      const errMsg = aiData.error?.message || JSON.stringify(aiData.error) || 'پاسخی از سمت جمنای دریافت نشد.';
      throw new Error(errMsg);
    }

    const textOutput = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'متن تحلیلی تولید نشد.';

    // ۴. تعیین شماره نسخه و ثبت در دیتابیس
    const lastVer = await env.DB.prepare(
      "SELECT MAX(version) as max_v FROM roadmaps WHERE student_id = ?"
    ).bind(studentId).first();
    const nextVersion = (lastVer?.max_v || 0) + 1;

    const payloadToStore = JSON.stringify({
      text: textOutput,
      gardner: gardnerScores,
      topSkills: skillScores.slice(0, 7),
      topRequirements
    });

    await env.DB.prepare(`
      INSERT INTO roadmaps (student_id, version, analysis, created_at)
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
