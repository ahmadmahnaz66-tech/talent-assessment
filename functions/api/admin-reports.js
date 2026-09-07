export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    const { action, slug, title, displayOrder } = data;

    if (action === 'add-skill') {
      if (!slug || !title) {
        return new Response(JSON.stringify({ error: 'شناسه لاتین و عنوان مهارت الزامی است.' }), { status: 400 });
      }
      await env.DB.prepare(
        'INSERT INTO skills (slug, title, display_order) VALUES (?, ?, ?)'
      ).bind(slug.trim().toLowerCase(), title.trim(), Number(displayOrder) || 0).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    if (action === 'delete-skill') {
      if (!slug) {
        return new Response(JSON.stringify({ error: 'شناسه مهارت الزامی است.' }), { status: 400 });
      }
      // حذف سوالات وابسته و سپس حذف خود مهارت
      await env.DB.prepare('DELETE FROM questions WHERE skill_slug = ?').bind(slug).run();
      await env.DB.prepare('DELETE FROM skills WHERE slug = ?').bind(slug).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    return new Response(JSON.stringify({ error: 'عملیات نامعتبر است.' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
