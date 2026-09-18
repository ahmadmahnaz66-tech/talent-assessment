// functions/api/_deepseek.js

export async function askDeepSeek(env, { systemPrompt = '', userPrompt, temperature = 0.3 }) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('کلید API دیپ‌سیک (DEEPSEEK_API_KEY) در تنظیمات کلادفلر یافت نشد.');
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`خطا از سوی دیپ‌سیک: ${errText}`);
  }

  const data = await response.json();
  const rawResponse = data.choices?.[0]?.message?.content;
  if (!rawResponse) throw new Error('پاسخی از دیپ‌سیک دریافت نشد.');

  return rawResponse;
}
