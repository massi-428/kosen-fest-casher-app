import { Schema, model, models } from 'mongoose';

const employeeSchema = new Schema({
  storeId: { type: String, required: true },
  personalId: { type: Number, required: true },
  name: { type: String, required: true },
  archivedAt: { type: Date, default: null },
  revision: { type: Number, default: 0 },
}, { timestamps: true });
employeeSchema.index({ storeId: 1, personalId: 1 }, { unique: true });
const counterSchema = new Schema({ _id: String, value: { type: Number, default: 0 } });
const recordSchema = new Schema({
  storeId: { type: String, required: true },
  personalId: { type: Number, required: true },
  clockIn: { type: Date, required: true },
  clockOut: { type: Date, default: null },
});
recordSchema.index({ storeId: 1, personalId: 1 }, { unique: true, partialFilterExpression: { clockOut: null } });
const shiftSchema = new Schema({
  storeId: { type: String, required: true },
  personalId: { type: Number, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
});
shiftSchema.index({ storeId: 1, start: 1 });

export const Employee = models.AttendanceEmployee || model('AttendanceEmployee', employeeSchema);
export const EmployeeCounter = models.EmployeeCounter || model('EmployeeCounter', counterSchema);
export const AttendanceRecord = models.AttendanceRecord || model('AttendanceRecord', recordSchema);
export const Shift = models.AttendanceShift || model('AttendanceShift', shiftSchema);
