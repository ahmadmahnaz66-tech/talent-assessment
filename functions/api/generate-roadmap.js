export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }

  const { results } = await env.DB.prepare(
    "SELECT version, analysis, created_at FROM roadmaps WHERE student_id = ? ORDER BY version DESC"
  ).bind(String(studentId).trim()).all();

  return new Response(JSON.stringify(results || []), { headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { studentId } = await request.json();

    const rawKey = env.GEMINI_API_KEY;
    if (!rawKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY در متغیرهای محیطی یافت نشد.' }), { status: 400 });
    }
    const apiKey = rawKey.trim();
    const cleanStudentId = String(studentId).trim();

    // ۱. دریافت نمرات دانش‌آموز از جدول responses
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
    `).bind(cleanStudentId).all();

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

    // ۳. دریافت سوابق مجاورت‌سازی ۲ هفته‌ای مربی (در صورت وجود)
    const { results: exposureTrials } = await env.DB.prepare(`
      SELECT e.skill_slug, s.title as skill_title, e.learning_speed, e.resilience, e.engagement, e.mentor_note, e.trial_verdict
      FROM exposure_trials e
      JOIN skills s ON e.skill_slug = s.slug
      WHERE e.student_id = ?
      ORDER BY e.created_at DESC
      LIMIT 3
    `).bind(cleanStudentId).all();

    let exposureSummaryText = 'هنوز دوره مجاورت‌سازی ۲ هفته‌ای عملی برای این کیس ثبت نشده است.';
    if (exposureTrials && exposureTrials.length > 0) {
      exposureSummaryText = exposureTrials.map(t => 
        `- کارگاه آزمایشی مهارت «${t.skill_title}»: سرعت یادگیری (${t.learning_speed})، تاب‌آوری در بن‌بست و چالش (${t.resilience})، اشتیاق خودانگیخته (${t.engagement}) | نظر مربی: ${t.mentor_note || '-'} | نتیجه میدانی: ${t.trial_verdict}`
      ).join('\n');
    }

    const topSkillsText = skillScores.slice(0, 5).map(s => 
      `- ${s.title} (کد هالند: ${s.holland_primary || '-'}/${s.holland_secondary || '-'}): امتیاز ${s.total_score} از ۶۰`
    ).join('\n');

    const gardnerSummaryText = gardnerScores.map(g => 
      `- بعد ${g.gardner_intelligence}: ${g.percentage}%`
    ).join('\n');

    const reqSummaryText = topRequirements.map(req => 
      `- شاخص عینی «${req.requirement}» در مهارت ${req.skill_title}: ${req.percentage}%`
    ).join('\n');

    // ۴. پرامپت روانشناختی استعدادیابی با نقش پیشنهاددهنده بسته‌های A به A1
    const systemPrompt = `تو یک روانشناس ارشد بالینی کودک و متخصص استعدادیابی مدارس مهارت‌محور هستی.
وظیفه تو تحلیل علمی پروفایل استعدادیابی یک کودک ۷ تا ۱۲ ساله بر اساس مدل هوش‌های چندگانه گاردنر و مدل رغبت‌سنجی هالند (RIASEC) است.
مهم: تو به عنوان «تسهیل‌گر و پیشنهاددهنده راهکار» عمل می‌کنی؛ بنابراین باید پروتکل‌های رشد را به صورت بسته‌های اقدام عینی و مشخص طراحی کنی.

گزارش تحلیلی باید شامل ۴ بخش تفکیک‌شده باشد:
۱. تحلیل استعدادهای محوری و تیپ غالب هالند (ترسیم نقطه A بر اساس نمرات آزمون و رفتارها).
۲. تحلیل روان‌شناختی نقاط قوت، پروفایل گاردنر و یافته‌های حاصل از دوره ۲ هفته‌ای مجاورت‌سازی (Expose).
۳. بسته رشد اختصاصی از نقطه A به A1 (بسیار مهم: حداقل ۲ فعالیت، ابزار یا بازی عملیاتی کاملاً مشخص با نام‌های عینی—مثلاً طراحی «دفترچه معماهای منطقی»، «تمرینات تنظیم توجه و تن صدا در حل مسئله»، یا پروژه‌های چالش‌محور خانگی و مدرسه‌ای—دقیقاً بنویس هر بسته چه مشخصاتی دارد و چگونه اجرا می‌شود).
۴. رهنمودهای کلیدی برای کادر مدرسه و اولیا جهت تسهیل‌گری بدون دخالت مستقیم و بدون ایجاد مقاومت روانی.

لحن تحلیل باید کاملاً تخصصی، بالینی، کاربردی و به زبان فارسی شیوا باشد.`;

    // کاملاً بدون اطلاعات هویتی (Zero-PII)
    const userPrompt = `داده‌های پایش شناختی و رفتاری کودک (شناسه پرونده: کیس ارزیابی محرمانه):

مهارت‌های اولویت اول در ارزیابی اولیه والدین:
${topSkillsText}

پروفایل هوش‌های چندگانه گاردنر:
${gardnerSummaryText}

شاخص‌های رفتاری برجسته (Requirements):
${reqSummaryText}

مشاهدات میدانی مربی در دوره مجاورت‌سازی ۲ هفته‌ای (Expose Trial):
${exposureSummaryText}

لطفاً کارنامه تخصصی و بسته اقدام گام‌به‌گام رشد A به A1 را تدوین کن.`;

    const requestBody = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 2800
      }
    });

    const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/4e081705b0a69025a3affdd5ff991364/school-ai/google-ai-studio/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

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
      const errMsg = aiData.error?.message || JSON.stringify(aiData.error) || 'پاسخی از سمت سرور هوش مصنوعی دریافت نشد.';
      throw new Error(errMsg);
    }

    const textOutput = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'متن تحلیلی تولید نشد.';

    // ۵. تعیین نسخه و ذخیره در جدول roadmaps
    const lastVer = await env.DB.prepare(
      "SELECT MAX(version) as max_v FROM roadmaps WHERE student_id = ?"
    ).bind(cleanStudentId).first();
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
    `).bind(cleanStudentId, nextVersion, payloadToStore).run();

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
