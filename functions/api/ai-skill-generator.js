export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { slug, title } = await request.json();
    if (!slug || !title) {
      return new Response(JSON.stringify({ error: 'شناسه و عنوان مهارت الزامی است.' }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY در کلودفلر تنظیم نشده است.' }), { status: 500 });
    }

    const fullPrompt = `نقش تو یک متخصص ارشد روان‌سنجی کودک و روان‌شناسی تحولی با تمرکز بر استعدادیابی و هوش‌های چندگانه (گاردنر و تیپ‌های هالند) برای کودکان دوره ابتدایی (۷ تا ۱۲ سال) است.

من می‌خواهم برای یک مهارت جدید، یک بسته ۱۵ سوالی (گویه ارزیابی رفتار) ویژه پرسشنامه والدین طراحی کنی. سوالات باید کاملاً هم‌راستا با استانداردها و اصول زیر طراحی شوند:

۱. زاویه دید و فرمت پاسخ‌دهی:
- مخاطب گویه‌ها «والدین» هستند؛ بنابراین رفتار باید در بستر منزل، بازی، روابط و کنجکاوی‌های روزمره کودک توصیف شود.
- مقیاس لیکرت ۵ گزینه‌ای است: [هرگز (۰)، به‌ندرت (۱)، گاهی (۲)، معمولاً (۳)، همیشه (۴)].
- سوالات باید به گونه‌ای صیقل بخورند که این مقیاس ۵ گزینه‌ای دقیقاً به تناوب واقعی رفتار اشاره کند.

۲. کنترل خطای هاله‌ای (Halo Effect) و سوگیری تایید:
- از به کار بردن عبارات کیفی و اغراق‌آمیز مثل «استعداد فوق‌العاده دارد»، «بسیار باهوش است» یا «نابغه است» اکیداً خودداری کن.
- از طرح سوالات تابلو یا سوالاتی که والد خجالت بکشد به آن‌ها نمره پایین بدهد (مثل رفتارهای بدیهی ادب، هوش عمومی یا وظیفه‌شناسی) پرهیز کن.
- رفتارها باید کاملاً خنثی، عینی (Objective) و مبتنی بر عملگرایی روزمره باشند تا والد احساس کند نمره ۲ یا ۱ نیز کاملاً طبیعی است.

۳. پنج ستون اصلی طراحی برای ۱۵ سوال (دقیقاً ۳ سوال در هر بعد):
- بعد ۱: اشتیاق خودجوش (Intrinsic Motivation) -> رفتارهایی که کودک بدون پاداش، تکلیف مدرسه یا اصرار والدین داوطلبانه به سمتشان می‌رود.
- بعد ۲: سرعت پردازش و یادگیری شهودی (Learning Speed & Intuition) -> چگونگی درک سریع الگوها، رفع اشکال سریع و ارتباط دادن اطلاعات جدید به تجربیات قبلی.
- بعد ۳: غرقگی، توجه متمرکز و تاب‌آوری (Flow & Grit) -> توانایی تمرکز عمیق روی این فعالیت تا حدی که متوجه گذر زمان یا صداهای اطراف نشود، و پافشاری هنگام برخورد با بن‌بست.
- بعد ۴: خلاقیت ترکیبی و کاربرد عملی (Creative Application) -> ترکیب این مهارت با وسایل دورریز، بازی‌های شخصی، یا حل یک مسئله روزمره خانوادگی.
- بعد ۵: حساسیت ادراکی و توجه به جزئیات (Perceptual Nuance) -> دیدن و شنیدن ظرایفی در آن حوزه که افراد عادی متوجه آن نمی‌شوند.

۴. متادیتا و نشان تشویقی:
- عنوان نشان افتخار مهارتی (مثال: نشان معمار آینده و هوش مصنوعی)
- یک ایموجی متناسب
- یک مأموریت خانوادگی ۲۴ ساعته (Micro-Challenge) ساده و لذت‌بخش در منزل برای راستی‌آزمایی رفتار

مهارت مورد نظر:
عنوان فارسی: ${title}
شناسه انگلیسی (slug): ${slug}

خروجی را الزاما و بدون هیچ متن اضافه، مقدمه یا علامت Markdown فقط و فقط در قالب ساختار JSON زیر ارسال کن:
{
  "badge_title": "عنوان نشان افتخار",
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.3
        }
      })
    });

    const aiData = await aiRes.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('پاسخی از هوش مصنوعی دریافت نشد.');

    const parsed = JSON.parse(rawText);

    // ۱. ثبت مهارت در جدول مهارت‌ها
    await env.DB.prepare(
      "INSERT OR IGNORE INTO skills (slug, title) VALUES (?, ?)"
    ).bind(slug, title).run();

    // ۲. ثبت دسته‌ای ۱۵ گویه طراحی‌شده در دیتابیس D1
    const statements = parsed.questions.map(q => {
      return env.DB.prepare(
        "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
      ).bind(slug, q.text, q.order);
    });

    await env.DB.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      message: `مهارت «${title}» با نشان «${parsed.badge_emoji} ${parsed.badge_title}» و ۱۵ گویه تخصصی روان‌سنجی با موفقیت ثبت شد.`
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
