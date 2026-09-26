import { askGeminiWithHistory, askOpenRouter } from './_gemini.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { studentId, history, imageBase64, imageMimeType, userQuestion, provider } = body;

    const systemPrompt = `تو یک معلم خصوصی و مشاور بسیار مهربان، صبور و باحوصله برای دانش‌آموزان در سایت «مهارت‌خانه» هستی. 
    وظیفه تو این است که به روش «سقراطی» عمل کنی:
    1. تاریخچه گفتگو را کاملاً به خاطر بسپار و بر اساس مرحله‌ای که دانش‌آموز در آن است پاسخ بده.
    2. به جای دادن پاسخ مستقیم، مفهوم را به زبانی ساده توضیح بده و با پرسیدن سوالات راهنمایی‌کننده و مثال‌های ملموس، دانش‌آموز را هدایت کن.
    3. لحن کلامت دوستانه، گرم و تشویق‌کننده باشد.`;

    let aiResponse = '';

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

    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "دیتابیس متصل نیست" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ثبت در جدول اختصاصی چت‌ها بدون هیچ‌گونه خطای تکراری‌بودن
    await env.DB.prepare(
      `INSERT INTO tutor_conversations (student_id, message, response, provider, created_at) 
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(
      studentId || 'guest_user',
      userQuestion || '[ارسال تصویر]',
      aiResponse,
      provider || 'gemini'
    ).run();

    return new Response(JSON.stringify({ success: true, reply: aiResponse }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
