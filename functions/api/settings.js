export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM site_settings").all();
    const settings = {};
    (results || []).forEach(r => { settings[r.key] = r.value; });
    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { requesterRole, settings } = body;

    if (requesterRole !== 'super_admin' && requesterRole !== 'principal') {
      return new Response(JSON.stringify({ error: 'عدم دسترسی مجاز' }), { status: 403 });
    }

    for (const [k, v] of Object.entries(settings)) {
      await env.DB.prepare(
        "INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(k, String(v)).run();
    }

    return new Response(JSON.stringify({ success: true, message: 'تنظیمات با موفقیت ذخیره شد.' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
