// functions/api/test-ai.js

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { requesterRole } = await request.json();

    // اعتبارسنجی سطح دسترسی: فقط مدیر ارشد سامانه
    if (requesterRole !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'دسترسی غیرمجاز. این بخش مخصوص مدیر ارشد است.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // استخراج تمام کلیدهای تعریف‌شده در سیستم
    let rawKeys = [];
    if (env.GEMINI_API_KEYS) rawKeys.push(...env.GEMINI_API_KEYS.split(',').map(k => k.trim()));
    if (env.GEMINI_API_KEY) rawKeys.push(...env.GEMINI_API_KEY.split(',').map(k => k.trim()));
    ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4'].forEach(k => {
      if (env[k]) rawKeys.push(String(env[k]).trim());
    });

    const apiKeys = [...new Set(rawKeys.filter(Boolean))];

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'هیچ کلید هوش مصنوعی در سرور یافت نشد.' }), { status: 500 });
    }

    const testModel = 'gemini-3.6-flash';
    const testPayload = {
      contents: [{ role: 'user', parts: [{ text: 'سلام، تست ارتباط سرور. کلمه تایید را بنویس.' }] }],
      generationConfig: { maxOutputTokens: 50, temperature: 0.2 }
    };

    const results = [];

    for (let i = 0; i < apiKeys.length; i++) {
      const key = apiKeys[i];
      const maskedKey = `${key.slice(0, 6)}...${key.slice(-4)}`;
      const startTime = Date.now();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${key}`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(testPayload)
        });

        const duration = Date.now() - startTime;

        if (res.ok) {
          const data = await res.json();
          const usage = data.usageMetadata || {};
          results.push({
            keyIndex: i + 1,
            maskedKey,
            status: 'success',
            pingMs: duration,
            promptTokens: usage.promptTokenCount || 0,
            candidatesTokens: usage.candidatesTokenCount || 0,
            totalTokens: usage.totalTokenCount || 0,
            model: testModel
          });
        } else {
          const errText = await res.text();
          results.push({
            keyIndex: i + 1,
            maskedKey,
            status: 'error',
            pingMs: duration,
            errorMessage: errText
          });
        }
      } catch (err) {
        results.push({
          keyIndex: i + 1,
          maskedKey,
          status: 'network_error',
          errorMessage: err.message
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
