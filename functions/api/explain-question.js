export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { questionText, skillTitle } = body;

    if (!questionText) {
      return new Response(JSON.stringify({ error: 'متن سوال الزامی است.' }), { status: 400 });
    }

    // دریافت لیست کلیدها؛ پشتیبانی هم‌زمان از چند کلید با کاما یا یک کلید تکی
    const keysRaw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
    const apiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'کلید API تنظیم نشده است.' }), { status: 500 });
    }

    const prompt = `شما یک مشاور و روان‌شناس کودک متخصص هستید. 
والدینی در حال پر کردن فرم ارزیابی و استعدادیابی فرزند خود هستند و مفهوم این سوال برایشان مبهم است.
حوزه مهارت: ${skillTitle || 'عمومی'}
صورت سوال: "${questionText}"

وظیفه شما:
۱. در حداکثر ۲ جمله به زبان بسیار صمیمی، ساده و به دور از اصطلاحات سخت علمی توضیح بده این سوال دقیقاً چه رفتاری را می‌سنجد.
۲. دو مثال ملموس و عینی از کارهای روزمره کودک (مثلاً حین بازی، تکالیف یا تعامل خانوادگی) بیاور که نشان دهد اگر کودک این ویژگی را دارد چطور رفتار می‌کند و اگر ندارد چگونه است.

پاسخ کاملاً تمیز، مستقیم و بدون مقدمه‌چینی رسمی باشد.`;

    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 500
      }
    });

    let explanation = '';
    let lastError = '';

    // حلقه چرخش کلیدها (Key Rotation / Failover)
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
        break;
      }

      // در صورت پر شدن سهمیه، ذخیره خطا و رفتن به کلید بعدی
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
