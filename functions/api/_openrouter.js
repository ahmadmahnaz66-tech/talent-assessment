// functions/api/_openrouter.js

export async function askOpenRouter(env, { systemPrompt = '', userPrompt, temperature = 0.3 }) {
  const apiKey = env.OPENROUTER_API_KEY || env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('کلید API اوپن‌روتر یافت نشد.');
  }

  // استفاده از یکی از مدل‌های رایگان و پایدار متن‌باز روی OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': 'https://mahatkhanema.ir', // اختیاری برای شناسایی سایت
      'X-Title': 'Mahatkhanema'
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3-8b-instruct:free', // مدل کاملاً رایگان و پرسرعت
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`خطا از سوی اوپن‌روتر: ${errText}`);
  }

  const data = await response.json();
  const rawResponse = data.choices?.[0]?.message?.content;
  if (!rawResponse) throw new Error('پاسخی از اوپن‌روتر دریافت نشد.');

  return rawResponse;
}
