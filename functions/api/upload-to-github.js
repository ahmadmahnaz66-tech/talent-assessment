export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const token = env.GITHUB_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'تنظیمات توکن گیت‌هاب (GITHUB_TOKEN) در سرور یافت نشد.' }), { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'هیچ فایلی ارسال نشده است.' }), { status: 400 });
    }

    // بررسی پسوندهای صوتی مجاز
    const fileName = file.name.toLowerCase();
    const validExts = ['.mp3', '.m4a', '.wav', '.ogg'];
    if (!validExts.some(ext => fileName.endsWith(ext))) {
      return new Response(JSON.stringify({ error: 'فرمت فایل مجاز نیست. فقط فایل‌های صوتی مجازند.' }), { status: 400 });
    }

    // ساخت نام استاندارد و یکتا برای فایل
    const cleanBaseName = fileName.replace(/[^a-z0-9.]/gi, '-').replace(/-+/g, '-');
    const targetFileName = `${Date.now()}-${cleanBaseName}`;
    const filePath = `audio/${targetFileName}`;

    // تبدیل فایل به Base64 جهت ارسال به API گیت‌هاب
    const arrayBuffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const contentBase64 = btoa(binary);

    // ارسال مستقیم فایل به مخزن گیت‌هاب
    const repoOwner = 'ahmadmahnaz66-tech';
    const repoName = 'talent-assessment';
    const ghUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

    const ghRes = await fetch(ghUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Cloudflare-Pages-Uploader',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Upload audio: ${targetFileName} via admin panel`,
        content: contentBase64,
        branch: 'main'
      })
    });

    const ghData = await ghRes.json();

    if (!ghRes.ok) {
      return new Response(JSON.stringify({ error: ghData.message || 'خطا در آپلود به گیت‌هاب.' }), { status: ghRes.status });
    }

    // ساخت لینک مستقیم فایل روی دامنه سایت
    const directUrl = `https://apadana.maharatkhanema.ir/${filePath}`;

    return new Response(JSON.stringify({
      success: true,
      audio_url: directUrl,
      fileName: targetFileName
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
