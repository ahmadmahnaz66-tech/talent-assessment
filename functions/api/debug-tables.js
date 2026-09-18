// functions/api/debug-tables.js

export async function onRequestGet(context) {
  const { env } = context;

  try {
    // ۱. دریافت لیست تمام جدول‌ها
    const tablesResult = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();

    const tables = tablesResult.results || [];
    const dbData = {};

    // ۲. خواندن رکوردها از هر جدول
    for (const t of tables) {
      const tableName = t.name;
      // از جدول‌های سیستمی کلادفلر صرف‌نظر می‌کنیم
      if (tableName.startsWith('sqlite_') || tableName.startsWith('d1_')) continue;

      const rows = await env.DB.prepare(`SELECT * FROM "${tableName}" LIMIT 50`).all();
      dbData[tableName] = {
        count: rows.results ? rows.results.length : 0,
        rows: rows.results || []
      };
    }

    return new Response(JSON.stringify({ success: true, dbData }, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
