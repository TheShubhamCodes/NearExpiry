const express = require('express');
const {
  getEmployees,
  createEmployee,
  updateEmployee,
  toggleStatus,
  deleteEmployee
} = require('../controllers/employeeController');
const { authenticate, requireOwner } = require('../middleware/authMiddleware');

const router = express.Router();

// All employee routes are restricted to the store owner
router.use(authenticate, requireOwner);

router.get('/', getEmployees);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.patch('/:id/status', toggleStatus);
router.delete('/:id', deleteEmployee);

module.exports = router;

