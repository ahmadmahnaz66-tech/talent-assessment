export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { studentId, reportData, options } = await request.json();

    const { audience = 'counselor', framework = 'gardner', length = 'detailed' } = options || {};

    const scoresSummary = reportData.map(r => `- ${r.skill_title}: ${r.total_score} امتیاز`).join('\n');

    let audiencePrompt = '';
    if (audience === 'parents') {
      audiencePrompt = 'مخاطب این گزارش اولیای دانش‌آموز هستند. لحن باید بسیار محترمانه، روشن، امیدبخش و فاقد اصطلاحات پیچیده بالینی باشد. راهکارهای تقویتی خانگی ارائه بده.';
    } else if (audience === 'student') {
      audiencePrompt = 'مخاطب این متن خود دانش‌آموز دبستانی است. لحن باید کاملاً خودمانی، صمیمانه، داستانی و انگیزشی باشد تا کودک به علایق و استعدادهای خود افتخار کند.';
    } else if (audience === 'activities') {
      audiencePrompt = 'تمرکز گزارش بر معرفی دقیق کلاس‌ها، بازی‌ها، کتاب‌ها، کارگاه‌ها و فعالیت‌های فوق‌برنامه باشد تا مدرسه و خانواده بدانند کودک را در چه فضاهایی ثبت‌نام کنند.';
    } else {
      audiencePrompt = 'مخاطب مشاور تخصصی و کادر مدرسه است. لحن کاملاً بالینی، دقیق و تحلیلی باشد و به جنبه‌های رفتاری و نقاط اوج و نیاز به تقویت توجه کند.';
    }

    const systemPrompt = `تو یک روانشناس و مشاور ارشد استعدادیابی کودکان و نوجوانان هستی.
وظیفه تو تحلیل داده‌های آزمون استعدادیابی دانش‌آموز دبستانی و نگارش کارنامه توصیفی است.
چارچوب نظری ارزیابی: ${framework === 'gardner' ? 'نظریه هوش‌های چندگانه گاردنر' : 'رویکرد استعدادسنجی مهارتی و روانشناختی'}.
دستورالعمل سطح تفصیل: ${length === 'detailed' ? 'جامع، کامل و با بخش‌بندی منظم' : 'کوتاه، چکیده و کاربردی'}.
${audiencePrompt}
فقط به زبان فارسی شیوا و با ساختار تیتربندی منظم پاسخ بده.`;

    const userMessage = `نمرات ارزیابی دانش‌آموز (کد: ${studentId}):\n${scoresSummary}\n\nلطفاً گزارش تحلیل استعداد و پیشنهادات راهبردی را تدوین کن.`;

    // اتصال به هوش مصنوعی کلودفلر (Workers AI) یا Gateway
    let aiResponseText = '';
    if (env.AI) {
      const aiResult = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      });
      aiResponseText = aiResult.response;
    } else {
      // فال‌بک نمونه ساختاریافته در صورت عدم اتصال توکن AI
      aiResponseText = `گزارش استعدادیابی دانش‌آموز (${studentId})\n\nتحلیل کلی مهارت‌ها:\nبر اساس نمرات ثبت‌شده، استعداد برجسته کودک در حوزه‌های با امتیاز بالا مشهود است.\n\nپیشنهادات راهبردی:\n۱. تقویت و غنی‌سازی توانمندی‌های شاخص از طریق پروژه‌های عملی مدرسه.\n۲. ایجاد انگیزه و شرکت در کارگاه‌های مهارت‌محور گروهی.`;
    }

    return new Response(JSON.stringify({ success: true, analysis: aiResponseText }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}
