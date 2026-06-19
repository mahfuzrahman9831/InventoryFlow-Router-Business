import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Truck,
  Phone,
  MapPin,
  Building2,
  PackageCheck,
  X,
  PlusCircle,
  Package,
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
import { query, where, getDocs, orderBy, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const SuppliersPage = () => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTxDeleteConfirmOpen, setIsTxDeleteConfirmOpen] = useState(false);
  const [txToDelete, setTxToDelete] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [memoImage, setMemoImage] = useState<string | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [manualTotal, setManualTotal] = useState(0);
  const [supplierTransactions, setSupplierTransactions] = useState<any[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    companyName: '',
    dueAmount: 0
  });

  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentNote, setPaymentNote] = useState('');

  const [purchaseItems, setPurchaseItems] = useState<any[]>([
    { productId: '', name: '', category: '', purchasePrice: 0, quantity: 0 }
  ]);

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user]);

  const fetchAllData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [supps, prods, purchs] = await Promise.all([
        fetchItems(user.uid, 'suppliers'),
        fetchItems(user.uid, 'products'),
        fetchItems(user.uid, 'purchases')
      ]);
      setSuppliers(supps);
      setProducts(prods);
      setPurchases(purchs);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await createItem(user.uid, 'suppliers', formData);
      await fetchAllData();
      setIsModalOpen(false);
      setFormData({ name: '', phone: '', address: '', companyName: '', dueAmount: 0 });
    } catch (error) {
      console.error('Error saving supplier:', error);
    }
  };

  const handleViewHistory = async (supplier: any) => {
    if (!user) return;
    setSelectedSupplier(supplier);
    try {
      const purchasCol = getCollectionRef(user.uid, 'purchases');
      const paymentsCol = getCollectionRef(user.uid, 'supplierPayments');
      
      const qPurchases = query(purchasCol, where('supplierId', '==', supplier.id));
      const qPayments = query(paymentsCol, where('supplierId', '==', supplier.id));
      
      const [pSnap, paySnap] = await Promise.all([getDocs(qPurchases), getDocs(qPayments)]);
      
      const purchasesData = pSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'purchase' }));
      const paymentsData = paySnap.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'payment' }));
      
      const allTransactions = [...purchasesData, ...paymentsData].sort((a: any, b: any) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      setSupplierTransactions(allTransactions);
      setIsHistoryOpen(true);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const handlePayDue = (supplier: any) => {
    setSelectedSupplier(supplier);
    setPaymentAmount(0);
    setPaymentNote('');
    setMemoImage(null);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || paymentAmount <= 0 || !user) return;

    try {
      const batch = writeBatch(db);
      
      const oldDue = Number(selectedSupplier.dueAmount) || 0;
      const newDue = Math.max(0, oldDue - paymentAmount);
      
      // Update supplier
      const supplierRef = getDocRef(user.uid, 'suppliers', selectedSupplier.id);
      batch.update(supplierRef, { dueAmount: newDue });
      
      // Record payment
      const paymentRef = doc(getCollectionRef(user.uid, 'supplierPayments'));
      batch.set(paymentRef, {
        supplierId: selectedSupplier.id,
        amount: paymentAmount,
        date: new Date().toISOString(),
        previousDue: oldDue,
        newDue: newDue,
        note: paymentNote || 'Standalone Payment',
        memoImage,
        createdAt: new Date().toISOString()
      });
      
      await batch.commit();
      await fetchAllData();
      setIsPaymentModalOpen(false);
      alert('Payment recorded successfully!');
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  const handleEditTx = (tx: any) => {
    setEditingTx(tx);
    setIsEditTxModalOpen(true);
  };

  const handleUpdateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingTx || !selectedSupplier) return;

    try {
      const batch = writeBatch(db);
      const currentSupp = suppliers.find(s => s.id === selectedSupplier.id);
      if (!currentSupp) {
        alert('Supplier data not found. Please refresh.');
        return;
      }
      
      const supplierRef = getDocRef(user.uid, 'suppliers', selectedSupplier.id);
      
      if (editingTx.type === 'purchase') {
        const purchaseRef = getDocRef(user.uid, 'purchases', editingTx.id);
        const oldDue = Number(editingTx.dueAmount) || 0;
        const newTotal = Number(editingTx.totalAmount) || 0;
        const newPaid = Number(editingTx.paidAmount) || 0;
        const newDue = newTotal - newPaid;
        
        // Update Supplier Balance: Subtract old due, add new due
        const supplierDueDiff = newDue - oldDue;
        batch.update(supplierRef, {
          dueAmount: (Number(currentSupp.dueAmount) || 0) + supplierDueDiff
        });

        batch.update(purchaseRef, {
          totalAmount: newTotal,
          paidAmount: newPaid,
          dueAmount: newDue,
          date: editingTx.date
        });
      } else if (editingTx.type === 'payment') {
        const paymentRef = getDocRef(user.uid, 'supplierPayments', editingTx.id);
        const oldPaymentAmount = Number(editingTx.amount) || 0;
        const newPaymentAmount = Number(editingTx.amount) || 0; // In case I add separate field
        
        // If amount changed:
        // Update Supplier Balance: Add back old payment, subtract new payment
        const supplierPayDiff = oldPaymentAmount - newPaymentAmount;
        batch.update(supplierRef, {
          dueAmount: (Number(currentSupp.dueAmount) || 0) + supplierPayDiff
        });

        batch.update(paymentRef, {
          amount: newPaymentAmount,
          note: editingTx.note,
          date: editingTx.date
        });
      }

      await batch.commit();
      setIsEditTxModalOpen(false);
      await fetchAllData();
      // Refresh current history view
      handleViewHistory(currentSupp);
      alert('Transaction updated successfully!');
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Failed to update transaction');
    }
  };

  const handleDeleteTx = async (tx: any) => {
    setTxToDelete(tx);
    setIsTxDeleteConfirmOpen(true);
  };

  const confirmDeleteTx = async () => {
    if (!user || !selectedSupplier || !txToDelete) return;

    try {
      const batch = writeBatch(db);
      const currentSupp = suppliers.find(s => s.id === selectedSupplier.id);
      if (!currentSupp) {
        alert('Supplier data not found. Please refresh.');
        return;
      }
      
      const supplierRef = getDocRef(user.uid, 'suppliers', selectedSupplier.id);

      if (txToDelete.type === 'purchase') {
        const purchaseRef = getDocRef(user.uid, 'purchases', txToDelete.id);
        const dueToRevert = Number(txToDelete.dueAmount) || 0;
        
        // 1. Revert Supplier Balance
        batch.update(supplierRef, {
          dueAmount: Math.max(0, (Number(currentSupp.dueAmount) || 0) - dueToRevert)
        });
        
        // 2. Revert Stock and Batches
        if (Array.isArray(txToDelete.items)) {
          for (const item of txToDelete.items) {
            if (item.productId) {
              const productRef = getDocRef(user.uid, 'products', item.productId);
              const productData = products.find(p => p.id === item.productId);
              if (productData) {
                const newStock = Math.max(0, (Number(productData.stockQuantity) || 0) - Number(item.quantity));
                
                let updatedBatches = Array.isArray(productData.batches) ? [...productData.batches] : [];
                // Match batch by price and quantity
                const batchIdx = updatedBatches.findIndex(b => 
                  Number(b.purchasePrice || b.price) === Number(item.purchasePrice) && 
                  Number(b.quantity) === Number(item.quantity)
                );
                
                if (batchIdx > -1) {
                  updatedBatches.splice(batchIdx, 1);
                }

                batch.update(productRef, {
                  stockQuantity: newStock,
                  batches: updatedBatches
                });
              }
            }
          }
        }
        
        batch.delete(purchaseRef);
      } else if (txToDelete.type === 'payment') {
        const paymentRef = getDocRef(user.uid, 'supplierPayments', txToDelete.id);
        const amountToRevert = Number(txToDelete.amount) || 0;
        
        // Revert supplier balance
        batch.update(supplierRef, {
          dueAmount: (Number(currentSupp.dueAmount) || 0) + amountToRevert
        });
        
        batch.delete(paymentRef);
      }

      await batch.commit();
      await fetchAllData();
      
      const updatedSupp = suppliers.find(s => s.id === selectedSupplier.id) || currentSupp;
      handleViewHistory(updatedSupp);
      
      setIsTxDeleteConfirmOpen(false);
      setTxToDelete(null);
      alert('Transaction deleted and balances adjusted.');
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const confirmDelete = async () => {
    if (!supplierToDelete || !user) return;
    try {
      await deleteItem(user.uid, 'suppliers', supplierToDelete.id);
      await fetchAllData();
      setIsDeleteModalOpen(false);
      setSupplierToDelete(null);
    } catch (error) {
      alert('Failed to delete supplier');
    }
  };

  const handleOpenPurchase = (supplier: any) => {
    setSelectedSupplier(supplier);
    setPurchaseItems([{ productId: '', name: '', category: '', purchasePrice: 0, quantity: 0 }]);
    setMemoImage(null);
    setIsManualEntry(false);
    setManualTotal(0);
    setPaidAmount(0);
    setIsPurchaseModalOpen(true);
  };

  const handleAddItem = () => {
    setPurchaseItems([...purchaseItems, { productId: '', name: '', category: '', purchasePrice: 0, quantity: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (purchaseItems.length > 1) {
      setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...purchaseItems];
    
    // Handle numeric fields safely
    let processedValue = value;
    if ((field === 'purchasePrice' || field === 'quantity') && value === '') {
      processedValue = '';
    } else if (field === 'purchasePrice') {
      processedValue = parseFloat(value);
      if (isNaN(processedValue)) processedValue = 0;
    } else if (field === 'quantity') {
      processedValue = parseInt(value);
      if (isNaN(processedValue)) processedValue = 0;
    }

    newItems[index] = { ...newItems[index], [field]: processedValue };
    
    // If selecting an existing product, auto-fill details
    if (field === 'productId' && value) {
      const prod = products.find(p => p.id === value);
      if (prod) {
        newItems[index].name = prod.name;
        newItems[index].category = prod.category;
        newItems[index].purchasePrice = prod.purchasePrice;
      }
    } else if (field === 'productId' && !value) {
      newItems[index].name = '';
      newItems[index].category = '';
      newItems[index].purchasePrice = 0;
    }
    
    setPurchaseItems(newItems);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMemoImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePurchaseSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !user) return;

    const totalAmount = isManualEntry 
      ? Number(manualTotal) 
      : purchaseItems.reduce((sum, item) => sum + (item.purchasePrice * item.quantity), 0);
    
    if (totalAmount <= 0) {
      alert('Total amount must be greater than 0');
      return;
    }

    const purchaseDue = totalAmount - paidAmount;
    
    try {
      const batch = writeBatch(db);
      
      // 1. Record Purchase
      const purchaseRef = doc(getCollectionRef(user.uid, 'purchases'));
      batch.set(purchaseRef, {
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        items: isManualEntry ? [] : purchaseItems,
        totalAmount,
        paidAmount,
        dueAmount: purchaseDue,
        memoImage,
        isManualEntry,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      // 2. Update Supplier Due
      const supplierRef = getDocRef(user.uid, 'suppliers', selectedSupplier.id);
      batch.update(supplierRef, {
        dueAmount: (Number(selectedSupplier.dueAmount) || 0) + purchaseDue
      });

      // 3. Update Products Stock (Only if not manual entry and items exist)
      if (!isManualEntry) {
        for (const item of purchaseItems) {
          if (!item.name || item.quantity <= 0) continue;

          if (item.productId) {
            const productRef = getDocRef(user.uid, 'products', item.productId);
            const currentProd = products.find(p => p.id === item.productId);
            if (currentProd) {
              const newBatch = {
                price: Number(item.purchasePrice),
                purchasePrice: Number(item.purchasePrice), // Alias for compatibility
                quantity: Number(item.quantity),
                date: new Date().toISOString()
              };
              
              const existingBatches = (Array.isArray(currentProd.batches) ? currentProd.batches : [
                { 
                  price: Number(currentProd.purchasePrice), 
                  purchasePrice: Number(currentProd.purchasePrice),
                  quantity: Number(currentProd.stockQuantity), 
                  date: currentProd.createdAt || new Date().toISOString() 
                }
              ]).filter((b: any) => (Number(b.quantity) || 0) > 0);

              const targetPrice = Number(item.purchasePrice);
              const matchingBatchIdx = existingBatches.findIndex((b: any) => 
                Number(b.purchasePrice ?? b.price) === targetPrice
              );

              let updatedBatches: any[];
              if (matchingBatchIdx > -1) {
                updatedBatches = existingBatches.map((b: any, idx: number) => {
                  if (idx === matchingBatchIdx) {
                    return {
                      ...b,
                      quantity: Number(b.quantity) + Number(item.quantity)
                    };
                  }
                  return b;
                });
              } else {
                updatedBatches = [...existingBatches, newBatch];
              }

              batch.update(productRef, {
                stockQuantity: (Number(currentProd.stockQuantity) || 0) + Number(item.quantity),
                purchasePrice: Number(item.purchasePrice), // Latest price as default
                supplierId: selectedSupplier.id,
                batches: updatedBatches
              });
            }
          } else {
            // New Product
            const newProductRef = doc(getCollectionRef(user.uid, 'products'));
            const initialBatch = {
              price: Number(item.purchasePrice),
              purchasePrice: Number(item.purchasePrice),
              quantity: Number(item.quantity),
              date: new Date().toISOString()
            };
            batch.set(newProductRef, {
              name: item.name,
              category: item.category || 'General',
              purchasePrice: Number(item.purchasePrice),
              sellingPrice: Number(item.purchasePrice) * 1.2,
              stockQuantity: Number(item.quantity),
              supplierId: selectedSupplier.id,
              minStock: 5,
              unit: 'pcs',
              batches: [initialBatch],
              createdAt: new Date().toISOString()
            });
          }
        }
      }

      await batch.commit();
      await fetchAllData();
      setIsPurchaseModalOpen(false);
      setPaidAmount(0);
      setManualTotal(0);
      alert('Purchase recorded successfully!');
    } catch (error) {
      console.error('Error recording purchase:', error);
      alert('Failed to record purchase');
    }
  };

  const getSupplierPurchases = (supplierId: string) => {
    return purchases.filter(p => String(p.supplierId) === String(supplierId)).reverse();
  };

  const getSupplierProducts = (supplierId: string) => {
    return products.filter(p => String(p.supplierId) === String(supplierId));
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.companyName.toLowerCase().includes(search.toLowerCase())
  );

  const totalSuppliersDue = suppliers.reduce((sum, s) => sum + (s.dueAmount || 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage your supply chain and partner companies.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="bg-red-50 border border-red-100 px-4 py-2 rounded-lg flex flex-col items-end">
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Total Suppliers Due</span>
            <span className="text-xl font-black text-red-600">৳{totalSuppliersDue.toLocaleString()}</span>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Add Supplier
          </button>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Search Suppliers" 
          className="w-full rounded-lg border bg-card py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:italic"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-polish h-48 animate-pulse bg-slate-50 border border-slate-100" />
          ))
        ) : filteredSuppliers.length > 0 ? (
          filteredSuppliers.map((supplier) => (
            <motion.div 
              layout
              key={supplier.id}
              className="card-polish overflow-hidden group"
            >
              <div className="bg-slate-50 p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-blue-500 shadow-xl shadow-slate-900/10">
                    <Truck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 tracking-tight">{supplier.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mt-1">
                      <Building2 className="h-3 w-3" />
                      {supplier.companyName}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Payable Due</span>
                    <span className="text-lg font-black text-red-600">৳{(supplier.dueAmount || 0).toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setSupplierToDelete(supplier);
                      setIsDeleteModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-all shadow-sm"
                    title="Delete Supplier"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
                  <Phone className="h-4 w-4 text-slate-300" />
                  <span>{supplier.phone}</span>
                </div>
                <div className="flex items-start gap-3 text-xs font-bold text-slate-400 truncate">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-slate-300" />
                  <span className="tracking-tight">{supplier.address}</span>
                </div>
              </div>

              <div className="bg-slate-50/50 px-6 py-4 flex items-center justify-between border-t border-slate-100 flex-wrap gap-y-4">
                <button 
                  onClick={() => handleOpenPurchase(supplier)}
                  className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline flex items-center gap-2"
                >
                  <PlusCircle className="h-3.5 w-3.5" /> Record Purchase
                </button>
                <button 
                  onClick={() => handlePayDue(supplier)}
                  className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:underline flex items-center gap-2"
                >
                  <PlusCircle className="h-3.5 w-3.5" /> Pay Due
                </button>
                <button 
                  onClick={() => handleViewHistory(supplier)}
                  className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline flex items-center gap-2"
                >
                  <PackageCheck className="h-4 w-4" /> View History
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <Truck className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">No suppliers found</h3>
          </div>
        )}
      </div>

      {isPurchaseModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto pt-20 pb-20">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Record Bulk Purchase</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Supplier: {selectedSupplier.name} ({selectedSupplier.companyName})</p>
              </div>
              <button onClick={() => setIsPurchaseModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePurchaseSave} className="space-y-6">
              {/* Toggle Entry Mode */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <input 
                  type="checkbox" 
                  id="entryMode"
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={isManualEntry}
                  onChange={e => setIsManualEntry(e.target.checked)}
                />
                <label htmlFor="entryMode" className="text-[11px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none">
                  Total Bill Only (No Individual Products)
                </label>
              </div>

              {!isManualEntry ? (
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 pb-2">
                  {purchaseItems.map((item, index) => (
                    <div key={index} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-4 relative">
                      {purchaseItems.length > 1 && (
                        <button 
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="absolute right-2 top-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Product Selection</label>
                          <select 
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={item.productId}
                            onChange={e => handleItemChange(index, 'productId', e.target.value)}
                          >
                            <option value="">+ Add New Product</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Product Name</label>
                          <input 
                            required={!isManualEntry}
                            disabled={!!item.productId}
                            type="text" 
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                            value={item.name}
                            onChange={e => handleItemChange(index, 'name', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Category</label>
                          <input 
                            required={!isManualEntry}
                            disabled={!!item.productId}
                            type="text" 
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                            value={item.category}
                            onChange={e => handleItemChange(index, 'category', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Purch. Price</label>
                          <input 
                            required={!isManualEntry}
                            type="number" 
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={item.purchasePrice === 0 ? '' : (item.purchasePrice || '')}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={e => handleItemChange(index, 'purchasePrice', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Quantity</label>
                          <input 
                            required={!isManualEntry}
                            type="number" 
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={item.quantity === 0 ? '' : (item.quantity || '')}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    type="button"
                    onClick={handleAddItem}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/30 transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <PlusCircle className="h-4 w-4" /> Add Another Item
                  </button>
                </div>
              ) : (
                <div className="p-6 rounded-2xl border-2 border-dashed border-blue-100 bg-blue-50/20 space-y-4">
                   <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Manual Bill Amount (Total)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300">৳</span>
                      <input 
                        type="number"
                        className="w-full h-16 pl-12 pr-4 rounded-xl border border-slate-200 bg-white text-3xl font-black outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        value={manualTotal === 0 ? '' : manualTotal}
                        onFocus={e => e.target.select()}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={e => setManualTotal(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wide italic">* Stock entries will not be updated in manual mode.</p>
                   </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Transaction Memo (Image)</label>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 cursor-pointer hover:bg-slate-100 transition-all">
                      <Package className="h-4 w-4" />
                      <span className="text-xs font-black uppercase tracking-widest">Upload Memo</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                    {memoImage && (
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                        <img src={memoImage} className="w-full h-full object-cover" />
                        <button 
                          type="button" 
                          onClick={() => setMemoImage(null)}
                          className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl-lg"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 text-right">Paid Amount</label>
                    <input 
                      type="number"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xl font-black text-green-600 text-right outline-none focus:ring-2 focus:ring-green-500/20"
                      value={paidAmount === 0 ? '' : paidAmount}
                      onFocus={e => e.target.select()}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex flex-col justify-end items-end">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Bill Amount</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">
                      ৳{(isManualEntry ? manualTotal : purchaseItems.reduce((sum, item) => sum + (item.purchasePrice * item.quantity), 0)).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col justify-end items-end">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Generated Due</p>
                    <p className="text-xl font-black text-red-600 tracking-tighter">
                      ৳{((isManualEntry ? manualTotal : purchaseItems.reduce((sum, item) => sum + (item.purchasePrice * item.quantity), 0)) - paidAmount).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-500/20"
                >
                  Record Transaction
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isHistoryOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-8 shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Supply History & Memos</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedSupplier.name} ({selectedSupplier.companyName})</p>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-8">
              {supplierTransactions.length > 0 ? (
                supplierTransactions.map(item => (
                  <div key={item.id} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    {item.type === 'purchase' ? (
                      <div>
                        <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-100">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-white rounded-lg border border-slate-200 text-blue-600">
                              <Truck className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Stock Purchase</p>
                              <p className="text-sm font-bold text-slate-900">{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Amount</p>
                              <p className="text-xl font-black text-slate-900 tracking-tighter">৳{item.totalAmount.toLocaleString()}</p>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleEditTx(item)}
                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-blue-600 transition-all shadow-sm"
                                title="Edit Purchase"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteTx(item)}
                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-600 transition-all shadow-sm"
                                title="Delete Purchase"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Items Supplied</h4>
                            <div className="space-y-3">
                              {item.items.map((prod: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{prod.name}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">{prod.category}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-black text-slate-900">{prod.quantity} pcs</p>
                                    <p className="text-[10px] text-slate-400 font-bold">৳{prod.purchasePrice}/pc</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                                <div className="text-xs font-bold text-slate-500">Total: <span className="text-slate-900 font-black">৳{item.totalAmount?.toLocaleString()}</span></div>
                                <div className="flex gap-6">
                                    <div className="text-xs font-bold text-slate-500">Paid: <span className="text-emerald-600">৳{item.paidAmount?.toLocaleString()}</span></div>
                                    <div className="text-xs font-bold text-slate-500">Due: <span className="text-rose-600">৳{item.dueAmount?.toLocaleString()}</span></div>
                                </div>
                            </div>
                          </div>
                          
                          {item.memoImage && (
                            <div>
                              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Transaction Memo</h4>
                              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 relative group">
                                <img src={item.memoImage} className="w-full h-auto max-h-[300px] object-contain mx-auto transition-transform group-hover:scale-105" />
                                <a 
                                  href={item.memoImage} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-black uppercase tracking-widest"
                                >
                                  Click to Expand
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-rose-50/30 p-6 flex items-center justify-between flex-wrap gap-6">
                         <div className="flex items-center gap-4">
                            <div className="p-3 bg-white rounded-xl border border-rose-100 text-rose-600 shadow-sm">
                              <PlusCircle className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase text-rose-400 tracking-widest">Payment to Supplier</p>
                                <p className="text-sm font-bold text-slate-900">{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                <p className="text-[11px] text-slate-500 font-medium italic mt-1">"{item.note}"</p>
                            </div>
                         </div>
                         
                         {item.memoImage && (
                            <div className="w-20 h-20 rounded-lg overflow-hidden border border-rose-100 bg-white relative group shrink-0">
                               <img src={item.memoImage} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                               <a 
                                 href={item.memoImage} 
                                 target="_blank" 
                                 rel="noreferrer"
                                 className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[8px] text-white font-black uppercase tracking-widest"
                               >
                                 View
                               </a>
                            </div>
                         )}

                         <div className="text-right flex flex-col items-end gap-2 ml-auto">
                            <div>
                               <p className="text-[9px] font-black uppercase text-rose-400 tracking-widest">Amount Paid</p>
                               <p className="text-2xl font-black text-rose-600 tracking-tighter">- ৳{item.amount.toLocaleString()}</p>
                               <p className="text-[10px] text-slate-400 font-bold mt-1">New Balance: ৳{item.newDue.toLocaleString()}</p>
                            </div>
                            <div className="flex gap-1">
                               <button 
                                 onClick={() => handleEditTx(item)}
                                 className="p-2 rounded-lg bg-white border border-rose-100 text-rose-300 hover:text-blue-600 transition-all shadow-sm"
                                 title="Edit Payment"
                               >
                                 <Pencil className="h-3.5 w-3.5" />
                               </button>
                               <button 
                                 onClick={() => handleDeleteTx(item)}
                                 className="p-2 rounded-lg bg-white border border-rose-100 text-rose-300 hover:text-red-600 transition-all shadow-sm"
                                 title="Delete Payment"
                               >
                                 <Trash2 className="h-3.5 w-3.5" />
                               </button>
                            </div>
                         </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Package className="h-16 w-16 text-slate-100" />
                  <div className="text-center">
                    <p className="text-slate-400 font-bold italic text-lg">No purchase history yet.</p>
                    <button 
                      onClick={() => {
                        setIsHistoryOpen(false);
                        handleOpenPurchase(selectedSupplier);
                      }}
                      className="mt-4 rounded-lg bg-blue-600 px-6 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                    >
                      Record first purchase
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="pt-6 shrink-0">
              <button 
                onClick={() => setIsHistoryOpen(false)}
                className="w-full rounded-lg border border-slate-200 px-4 py-4 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-bold"
              >
                Close History
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isPaymentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Payable Deposit</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Supplier: {selectedSupplier.name}</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Outstanding</p>
                  <p className="text-xl font-black text-slate-900">৳{selectedSupplier.dueAmount?.toLocaleString()}</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Remaining After</p>
                  <p className="text-xl font-black text-rose-600">৳{Math.max(0, (selectedSupplier.dueAmount || 0) - paymentAmount).toLocaleString()}</p>
               </div>
            </div>
            
            <form onSubmit={handlePaymentSave} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Payment Amount</label>
                <input 
                  required
                  type="number" 
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xl font-black text-rose-600 outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                  value={paymentAmount === 0 ? '' : paymentAmount}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Note (Optional)</label>
                <textarea 
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  rows={2}
                  placeholder="Payment receipt number, bank info etc..."
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Payment Memo (Image)</label>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 cursor-pointer hover:bg-slate-100 transition-all">
                    <Package className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-widest">Upload Memo</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                  </label>
                  {memoImage && (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                      <img src={memoImage} className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setMemoImage(null)}
                        className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl-lg"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="pt-6 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 rounded-lg bg-rose-600 px-4 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-500/20"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
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
                  ID: #{editingTx.id.slice(-6)} • {editingTx.type === 'purchase' ? 'Stock Purchase' : 'Supplier Payment'}
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

                {editingTx.type === 'purchase' ? (
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
                        className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2.5 text-sm font-black text-rose-600 outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={editingTx.amount === 0 ? '' : editingTx.amount}
                        onFocus={e => e.target.select()}
                        onChange={e => setEditingTx({ ...editingTx, amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {editingTx.type === 'purchase' && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Already Paid</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">৳</span>
                    <input 
                      type="number"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2.5 text-sm font-black text-emerald-600 outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={editingTx.paidAmount === 0 ? '' : editingTx.paidAmount}
                      onFocus={e => e.target.select()}
                      onChange={e => setEditingTx({ ...editingTx, paidAmount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider pt-1">
                    <span className="text-slate-400">Calculated Due:</span>
                    <span className="text-rose-600">৳{(editingTx.totalAmount - editingTx.paidAmount).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {editingTx.type === 'payment' && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Note</label>
                  <textarea 
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 resize-none h-24"
                    value={editingTx.note || ''}
                    onChange={e => setEditingTx({ ...editingTx, note: e.target.value })}
                    placeholder="Describe this payment..."
                  />
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">New Supplier Profile</h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Contact Name</label>
                <input 
                  required
                  type="text" 
                  placeholder="Supplier Name"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Company Name</label>
                <input 
                  required
                  type="text" 
                  placeholder="Company Name"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={formData.companyName}
                  onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Phone</label>
                <input 
                  required
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
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  rows={2}
                  placeholder="Address"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Initial Due Amount</label>
                <input 
                  type="number" 
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  value={formData.dueAmount === 0 ? '' : formData.dueAmount}
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
                  Save Supplier
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Transaction Delete Confirmation Modal */}
      {isTxDeleteConfirmOpen && txToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl text-center"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 mb-6">
              <Trash2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Delete Transaction?</h2>
            <p className="text-sm text-slate-500 mb-8 font-medium italic px-4">
              "This will delete the <b>{txToDelete.type}</b> record and revert ৳<b>{txToDelete.type === 'purchase' ? txToDelete.totalAmount.toLocaleString() : txToDelete.amount.toLocaleString()}</b> from the supplier balance. Product stock will also be adjusted."
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsTxDeleteConfirmOpen(false);
                  setTxToDelete(null);
                }}
                className="flex-1 rounded-xl border border-slate-200 py-4 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-bold"
              >
                No, Keep
              </button>
              <button 
                onClick={confirmDeleteTx}
                className="flex-1 rounded-xl bg-red-600 py-4 text-xs font-black text-white uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 font-bold"
              >
                Yes, Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {isDeleteModalOpen && supplierToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
              <Trash2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Delete Supplier?</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium italic">
              "Are you sure you want to delete <b>{supplierToDelete.name}</b> from <b>{supplierToDelete.companyName}</b>? This cannot be undone."
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSupplierToDelete(null);
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
    </div>
  );
};
