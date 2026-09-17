export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { slug, title } = await request.json();
    if (!slug || !title) {
      return new Response(JSON.stringify({ error: 'شناسه و عنوان مهارت الزامی است.' }), { status: 400 });
    }

    const cleanSlug = String(slug).trim().toLowerCase();
    const cleanTitle = String(title).trim();

    const keysRaw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
    const apiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'کلید API هوش مصنوعی در سرور تنظیم نشده است.' }), { status: 500 });
    }

    const fullPrompt = `نقش تو یک متخصص ارشد روان‌سنجی کودک و استعدادیابی بر اساس مدل کدهای هالند (RIASEC) برای سنین ۷ تا ۱۲ سال است.

برای مهارت جدید زیر:
عنوان: ${cleanTitle}
شناسه: ${cleanSlug}

۱. ابتدا دسته و هم‌خانواده اصلی این مهارت را بر اساس یکی از ۶ کد هالند زیر تعیین کن:
- realistic (مهارت‌های ابزاری، بدنی، ورزشی، آشپزی، فنی)
- investigative (مهارت‌های تحلیلی، فکری، کدنویسی، هوش مصنوعی، نجوم، شطرنج)
- artistic (مهارت‌های خلاقانه، بازیگری، طنز، هنر، موسیقی، نویسندگی)
- social (مهارت‌های بیانی، سخنوری، مشاوره، ارتباطی)
- enterprising (رهبری، مذاکره، کارآفرینی)
- conventional (نظم، دقت، محاسبات دفتری)

۲. یک بسته ۱۵ سوالی (گویه عینی رفتار در منزل و بازی) با مقیاس لیکرت ۵ گزینه‌ای (۰ تا ۴) طراحی کن.
۳. کنترل خطای هاله‌ای (بدون کلمات مبالغه‌آمیز مانند نابغه یا باهوش).
۴. پوشش ۵ بعد: اشتیاق خودجوش (۳ گویه)، یادگیری شهودی (۳ گویه)، غرقگی و تاب‌آوری (۳ گویه)، خلاقیت ترکیبی (۳ گویه)، حساسیت ادراکی (۳ گویه).

خروجی الزاما و صرفاً یک JSON استاندارد بدون هیچ علامت مارک‌داون باشد:
{
  "category": "یکی از ۶ کد بالا به انگلیسی",
  "badge_title": "عنوان نشان افتخار",
  "badge_emoji": "یک ایموجی مرتبط",
  "micro_challenge": "ماموریت ۲۴ ساعته خانوادگی",
  "questions": [
    {"order": 1, "text": "متن گویه اول..."},
    {"order": 2, "text": "متن گویه دوم..."},
    {"order": 3, "text": "متن گویه سوم..."},
    {"order": 4, "text": "متن گویه چهارم..."},
    {"order": 5, "text": "متن گویه پنجم..."},
    {"order": 6, "text": "متن گویه ششم..."},
    {"order": 7, "text": "متن گویه هفتم..."},
    {"order": 8, "text": "متن گویه هشتم..."},
    {"order": 9, "text": "متن گویه نهم..."},
    {"order": 10, "text": "متن گویه دهم..."},
    {"order": 11, "text": "متن گویه یازدهم..."},
    {"order": 12, "text": "متن گویه دوازدهم..."},
    {"order": 13, "text": "متن گویه سیزدهم..."},
    {"order": 14, "text": "متن گویه چهاردهم..."},
    {"order": 15, "text": "متن گویه پانزدهم..."}
  ]
}`;

    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 3000 }
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
      return new Response(JSON.stringify({ error: `خطای هوش مصنوعی: ${lastError}` }), { status: 500 });
    }

    const aiData = await aiRes.json();
    let rawOutput = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawOutput = rawOutput.replace(/^```json/gim, '').replace(/^```/gim, '').trim();
    const parsed = JSON.parse(rawOutput);

    const category = parsed.category || 'general';

    await env.DB.prepare(`
      INSERT INTO skills (slug, title, category) 
      VALUES (?, ?, ?) 
      ON CONFLICT(slug) DO UPDATE SET category = excluded.category
    `).bind(cleanSlug, cleanTitle, category).run();

    const statements = parsed.questions.map(q => {
      return env.DB.prepare(
        "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
      ).bind(cleanSlug, q.text, q.order);
    });
    await env.DB.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      message: `مهارت «${cleanTitle}» در دسته [${category}] به همراه ۱۵ گویه ثبت شد.`
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
