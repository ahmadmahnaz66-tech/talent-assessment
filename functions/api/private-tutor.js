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

    // انتخاب هوش مصنوعی بر اساس انتخاب کاربر (پیش‌فرض روی openrouter برای سرعت بالا)
    if (provider === 'gemini') {
      aiResponse = await askGeminiWithHistory(env, {
        systemPrompt,
        history: history || [],
        userQuestion,
        imageBase64,
        imageMimeType: imageMimeType || 'image/jpeg',
        temperature: 0.5,
        maxTokens: 2000
      });
    } else {
      // پیش‌فرض OpenRouter (سریع و بدون تایم‌اوت)
      aiResponse = await askOpenRouter(env, {
        systemPrompt,
        history: history || [],
        userQuestion,
        imageBase64,
        imageMimeType: imageMimeType || 'image/jpeg',
        temperature: 0.5,
        maxTokens: 2000
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
