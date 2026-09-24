// functions/api/_gemini.js

export async function askGeminiWithHistory(env, { systemPrompt = '', history = [], userQuestion, imageBase64, imageMimeType = 'image/jpeg', temperature = 0.4, maxTokens = 5000 }) {
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

  const models = [
    'gemini-3.6-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.5-flash'
  ];

  // ساخت ساختار محتوا شامل تاریخچه مکالمات قبلی
  let contents = [];

  // اضافه کردن سیستم پرامپت به عنوان دستورالعمل اولیه
  if (systemPrompt) {
    contents.push({
      role: 'user',
      parts: [{ text: `[دستورالعمل سیستم]: ${systemPrompt}` }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'متوجه شدم. آماده‌ام تا به عنوان معلم خصوصی مهربان و سقراطی به دانش‌آموز کمک کنم.' }]
    });
  }

  // اضافه کردن تاریخچه چت‌های قبلی
  if (Array.isArray(history) && history.length > 0) {
    // حذف آخرین پیام کاربر از تاریخچه چون پایین‌تر به صورت دستی همراه با عکس یا متن جدید اضافه می‌شود
    const cleanHistory = history.slice(0, -1);
    contents.push(...cleanHistory);
  }

  // ساخت پیام جدید کاربر (همراه با عکس در صورت وجود)
  const currentParts = [];
  if (userQuestion) {
    currentParts.push({ text: userQuestion });
  }
  if (imageBase64) {
    currentParts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageBase64
      }
    });
  }

  if (currentParts.length > 0) {
    contents.push({
      role: 'user',
      parts: currentParts
    });
  }

  const requestBody = JSON.stringify({
    contents: contents,
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  });

  const shuffledKeys = [...apiKeys].sort(() => Math.random() - 0.5);
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
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

          if (res.status === 429 || res.status === 503) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
        } catch (err) {
          lastError = err.message;
        }
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error(`خطا در دریافت پاسخ هوش مصنوعی: ${lastError}`);
}
