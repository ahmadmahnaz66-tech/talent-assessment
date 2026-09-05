export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const studentId = searchParams.get('id');

  if (!studentId) {
    return new Response(JSON.stringify({ error: 'کد دانش‌آموز الزامی است' }), { status: 400 });
  }

  // اتصال به دیتابیس D1 با بایندینگ DB
  const student = await context.env.DB.prepare(
    "SELECT id, student_name, grade FROM students WHERE id = ?"
  ).bind(studentId).first();

  if (!student) {
    return new Response(JSON.stringify({ error: 'دانش‌آموزی با این مشخصات یافت نشد' }), { status: 404 });
  }

  return new Response(JSON.stringify(student), {
    headers: { "Content-Type": "application/json" }
  });
}
