// functions/api/private-tutor.js
import { askGeminiWithHistory } from './_gemini.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'فرمت داده‌های ارسالی نامعتبر است.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { history, imageBase64, imageMimeType, userQuestion } = body;

    if (!imageBase64 && !userQuestion) {
      return new Response(JSON.stringify({ success: false, error: 'لطفاً عکس یا سوال خود را ارسال کنید.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = `تو یک معلم خصوصی و مشاور بسیار مهربان، صبور و باحوصله برای دانش‌آموزان در سایت «مهارت‌خانه» هستی. 
    وظیفه تو این است که به روش «سقراطی» عمل کنی:
    1. تاریخچه گفتگو و مراحل قبلی را کاملاً به خاطر بسپار و بر اساس آن پیش برو.
    2. به جای دادن پاسخ مستقیم یا حل کردن کامل تمرین، مفهوم را به زبانی ساده توضیح بده و با پرسیدن سوالات راهنمایی‌کننده و مثال‌های ملموس، دانش‌آموز را هدایت کن تا خودش به جواب برسد.
    3. لحن کلامت دوستانه، گرم و تشویق‌کننده باشد.`;

    // فراخوانی تابع جدید که تاریخچه چت و تصویر را با هم مدیریت می‌کند
    const aiResponse = await askGeminiWithHistory(env, {
      systemPrompt,
      history: history || [],
      userQuestion,
      imageBase64,
      imageMimeType: imageMimeType || 'image/jpeg',
      temperature: 0.5,
      maxTokens: 2000
    });

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
