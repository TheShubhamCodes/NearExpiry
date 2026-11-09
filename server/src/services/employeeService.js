const User = require('../models/User');
const { createEmployeeSchema, updateEmployeeSchema } = require('../utils/validators');

const listEmployees = async () => {
  // Return all employees (excluding owner password)
  return await User.find({ role: 'employee' }).sort({ createdAt: -1 });
};

const createEmployee = async (data) => {
  const validated = createEmployeeSchema.parse(data);

  // Check email uniqueness
  const existingUser = await User.findOne({ email: validated.email });
  if (existingUser) {
    const error = new Error('A user with this email address already exists.');
    error.statusCode = 400;
    throw error;
  }

  // Create employee
  const employee = await User.create({
    fullName: validated.fullName,
    email: validated.email,
    password: validated.password,
    role: 'employee',
    isActive: true
  });

  return employee;
};

const updateEmployee = async (id, data, currentUserId) => {
  const validated = updateEmployeeSchema.parse(data);

  const employee = await User.findById(id);
  if (!employee) {
    const error = new Error('Employee not found.');
    error.statusCode = 404;
    throw error;
  }

  // Prevent modifying the owner through this endpoint
  if (employee.role === 'owner') {
    const error = new Error('Owner account cannot be modified via employee management.');
    error.statusCode = 403;
    throw error;
  }

  if (validated.fullName !== undefined) employee.fullName = validated.fullName;
  if (validated.isActive !== undefined) employee.isActive = validated.isActive;

  await employee.save();
  return employee;
};

const toggleEmployeeStatus = async (id, currentUserId) => {
  if (id === currentUserId.toString()) {
    const error = new Error('You cannot deactivate your own account.');
    error.statusCode = 400;
    throw error;
  }

  const employee = await User.findById(id);
  if (!employee) {
    const error = new Error('Employee not found.');
    error.statusCode = 404;
    throw error;
  }

  if (employee.role === 'owner') {
    const error = new Error('Owner status cannot be toggled.');
    error.statusCode = 403;
    throw error;
  }

  employee.isActive = !employee.isActive;
  await employee.save();
  return employee;
};

const deleteEmployee = async (id, currentUserId) => {
  if (id === currentUserId.toString()) {
    const error = new Error('You cannot delete your own account.');
    error.statusCode = 400;
    throw error;
  }

  const employee = await User.findById(id);
  if (!employee) {
    const error = new Error('Employee not found.');
    error.statusCode = 404;
    throw error;
  }

  if (employee.role === 'owner') {
    const error = new Error('Owner account cannot be deleted.');
    error.statusCode = 403;
    throw error;
  }

  await User.findByIdAndDelete(id);
  return { success: true, message: 'Employee account removed.' };
};

module.exports = {
  listEmployees,
  createEmployee,
  updateEmployee,
  toggleEmployeeStatus,
  deleteEmployee
};

