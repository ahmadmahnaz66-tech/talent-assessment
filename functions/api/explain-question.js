export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { questionText, skillTitle, childAge } = await request.json();

    if (!questionText) {
      return new Response(JSON.stringify({ error: 'متن گویه الزامی است.' }), { status: 400 });
    }

    const keysRaw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
    const apiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'کلید هوش مصنوعی در سرور تنظیم نشده است.' }), { status: 500 });
    }

    const prompt = `نقش تو یک مشاور روان‌شناس تربیتی و متخصص استعدادیابی کودک دبستان (۷ تا ۱۲ سال) است.
یک والد در حال پاسخ به پرسشنامه استعدادیابی فرزندش است و درباره این گویه به راهنمایی نیاز دارد:

حوزه مهارت: ${skillTitle || 'عمومی'}
گویه ارزیابی: "${questionText}"
سن تقریبی کودک: ${childAge || '۷ تا ۱۲ سال'}

لطفاً خیلی خودمانی، کامل و در ۳ بخش شفاف زیر به والد توضیح بده (پاسخ نباید نصفه رها شود و حتماً باید هر ۳ بخش کامل نوشته شود):
۱. منظور دقیق این رفتار در خانه و بازی‌های کودک چیست؟
۲. دو نمونه عینی از رفتار کودک که نشان‌دهنده نمره بالا (هست/خیلی زیاد) است.
۳. دو نمونه عینی که نشان‌دهنده نمره پایین (به‌ندرت/هیچ‌وقت) است.

پاسخ را صمیمی، آرامش‌بخش، بدون واژه‌های پیچیده و کاملاً کاربردی بنویس.`;

    // افزایش سقف توکن خروجی برای جلوگیری از قطع شدن متن
    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500 }
    });

    const fallbackModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.6-flash'];
    const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);

    let aiRes = null;
    let lastError = '';

    outerLoop:
    for (const key of shuffledKeys) {
      for (const model of fallbackModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        try {
          aiRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key
            },
            body: requestBody
          });

          if (aiRes.ok) {
            break outerLoop;
          }

          lastError = await aiRes.text();
        } catch (e) {
          lastError = e.message;
        }
      }
    }

    if (!aiRes || !aiRes.ok) {
      return new Response(JSON.stringify({ error: `خطای سرویس هوشمند: ${lastError}` }), { status: 500 });
    }

    const aiData = await aiRes.json();
    const explanation = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'متاسفانه توضیحی دریافت نشد.';

    return new Response(JSON.stringify({ success: true, explanation }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
