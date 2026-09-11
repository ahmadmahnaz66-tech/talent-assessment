export async function onRequestGet(context) {
  const { env } = context;
  
  const { results: skills } = await env.DB.prepare(
    'SELECT slug, title FROM skills ORDER BY display_order'
  ).all();
  
  const { results: questions } = await env.DB.prepare(
    'SELECT skill_slug, question_text, display_order FROM questions ORDER BY skill_slug, display_order'
  ).all();
  
  return new Response(JSON.stringify({ skills, questions }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
