import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Calculator,
  User,
  Package,
  CheckCircle,
  Clock,
  Printer,
  CreditCard,
  Calendar,
  X,
  Loader2
} from 'lucide-react';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../contexts/AuthContext';
import { 
  fetchItems, 
  createItem, 
  updateItem, 
  deleteItem, 
  getCollectionRef,
  getDocRef,
  fetchItemById
} from '../services/firestoreService';
import { cn } from '../lib/utils';
import { writeBatch, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../services/firestoreService';

export const SalesPage = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    customerId: '',
    items: [{ productId: '', quantity: 1, price: 0 }],
    receivedAmount: 0,
    remarks: '',
    isHistorical: false,
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user, isModalOpen]);

  const fetchAllData = async () => {
    if (!user) return;
    try {
      const [prods, custs, sets, sls, exps] = await Promise.all([
        fetchItems(user.uid, 'products'),
        fetchItems(user.uid, 'customers'),
        fetchItems(user.uid, 'settings').then(res => res[0] || null),
        fetchItems(user.uid, 'sales'),
        fetchItems(user.uid, 'expenses')
      ]);
      setProducts(prods);
      setCustomers(custs);
      setSettings(sets);
      const sortedSales = [...sls].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setSales(sortedSales);
      // Store expenses locally if needed for analytics cards
      (window as any)._allExpenses = exps; 
    } catch (error) {
      console.error('Error fetching sales data:', error);
    }
  };

  const fetchSales = async () => {
    if (!user) return;
    try {
      const sls = await fetchItems(user.uid, 'sales');
      const sortedSales = [...sls].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setSales(sortedSales);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const getMonthOptions = () => {
    const months = new Set<string>();
    sales.forEach(sale => {
      months.add(new Date(sale.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
    });
    return ["All Time", ...Array.from(months).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())];
  };

  const getFilteredBreakdown = () => {
    // Set to local midnight of May 14, 2026 to be safe
    const PROFIT_START_DATE = new Date(2026, 4, 14, 0, 0, 0); 
    const expenses = (window as any)._allExpenses || [];
    
    if (selectedMonthFilter === "All Time") {
      let total = 0;
      let profit = 0;
      sales.forEach(s => {
        total += s.totalAmount;
        if (new Date(s.date) >= PROFIT_START_DATE) {
          profit += (s.profit || 0);
        }
      });
      
      // Subtract all expenses for Net Profit (only those since PROFIT_START_DATE)
      const totalExps = expenses
        .filter((e: any) => new Date(e.date) >= PROFIT_START_DATE)
        .reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);
      return [{ name: "All Time", total, profit: profit - totalExps }];
    }

    const filteredSales = sales.filter(sale => {
      const monthYear = new Date(sale.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return monthYear === selectedMonthFilter;
    });

    let monthSalesTotal = 0;
    let monthSalesProfit = 0;
    filteredSales.forEach(s => {
      monthSalesTotal += s.totalAmount;
      if (new Date(s.date) >= PROFIT_START_DATE) {
        monthSalesProfit += (s.profit || 0);
      }
    });

      // Subtract expenses for the specific month (only those since PROFIT_START_DATE)
      const monthExps = expenses.filter((e: any) => {
        const d = new Date(e.date);
        const expMonthYear = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return expMonthYear === selectedMonthFilter && d >= PROFIT_START_DATE;
      }).reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);

    return [{ 
      name: selectedMonthFilter, 
      total: monthSalesTotal, 
      profit: monthSalesProfit - monthExps 
    }];
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', quantity: 1, price: 0 }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    
    let processedValue = value;
    if (field === 'quantity') {
      processedValue = value === '' ? '' : (parseInt(value) || 0);
    } else if (field === 'price') {
      processedValue = value === '' ? '' : (parseFloat(value) || 0);
    }

    newItems[index] = { ...newItems[index], [field]: processedValue };
    
    // Auto-fill price if product changes disabled as per user request
    if (field === 'productId') {
      // Logic removed
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<any>(null);

  const calculateTotal = () => {
    return formData.items.reduce((acc, item) => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.price) || 0;
      return acc + (p * q);
    }, 0);
  };

  const calculateProfit = () => {
    return formData.items.reduce((acc, item) => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const q = Number(item.quantity) || 0;
        const p = Number(item.price) || 0;
        const purchase = Number(product.purchasePrice) || 0;
        return acc + ((p - purchase) * q);
      }
      return acc;
    }, 0);
  };

  const handleDeleteSale = async () => {
    if (!saleToDelete || !user) return;
    
    try {
      const batch = writeBatch(db);
      
      // 1. Restore Stock (if not historical)
      if (!saleToDelete.isHistorical) {
        for (const item of saleToDelete.items) {
          const productRef = getDocRef(user.uid, 'products', item.productId);
          const product = products.find(p => p.id === item.productId);
          if (product) {
            batch.update(productRef, {
              stockQuantity: (Number(product.stockQuantity) || 0) + Number(item.quantity)
            });
          }
        }
      }
      
      // 2. Revert Customer Due
      if (saleToDelete.customerId && saleToDelete.dueAmount > 0) {
        const customerRef = getDocRef(user.uid, 'customers', saleToDelete.customerId);
        const customer = customers.find(c => c.id === saleToDelete.customerId);
        if (customer) {
          batch.update(customerRef, {
            dueAmount: Math.max(0, (Number(customer.dueAmount) || 0) - saleToDelete.dueAmount)
          });
        }
      }
      
      // 3. Delete Sale
      const saleRef = getDocRef(user.uid, 'sales', saleToDelete.id);
      batch.delete(saleRef);
      
      await batch.commit();
      await fetchSales();
      setIsDeleteModalOpen(false);
      setSaleToDelete(null);
      alert('Sale deleted and inventory/balances reverted.');
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Failed to delete sale');
    }
  };

  const formatSafeNumber = (num: any) => {
    const val = Number(num);
    return isNaN(val) ? "0.00" : val.toLocaleString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      if (isNewCustomer) {
        if (!newCustomerName) {
          alert('Please provide new customer name');
          setIsSubmitting(false);
          return;
        }
      } else if (!formData.customerId && !formData.isHistorical) {
        // Allow walk-in if historical, otherwise require customer
        alert('Please select a customer or mark as walk-in');
        setIsSubmitting(false);
        return;
      }
      
      const batch = writeBatch(db);
      let finalCustomerId = formData.customerId;
      let finalCustomerName = '';

      const totalAmount = calculateTotal();
      const profit = calculateProfit();
      const dueAmount = Math.max(0, totalAmount - Number(formData.receivedAmount));

      // 1. Create New Customer if needed
      if (isNewCustomer) {
        const newCustomerRef = doc(getCollectionRef(user.uid, 'customers'));
        finalCustomerId = newCustomerRef.id;
        finalCustomerName = newCustomerName;
        batch.set(newCustomerRef, {
          name: newCustomerName,
          phone: newCustomerPhone,
          address: newCustomerAddress,
          dueAmount: dueAmount, // Set initial due from this sale
          createdAt: new Date().toISOString()
        });
      } else {
        const customer = customers.find(c => c.id === finalCustomerId);
        if (customer) {
          finalCustomerName = customer.name;
        } else {
          finalCustomerName = 'Walk-in Customer';
        }
      }

      // 2. Create Sale Record
      const saleRef = doc(getCollectionRef(user.uid, 'sales'));
      const saleItems = [];
      let totalPurchaseCost = 0;

      // 3. Update products stock and batches (if not historical)
      if (!formData.isHistorical) {
        for (const item of formData.items) {
          const productRef = getDocRef(user.uid, 'products', item.productId);
          const product = products.find(p => p.id === item.productId);
          if (product) {
            let remainingToSell = Number(item.quantity);
            const updatedBatches = [...(Array.isArray(product.batches) ? product.batches : [
              { price: Number(product.purchasePrice), purchasePrice: Number(product.purchasePrice), quantity: Number(product.stockQuantity), date: product.createdAt || new Date(0).toISOString() }
            ])];

            let costForThisItem = 0;
            // FIFO Deduction
            for (let i = 0; i < updatedBatches.length && remainingToSell > 0; i++) {
              const batchQty = Number(updatedBatches[i].quantity);
              if (batchQty > 0) {
                const deduction = Math.min(batchQty, remainingToSell);
                updatedBatches[i].quantity = batchQty - deduction;
                remainingToSell -= deduction;
                costForThisItem += deduction * Number(updatedBatches[i].purchasePrice || updatedBatches[i].price || 0);
              }
            }
            
            // If we sold more than we had in batches, use the latest price for the remainder
            if (remainingToSell > 0) {
              costForThisItem += remainingToSell * Number(product.purchasePrice);
            }

            totalPurchaseCost += costForThisItem;
            
            batch.update(productRef, {
              stockQuantity: Math.max(0, (Number(product.stockQuantity) || 0) - Number(item.quantity)),
              batches: updatedBatches
            });

            saleItems.push({
              ...item,
              name: product.name,
              purchaseCost: costForThisItem // Recorded for accurate individual profit
            });
          }
        }
      } else {
        // Historical - just map names
        for (const item of formData.items) {
          const product = products.find(p => p.id === item.productId);
          saleItems.push({
            ...item,
            name: product?.name || 'Unknown Product'
          });
        }
      }

      const finalProfit = totalAmount - totalPurchaseCost;

      const saleData: any = {
        customerName: finalCustomerName,
        items: saleItems,
        totalAmount,
        receivedAmount: Number(formData.receivedAmount) || 0,
        dueAmount,
        profit: formData.isHistorical ? calculateProfit() : finalProfit,
        remarks: formData.remarks || '',
        isHistorical: formData.isHistorical,
        date: new Date(formData.date).toISOString(),
        createdAt: new Date().toISOString()
      };

      if (finalCustomerId) {
        saleData.customerId = finalCustomerId;
      }

      batch.set(saleRef, saleData);

      // 4. Update customer due balance (Only for existing customers, new ones already handled)
      if (dueAmount > 0 && !isNewCustomer && finalCustomerId) {
        const customerRef = getDocRef(user.uid, 'customers', finalCustomerId);
        const customer = customers.find(c => c.id === finalCustomerId);
        if (customer) {
          const currentDue = (Number(customer?.dueAmount) || 0);
          batch.update(customerRef, {
            dueAmount: currentDue + dueAmount
          });
        }
      }

      await batch.commit();
      
      setIsModalOpen(false);
      setFormData({ 
        customerId: '', 
        items: [{ productId: '', quantity: 1, price: 0 }], 
        receivedAmount: 0,
        remarks: '',
        isHistorical: false,
        date: new Date().toISOString().split('T')[0]
      });
      setIsNewCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
      await fetchAllData();
      alert('Sale created successfully!');
    } catch (error) {
      console.error('Error creating sale:', error);
      try {
        handleFirestoreError(error, OperationType.WRITE, 'sales-batch');
      } catch (innerError: any) {
        alert(`Failed to process sale: ${innerError.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateReceipt = (existingSale?: any) => {
    if (!settings) return alert('Shop settings not loaded yet.');
    
    let saleData: any;
    let customer: any;
    let invoiceNo: string;
    let dateStr: string;

    if (existingSale) {
      saleData = existingSale;
      // For existing sales, we might need to find the customer details or use the name saved in the sale
      const foundCustomer = customers.find(c => c.id === existingSale.customerId);
      customer = foundCustomer || { name: existingSale.customerName, phone: 'N/A', address: 'N/A' };
      invoiceNo = `#INV-${existingSale.id.slice(-6)}`;
      dateStr = new Date(existingSale.date).toLocaleDateString();
    } else {
      // Logic for new sale creation receipt (pre-save)
      const total = calculateTotal();
      const receivedAmt = Number(formData.receivedAmount) || 0;
      const dueAmt = Math.max(0, total - receivedAmt);
      
      const foundCustomer = isNewCustomer 
        ? { name: newCustomerName, phone: newCustomerPhone, address: newCustomerAddress || 'N/A' }
        : customers.find(c => c.id === formData.customerId) || { name: 'Walk-in Customer', phone: 'N/A', address: 'N/A' };
      
      customer = foundCustomer;
      invoiceNo = `#QT-${Date.now().toString().slice(-6)}`;
      dateStr = new Date().toLocaleDateString();
      
      const saleItems = formData.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          ...item,
          name: product?.name || 'Unknown Product'
        };
      });

      saleData = {
        items: saleItems,
        totalAmount: total,
        receivedAmount: receivedAmt,
        dueAmount: dueAmt
      };
    }

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(33, 150, 243); // Blue
    doc.text(settings.shopName, 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(settings.address, 105, 27, { align: 'center' });
    doc.text(`Phone: ${settings.phone} | Email: ${settings.email}`, 105, 32, { align: 'center' });
    
    doc.setDrawColor(200);
    doc.line(20, 38, 190, 38);
    
    // Customer Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('BILL TO:', 20, 50);
    doc.setFontSize(10);
    doc.text(`Name: ${customer.name}`, 20, 57);
    doc.text(`Phone: ${customer.phone || 'N/A'}`, 20, 62);
    doc.text(`Address: ${customer.address || 'N/A'}`, 20, 67);
    
    doc.text('INVOICE DETAILS:', 140, 50);
    doc.text(`Invoice No: ${invoiceNo}`, 140, 57);
    doc.text(`Date: ${dateStr}`, 140, 62);
    
    // Table
    const tableItems = saleData.items.map((item: any, index: number) => {
      return [
        index + 1,
        item.name || 'Unknown Product',
        item.quantity,
        `Tk ${item.price.toLocaleString()}`,
        `Tk ${(item.price * item.quantity).toLocaleString()}`
      ];
    });

    autoTable(doc, {
      startY: 75,
      head: [['#', 'Description', 'Qty', 'Rate', 'Total']],
      body: tableItems,
      theme: 'grid',
      headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: {
        4: { halign: 'right' },
        3: { halign: 'right' },
        2: { halign: 'center' }
      }
    });

    const finalY = ((doc as any).lastAutoTable?.cursor?.y || 150) + 10;
    
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Summary:', 140, finalY);
    doc.text(`Sub Total: Tk ${saleData.totalAmount.toLocaleString()}`, 140, finalY + 7);
    doc.text(`Paid Amount: Tk ${saleData.receivedAmount.toLocaleString()}`, 140, finalY + 13);
    
    if (saleData.dueAmount > 0) {
      doc.setTextColor(220, 38, 38); // Red for due
    }
    doc.text(`Due Balance: Tk ${saleData.dueAmount.toLocaleString()}`, 140, finalY + 19);
    doc.setTextColor(0); // Reset to black

    doc.setFontSize(12);
    doc.setTextColor(33, 150, 243);
    doc.text(`Grand Total: Tk ${saleData.totalAmount.toLocaleString()}`, 140, finalY + 28);
    
    doc.setTextColor(150);
    doc.setFontSize(8);
    doc.text('Thank you for your business!', 105, 285, { align: 'center' });
    
    // Download the PDF
    doc.save(`receipt-${invoiceNo}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Sales & Invoicing</h1>
          <p className="text-slate-500 font-medium">Create invoices and track sales transactions.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
          <Calendar className="h-4 w-4 text-slate-400" />
          <select 
            value={selectedMonthFilter}
            onChange={(e) => setSelectedMonthFilter(e.target.value)}
            className="text-xs font-black uppercase tracking-widest text-slate-600 outline-none pr-4 cursor-pointer bg-transparent"
          >
            {getMonthOptions().map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create New Sale
        </button>
      </div>

      {/* Monthly Performance Analytics */}
      {sales.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {getFilteredBreakdown().map((month, i) => (
            <React.Fragment key={month.name}>
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card-polish p-6 bg-white border-b-4 border-b-blue-600"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{month.name} Net Sales</span>
                  <span className="text-3xl font-black text-slate-900 tracking-tighter">৳{month.total.toLocaleString()}</span>
                </div>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 + 0.1 }}
                className="card-polish p-6 bg-white border-b-4 border-b-green-600"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{month.name} Net Profit</span>
                  <span className="text-3xl font-black text-green-600 tracking-tighter">৳{month.profit.toLocaleString()}</span>
                </div>
              </motion.div>
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="grid gap-6">
        {sales.length > 0 ? (
          <div className="card-polish overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-sm">Recent Sales History</h3>
              <button className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline">Export CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b">
                  <tr>
                    <th className="px-6 py-3">Invoice ID</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Items</th>
                    <th className="px-6 py-3">Total Price</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.map((sale: any, i: number) => (
                    <React.Fragment key={sale.id}>
                      <tr 
                        className="hover:bg-slate-50 transition-colors cursor-pointer group/row"
                        onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)}
                      >
                        <td className="px-6 py-3 font-mono text-[10px] font-bold text-slate-400">#INV-{sale.id.slice(-6)}</td>
                        <td className="px-6 py-3 text-slate-500">{new Date(sale.date).toLocaleDateString()}</td>
                        <td className="px-6 py-3 font-bold group-hover/row:text-blue-600 transition-colors">{sale.customerName}</td>
                        <td className="px-6 py-3 text-slate-500 font-medium">{sale.items.length} products</td>
                        <td className="px-6 py-3 font-black">৳{sale.totalAmount.toLocaleString()}</td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                              sale.dueAmount > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                            )}>
                              {sale.dueAmount > 0 ? 'DUE' : 'PAID'}
                            </span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSaleToDelete(sale);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedSaleId === sale.id && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-blue-50/30">
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="space-y-2"
                            >
                              <div className="grid grid-cols-12 gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-blue-100">
                                <div className="col-span-6">Product Description</div>
                                <div className="col-span-2 text-center">Qty</div>
                                <div className="col-span-2 text-right">Price</div>
                                <div className="col-span-2 text-right">Subtotal</div>
                              </div>
                              {sale.items.map((item: any, idx: number) => {
                                const product = products.find(p => p.id === item.productId);
                                return (
                                  <div key={idx} className="grid grid-cols-12 gap-4 text-xs py-1 border-b border-blue-100/50 last:border-0 hover:bg-white/50 transition-colors rounded px-2 -mx-2">
                                    <div className="col-span-6 font-bold text-slate-700 truncate">
                                      {item.name || product?.name || 'Unknown Product'}
                                    </div>
                                    <div className="col-span-2 text-center font-bold text-slate-500">{item.quantity}</div>
                                    <div className="col-span-2 text-right font-medium text-slate-400">৳{item.price.toLocaleString()}</div>
                                    <div className="col-span-2 text-right font-black text-blue-600">৳{(item.price * item.quantity).toLocaleString()}</div>
                                  </div>
                                );
                              })}
                              <div className="flex justify-between items-end pt-2 border-t border-blue-100/50 mt-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    generateReceipt(sale);
                                  }}
                                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  Print Receipt
                                </button>
                                <div className="flex gap-8">
                                  <div className="text-right">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Received</span>
                                    <span className="text-xs font-black text-emerald-600">৳{sale.receivedAmount.toLocaleString()}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Balance Due</span>
                                    <span className="text-xs font-black text-red-600">৳{sale.dueAmount.toLocaleString()}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Profit</span>
                                    <span className="text-xs font-black text-blue-600">৳{sale.profit.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                              {sale.remarks && (
                                <div className="mt-4 p-3 rounded-lg bg-white/50 border border-blue-100/50">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Remarks / Internal Notes:</span>
                                  <p className="text-xs text-slate-600 italic">"{sale.remarks}"</p>
                                </div>
                              )}
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card-polish p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 border border-slate-100 shadow-sm">
               <Clock className="h-8 w-8 text-slate-300" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-2">No Transactions Found</h2>
            <p className="text-xs text-slate-400 font-bold max-w-xs mb-8 uppercase tracking-widest">
               Start a new sale to see invoice history and analytics
            </p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="rounded-lg bg-blue-600 px-6 py-3 text-[10px] font-black text-white uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:scale-105 transition-all"
            >
              Create New Invoice
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 md:p-10 shadow-2xl no-scrollbar"
          >
            <div className="flex items-center justify-between mb-6 md:mb-10">
              <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                  <Calculator className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate">Sales Invoice</h2>
                  <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 opacity-70">Active Session</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-all shrink-0">
                <X className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6 md:space-y-10">
              <div className="p-4 md:p-6 rounded-xl border border-slate-100 bg-slate-50/50 space-y-4 md:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500" 
                        checked={isNewCustomer}
                        onChange={e => setIsNewCustomer(e.target.checked)}
                      />
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">New Customer</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer group" title="Entry won't reduce current stock">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-amber-600 border-slate-300 focus:ring-amber-500" 
                        checked={formData.isHistorical}
                        onChange={e => setFormData({ ...formData, isHistorical: e.target.checked })}
                      />
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest leading-tight">Historical Data (No Stock Change)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Sale Date:</label>
                    <input 
                      type="date"
                      className="text-[11px] font-bold bg-white border border-slate-200 rounded px-2 py-1.5 outline-none w-full sm:w-auto"
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                </div>
                
                {isNewCustomer ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="relative group">
                      <User className="h-5 w-5 absolute left-4 top-[14px] md:top-3 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                      <input 
                        type="text"
                        placeholder="Customer Name"
                        className="w-full h-12 md:h-12 pl-12 pr-4 rounded-lg border border-slate-200 bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        value={newCustomerName}
                        onChange={e => setNewCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="relative group">
                      <Plus className="h-5 w-5 absolute left-4 top-[14px] md:top-3 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                      <input 
                        type="text"
                        placeholder="Phone Number (Optional)"
                        className="w-full h-12 md:h-12 pl-12 pr-4 rounded-lg border border-slate-200 bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        value={newCustomerPhone}
                        onChange={e => setNewCustomerPhone(e.target.value)}
                      />
                    </div>
                    <div className="relative group">
                      <Plus className="h-5 w-5 absolute left-4 top-[14px] md:top-3 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                      <input 
                        type="text"
                        placeholder="Address (Optional)"
                        className="w-full h-12 md:h-12 pl-12 pr-4 rounded-lg border border-slate-200 bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        value={newCustomerAddress}
                        onChange={e => setNewCustomerAddress(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative group">
                    <User className="h-5 w-5 absolute left-4 top-[14px] md:top-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                    <select 
                      required={!isNewCustomer}
                      className="w-full h-12 md:h-14 pl-10 md:pl-12 pr-4 rounded-lg border border-slate-200 bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-auto max-w-full"
                      value={formData.customerId}
                      onChange={e => setFormData({ ...formData, customerId: e.target.value })}
                    >
                      <option value="">Select Customer...</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name.length > 10 ? c.name.slice(0, 10) + '..' : c.name} — {c.phone.slice(-11)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      Order Breakdown
                   </h3>
                   <button 
                    type="button" 
                    onClick={addItem}
                    className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors uppercase tracking-widest"
                   >
                     + Add Product
                   </button>
                </div>
                
                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex flex-col md:grid md:grid-cols-12 gap-4 items-center bg-white p-4 rounded-lg border border-slate-100 shadow-sm relative group">
                      <div className="w-full md:col-span-6">
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Select SKU</label>
                        <select 
                          required
                          className="w-full h-11 md:h-10 px-3 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-auto max-w-full"
                          value={item.productId}
                          onChange={e => updateItem(index, 'productId', e.target.value)}
                        >
                          <option value="">Select SKU...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name.length > 12 ? p.name.slice(0, 12) + '..' : p.name} ({p.stockQuantity})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-full flex gap-4 md:col-span-5">
                        <div className="flex-1">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quantity</label>
                          <input 
                            required
                            type="number"
                            min="1"
                            className="w-full h-11 md:h-10 px-3 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                            value={item.quantity === 0 ? '' : (item.quantity ?? '')}
                            onFocus={e => e.target.select()}
                            onChange={e => updateItem(index, 'quantity', e.target.value)}
                          />
                        </div>
                        <div className="flex-[2]">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Rate (৳)</label>
                          <input 
                            required
                            type="number"
                            className="w-full h-11 md:h-10 px-3 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                            value={item.price === 0 ? '' : (item.price ?? '')}
                            onFocus={e => e.target.select()}
                            onChange={e => updateItem(index, 'price', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="w-full md:col-span-1 flex justify-end md:justify-center border-t md:border-t-0 pt-2 md:pt-0">
                        <button 
                          type="button" 
                          onClick={() => removeItem(index)}
                          disabled={formData.items.length === 1}
                          className="flex items-center gap-2 md:gap-0 md:w-8 md:h-8 px-4 md:px-0 py-2 md:py-0 rounded-full text-red-500 hover:bg-red-50 disabled:opacity-0 transition-colors text-[10px] md:text-sm font-bold uppercase md:lowercase"
                        >
                          <Trash2 className="h-4 w-4 shrink-0" />
                          <span className="md:hidden">Remove Item</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 border-t border-slate-100 pt-6 md:pt-8 items-start">
                <div className="card-polish p-6 border-l-4 border-l-blue-600 bg-slate-50/30">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Cash/Credit Received</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 md:top-2 text-2xl font-black text-slate-300">৳</span>
                    <input 
                      type="number"
                      placeholder="0.00"
                      className="w-full h-14 pl-12 pr-4 rounded-xl border border-slate-200 bg-white text-3xl font-black outline-none focus:border-blue-500 transition-all"
                      value={formData.receivedAmount === 0 ? '' : (formData.receivedAmount ?? '')}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const val = e.target.value;
                        setFormData({ ...formData, receivedAmount: val === '' ? '' : (parseFloat(val) || 0) });
                      }}
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center rounded-xl bg-red-600 p-6 text-white shadow-xl shadow-red-500/20">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest block opacity-70 mb-1">Payment Due:</span>
                      <span className="text-3xl md:text-4xl font-black tracking-tighter leading-none select-none">
                        ৳{formatSafeNumber(Math.max(0, calculateTotal() - (Number(formData.receivedAmount) || 0)))}
                      </span>
                    </div>
                    <CreditCard className="h-8 w-8 opacity-50 shrink-0" />
                  </div>

                  <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Gross Total:</span>
                    <span className="text-xl font-black text-slate-900 tracking-tighter">৳{formatSafeNumber(calculateTotal())}</span>
                  </div>

                  {formData.items.some(item => Number(item.price) > 0) && (
                    <div className="flex justify-between items-center px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none">Est. Profit:</span>
                      <span className="text-sm font-black text-emerald-600">
                        {calculateProfit() >= 0 ? '+' : ''}৳{formatSafeNumber(calculateProfit())}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Sale Remarks / Notes:</label>
                <textarea 
                  placeholder="Add any hints, customer notes or special instructions for this sale..."
                  className="w-full h-24 p-4 rounded-xl border border-slate-200 bg-slate-50/30 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                  value={formData.remarks}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                />
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-4">
                 <button 
                    type="button" 
                    onClick={generateReceipt}
                    className="flex-1 flex items-center justify-center gap-3 rounded-xl border-2 border-slate-200 py-4 md:py-5 text-xs font-black uppercase tracking-widest transition-all hover:bg-slate-50"
                 >
                    <Printer className="h-5 w-5 text-slate-400" />
                    Receipt
                 </button>
                 <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="flex-[2] flex items-center justify-center gap-3 rounded-xl bg-slate-900 py-4 md:py-5 text-xs font-black text-white uppercase tracking-widest transition-all hover:bg-black hover:scale-[1.01] active:scale-[0.98] shadow-2xl shadow-slate-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-blue-500" />
                  )}
                  {isSubmitting ? 'Processing...' : 'Authorize'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Sale Deletion Confirmation Modal */}
      {isDeleteModalOpen && saleToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl text-center"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 mb-6">
              <Trash2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tight uppercase tracking-widest">Delete Sale Entry?</h2>
            <p className="text-sm text-slate-500 mb-8 font-medium px-4">
              "This will delete the sale record, <b>restore products to stock</b> (if not a historical entry), and <b>revert the customer's due balance</b>. This action is irreversible."
            </p>
            
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSaleToDelete(null);
                }}
                className="flex-1 rounded-xl border border-slate-200 py-4 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-bold text-slate-600"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteSale}
                className="flex-1 rounded-xl bg-red-600 py-4 text-xs font-black text-white uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-500/30 font-bold"
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

