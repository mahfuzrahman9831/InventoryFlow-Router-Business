import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  UserCircle,
  Phone,
  CreditCard,
  History,
  CheckCircle2,
  AlertCircle,
  MapPin,
  X,
  Trash2,
  Pencil,
  Calendar
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { 
  fetchItems, 
  createItem, 
  updateItem, 
  deleteItem, 
  getCollectionRef,
  getDocRef
} from '../services/firestoreService';
import { cn } from '../lib/utils';
import { query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const CustomersPage = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'due'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<any[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [customerToDelete, setCustomerToDelete] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    dueAmount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user]);

  useEffect(() => {
    if (expandedCustomerId && user) {
      fetchTransactionsForId(expandedCustomerId);
    }
  }, [expandedCustomerId, user]);

  const fetchCustomers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const items = await fetchItems(user.uid, 'customers');
      setCustomers(items);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactionsForId = async (customerId: string) => {
    if (!user) return;
    try {
      const salesCol = getCollectionRef(user.uid, 'sales');
      const paymentsCol = getCollectionRef(user.uid, 'payments');
      
      const qSales = query(salesCol, where('customerId', '==', customerId));
      const qPayments = query(paymentsCol, where('customerId', '==', customerId));
      
      const [sSnap, pSnap] = await Promise.all([getDocs(qSales), getDocs(qPayments)]);
      
      const salesData = sSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'sale' }));
      const paymentsData = pSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'payment' }));
      
      const allTransactions = [...salesData, ...paymentsData].sort((a: any, b: any) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      setCustomerTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchTransactions = async () => {
    if (!user || !selectedCustomer) return;
    fetchTransactionsForId(selectedCustomer.id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await createItem(user.uid, 'customers', formData);
      await fetchCustomers();
      setIsModalOpen(false);
      setFormData({ name: '', phone: '', address: '', dueAmount: 0 });
    } catch (error) {
      console.error('Error saving customer:', error);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !user) return;

    try {
      const batch = writeBatch(db);
      const oldDue = Number(selectedCustomer.dueAmount) || 0;
      const newDue = Math.max(0, oldDue - paymentAmount);
      
      // Update customer
      const customerRef = getDocRef(user.uid, 'customers', selectedCustomer.id);
      batch.update(customerRef, { dueAmount: newDue });
      
      // Record payment
      const paymentRef = doc(getCollectionRef(user.uid, 'payments'));
      batch.set(paymentRef, {
        customerId: selectedCustomer.id,
        amount: paymentAmount,
        date: new Date().toISOString(),
        previousDue: oldDue,
        newDue: newDue,
        createdAt: new Date().toISOString()
      });
      
      await batch.commit();
      await fetchCustomers();
      
      // Update local selection to reflect changes in modal if open
      setSelectedCustomer({ ...selectedCustomer, dueAmount: newDue });
      
      setIsPaymentModalOpen(false);
      setPaymentAmount(0);
      alert('Payment recorded successfully!');
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  const confirmDelete = async () => {
    if (!customerToDelete || !user) return;
    try {
      await deleteItem(user.uid, 'customers', customerToDelete.id);
      await fetchCustomers();
      setIsDeleteModalOpen(false);
      setCustomerToDelete(null);
    } catch (error) {
      alert('Failed to delete customer');
    }
  };

  const handleEditTx = (tx: any) => {
    setEditingTx(tx);
    setIsEditTxModalOpen(true);
  };

  const handleUpdateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingTx || !expandedCustomerId) return;
    
    const customer = customers.find(c => c.id === expandedCustomerId);
    if (!customer) return;

    try {
      const batch = writeBatch(db);
      const customerRef = getDocRef(user.uid, 'customers', customer.id);
      
      if (editingTx.type === 'sale') {
        const saleRef = getDocRef(user.uid, 'sales', editingTx.id);
        const oldDue = Number(editingTx.dueAmount) || 0;
        const newTotal = Number(editingTx.totalAmount) || 0;
        const newReceived = Number(editingTx.receivedAmount) || 0;
        const newDue = Math.max(0, newTotal - newReceived);
        
        // Update Customer Balance: subtract old due, add new due
        const customerDueDiff = newDue - oldDue;
        batch.update(customerRef, {
          dueAmount: (Number(customer.dueAmount) || 0) + customerDueDiff
        });

        batch.update(saleRef, {
          totalAmount: newTotal,
          receivedAmount: newReceived,
          dueAmount: newDue,
          date: editingTx.date
        });
      } else if (editingTx.type === 'payment') {
        const paymentRef = getDocRef(user.uid, 'payments', editingTx.id);
        const oldPaymentAmount = Number(editingTx.amount) || 0;
        const newPaymentAmount = Number(editingTx.amount) || 0;
        
        // Update Customer Balance: Add back old payment, subtract new payment
        const customerPayDiff = oldPaymentAmount - newPaymentAmount;
        batch.update(customerRef, {
          dueAmount: (Number(customer.dueAmount) || 0) + customerPayDiff
        });

        batch.update(paymentRef, {
          amount: newPaymentAmount,
          date: editingTx.date
        });
      }

      await batch.commit();
      setIsEditTxModalOpen(false);
      await fetchCustomers();
      // Refresh current history view
      fetchTransactionsForId(customer.id);
      alert('Transaction updated successfully!');
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Failed to update transaction');
    }
  };

  const [isDeleteTxModalOpen, setIsDeleteTxModalOpen] = useState(false);
  const [txToDelete, setTxToDelete] = useState<any>(null);

  const handleDeleteTx = async (tx: any) => {
    setTxToDelete(tx);
    setIsDeleteTxModalOpen(true);
  };

  const confirmDeleteTx = async () => {
    const customerId = expandedCustomerId || selectedCustomer?.id;
    if (!user || !customerId || !txToDelete) return;

    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const tx = txToDelete;
    try {
      const batch = writeBatch(db);
      const customerRef = getDocRef(user.uid, 'customers', customer.id);

      if (tx.type === 'sale') {
        const saleRef = getDocRef(user.uid, 'sales', tx.id);
        const dueToRevert = Number(tx.dueAmount) || 0;
        
        // Revert customer balance
        batch.update(customerRef, {
          dueAmount: Math.max(0, (Number(customer.dueAmount) || 0) - dueToRevert)
        });
        
        batch.delete(saleRef);
      } else if (tx.type === 'payment') {
        const paymentRef = getDocRef(user.uid, 'payments', tx.id);
        const amountToRevert = Number(tx.amount) || 0;
        
        // Revert customer balance
        batch.update(customerRef, {
          dueAmount: (Number(customer.dueAmount) || 0) + amountToRevert
        });
        
        batch.delete(paymentRef);
      }

      await batch.commit();
      await fetchCustomers();
      fetchTransactionsForId(customer.id);
      setIsDeleteTxModalOpen(false);
      setTxToDelete(null);
      alert('Transaction deleted and balance adjusted.');
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction');
    }
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
                         c.phone.includes(search);
    const matchesTab = activeTab === 'all' || (activeTab === 'due' && c.dueAmount > 0);
    return matchesSearch && matchesTab;
  });

  const totalDueAmount = filteredCustomers.reduce((acc, curr) => acc + (curr.dueAmount || 0), 0);
  const totalDueCustomers = customers.filter(c => c.dueAmount > 0).length;
  const totalCustomers = customers.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer CRM</h1>
          <p className="text-muted-foreground">Manage relationships and track outstanding dues.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end pr-4 border-r border-slate-200">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Profiles</span>
            <span className="text-lg font-black text-slate-900">{totalCustomers}</span>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 h-fit"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search Customers" 
            className="w-full rounded-lg border bg-card py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:italic"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex p-1 bg-slate-100 rounded-lg self-start">
          <button 
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-md transition-all",
              activeTab === 'all' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            All Customers
          </button>
          <button 
            onClick={() => setActiveTab('due')}
            className={cn(
              "px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-md transition-all",
              activeTab === 'due' ? "bg-white text-red-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Due Customers
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <UserCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-blue-900 uppercase tracking-widest">Total Customers</h3>
              <p className="text-[10px] font-bold text-blue-600/70 uppercase tracking-widest">Registered in system</p>
            </div>
          </div>
          <p className="text-2xl font-black text-blue-600 tracking-tighter">{totalCustomers}</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-red-900 uppercase tracking-widest">Outstanding Debt</h3>
              <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-widest">{totalDueCustomers} {totalDueCustomers === 1 ? 'customer' : 'customers'} pending</p>
            </div>
          </div>
          <p className="text-2xl font-black text-red-600 tracking-tighter">৳{totalDueAmount.toLocaleString()}</p>
        </motion.div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 relative transition-all">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card p-6 animate-pulse bg-slate-50 border border-slate-100 min-h-[200px]" />
          ))
        ) : filteredCustomers.length > 0 ? (
          filteredCustomers.map((customer) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={customer.id}
              className={cn(
                "glass-card p-6 relative group cursor-pointer overflow-hidden transition-all duration-300",
                expandedCustomerId === customer.id ? "ring-2 ring-blue-500 md:col-span-2 lg:col-span-3 shadow-2xl" : "hover:shadow-lg"
              )}
              onClick={() => setExpandedCustomerId(expandedCustomerId === customer.id ? null : customer.id)}
            >
              {/* Background Accent Gradient */}
              <div className={cn(
                "absolute -right-4 -top-4 h-24 w-24 rounded-full blur-3xl opacity-20 transition-all group-hover:opacity-30",
                customer.dueAmount > 0 ? "bg-red-500" : "bg-blue-500"
              )} />

              <div className="flex items-start justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl font-black text-xl shadow-inner border transition-transform group-hover:scale-110",
                    customer.dueAmount > 0 
                      ? "bg-red-50 text-red-600 border-red-100" 
                      : "bg-blue-50 text-blue-600 border-blue-100"
                  )}>
                    {customer.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-lg tracking-tight group-hover:text-blue-600 transition-colors">
                      {customer.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {customer.phone || 'NO PHONE'}
                      </div>
                      {customer.address && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 truncate max-w-[200px]">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {customer.address}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {customer.dueAmount > 0 ? (
                  <div className="rounded-full bg-red-500/10 backdrop-blur-sm px-3 py-1 text-[9px] font-black text-red-600 border border-red-200/50 uppercase tracking-wider animate-pulse">
                    Unpaid
                  </div>
                ) : (
                  <div className="rounded-full bg-green-500/10 backdrop-blur-sm px-3 py-1 text-[9px] font-black text-green-600 border border-green-200/50 uppercase tracking-wider">
                    Trusted
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200/40 relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">Outstanding</p>
                  <p className={cn(
                    "text-3xl font-black tracking-tighter", 
                    customer.dueAmount > 0 ? "text-red-600" : "text-slate-900"
                  )}>
                    ৳{customer.dueAmount.toLocaleString()}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    className={cn(
                      "rounded-xl border p-2.5 transition-all shadow-sm",
                      expandedCustomerId === customer.id 
                        ? "bg-blue-600 text-white border-blue-600" 
                        : "border-slate-200 bg-white/50 text-slate-500 hover:bg-white hover:text-blue-600 hover:border-blue-200"
                    )}
                    title="History"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setExpandedCustomerId(expandedCustomerId === customer.id ? null : customer.id); 
                    }}
                  >
                     <History className="h-4 w-4" />
                  </button>
                  <button 
                    className="rounded-xl border border-red-100 bg-white/50 p-2.5 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm" 
                    title="Delete"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setCustomerToDelete(customer);
                      setIsDeleteModalOpen(true);
                    }}
                  >
                     <Trash2 className="h-4 w-4" />
                  </button>
                  {customer.dueAmount > 0 && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setSelectedCustomer(customer);
                        setIsPaymentModalOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 hover:bg-blue-700 hover:scale-105 active:scale-95"
                    >
                       <CreditCard className="h-4 w-4" />
                       Settle
                    </button>
                  )}
                </div>
              </div>

              {/* History Expansion View */}
              {expandedCustomerId === customer.id && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-6 pt-6 border-t border-slate-100 relative z-10"
                >
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <History className="h-3 w-3" />
                    Transaction History
                  </h4>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
                    {customerTransactions.length > 0 ? customerTransactions.map((tx, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-white shadow-sm flex items-center justify-between hover:border-blue-100 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center",
                            tx.type === 'payment' ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                          )}>
                             {tx.type === 'payment' ? <CreditCard className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-700 leading-none">
                               {tx.type === 'payment' ? "Payment Received" : `Invoice #QT-${tx.id.slice(-6)}`}
                            </p>
                            <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
                               {new Date(tx.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                          <div className="flex flex-col items-end gap-1">
                            <p className={cn("text-[11px] font-black tracking-tight", tx.type === 'payment' ? "text-green-600" : "text-slate-900")}>
                               {tx.type === 'payment' ? `- ৳${tx.amount.toLocaleString()}` : `৳${tx.totalAmount.toLocaleString()}`}
                            </p>
                            <div className="flex gap-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleEditTx(tx); }}
                                className="p-1 rounded bg-slate-50 border border-slate-200 text-slate-400 hover:text-blue-600 transition-all"
                                title="Edit"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteTx(tx); }}
                                className="p-1 rounded bg-slate-50 border border-slate-200 text-slate-400 hover:text-red-600 transition-all"
                                title="Delete"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No transactions discovered</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <UserCircle className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">No customers found</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* Register Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Register New Customer</h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Full Name</label>
                <input 
                  required
                  type="text" 
                  placeholder="Your Name"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Phone Number (Optional)</label>
                <input 
                  type="tel" 
                  placeholder="Phone Number"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Address</label>
                <textarea 
                  placeholder="Address"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[80px] resize-none placeholder:italic"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Initial Due Amount</label>
                <input 
                  type="number" 
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  value={formData.dueAmount === 0 ? '' : (formData.dueAmount || '')}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={e => setFormData({ ...formData, dueAmount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              
              <div className="pt-6 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                  Create Profile
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Customer Detail & History Modal */}
      {selectedCustomer && !isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                 <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-black">
                   {selectedCustomer.name.charAt(0)}
                 </div>
                 <div>
                   <h2 className="text-lg font-black text-slate-900 tracking-tight">{selectedCustomer.name}</h2>
                   <div className="flex flex-col">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedCustomer.phone || 'No Phone'}</p>
                     {selectedCustomer.address && (
                       <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                         <MapPin className="h-2 w-2 text-slate-300" />
                         {selectedCustomer.address}
                       </p>
                     )}
                   </div>
                 </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="rounded-full p-2 hover:bg-white transition-colors border border-transparent hover:border-slate-100 shadow-sm">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 group">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Due Balance</p>
                   <p className={cn("text-2xl font-black tracking-tight transition-colors", selectedCustomer.dueAmount > 0 ? "text-red-600" : "text-green-600")}>
                     ৳{selectedCustomer.dueAmount.toLocaleString()}
                   </p>
                   {selectedCustomer.dueAmount > 0 && (
                     <button 
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="mt-3 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                     >
                       Record Payment →
                     </button>
                   )}
                </div>
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Transactions</p>
                   <p className="text-2xl font-black tracking-tight text-slate-900">{customerTransactions.length}</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <History className="h-3 w-3" />
                  Transaction History
                </h3>
                <div className="space-y-3">
                  {customerTransactions.length > 0 ? customerTransactions.map((tx, i) => (
                    <div key={i} className="p-4 rounded-lg border border-slate-100 bg-white shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center",
                          tx.type === 'payment' ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                        )}>
                          {tx.type === 'payment' ? <CreditCard className="h-4 w-4" /> : <History className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-900 leading-tight">
                            {tx.type === 'payment' ? "Payment Received" : `Invoice #INV-${tx.id.slice(-6)}`}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                            {new Date(tx.date).toLocaleDateString()} at {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className={cn("text-[11px] font-black tracking-tight", tx.type === 'payment' ? "text-green-600" : "text-slate-900")}>
                          {tx.type === 'payment' ? `- ৳${tx.amount.toLocaleString()}` : `৳${tx.totalAmount.toLocaleString()}`}
                        </p>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleEditTx(tx)}
                            className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400 hover:text-blue-600 transition-all shadow-sm"
                            title="Edit"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteTx(tx)}
                            className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400 hover:text-red-600 transition-all shadow-sm"
                            title="Delete"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl">
                      <History className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No previous transactions found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Payment Settlement Modal */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="text-center mb-8">
              <div className="h-16 w-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
                <CreditCard className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Record Due Payment</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Settling for {selectedCustomer.name}
              </p>
            </div>

            <form onSubmit={handlePayment} className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Outstanding Balance</p>
                 <p className="text-2xl font-black text-red-600 tracking-tighter">৳{selectedCustomer.dueAmount.toLocaleString()}</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Payment Amount (৳)</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-xl font-black text-slate-300">৳</span>
                  <input 
                    required
                    type="number" 
                    max={selectedCustomer.dueAmount}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 pl-10 text-xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={paymentAmount === 0 ? '' : (paymentAmount || '')}
                    onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {isEditTxModalOpen && editingTx && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Pencil className="h-6 w-6 text-blue-600" />
                  Edit Transaction
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  ID: #{editingTx.id.slice(-6)} • {editingTx.type === 'sale' ? 'Sales Invoice' : 'Customer Payment'}
                </p>
              </div>
              <button onClick={() => setIsEditTxModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-all text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTx} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                    <input 
                      type="datetime-local"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={new Date(new Date(editingTx.date).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                      onChange={e => setEditingTx({ ...editingTx, date: new Date(e.target.value).toISOString() })}
                    />
                  </div>
                </div>

                {editingTx.type === 'sale' ? (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">৳</span>
                      <input 
                        type="number"
                        className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={editingTx.totalAmount === 0 ? '' : editingTx.totalAmount}
                        onFocus={e => e.target.select()}
                        onChange={e => setEditingTx({ ...editingTx, totalAmount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">৳</span>
                      <input 
                        type="number"
                        className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2.5 text-sm font-black text-emerald-600 outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={editingTx.amount === 0 ? '' : editingTx.amount}
                        onFocus={e => e.target.select()}
                        onChange={e => setEditingTx({ ...editingTx, amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {editingTx.type === 'sale' && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Received Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">৳</span>
                    <input 
                      type="number"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2.5 text-sm font-black text-emerald-600 outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={editingTx.receivedAmount === 0 ? '' : editingTx.receivedAmount}
                      onFocus={e => e.target.select()}
                      onChange={e => setEditingTx({ ...editingTx, receivedAmount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider pt-1">
                    <span className="text-slate-400">Calculated Due:</span>
                    <span className="text-rose-600">৳{(editingTx.totalAmount - editingTx.receivedAmount).toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="pt-6 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditTxModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all text-slate-500"
                >
                  Discard
                </button>
                <button 
                  type="submit" 
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {isDeleteModalOpen && customerToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
              <Trash2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Delete Customer?</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium italic">
              "Are you sure you want to delete <b>{customerToDelete.name}</b>? Past sales records will remain but will be unlinked."
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setCustomerToDelete(null);
                }}
                className="flex-1 rounded-lg border border-slate-200 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 font-bold"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Custom Delete Transaction Confirmation Modal */}
      {isDeleteTxModalOpen && txToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
              <Trash2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Delete Transaction?</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium italic">
              "This will delete the transaction and <b>automatically adjust the customer's due balance</b>."
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsDeleteTxModalOpen(false);
                  setTxToDelete(null);
                }}
                className="flex-1 rounded-lg border border-slate-200 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteTx}
                className="flex-1 rounded-lg bg-red-600 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 font-bold"
              >
                Confirm Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

