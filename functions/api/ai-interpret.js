export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { studentId, reportData, options } = await request.json();

    const { audience = 'counselor', framework = 'gardner', length = 'detailed' } = options || {};

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'کلید GEMINI_API_KEY در متغیرهای محیطی کلودفلر تعریف نشده است.' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const scoresSummary = (reportData || [])
      .map(r => `- ${r.skill_title}: ${r.total_score} امتیاز`)
      .join('\n');

    let audienceInstruction = '';
    if (audience === 'parents') {
      audienceInstruction = 'مخاطب گزارش اولیای دانش‌آموز هستند. لحن باید بسیار محترمانه، روشن، دلگرم‌کننده و خالی از اصطلاحات سخت باشد. راهکارهای پرورشی خانگی ارائه بده.';
    } else if (audience === 'student') {
      audienceInstruction = 'مخاطب خود دانش‌آموز مقطع دبستان است. لحن صمیمانه، قصه مانند و بسیار انگیزشی باشد تا کودک به علایق و مهارت‌هایش افتخار کند.';
    } else if (audience === 'activities') {
      audienceInstruction = 'گزارش باید مشخصاً به معرفی دوره‌های مهارتی، کلاس‌های فوق‌برنامه، بازی‌های فکری و کارگاه‌های مناسب با امتیازهای بالای دانش‌آموز بپردازد.';
    } else {
      audienceInstruction = 'مخاطب مشاور تخصصی و مدیریت مدرسه است. لحن بالینی، تحلیلی و تخصصی باشد و به ارزیابی نقاط قوت برجسته و نیازهای هدایتی دانش‌آموز اشاره کند.';
    }

    const systemPrompt = `نقش: تو یک روانشناس بالینی و مشاور استعدادیابی کودکان دبستان هستی.
چارچوب نظری: ${framework === 'gardner' ? 'هوش‌های چندگانه هوارد گاردنر' : 'رویکرد استعدادسنجی مهارتی و ترکیبی'}.
سطح تفصیل: ${length === 'detailed' ? 'جامع، تفکیک‌شده با تیترهای مشخص' : 'کوتاه و نکات کلیدی'}.
دستور لحن و مخاطب: ${audienceInstruction}
پاسخ را به زبان فارسی سلیس و روان بنویس.`;

    const userPrompt = `نمرات ارزیابی دانش‌آموز با کد ملی ${studentId}:\n${scoresSummary}\n\nلطفاً گزارش تحلیل استعداد را تدوین کن.`;

    // فراخوانی مستقیم Gemini 1.5 Flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000
        }
      })
    });

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const errDetail = geminiData.error?.message || 'خطای سرور جمنای';
      return new Response(JSON.stringify({ success: false, error: errDetail }), { 
        status: geminiRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const outputText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'پاسخی از جمنای دریافت نشد.';

    return new Response(JSON.stringify({ success: true, analysis: outputText }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
