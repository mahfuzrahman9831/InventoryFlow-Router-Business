import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Receipt, 
  Trash2, 
  Pencil, 
  Calendar,
  X,
  TrendingDown,
  Tag,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { 
  fetchItems, 
  createItem, 
  updateItem, 
  deleteItem 
} from '../services/firestoreService';
import { cn } from '../lib/utils';

export const ExpensesPage = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);

  const [formData, setFormData] = useState({
    category: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  const categories = [
    'Carrying Cost',
    'Shop Rent',
    'Electricity Bill',
    'Staff Salary',
    'Marketing',
    'Repairs',
    'Office Supplies',
    'Other'
  ];

  useEffect(() => {
    if (user) {
      fetchExpenses();
    }
  }, [user]);

  const fetchExpenses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const items: any[] = await fetchItems(user.uid, 'expenses');
      setExpenses(items.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const data = {
        ...formData,
        date: new Date(formData.date).toISOString(),
        amount: Number(formData.amount)
      };

      if (selectedExpense) {
        await updateItem(user.uid, 'expenses', selectedExpense.id, data);
      } else {
        await createItem(user.uid, 'expenses', data);
      }
      
      await fetchExpenses();
      closeModal();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Failed to save expense');
    }
  };

  const confirmDelete = async () => {
    if (!expenseToDelete || !user) return;
    try {
      await deleteItem(user.uid, 'expenses', expenseToDelete.id);
      await fetchExpenses();
      setIsDeleteModalOpen(false);
      setExpenseToDelete(null);
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense');
    }
  };

  const openModal = (expense: any = null) => {
    if (expense) {
      setSelectedExpense(expense);
      setFormData({
        category: expense.category,
        amount: expense.amount,
        date: new Date(expense.date).toISOString().split('T')[0],
        note: expense.note || ''
      });
    } else {
      setSelectedExpense(null);
      setFormData({
        category: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        note: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedExpense(null);
  };

  const filteredExpenses = expenses.filter(exp => 
    exp.category?.toLowerCase().includes(search.toLowerCase()) || 
    exp.note?.toLowerCase().includes(search.toLowerCase())
  );

  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track carrying costs and other operational expenses.</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700"
        >
          <Plus className="h-4 w-4" />
          Add Expense
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-red-900 uppercase tracking-widest">Total Expenses</h3>
              <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-widest">Selected period</p>
            </div>
          </div>
          <p className="text-2xl font-black text-red-600 tracking-tighter">৳{totalExpenses.toLocaleString()}</p>
        </motion.div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search category or note..." 
            className="w-full rounded-lg border bg-card py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-red-500/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Note</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Amount</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredExpenses.length > 0 ? (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 whitespace-now6wrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-slate-400" />
                        <span className="text-sm font-bold text-slate-700">
                          {new Date(expense.date).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-blue-500" />
                        <span className="text-sm font-black text-slate-900 tracking-tight">{expense.category}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[200px]">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 text-slate-400" />
                        <span className="text-xs text-slate-500 italic truncate block">{expense.note || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-black text-red-600">৳{Number(expense.amount).toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openModal(expense)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => {
                            setExpenseToDelete(expense);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                    No expenses found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {selectedExpense ? 'Edit Expense' : 'Add New Expense'}
              </h2>
              <button onClick={closeModal} className="rounded-full p-2 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Category</label>
                  <select 
                    required
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-red-500/20"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Amount (৳)</label>
                  <input 
                    required
                    type="number"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-red-500/20"
                    value={formData.amount || ''}
                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Date</label>
                  <input 
                    required
                    type="date"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-red-500/20"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Note (Optional)</label>
                  <textarea 
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 resize-none h-24"
                    placeholder="E.g. Transport cost for Rice"
                    value={formData.note}
                    onChange={e => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-xs font-black text-white uppercase tracking-widest shadow-lg shadow-red-500/20"
                >
                  {selectedExpense ? 'Update' : 'Save Expense'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
              <Trash2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Delete Expense?</h2>
            <p className="text-sm text-slate-500 mb-6 italic">
              Are you sure you want to delete this expense record?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-3 text-xs font-black uppercase tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 py-3 text-xs font-black text-white uppercase tracking-widest shadow-lg shadow-red-500/20"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
