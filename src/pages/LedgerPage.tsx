import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchItems } from '../services/firestoreService';
import { 
  BookOpen, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar, 
  Filter, 
  Search, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  RefreshCw,
  FolderOpen,
  Eye
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export const LedgerPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [calcMode, setCalcMode] = useState<'after_adj' | 'all'>('after_adj');

  const fetchLedgerData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [
        allSales,
        allPayments,
        allPurchases,
        allSuppPayments,
        allExpenses,
        allCustomers,
        allSuppliers,
        settingsCol
      ] = await Promise.all([
        fetchItems(user.uid, 'sales'),
        fetchItems(user.uid, 'payments'),
        fetchItems(user.uid, 'purchases'),
        fetchItems(user.uid, 'supplierPayments'),
        fetchItems(user.uid, 'expenses'),
        fetchItems(user.uid, 'customers'),
        fetchItems(user.uid, 'suppliers'),
        fetchItems(user.uid, 'settings')
      ]);

      setSales(allSales);
      setPayments(allPayments);
      setPurchases(allPurchases);
      setSupplierPayments(allSuppPayments);
      setExpenses(allExpenses);
      setCustomers(allCustomers);
      setSuppliers(allSuppliers);
      setSettings(settingsCol[0] || null);
    } catch (error) {
      console.error('Error fetching ledger data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, [user]);

  // Maps for quick lookup of names
  const customerMap = customers.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {} as Record<string, string>);
  const supplierMap = suppliers.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {} as Record<string, string>);

  // Build the list of all transactions
  const buildLedger = () => {
    const list: any[] = [];
    const lastAdjustment = settings?.lastCashAdjustment || { amount: 0, date: new Date(0).toISOString() };

    // 1. Sales (Cash in = s.receivedAmount)
    sales.forEach(s => {
      const date = s.createdAt || s.date;
      if (Number(s.receivedAmount || 0) > 0) {
        list.push({
          id: s.id,
          date,
          type: 'sale',
          typeName: 'Sale',
          description: `Invoice #INV-${s.id.slice(-6)} (${s.customerName || 'Customer'}) - ${s.items?.length || 0} item(s)`,
          cashIn: Number(s.receivedAmount || 0),
          cashOut: 0,
        });
      }
    });

    // 2. Customer Payments (Cash in = p.amount)
    payments.forEach(p => {
      const date = p.createdAt || p.date;
      const custName = customerMap[p.customerId] || 'Customer';
      if (Number(p.amount || 0) > 0) {
        list.push({
          id: p.id,
          date,
          type: 'customer_payment',
          typeName: 'Customer Payment',
          description: `Due Collection - ${custName} ${p.note ? `(${p.note})` : ''}`,
          cashIn: Number(p.amount || 0),
          cashOut: 0,
        });
      }
    });

    // 3. Purchases (Cash out = pur.paidAmount)
    purchases.forEach(pur => {
      const date = pur.createdAt || pur.date;
      if (Number(pur.paidAmount || 0) > 0) {
        list.push({
          id: pur.id,
          date,
          type: 'purchase',
          typeName: 'Purchase Stock',
          description: `Stock Purchase - ${pur.supplierName || supplierMap[pur.supplierId] || 'Supplier'} ${pur.isManualEntry ? '(Manual)' : ''}`,
          cashIn: 0,
          cashOut: Number(pur.paidAmount || 0),
        });
      }
    });

    // 4. Supplier Payments (Cash out = sp.amount)
    supplierPayments.forEach(sp => {
      const date = sp.createdAt || sp.date;
      const suppName = supplierMap[sp.supplierId] || 'Supplier';
      if (Number(sp.amount || 0) > 0) {
        list.push({
          id: sp.id,
          date,
          type: 'supplier_payment',
          typeName: 'Supplier Payment',
          description: `Due Paid to Supplier - ${suppName} ${sp.note ? `(${sp.note})` : ''}`,
          cashIn: 0,
          cashOut: Number(sp.amount || 0),
        });
      }
    });

    // 5. Expenses (Cash out = e.amount)
    expenses.forEach(e => {
      const date = e.createdAt || e.date;
      if (Number(e.amount || 0) > 0) {
        list.push({
          id: e.id,
          date,
          type: 'expense',
          typeName: `Expense (${e.category || 'Others'})`,
          description: `Business Expense - ${e.category} ${e.note ? `(${e.note})` : ''}`,
          cashIn: 0,
          cashOut: Number(e.amount || 0),
        });
      }
    });

    // Sort chronologically ascending to calculate running balance
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Filter by adjustment date if in "after_adj" mode
    let filteredList = [...list];
    let initialBalance = 0;

    if (calcMode === 'after_adj') {
      initialBalance = Number(lastAdjustment.amount);
      filteredList = list.filter(t => new Date(t.date) > new Date(lastAdjustment.date));
    } else {
      initialBalance = 0; // Cumulative from zero/start
    }

    // Compute running balance
    let currentBalance = initialBalance;
    const computedLedgerList = filteredList.map(tx => {
      currentBalance = currentBalance + tx.cashIn - tx.cashOut;
      return {
        ...tx,
        runningBalance: currentBalance
      };
    });

    // Return reversed list for newest on top view, keeping the computed running progress
    return {
      ledger: computedLedgerList.reverse(),
      initialBalance,
      adjustmentDate: lastAdjustment.date,
      finalBalance: currentBalance
    };
  };

  const { ledger, initialBalance, adjustmentDate, finalBalance } = buildLedger();

  // Apply visual filters (type, date, search queries)
  const filteredLedger = ledger.filter(item => {
    // Type Filter
    if (filterType !== 'all') {
      if (filterType === 'cash_in' && item.cashIn === 0) return false;
      if (filterType === 'cash_out' && item.cashOut === 0) return false;
      if (filterType === 'sale' && item.type !== 'sale') return false;
      if (filterType === 'customer_payment' && item.type !== 'customer_payment') return false;
      if (filterType === 'purchase' && item.type !== 'purchase') return false;
      if (filterType === 'supplier_payment' && item.type !== 'supplier_payment') return false;
      if (filterType === 'expense' && item.type !== 'expense') return false;
    }

    // Date Filters
    if (startDate) {
      const txDay = new Date(item.date).setHours(0,0,0,0);
      const startDay = new Date(startDate).setHours(0,0,0,0);
      if (txDay < startDay) return false;
    }
    if (endDate) {
      const txDay = new Date(item.date).setHours(23,59,59,999);
      const endDay = new Date(endDate).setHours(23,59,59,999);
      if (txDay > endDay) return false;
    }

    // Search Query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.description.toLowerCase().includes(query) ||
        item.typeName.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const exportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Date,Type,Description,Cash In (৳),Cash Out (৳),Running Balance (৳)\n';

    [...filteredLedger].reverse().forEach(tx => {
      const dateStr = new Date(tx.date).toLocaleDateString();
      const cleanDesc = tx.description.replace(/,/g, ' ');
      csvContent += `${dateStr},${tx.typeName},${cleanDesc},${tx.cashIn},${tx.cashOut},${tx.runningBalance}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Cash_Ledger_Statement_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8" id="ledger-view-container">
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-600" />
            Cash Book & Account Statement
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            Running bank ledger with direct cash-in & cash-out progression
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchLedgerData}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all"
          >
            <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            Refresh
          </button>
          <button 
            onClick={exportCSV}
            className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-blue-500/10"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Cash Statement Summary Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-2 border-emerald-400/20 rounded-2xl p-6"
        >
          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Coins className="h-4 w-4" />
            Current Ledger Balance
          </p>
          <p className="text-3xl font-black text-emerald-900 tracking-tight">
            ৳{finalBalance.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-emerald-700/80 mt-1">
            {calcMode === 'after_adj' ? 'Notice: Running balance derived from opening hand cash' : 'Cumulative total matching all timeline records'}
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between"
        >
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
              Opening / Adjustment Balance
            </p>
            <p className="text-xl font-black text-slate-800">
              ৳{initialBalance.toLocaleString()}
            </p>
          </div>
          <p className="text-[10px] font-semibold text-slate-400 mt-2">
            Last Manual Adjustment: {new Date(adjustmentDate).toLocaleDateString()}
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900 text-slate-200 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between"
        >
          <div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1.5">
              Calculation Mode
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => setCalcMode('after_adj')}
                className={cn(
                  "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                  calcMode === 'after_adj' 
                    ? "bg-blue-600 text-white" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                )}
              >
                After Adj.
              </button>
              <button
                onClick={() => setCalcMode('all')}
                className={cn(
                  "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                  calcMode === 'all' 
                    ? "bg-blue-600 text-white" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                )}
              >
                Full History
              </button>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 font-semibold mt-2.5">
            {calcMode === 'after_adj' 
              ? 'Mode: Calculates transaction progress only after the latest manual hand cash adjustments'
              : 'Mode: Accumulates all archived transactions starting from day one of registration'}
          </p>
        </motion.div>
      </div>

      {/* Filters Pane */}
      <div className="card-polish p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800 pb-2 border-b border-rose-50/10">
          <Filter className="h-4 w-4 text-blue-500" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">Filter & Search Statement</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Transaction Type Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Transaction Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Transactions</option>
              <option value="cash_in">Cash In (+) - Credit</option>
              <option value="cash_out">Cash Out (-) - Debit</option>
              <option value="sale">Sales Only</option>
              <option value="customer_payment">Receipts Only (Customer Payments)</option>
              <option value="purchase">Purchases Only</option>
              <option value="supplier_payment">Supplier Payments</option>
              <option value="expense">Expenses Only</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Start Date</label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">End Date</label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Custom Search bar */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Search (Note/Customer/Invoice)</label>
            <div className="relative">
              <input 
                type="text"
                placeholder="Type customer, description, or reference ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Bank Statement Ledger Book */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-4">
          <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Loading statement, please wait...</p>
        </div>
      ) : (
        <div className="card-polish overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Coins className="h-4 w-4 text-slate-400" />
              Cash Book Ledger & Running Bank-style Statement
            </h3>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              {filteredLedger.length} transaction(s) found
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Transaction Particulars</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4 text-right">Credit (In +)</th>
                  <th className="px-6 py-4 text-right">Debit (Out -)</th>
                  <th className="px-6 py-4 text-right bg-blue-50/50 text-blue-900 font-bold">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLedger.length > 0 ? (
                  <>
                    {filteredLedger.map((tx: any, idx) => (
                      <tr key={tx.id + idx} className="hover:bg-slate-50/80 transition-all font-medium">
                        <td className="px-6 py-4.5 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                          {new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4.5">
                          <div className="text-slate-800 font-bold text-sm leading-snug">{tx.description}</div>
                          <div className="text-[10px] text-slate-400 font-bold font-mono tracking-tighter mt-1">ID: {tx.id}</div>
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tight whitespace-nowrap inline-block",
                            tx.cashIn > 0 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          )}>
                            {tx.typeName}
                          </span>
                        </td>
                        
                        {/* Credit */}
                        <td className="px-6 py-4.5 text-right font-black text-sm text-emerald-600 whitespace-nowrap">
                          {tx.cashIn > 0 ? `+৳${tx.cashIn.toLocaleString()}` : '-'}
                        </td>
                        
                        {/* Debit */}
                        <td className="px-6 py-4.5 text-right font-black text-sm text-rose-500 whitespace-nowrap">
                          {tx.cashOut > 0 ? `-৳${tx.cashOut.toLocaleString()}` : '-'}
                        </td>
                        
                        {/* Running Balance */}
                        <td className={cn(
                          "px-6 py-4.5 text-right font-black text-sm bg-blue-50/50 whitespace-nowrap",
                          tx.runningBalance >= 0 ? "text-blue-900" : "text-red-700"
                        )}>
                          ৳{tx.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))}

                    {/* Special entry for Opening Adjustment when active - Rendered at bottom of transactions (oldest) */}
                    {calcMode === 'after_adj' && (
                      <tr className="bg-slate-50/40 text-slate-500">
                        <td className="px-6 py-4.5 font-mono text-[10px] text-slate-400 font-bold whitespace-nowrap">
                          {new Date(adjustmentDate).toLocaleDateString()} {new Date(adjustmentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4.5 font-bold text-slate-600">
                          Manual Cash Balance Opening Adjustment
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600 border whitespace-nowrap inline-block">
                            OPENING
                          </span>
                        </td>
                        <td className="px-6 py-4.5 text-right font-bold text-slate-400 whitespace-nowrap">-</td>
                        <td className="px-6 py-4.5 text-right font-bold text-slate-400 whitespace-nowrap">-</td>
                        <td className="px-6 py-4.5 text-right font-black text-slate-700 bg-blue-50/20 whitespace-nowrap">
                          ৳{initialBalance.toLocaleString()}
                        </td>
                      </tr>
                    )}
                  </>
                ) : (
                  <>
                    {calcMode === 'after_adj' && (
                      <tr className="bg-slate-50/40 text-slate-500">
                        <td className="px-6 py-4.5 font-mono text-[10px] text-slate-400 font-bold whitespace-nowrap">
                          {new Date(adjustmentDate).toLocaleDateString()} {new Date(adjustmentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4.5 font-bold text-slate-600">
                          Manual Cash Balance Opening Adjustment
                        </td>
                        <td className="px-6 py-4.5 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600 border whitespace-nowrap inline-block">
                            OPENING
                          </span>
                        </td>
                        <td className="px-6 py-4.5 text-right font-bold text-slate-400 whitespace-nowrap">-</td>
                        <td className="px-6 py-4.5 text-right font-bold text-slate-400 whitespace-nowrap">-</td>
                        <td className="px-6 py-4.5 text-right font-black text-slate-700 bg-blue-50/20 whitespace-nowrap">
                          ৳{initialBalance.toLocaleString()}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                        <FolderOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">No transaction history found (Empty Ledger)</p>
                        <p className="text-xs text-slate-400 font-medium mt-1">There are no ledger entries matching your query or date range.</p>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
