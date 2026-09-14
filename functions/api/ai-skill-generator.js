export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { slug, title } = await request.json();
    if (!slug || !title) {
      return new Response(JSON.stringify({ error: 'شناسه و عنوان مهارت الزامی است.' }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY در تنظیمات کلودفلر یافت نشد.' }), { status: 500 });
    }

    const fullPrompt = `نقش تو یک متخصص ارشد روان‌سنجی کودک و روان‌شناسی تحولی با تمرکز بر استعدادیابی و هوش‌های چندگانه برای کودکان دوره ابتدایی (۷ تا ۱۲ سال) است.
برای مهارت "${title}" با شناسه انگلیسی "${slug}"، دقیقاً ۱۵ گویه عینی و رفتاری ویژه پرسشنامه والدین طراحی کن.

اصول روان‌سنجی:
- مخاطب والدین هستند؛ رفتارها عینی در خانه و بازی و بدون عبارات اغراق‌آمیز (نابغه، فوق‌العاده).
- مقیاس لیکرت ۵ گزینه‌ای تناوب رفتار (۰ هرگز تا ۴ همیشه).
- ۵ بعد اصلی (هر بعد دقیقاً ۳ گویه):
  ۱. اشتیاق خودجوش (۳ سوال)
  ۲. سرعت پردازش و یادگیری شهودی (۳ سوال)
  ۳. غرقگی و تاب‌آوری (۳ سوال)
  ۴. خلاقیت ترکیبی و کاربرد عملی (۳ سوال)
  ۵. حساسیت ادراکی به جزئیات (۳ سوال)

خروجی را بدون هرگونه توضیح اضافی یا مقدمه، صرفاً در قالب یک شیء JSON استاندارد به فرمت زیر برگردان:
{
  "badge_title": "عنوان نشان افتخار مهارتی",
  "badge_emoji": "یک ایموجی مرتبط",
  "micro_challenge": "شرح ماموریت ۲۴ ساعته خانوادگی",
  "questions": [
    {"order": 1, "text": "متن سوال اول..."},
    {"order": 2, "text": "متن سوال دوم..."},
    {"order": 3, "text": "متن سوال سوم..."},
    {"order": 4, "text": "متن سوال چهارم..."},
    {"order": 5, "text": "متن سوال پنجم..."},
    {"order": 6, "text": "متن سوال ششم..."},
    {"order": 7, "text": "متن سوال هفتم..."},
    {"order": 8, "text": "متن سوال هشتم..."},
    {"order": 9, "text": "متن سوال نهم..."},
    {"order": 10, "text": "متن سوال دهم..."},
    {"order": 11, "text": "متن سوال یازدهم..."},
    {"order": 12, "text": "متن سوال دوازدهم..."},
    {"order": 13, "text": "متن سوال سیزدهم..."},
    {"order": 14, "text": "متن سوال چهاردهم..."},
    {"order": 15, "text": "متن سوال پانزدهم..."}
  ]
}`;

    const geminiUrl = `[https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=$){apiKey}`;
    
    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.3
        }
      })
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok || aiData.error) {
      const errMsg = aiData.error?.message || JSON.stringify(aiData.error) || 'خطای ناشناخته از گوگل';
      return new Response(JSON.stringify({ error: `خطای گوگل جمنای: ${errMsg}` }), { status: 500 });
    }

    let rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(JSON.stringify({ error: 'پاسخی از مدل دریافت نشد یا متن مسدود شد: ' + JSON.stringify(aiData) }), { status: 500 });
    }

    // پاکسازی احتمالی کاراکترهای اضافی مارک‌داون
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(rawText);

    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return new Response(JSON.stringify({ error: 'ساختار سوالات ارسالی از مدل ناقص بود.' }), { status: 500 });
    }

    // ۱. درج مهارت در جدول مهارت‌ها
    await env.DB.prepare(
      "INSERT OR IGNORE INTO skills (slug, title) VALUES (?, ?)"
    ).bind(slug, title).run();

    // ۲. درج گروهی هر ۱۵ سوال در پایگاه داده D1
    const statements = parsed.questions.map(q => {
      return env.DB.prepare(
        "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
      ).bind(slug, q.text, q.order);
    });

    await env.DB.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      message: `مهارت «${title}» با نشان «${parsed.badge_emoji || '🎖️'} ${parsed.badge_title || ''}» و ${parsed.questions.length} گویه تخصصی با موفقیت ثبت شد.`
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
