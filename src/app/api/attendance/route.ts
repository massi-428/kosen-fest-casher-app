import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { getActiveStoreContext } from '@/lib/store';
import { unauthorizedResponse } from '@/lib/auth';
import { Employee, EmployeeCounter, AttendanceRecord, Shift } from '@/models/Attendance';
import { personalIdFrom, shiftDates } from '@/lib/attendance';
import { isValidObjectId } from '@/lib/validation';

export const dynamic = 'force-dynamic';
const reply = (message: string, status = 400) => NextResponse.json({ message }, { status });

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const { storeId } = context;
    const params = new URL(request.url).searchParams;
    if (params.has('personalId')) {
      const personalId = personalIdFrom(params.get('personalId'));
      if (!personalId) return reply('個人IDを正しく入力してください');
      const employee = await Employee.findOne({ storeId, personalId });
      if (!employee) return reply('このIDのスタッフは登録されていません', 404);
      const active = await AttendanceRecord.findOne({ storeId, personalId, clockOut: null });
      return NextResponse.json({ employee, active });
    }
    if (params.get('mode') === 'reminders') {
      const now = new Date();
      const shifts = await Shift.find({ storeId, start: { $gte: now, $lte: new Date(now.getTime() + 15 * 60000) } }).sort({ start: 1 }).lean();
      const ids = shifts.map(s => s.personalId);
      const [employees, active] = await Promise.all([
        Employee.find({ storeId, personalId: { $in: ids } }).lean(),
        AttendanceRecord.find({ storeId, personalId: { $in: ids }, clockOut: null }).lean(),
      ]);
      return NextResponse.json(shifts.filter(s => !active.some(a => a.personalId === s.personalId)).map(s => ({ ...s, name: employees.find(e => e.personalId === s.personalId)?.name || '' })));
    }
    const [employees, records, shifts] = await Promise.all([
      Employee.find({ storeId }).sort({ personalId: 1 }),
      AttendanceRecord.find({ storeId }).sort({ clockIn: -1 }).limit(100),
      Shift.find({ storeId, end: { $gte: new Date() } }).sort({ start: 1 }),
    ]);
    return NextResponse.json({ employees, records, shifts });
  } catch { return reply('勤怠情報を取得できませんでした', 500); }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const { storeId } = context;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply('入力が不正です');
    if (body.action === 'employee' || body.action === 'employees') {
      const names: unknown[] = body.action === 'employee' ? [body.name] : body.names;
      if (!Array.isArray(names) || names.length < 1 || names.length > 200) return reply('スタッフは1〜200人で登録してください');
      if (names.some(name => typeof name !== 'string' || !name.trim() || name.trim().length > 80)) return reply('氏名を1〜80文字で入力してください');
      // Counter allocation and employee creation commit together; failed registration consumes no ID.
      const employees = await Employee.db.transaction(async session => {
        const counter = await EmployeeCounter.findOneAndUpdate({ _id: storeId }, { $inc: { value: names.length } }, { upsert: true, new: true, session });
        return Employee.create(names.map((name, index) => ({ storeId, personalId: counter.value - names.length + index + 1, name: (name as string).trim() })), { session, ordered: true });
      });
      return NextResponse.json(body.action === 'employee' ? employees[0] : { employees }, { status: 201 });
    }
    const personalId = personalIdFrom(body.personalId);
    if (!personalId) return reply('個人IDを正しく入力してください');
    if (!['clockIn', 'clockOut', 'shift', 'deleteShift'].includes(body.action)) return reply('操作が不正です');
    const dates = body.action === 'shift' ? shiftDates(body.start, body.end) : null;
    if (body.action === 'shift' && !dates) return reply('シフトの開始・終了日時を正しく入力してください');
    if (body.action === 'deleteShift' && !isValidObjectId(body.shiftId)) return reply('シフトIDが不正です');
    const result = await Employee.db.transaction(async session => {
      // Serialize changes for each employee, including simultaneous punches and overlapping shifts.
      const employee = await Employee.findOneAndUpdate({ storeId, personalId }, { $inc: { revision: 1 } }, { session });
      if (!employee) return { message: 'スタッフが見つかりません', status: 404 };
      if (body.action === 'shift' && dates) {
        const overlap = await Shift.exists({ storeId, personalId, start: { $lt: dates.end }, end: { $gt: dates.start } }).session(session);
        if (overlap) return { message: '既存のシフトと時間が重なっています', status: 409 };
        await Shift.create([{ storeId, personalId, ...dates }], { session });
        return { message: 'シフトを登録しました', status: 201 };
      }
      if (body.action === 'deleteShift') {
        const deleted = await Shift.findOneAndDelete({ _id: body.shiftId, storeId, personalId }, { session });
        return { message: deleted ? 'シフトを削除しました' : 'シフトが見つかりません', status: deleted ? 200 : 404 };
      }
      const active = await AttendanceRecord.findOne({ storeId, personalId, clockOut: null }).session(session);
      if (body.action === 'clockIn') {
        if (active) return { message: 'すでに出勤しています。状態を再取得してください', status: 409 };
        await AttendanceRecord.create([{ storeId, personalId, clockIn: new Date(), clockOut: null }], { session });
      } else {
        if (!active || String(active._id) !== body.recordId) return { message: '勤怠状態が変わりました。状態を再取得してください', status: 409 };
        active.clockOut = new Date();
        await active.save({ session });
      }
      return { message: body.action === 'clockIn' ? '出勤を記録しました' : '退勤を記録しました', status: 200 };
    });
    return reply(result.message, result.status);
  } catch (error) {
    if (error instanceof SyntaxError) return reply('入力が不正です');
    return reply('保存できませんでした。再取得して状態を確認してください', 500);
  }
}
