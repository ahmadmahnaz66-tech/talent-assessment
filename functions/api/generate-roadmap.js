// دریافت سوابق تحلیل‌های یک دانش‌آموز
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId');

  if (!studentId) {
    return new Response(JSON.stringify({ error: 'کد دانش‌آموز الزامی است.' }), { status: 400 });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, version, analysis, created_at 
      FROM roadmaps 
      WHERE student_id = ? 
      ORDER BY version DESC
    `).bind(studentId).all();

    return new Response(JSON.stringify(results || []), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// تولید و ثبت تحلیل جدید
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { studentId } = await request.json();

    if (!studentId) {
      return new Response(JSON.stringify({ error: 'کد دانش‌آموز الزامی است.' }), { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'کلید GEMINI_API_KEY تنظیم نشده است.' }), { status: 500 });
    }

    const student = await env.DB.prepare(
      'SELECT id, student_name, grade FROM students WHERE id = ?'
    ).bind(studentId).first();

    if (!student) {
      return new Response(JSON.stringify({ error: 'دانش‌آموز یافت نشد.' }), { status: 404 });
    }

    // بررسی نسخه جدید
    const lastRoadmap = await env.DB.prepare(
      'SELECT MAX(version) as max_v FROM roadmaps WHERE student_id = ?'
    ).bind(studentId).first();

    const nextVersion = (lastRoadmap?.max_v || 0) + 1;

    // استخراج نمرات به صورت پویا با اتصال به جدول skills
    const { results } = await env.DB.prepare(`
      SELECT 
        r.skill_slug, 
        r.total_score, 
        COALESCE(s.title, r.skill_slug) AS skill_title
      FROM responses r
      LEFT JOIN skills s ON r.skill_slug = s.slug
      WHERE r.student_id = ? AND r.total_score > 0 
      ORDER BY r.total_score DESC
    `).bind(studentId).all();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ error: 'پاسخی برای این دانش‌آموز ثبت نشده است.' }), { status: 400 });
    }

    const scoresList = results.map((r, i) => `${i + 1}. ${r.skill_title}: ${r.total_score} از ۶۰`).join('\n');

    // پرامپت با قالب استاندارد و بدون تغییر برای تمامی دانش‌آموزان
    const promptText = `
شما یک سیستم ارزیابی و استعدادیابی رسمی مدرسه هستید.
وظیفه شما تدوین «کارنامه هدایت استعدادیابی و نقشه رشد A به A1» بر اساس یک ساختار و فرمت کاملاً ثابت و رسمی است.

مشخصات پرونده:
- نام و نام خانوادگی: ${student.student_name}
- کد پرونده دانش‌آموز: ${student.id}
- پایه تحصیلی: ${student.grade || 'نامشخص'}
- نسخه سند: ${nextVersion}

اطلاعات نمرات ارزیابی مهارت‌ها (به ترتیب اولویت علاقه از بیشترین به کمترین):
${scoresList}

دستورالعمل مهم: شما باید دقیقاً و مو‌به‌مو قالب زیر را بدون کم و کاست رعایت کنید. عناوین داخل پرانتز یا کروشه‌ها را با تحلیل فنی پر کنید و ترتیب عناوین، تیترها و ساختار خطوط را ابداً تغییر ندهید:

========================================
📋 پرونده جامع هدایت استعدادیابی و نقشه راه رشد فردی
========================================

■ مشخصات هویتی و ثبتی
• نام دانش‌آموز: ${student.student_name}
• پایه تحصیلی: ${student.grade || 'نامشخص'}
• نسخه کارنامه: نسخه ${nextVersion}

----------------------------------------
۱. نمایه علایق برتر و کانون استعدادها (۳ اولویت نخست)
• اولویت ۱: [نام مهارت اول صدر جدول] (امتیاز کسب‌شده: [نمره]/۶۰)
  ← تحلیل رفتاری: [توضیح کوتاه و دقیق در ۲ خط درباره نوع علاقه و پتانسیل کودک در این زمینه]
• اولویت ۲: [نام مهارت دوم صدر جدول] (امتیاز کسب‌شده: [نمره]/۶۰)
  ← تحلیل رفتاری: [توضیح کوتاه در ۲ خط]
• اولویت ۳: [نام مهارت سوم صدر جدول] (امتیاز کسب‌شده: [نمره]/۶۰)
  ← تحلیل رفتاری: [توضیح کوتاه در ۲ خط]

----------------------------------------
۲. نقشه راه تحول و جهش مهارتی (مسیر رشد A به A1)
• وضعیت پایه فعلی (سطح A):
  [شرح تمایلات، علایق خودجوش و رفتارهایی که اکنون از کودک بر اساس پایش اولیا دیده می‌شود - حداکثر ۳ خط]

• افق رشد و شکوفایی هدف (سطح A1):
  [سطح توانمندی، مهارت کاربردی و خلق اثر خروجی که انتظار داریم کودک با آموزش هدفمند در پایان دوره به آن برسد - حداکثر ۳ خط]

• نقشه اقدام سه‌گام برای ارتقا از A به A1:
  گام اول (آشنایی و تجربه مستقیم): [یک فعالیت شفاف و ملموس]
  گام دوم (پرورش و یادگیری نظام‌مند): [یک برنامه تمرینی یا ثبت‌نام دوره‌ای]
  گام سوم (تولید محصول / اجرای پروژه عملی): [یک پروژه کوچک نهایی که کودک خلق می‌کند]

----------------------------------------
۳. پروتکل توصیه‌های کاربردی برای اولیا در محیط منزل
۱. [توصیه محیطی و تقویت حس کنجکاوی متناسب با علایق برتر]
۲. [مدیریت زمان و ابزارهای مورد نیاز در خانه]
۳. [نوع بازخورد و تشویق والدین بدون تحمیل بار روانی بر کودک]

----------------------------------------
۴. بسته پیشنهادات اجرایی ویژه مشاور و معلمان مدرسه
۱. نقش در کلاس درس: [مسئولیت یا فرصت متناسب با مهارت‌های صدر جدول در کلاس]
۲. فعالیت‌های فوق‌برنامه: [کلاس‌های کانون مدرسه یا مسابقات پیشنهادی]
۳. پایش و خودتنظیمی هیجانی: [نحوه حفظ انگیزه و پشتکار دانش‌آموز در این مسیر]
========================================
`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
    // ارسال درخواست همراه با کنترل دما جهت تضمین ثبات قالب
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'خطا در ارتباط با جمنای');
    }

    const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'محتوایی دریافت نشد.';

    // ذخیره دائمی نسخه جدید در جدول دیتابیس D1
    await env.DB.prepare(`
      INSERT INTO roadmaps (student_id, version, analysis)
      VALUES (?, ?, ?)
    `).bind(studentId, nextVersion, outputText).run();

    return new Response(JSON.stringify({
      studentName: student.student_name,
      version: nextVersion,
      analysis: outputText
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
