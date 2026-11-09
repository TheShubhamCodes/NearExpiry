const employeeService = require('../services/employeeService');

const getEmployees = async (req, res, next) => {
  try {
    const employees = await employeeService.listEmployees();
    return res.status(200).json({
      success: true,
      data: employees
    });
  } catch (error) {
    next(error);
  }
};

const createEmployee = async (req, res, next) => {
  try {
    const employee = await employeeService.createEmployee(req.body);
    return res.status(201).json({
      success: true,
      message: 'Employee account created successfully.',
      data: employee
    });
  } catch (error) {
    next(error);
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const employee = await employeeService.updateEmployee(req.params.id, req.body, req.user._id);
    return res.status(200).json({
      success: true,
      message: 'Employee details updated.',
      data: employee
    });
  } catch (error) {
    next(error);
  }
};

const toggleStatus = async (req, res, next) => {
  try {
    const employee = await employeeService.toggleEmployeeStatus(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      message: `Employee marked as ${employee.isActive ? 'active' : 'inactive'}.`,
      data: employee
    });
  } catch (error) {
    next(error);
  }
};

const deleteEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.deleteEmployee(req.params.id, req.user._id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEmployees,
  createEmployee,
  updateEmployee,
  toggleStatus,
  deleteEmployee
};

