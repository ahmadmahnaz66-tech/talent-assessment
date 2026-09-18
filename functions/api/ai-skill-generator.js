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

۲. یک بسته ۱۵ سوالی ارزیابی **از دید والدین** (مشاهدات عینی رفتار فرزند در منزل و بازی، با لحنی مانند: "فرزندم در مواجهه با..." یا "در طول بازی تمایل دارد که...") طراحی کن. به هیچ وجه از زبان اول شخص کودک (مثل "دوست دارم") استفاده نکن.
۳. یک بسته ۱۰ گویه تخصصی **مربی** (برای ارزیابی مجاورت‌سازی نقطه A به A1) با لحن سوم شخص و مشاهدات عینی رفتاری در محیط کارگاه طراحی کن.
۴. کنترل خطای هاله‌ای (بدون کلمات مبالغه‌آمیز مانند نابغه یا باهوش).

خروجی باید دقیقاً این ساختار JSON باشد:
{
  "category": "realistic|investigative|artistic|social|enterprising|conventional",
  "badge_title": "عنوان جذاب نشان افتخار",
  "badge_emoji": "یک ایموجی مرتبط",
  "micro_challenge": "ماموریت ۲۴ ساعته خانوادگی و آزمون رفتاری والدین در منزل",
  "questions": [
    {"order": 1, "text": "متن گویه اول از دید والدین..."}
  ],
  "coach_questions": [
    {"order": 1, "text": "متن گویه اول مربی (رفتاری و از دید ناظر)..."}
  ]
}`;

    const rawResponse = await askGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 6000
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
    const coachQuestions = parsedData.coach_questions || [];

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('گویه‌های ارزیابی توسط هوش مصنوعی استخراج نشد.');
    }

    // ۱. ثبت یا به‌روزرسانی مهارت در دیتابیس
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

    // ۲. پاکسازی گویه‌های قبلی همین مهارت در صورت وجود
    await env.DB.prepare("DELETE FROM questions WHERE skill_slug = ?").bind(cleanSlug).run();

    // ۳. درج ۱۵ گویه ارزیابی (از دید والدین) با پیشوند [student]
    let insertedStudent = 0;
    for (const q of questions) {
      const qText = q.text || q.question_text || '';
      if (qText.trim()) {
        await env.DB.prepare(
          "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
        ).bind(cleanSlug, '[student] ' + qText.trim(), q.order || (insertedStudent + 1)).run();
        insertedStudent++;
      }
    }

    // ۴. درج ۱۰ گویه تخصصی مربی با پیشوند [coach]
    let insertedCoach = 0;
    for (const q of coachQuestions) {
      const qText = q.text || q.question_text || '';
      if (qText.trim()) {
        await env.DB.prepare(
          "INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)"
        ).bind(cleanSlug, '[coach] ' + qText.trim(), 100 + (q.order || (insertedCoach + 1))).run();
        insertedCoach++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `مهارت "${cleanTitle}" با ${insertedStudent} گویه والدین و ${insertedCoach} گویه مربی با موفقیت ذخیره شد.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
