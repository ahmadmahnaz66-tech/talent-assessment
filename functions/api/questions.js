export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const skillSlug = url.searchParams.get('skill');

  try {
    let query = 'SELECT id, skill_slug, question_text, display_order FROM questions';
    const params = [];

    if (skillSlug) {
      query += ' WHERE skill_slug = ? ORDER BY display_order ASC, id ASC';
      params.push(skillSlug);
    } else {
      query += ' ORDER BY skill_slug ASC, display_order ASC, id ASC';
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify(results || []), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    const { action, id, skillSlug, questionText, displayOrder } = data;

    // ۱. افزودن سوال جدید
    if (action === 'add') {
      if (!skillSlug || !questionText) {
        return new Response(JSON.stringify({ error: 'مهارت و متن سوال الزامی است.' }), { status: 400 });
      }
      await env.DB.prepare(
        'INSERT INTO questions (skill_slug, question_text, display_order) VALUES (?, ?, ?)'
      ).bind(skillSlug, questionText.trim(), Number(displayOrder) || 1).run();

      return new Response(JSON.stringify({ success: true, message: 'سوال با موفقیت اضافه شد.' }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // ۲. ویرایش سوال
    if (action === 'edit') {
      if (!id || !questionText) {
        return new Response(JSON.stringify({ error: 'شناسه و متن سوال الزامی است.' }), { status: 400 });
      }
      await env.DB.prepare(
        'UPDATE questions SET question_text = ?, display_order = ? WHERE id = ?'
      ).bind(questionText.trim(), Number(displayOrder) || 1, Number(id)).run();

      return new Response(JSON.stringify({ success: true, message: 'سوال با موفقیت ویرایش شد.' }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // ۳. حذف سوال
    if (action === 'delete') {
      if (!id) {
        return new Response(JSON.stringify({ error: 'شناسه سوال الزامی است.' }), { status: 400 });
      }
      await env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(Number(id)).run();

      return new Response(JSON.stringify({ success: true, message: 'سوال با موفقیت حذف شد.' }), {
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
