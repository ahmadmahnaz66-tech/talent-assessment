// functions/api/_gemini.js

export async function askGemini(env, { systemPrompt = '', userPrompt, temperature = 0.4, maxTokens = 5000 }) {
  if (!userPrompt) {
    throw new Error('متن پرامپت ارسالی الزامی است.');
  }

  // ۱. جمع‌آوری و شناسایی تمام کلیدهای تعریف‌شده در کلادفلر
  let apiKeys = [];
  if (env.GEMINI_API_KEYS) {
    apiKeys.push(...env.GEMINI_API_KEYS.split(',').map(k => k.trim()));
  }
  if (env.GEMINI_API_KEY) {
    apiKeys.push(...env.GEMINI_API_KEY.split(',').map(k => k.trim()));
  }
  ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4'].forEach(k => {
    if (env[k]) apiKeys.push(String(env[k]).trim());
  });

  apiKeys = [...new Set(apiKeys.filter(Boolean))];

  if (apiKeys.length === 0) {
    throw new Error('هیچ کلید معتبری برای هوش مصنوعی در سرور یافت نشد.');
  }

  // ۲. مدل‌های پایدار و مقاوم در برابر خطای سهمیه (اولویت با مدل‌های Flash پایدار)
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-3.6-flash'
  ];

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  });

  // توزیع تصادفی بار میان کلیدها
  const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);
  let lastError = '';

  for (const key of shuffledKeys) {
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key
          },
          body: requestBody
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        }

        const errText = await res.text();
        lastError = errText;
        
        // اگر خطای 429 داد، به سرعت مدل یا کلید بعدی را تست کند
        if (res.status === 429) {
          continue;
        }
      } catch (err) {
        lastError = err.message;
      }
    }
  }

  throw new Error(`خطا در دریافت پاسخ هوش مصنوعی (تمامی مدل‌ها/کلیدها محدود شدند): ${lastError}`);
}
