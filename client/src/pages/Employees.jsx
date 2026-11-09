import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  UserX, 
  Mail, 
  Lock, 
  Search, 
  Trash2, 
  Edit2, 
  Power,
  Shield,
  Clock,
  AlertCircle
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import { SkeletonTable } from '../components/ui/Skeleton';
import { 
  getEmployees, 
  createEmployee, 
  updateEmployee, 
  toggleEmployeeStatus, 
  deleteEmployee 
} from '../services/api';
import { useToast } from '../context/ToastContext';

export default function Employees() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Add form state
  const [addForm, setAddForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [addErrors, setAddErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await getEmployees();
      if (res.success && res.data) {
        setEmployees(res.data);
      }
    } catch (err) {
      showToast({
        title: 'Error Loading Staff',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!addForm.fullName.trim()) errors.fullName = 'Full name is required';
    if (!addForm.email.trim()) errors.email = 'Email address is required';
    if (!addForm.password || addForm.password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (addForm.password !== addForm.confirmPassword) errors.confirmPassword = 'Passwords do not match';

    if (Object.keys(errors).length > 0) {
      setAddErrors(errors);
      return;
    }

    try {
      setIsSubmitting(true);
      setAddErrors({});
      await createEmployee({
        fullName: addForm.fullName,
        email: addForm.email,
        password: addForm.password,
        role: 'employee'
      });

      showToast({
        title: 'Employee Created',
        message: `${addForm.fullName} has been added as a store employee.`,
        type: 'success'
      });

      setIsAddModalOpen(false);
      setAddForm({ fullName: '', email: '', password: '', confirmPassword: '' });
      fetchEmployees();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setAddErrors({ form: msg });
      showToast({ title: 'Creation Failed', message: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (employee) => {
    try {
      const res = await toggleEmployeeStatus(employee._id);
      showToast({
        title: 'Status Updated',
        message: res.message || 'Employee status updated.',
        type: 'success'
      });
      fetchEmployees();
    } catch (err) {
      showToast({
        title: 'Update Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !selectedEmployee) return;

    try {
      setIsSubmitting(true);
      await updateEmployee(selectedEmployee._id, { fullName: editName });
      showToast({
        title: 'Staff Updated',
        message: 'Employee details saved.',
        type: 'success'
      });
      setIsEditModalOpen(false);
      setSelectedEmployee(null);
      fetchEmployees();
    } catch (err) {
      showToast({
        title: 'Update Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (employee) => {
    if (!window.confirm(`Are you sure you want to remove ${employee.fullName}?`)) return;

    try {
      await deleteEmployee(employee._id);
      showToast({
        title: 'Employee Removed',
        message: 'Account successfully deleted.',
        type: 'info'
      });
      fetchEmployees();
    } catch (err) {
      showToast({
        title: 'Delete Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    }
  };

  const filteredEmployees = employees.filter((emp) =>
    emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = employees.filter((e) => e.isActive).length;
  const inactiveCount = employees.filter((e) => !e.isActive).length;

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>Employee Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Store Owner Control: Authorize supermarket staff to manage products and log inventory batches.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={UserPlus}
          onClick={() => {
            setAddErrors({});
            setAddForm({ fullName: '', email: '', password: '', confirmPassword: '' });
            setIsAddModalOpen(true);
          }}
        >
          Add Employee
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Staff</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{employees.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Employees</p>
              <p className="text-2xl font-extrabold text-emerald-600 mt-0.5">{activeCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Deactivated Accounts</p>
              <p className="text-2xl font-extrabold text-rose-600 mt-0.5">{inactiveCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <UserX className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Search employees by name or email address..."
            icon={Search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Employee Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Assigned Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sign-In</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.length === 0 ? (
                <TableRow hover={false}>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <EmptyState
                      icon={Users}
                      title="No Employees Registered"
                      description="You haven't created any employee accounts yet. Employees can log products and batches without access to owner settings."
                      actionLabel="Add First Employee"
                      actionIcon={UserPlus}
                      onAction={() => setIsAddModalOpen(true)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map((emp) => (
                  <TableRow key={emp._id}>
                    <TableCell className="font-semibold text-slate-900">
                      {emp.fullName}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {emp.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" size="sm">
                        Employee
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={emp.isActive ? 'fresh' : 'danger'}
                        size="sm"
                        dot
                      >
                        {emp.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {emp.lastLogin
                        ? new Date(emp.lastLogin).toLocaleDateString()
                        : 'Never logged in'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setEditName(emp.fullName);
                            setIsEditModalOpen(true);
                          }}
                          title="Edit Name"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant={emp.isActive ? 'warning' : 'outline'}
                          size="xs"
                          onClick={() => handleToggleStatus(emp)}
                          title={emp.isActive ? 'Deactivate Employee' : 'Activate Employee'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDelete(emp)}
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete Employee"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-xs text-slate-400 px-2">
            <span>Showing {filteredEmployees.length} of {employees.length} employee accounts</span>
            <span>Owner Authorization Enforced</span>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Supermarket Employee"
        description="Create credentials for a supermarket cashier or stock keeper."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSubmitting}
              onClick={handleAddSubmit}
            >
              Create Account
            </Button>
          </>
        }
      >
        {addErrors.form && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{addErrors.form}</span>
          </div>
        )}

        <form onSubmit={handleAddSubmit} className="space-y-3.5">
          <Input
            label="Employee Full Name"
            placeholder="e.g. Marcus Miller"
            value={addForm.fullName}
            onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
            error={addErrors.fullName}
            disabled={isSubmitting}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="marcus@supermarket.local"
            icon={Mail}
            value={addForm.email}
            onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            error={addErrors.email}
            disabled={isSubmitting}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Temporary Password"
              type="password"
              placeholder="••••••••"
              icon={Lock}
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              error={addErrors.password}
              disabled={isSubmitting}
              helperText="Min. 6 characters"
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              icon={Lock}
              value={addForm.confirmPassword}
              onChange={(e) => setAddForm({ ...addForm, confirmPassword: e.target.value })}
              error={addErrors.confirmPassword}
              disabled={isSubmitting}
            />
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Employee Information"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSubmitting}
              onClick={handleEditSubmit}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Updating account for <strong>{selectedEmployee?.email}</strong>
          </p>
          <Input
            label="Full Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </Modal>

    </div>
  );
}

