export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { questionText, skillTitle } = body;

    if (!questionText) {
      return new Response(JSON.stringify({ error: 'متن سوال الزامی است.' }), { status: 400 });
    }

    const keysRaw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
    const apiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'کلید API تنظیم نشده است.' }), { status: 500 });
    }

    const prompt = `شما یک مشاور و روانشناس کودک باتجربه در دبستان هستید. 
والدی در حال تکمیل پرسشنامه استعدادیابی فرزند خود است و مفهوم این پرسش را متوجه نشده است:
حوزه مهارت: ${skillTitle || 'عمومی'}
صورت سوال: "${questionText}"

دستورالعمل تولید پاسخ:
۱. پاسخ را کاملاً و ۱۰۰٪ به زبان فارسی سلیس و ساده بنویسید (بدون حتی یک کلمه انگلیسی).
۲. در ۱ الی ۲ جمله روان توضیح دهید این پرسش دقیقاً چه نشانه‌ای از رشد کودک را ارزیابی می‌کند.
۳. دو مثال عینی و مقایسه‌ای از کارهای روزمره کودک در خانه یا بازی بیاورید:
   - مثال اول: اگر این ویژگی در کودک بالا باشد چه می‌کند؟
   - مثال دوم: اگر این ویژگی در کودک کم باشد چه واکنشی نشان می‌دهد؟
۴. پاسخ مستقیم باشد و تا انتها کامل بیان شود.`;

    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1200
      }
    });

    let explanation = '';
    let lastError = '';

    for (const key of apiKeys) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });

      if (res.ok) {
        const data = await res.json();
        explanation = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (explanation) break;
      }

      lastError = await res.text();
    }

    if (!explanation) {
      return new Response(JSON.stringify({ error: `خطا در دریافت راهنمایی: ${lastError}` }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, explanation: explanation.trim() }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
