export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { slug, title } = await request.json();
    if (!slug || !title) {
      return new Response(JSON.stringify({ error: 'شناسه و عنوان مهارت الزامی است.' }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید API جمنای در تنظیمات ست نشده است.' }), { status: 500 });
    }

    const systemPrompt = `نقش تو متخصص ارشد روان‌سنجی کودک و استعدادیابی ۷ تا ۱۲ سال است. 
برای مهارت "${title}" با شناسه انگلیسی "${slug}"، دقیقاً ۱۵ گویه عینی و رفتاری ویژه پرسشنامه والدین طراحی کن.
اصول طراحی:
- مقیاس لیکرت ۵ گزینه‌ای تناوب رفتاری (هرگز تا همیشه).
- رفتارهای عینی در بازی و خانه؛ بدون الفاظ مبالغه‌آمیز هوش یا استعداد و کنترل سوگیری والدین.
- پوشش ۵ بعد: اشتیاق خودجوش (۳ گویه)، یادگیری شهودی و سرعت درک (۳ گویه)، تمرکز و تاب‌آوری (۳ گویه)، کاربرد خلاقانه (۳ گویه)، حساسیت ادراکی (۳ گویه).

پاسخ را الزاما و فقط به صورت یک آرایه JSON معتبر از آبجکت‌ها برگردان، بدون هیچ متن اضافی یا علامت Markdown:
[
  {"order": 1, "text": "متن سوال اول..."},
  {"order": 2, "text": "متن سوال دوم..."}
]`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.4
        }
      })
    });

    const aiData = await aiRes.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('پاسخی از مدل هوش مصنوعی دریافت نشد.');

    const questions = JSON.parse(rawText);

    // ۱. درج مهارت در جدول مهارت‌ها در صورت عدم وجود
    await env.DB.prepare(
      "INSERT OR IGNORE INTO skills (slug, title) VALUES (?, ?)"
    ).bind(slug, title).run();

    // ۲. درج گروهی هر ۱۵ سوال در پایگاه داده D1
    const statements = questions.map(q => {
      return env.DB.prepare(
        "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
      ).bind(slug, q.text, q.order);
    });

    await env.DB.batch(statements);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `مهارت "${title}" به همراه ۱۵ گویه تخصصی با موفقیت ثبت شد.` 
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
