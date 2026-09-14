export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const token = env.GITHUB_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'کلید GITHUB_TOKEN در تنظیمات کلودفلر ست نشده است.' }), { status: 500, headers: corsHeaders });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'فایلی ارسال نشد.' }), { status: 400, headers: corsHeaders });
    }

    // گیت‌هاب API برای فایل‌های بالای ۲۵ مگابایت اجازه متد contents PUT مستقیم را نمی‌دهد
    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'حجم فایل صوتی نباید بیشتر از ۲۵ مگابایت باشد (محدودیت API گیت‌هاب).' }), { status: 400, headers: corsHeaders });
    }

    const fileName = file.name.toLowerCase();
    const cleanBaseName = fileName.replace(/[^a-z0-9.]/gi, '-').replace(/-+/g, '-');
    const targetFileName = `${Date.now()}-${cleanBaseName}`;
    const filePath = `audio/${targetFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // تبدیل بافر به Base64 به روش قطعه‌قطعه (Chunked) برای جلوگیری از کرش حافظه
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const contentBase64 = btoa(binary);

    const repoOwner = 'ahmadmahnaz66-tech';
    const repoName = 'talent-assessment';
    const ghUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

    const ghRes = await fetch(ghUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Cloudflare-Worker-Uploader',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Upload audio ${targetFileName}`,
        content: contentBase64,
        branch: 'main'
      })
    });

    const ghData = await ghRes.json();

    if (!ghRes.ok) {
      return new Response(JSON.stringify({ error: ghData.message || 'خطا در گیت‌هاب' }), { status: ghRes.status, headers: corsHeaders });
    }

    const directUrl = `https://apadana.maharatkhanema.ir/${filePath}`;
    return new Response(JSON.stringify({ success: true, audio_url: directUrl }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'خطای داخلی سرور: ' + err.message }), { status: 500, headers: corsHeaders });
  }
}
