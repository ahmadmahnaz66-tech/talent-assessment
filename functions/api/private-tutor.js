// functions/api/private-tutor.js
import { askGemini } from './_gemini.js';

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

    const { imageBase64, imageMimeType, userQuestion } = body;

    if (!imageBase64 && !userQuestion) {
      return new Response(JSON.stringify({ success: false, error: 'لطفاً عکس یا سوال خود را ارسال کنید.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = `تو یک معلم خصوصی و مشاور بسیار مهربان، صبور و باحوصله برای دانش‌آموزان در سایت «مهارت‌خانه» هستی. 
    وظیفه تو این است که به جای دادن پاسخ مستقیم یا حل کردن کامل تمرین، به روش «سقراطی» عمل کنی:
    1. عکس صفحه کتاب یا سوال را با دقت بررسی کن.
    2. مفهوم را به زبانی بسیار ساده و ملموس توضیح بده.
    3. یک مثال مابه‌ازای واقعی بزن.
    4. در نهایت با طرح یک سوال راهنمایی‌کننده، از دانش‌آموز بخواه خودش بخش بعدی را حل کند و او را تشویق کن.
    لحن کلامت دوستانه، گرم و تشویق‌کننده باشد.`;

    const promptText = userQuestion ? `سوال دانش‌آموز: ${userQuestion}` : `لطفاً این تصویر از کتاب یا تمرین را بررسی کن و گام‌به‌گام به روش سقراطی به من یاد بده.`;

    // فراخوانی تابع جمینای با پشتیبانی از تصویر و متن
    const aiResponse = await askGemini(env, {
      systemPrompt,
      userPrompt: promptText,
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
