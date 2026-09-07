export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { studentId, reportData, options } = await request.json();

    const { audience = 'counselor', framework = 'gardner', length = 'detailed' } = options || {};

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'کلید GEMINI_API_KEY در متغیرهای محیطی کلودفلر یافت نشد.' 
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const scoresSummary = (reportData || [])
      .map(r => `- ${r.skill_title}: ${r.total_score} امتیاز`)
      .join('\n');

    let audienceInstruction = '';
    if (audience === 'parents') {
      audienceInstruction = 'مخاطب گزارش اولیای دانش‌آموز هستند. لحن دلگرم‌کننده، بدون اصطلاحات پیچیده و با راهکارهای عملی خانگی باشد.';
    } else if (audience === 'student') {
      audienceInstruction = 'مخاطب خود دانش‌آموز مقطع دبستان است. لحن صمیمانه، داستانی و مشوق باشد.';
    } else if (audience === 'activities') {
      audienceInstruction = 'گزارش متمرکز بر معرفی دوره‌ها، کارگاه‌ها و فعالیت‌های فوق‌برنامه باشد.';
    } else {
      audienceInstruction = 'مخاطب مشاور تخصصی مدرسه است. لحن بالینی، ساختاریافته و با تفکیک نقاط قوت و نیازهای پرورشی باشد.';
    }

    const systemPrompt = `تو روانشناس و متخصص استعدادیابی کودکان دبستان هستی.
چارچوب ارزیابی: ${framework === 'gardner' ? 'هوش‌های چندگانه گاردنر' : 'رویکرد مهارتی'}.
حجم گزارش: ${length === 'detailed' ? 'جامع و تفکیک‌شده' : 'چکیده و نکات کلیدی'}.
دستور مخاطب: ${audienceInstruction}
پاسخ به فارسی روان باشد.`;

    const userPrompt = `نمرات دانش‌آموز با شناسه ${studentId}:\n${scoresSummary}\n\nتحلیل استعداد و راهکارهای رشدی را صادر کن.`;

    const gatewayUrl = 'https://gateway.ai.cloudflare.com/v1/4e081705b0a69025a3affdd5ff991364/school-ai/google-ai-studio/v1beta/models/gemini-1.5-flash:generateContent';

    const res = await fetch(gatewayUrl, {
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
          temperature: 0.7,
          maxOutputTokens: 2000
        }
      })
    });

    const resData = await res.json();

    if (!res.ok) {
      const msg = resData.error?.message || 'خطای پردازش هوش مصنوعی';
      return new Response(JSON.stringify({ success: false, error: msg }), { 
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const outputText = resData.candidates?.[0]?.content?.parts?.[0]?.text || 'پاسخی دریافت نشد.';

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
