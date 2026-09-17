// functions/api/ai-skill-generator.js
import { askGemini } from './_gemini.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { slug, title } = await request.json();
    if (!slug || !title) {
      return new Response(JSON.stringify({ error: 'شناسه انگلیسی و عنوان فارسی مهارت الزامی است.' }), { status: 400 });
    }

    const cleanSlug = String(slug).trim().toLowerCase();
    const cleanTitle = String(title).trim();

    const systemPrompt = `تو یک متخصص ارشد روان‌سنجی کودک و استعدادیابی بر اساس مدل کدهای هالند (RIASEC) برای سنین ۷ تا ۱۲ سال هستی.
خروجی باید منحصراً و بدون هیچ متن یا توضیح اضافی، یک شیء JSON معتبر و استاندارد باشد. از تگ‌های مارک‌داون مثل \`\`\`json در ابتدا و انتهای پاسخ خودداری کن.`;

    const userPrompt = `برای مهارت جدید زیر:
عنوان: ${cleanTitle}
شناسه: ${cleanSlug}

۱. ابتدا دسته اصلی این مهارت را بر اساس یکی از ۶ کد هالند زیر تعیین کن:
- realistic (مهارت‌های ابزاری، بدنی، ورزشی، آشپزی، فنی)
- investigative (مهارت‌های تحلیلی، فکری، کدنویسی، هوش مصنوعی، نجوم، شطرنج)
- artistic (مهارت‌های خلاقانه، بازیگری، طنز، هنر، موسیقی، نویسندگی)
- social (مهارت‌های بیانی، سخنوری، مشاوره، ارتباطی)
- enterprising (رهبری، مذاکره، کارآفرینی)
- conventional (نظم، دقت، محاسبات دفتری)

۲. یک بسته ۱۵ سوالی (گویه عینی رفتار در منزل و بازی) با مقیاس لیکرت ۵ گزینه‌ای (۰ تا ۴) طراحی کن.
۳. کنترل خطای هاله‌ای (بدون کلمات مبالغه‌آمیز مانند نابغه یا باهوش).
۴. پوشش ۵ بعد: اشتیاق خودجوش (۳ گویه)، یادگیری شهودی (۳ گویه)، غرقگی و تاب‌آوری (۳ گویه)، خلاقیت ترکیبی (۳ گویه)، حساسیت ادراکی (۳ گویه).

خروجی باید دقیقاً این ساختار JSON باشد:
{
  "category": "realistic|investigative|artistic|social|enterprising|conventional",
  "badge_title": "عنوان جذاب نشان افتخار",
  "badge_emoji": "یک ایموجی مرتبط",
  "micro_challenge": "ماموریت ۲۴ ساعته خانوادگی و آزمون رفتاری والدین در منزل",
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

    // فراخوانی از ماژول مرکزی با سقف توکن بالا جهت جلوگیری از قطع شدن پاسخ
    const rawResponse = await askGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 5000
    });

    let cleanJson = rawResponse.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      // پشتیبانی در صورت وجود خطای کاراکترهای رشته‌ای
      const matchStart = cleanJson.indexOf('{');
      const matchEnd = cleanJson.lastIndexOf('}');
      if (matchStart !== -1 && matchEnd !== -1) {
        parsedData = JSON.parse(cleanJson.substring(matchStart, matchEnd + 1));
      } else {
        throw new Error('فرمت خروجی مدل هوش مصنوعی دچار اختلال شد. لطفاً دوباره تلاش کنید.');
      }
    }

    const category = parsedData.category || 'realistic';
    const badgeTitle = parsedData.badge_title || cleanTitle;
    const badgeEmoji = parsedData.badge_emoji || '⭐';
    const microChallenge = parsedData.micro_challenge || '';
    const questions = parsedData.questions || [];

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('گویه‌های ارزیابی توسط هوش مصنوعی استخراج نشد.');
    }

    // ۱. ثبت یا به‌روزرسانی مهارت با متادیتاهای هالند در دیتابیس
    const existing = await env.DB.prepare("SELECT slug FROM skills WHERE slug = ?").bind(cleanSlug).first();
    if (existing) {
      try {
        await env.DB.prepare(
          "UPDATE skills SET title = ?, category = ?, badge_title = ?, badge_emoji = ?, micro_challenge = ? WHERE slug = ?"
        ).bind(cleanTitle, category, badgeTitle, badgeEmoji, microChallenge, cleanSlug).run();
      } catch (e) {
        await env.DB.prepare(
          "UPDATE skills SET title = ?, category = ? WHERE slug = ?"
        ).bind(cleanTitle, category, cleanSlug).run();
      }
    } else {
      try {
        await env.DB.prepare(
          "INSERT INTO skills (slug, title, category, badge_title, badge_emoji, micro_challenge, display_order) VALUES (?, ?, ?, ?, ?, ?, 99)"
        ).bind(cleanSlug, cleanTitle, category, badgeTitle, badgeEmoji, microChallenge).run();
      } catch (e) {
        await env.DB.prepare(
          "INSERT INTO skills (slug, title, category, display_order) VALUES (?, ?, ?, 99)"
        ).bind(cleanSlug, cleanTitle, category).run();
      }
    }

    // ۲. پاکسازی گویه‌های قبلی همین مهارت در صورت وجود (جلوگیری از تکرار)
    await env.DB.prepare("DELETE FROM questions WHERE skill_slug = ?").bind(cleanSlug).run();

    // ۳. درج دقیق ۱۵ گویه در جدول questions
    let inserted = 0;
    for (const q of questions) {
      const qText = q.text || q.question_text || (typeof q === 'string' ? q : '');
      if (qText && qText.trim()) {
        const orderNum = q.order || (inserted + 1);
        await env.DB.prepare(
          "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
        ).bind(cleanSlug, qText.trim(), orderNum).run();
        inserted++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `مهارت "${cleanTitle}" در تیپ [${category}] با ${inserted} گویه و نشان "${badgeTitle} ${badgeEmoji}" با موفقیت ذخیره شد.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
