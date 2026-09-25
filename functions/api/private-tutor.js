// functions/api/private-tutor.js
import { askGeminiWithHistory } from './_gemini.js';
import { askOpenRouter } from './_openrouter.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { history, imageBase64, imageMimeType, userQuestion, provider } = body;

    const systemPrompt = `تو یک معلم خصوصی و مشاور بسیار مهربان، صبور و باحوصله برای دانش‌آموزان در سایت «مهارت‌خانه» هستی. 
    وظیفه تو این است که به روش «سقراطی» عمل کنی:
    1. تاریخچه گفتگو را کاملاً به خاطر بسپار و بر اساس مرحله‌ای که دانش‌آموز در آن است پاسخ بده.
    2. به جای دادن پاسخ مستقیم، مفهوم را به زبانی ساده توضیح بده و با پرسیدن سوالات راهنمایی‌کننده و مثال‌های ملموس، دانش‌آموز را هدایت کن.
    3. لحن کلامت دوستانه، گرم و تشویق‌کننده باشد.`;

    let aiResponse = '';

    // انتخاب موتور هوش مصنوعی
    if (provider === 'openrouter') {
      aiResponse = await askOpenRouter(env, {
        systemPrompt,
        history: history || [],
        userQuestion,
        imageBase64,
        imageMimeType: imageMimeType || 'image/jpeg',
        temperature: 0.5,
        maxTokens: 2000
      });
    } else {
      aiResponse = await askGeminiWithHistory(env, {
        systemPrompt,
        history: history || [],
        userQuestion,
        imageBase64,
        imageMimeType: imageMimeType || 'image/jpeg',
        temperature: 0.5,
        maxTokens: 2000
      });
    }

    // بررسی اتصال دیتابیس و ثبت لاگ چت
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "دیتابیس متصل نیست (env.DB تعریف نشده است)" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      await env.DB.prepare(
        "INSERT INTO responses (student_id, skill_slug, answers, total_score, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind(
        '2000', // شناسه پیش‌فرض کاربر
        'private-tutor', // اسلاگ اختصاصی برای تفکیک چت‌ها
        JSON.stringify({ 
          question: userQuestion || '[ارسال تصویر]', 
          response: aiResponse, 
          provider: provider || 'gemini' 
        }),
        0
      ).run();
    } catch (dbErr) {
      return new Response(JSON.stringify({ success: false, error: "خطا در ثبت دیتابیس: " + dbErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, reply: aiResponse }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'خطای ناشناخته در سرور' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
