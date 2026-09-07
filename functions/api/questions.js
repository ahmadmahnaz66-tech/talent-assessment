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
