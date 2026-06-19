/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen,
  Package, 
  Users, 
  ShoppingCart, 
  UserCircle, 
  Settings, 
  Menu, 
  X,
  Sun,
  Moon,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Search,
  Loader2,
  Mail,
  RefreshCw,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { auth } from './lib/firebase';
import { signOut } from 'firebase/auth';
import { AuthPage } from './pages/AuthPage';
import { cn } from './lib/utils';

import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { 
  fetchItems, 
  createItem, 
  updateItem, 
  createUserProfile 
} from './services/firestoreService';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { SalesPage } from './pages/SalesPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { LedgerPage } from './pages/LedgerPage';
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom';

const AuthActionDispatcher = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  if (mode === 'resetPassword') {
    return <Navigate to={`/reset-password?oobCode=${oobCode}`} replace />;
  }

  // Fallback to dashboard or login
  return <Navigate to="/" replace />;
};

// Pages
export const Dashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isAdjustingCash, setIsAdjustingCash] = useState(false);
  const [newCashBalance, setNewCashBalance] = useState(0);
  const [isAdjusting, setIsAdjusting] = useState(false);
  
  const handleCashAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isAdjusting) return;
    setIsAdjusting(true);
    try {
      const [settingsDoc] = await fetchItems(user.uid, 'settings');
      const adjustment = {
        amount: Number(newCashBalance),
        date: new Date().toISOString()
      };
      
      if (settingsDoc?.id) {
        await updateItem(user.uid, 'settings', settingsDoc.id, { 
          ...settingsDoc, 
          lastCashAdjustment: adjustment 
        });
      } else {
        await createItem(user.uid, 'settings', { 
          shopName: 'My Shop',
          lastCashAdjustment: adjustment 
        });
      }
      setIsAdjustingCash(false);
      await fetchDashboardData(selectedYear);
    } catch (error) {
      console.error('Error adjusting cash:', error);
    } finally {
      setIsAdjusting(false);
    }
  };
  
  const fetchDashboardData = async (year: number) => {
    if (!user) return;
    try {
      const [products, customers, allSales, expenses] = await Promise.all([
        fetchItems(user.uid, 'products'),
        fetchItems(user.uid, 'customers'),
        fetchItems(user.uid, 'sales'),
        fetchItems(user.uid, 'expenses')
      ]);

      // Set to local midnight of May 14, 2026 to be safe
      const PROFIT_START_DATE = new Date(2026, 4, 14, 0, 0, 0); 
      const yearSales = allSales.filter((s: any) => new Date(s.date).getFullYear() === year);
      
      const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      const todaySalesItems = allSales.filter((s: any) => {
        const sDate = new Date(s.date).toLocaleDateString('en-CA');
        return sDate === todayStr;
      });

      // Calculate current month's sales profit
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const currentMonthSales = allSales.filter((s: any) => {
        const d = new Date(s.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const currentMonthSalesProfit = currentMonthSales.reduce((acc, s: any) => acc + (Number(s.profit || 0)), 0);

      const totalValidExpenses = expenses
        .filter((e: any) => new Date(e.date) >= PROFIT_START_DATE)
        .reduce((acc, e: any) => acc + (Number(e.amount || 0)), 0);

      const stats = {
        totalProducts: products.length,
        totalStockValue: products.reduce((acc, p: any) => {
          if (p.batches && p.batches.length > 0) {
             return acc + p.batches.reduce((ba: number, b: any) => ba + (Number(b.purchasePrice) * Number(b.quantity)), 0);
          }
          return acc + (Number(p.purchasePrice || 0) * Number(p.stockQuantity || 0));
        }, 0),
        totalSales: allSales.reduce((acc, s: any) => acc + (Number(s.totalAmount || 0)), 0),
        totalDue: customers.reduce((acc, c: any) => acc + (Number(c.dueAmount || 0)), 0),
        cashHand: 0,
        totalExpenses: totalValidExpenses,
        netProfit: currentMonthSalesProfit,
        todaySales: todaySalesItems.reduce((acc, s: any) => acc + (Number(s.totalAmount || 0)), 0),
        todayProfit: todaySalesItems.reduce((acc, s: any) => acc + (Number(s.profit || 0)), 0)
      };

      // Calculate Cash in Hand based on adjustments and transactions
      const [settingsDoc]: any[] = await fetchItems(user.uid, 'settings');
      const lastAdjustment = settingsDoc?.lastCashAdjustment || { amount: 0, date: new Date(0).toISOString() };
      
      const salesAfterAdj = allSales.filter((s: any) => new Date(s.createdAt || s.date) > new Date(lastAdjustment.date));
      const customerPayments = await fetchItems(user.uid, 'payments');
      const custPayAfterAdj = customerPayments.filter((p: any) => new Date(p.createdAt || p.date) > new Date(lastAdjustment.date));
      
      const supplierPayments = await fetchItems(user.uid, 'supplierPayments');
      const suppPayAfterAdj = supplierPayments.filter((p: any) => new Date(p.createdAt || p.date) > new Date(lastAdjustment.date));
      
      const purchases = await fetchItems(user.uid, 'purchases');
      const purchasesAfterAdj = purchases.filter((p: any) => new Date(p.createdAt || p.date) > new Date(lastAdjustment.date));
      
      const expensesAfterAdj = expenses.filter((e: any) => new Date(e.createdAt || e.date) > new Date(lastAdjustment.date));

      const cashIn = salesAfterAdj.reduce((acc, s: any) => acc + (Number(s.receivedAmount || 0)), 0) +
                     custPayAfterAdj.reduce((acc, p: any) => acc + (Number(p.amount || 0)), 0);
      
      const cashOut = suppPayAfterAdj.reduce((acc, p: any) => acc + (Number(p.amount || 0)), 0) +
                      purchasesAfterAdj.reduce((acc, p: any) => acc + (Number(p.paidAmount || 0)), 0) +
                      expensesAfterAdj.reduce((acc, e: any) => acc + (Number(e.amount || 0)), 0);
      
      stats.cashHand = Number(lastAdjustment.amount) + cashIn - cashOut;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const chartData = months.map((month, index) => {
        const monthProfit = yearSales
          .filter((s: any) => {
            const saleDate = new Date(s.date);
            return saleDate.getMonth() === index && saleDate >= PROFIT_START_DATE;
          })
          .reduce((acc, s: any) => acc + (Number(s.profit || 0)), 0);

        return { name: month, profit: monthProfit };
      });

      const lowStockProducts = products.filter((p: any) => Number(p.stockQuantity) < 5);
      const recentSales = [...allSales].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

      const availableYears = Array.from(new Set(allSales.map((s: any) => new Date(s.date).getFullYear())));
      if (!availableYears.includes(new Date().getFullYear())) availableYears.push(new Date().getFullYear());

      setData({
        stats,
        chartData,
        lowStockProducts,
        recentSales,
        availableYears: availableYears.sort((a, b) => b - a)
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  useEffect(() => {
    fetchDashboardData(selectedYear);
  }, [selectedYear, user]);

  if (!data) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard metrics...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {[
          { label: 'Today\'s Sales', val: `৳${data.stats.todaySales.toLocaleString()}`, icon: ShoppingCart, color: 'text-blue-600', trend: 'Daily Volume' },
          { label: 'Today\'s Profit', val: `৳${data.stats.todayProfit.toLocaleString()}`, icon: CheckCircle, color: 'text-emerald-600', trend: 'Daily Net' },
          { label: 'Stock Value', val: `৳${data.stats.totalStockValue.toLocaleString()}`, icon: TrendingUp, color: 'text-blue-600', trend: 'Total Valuation' },
          { 
            label: 'Cash Hand', 
            val: `৳${data.stats.cashHand.toLocaleString()}`, 
            icon: CheckCircle, 
            color: 'text-emerald-600', 
            trend: 'Actual Cash',
            action: (
              <button 
                onClick={() => {
                  setNewCashBalance(data.stats.cashHand);
                  setIsAdjustingCash(true);
                }}
                className="mt-2 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline bg-blue-50 px-2 py-1 rounded"
              >
                Sync/Adjust Balance
              </button>
            )
          },
          { label: 'Total Due', val: `৳${data.stats.totalDue.toLocaleString()}`, icon: AlertTriangle, color: 'text-orange-600', trend: 'Outstanding Receivables' },
          { label: 'Expenses', val: `৳${data.stats.totalExpenses.toLocaleString()}`, icon: TrendingUp, color: 'text-red-600', trend: 'Business Costs' },
          { label: 'Net Profit', val: `৳${data.stats.netProfit.toLocaleString()}`, icon: CheckCircle, color: 'text-green-600', trend: 'Current Month' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
              "card-polish p-5 flex flex-col justify-between",
              stat.label === "Total Due" && "border-l-4 border-l-orange-500",
              stat.label === "Cash Hand" && "border-l-4 border-l-emerald-500",
              stat.label === "Expenses" && "border-l-4 border-l-red-500",
              stat.label === "Net Profit" && "border-l-4 border-l-green-500"
            )}
          >
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.label}</p>
              <h2 className={cn("mt-1 text-2xl font-black", stat.label === "Total Due" ? "text-orange-600" : stat.label === "Cash Hand" ? "text-emerald-600" : "text-slate-900")}>{stat.val}</h2>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-[10px]">
                 <span className="font-bold text-slate-400 opacity-60 uppercase">{stat.trend}</span>
              </div>
              {stat.action}
            </div>
          </motion.div>
        ))}
      </div>

      {isAdjustingCash && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Sync Cash Balance</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Update virtual cash to match reality</p>
              </div>
              <button 
                onClick={() => setIsAdjustingCash(false)} 
                className="rounded-full p-2 hover:bg-slate-100 transition-all"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCashAdjustment} className="space-y-6">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 mb-6">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Current Virtual Cash</p>
                <p className="text-2xl font-black text-emerald-900">৳{data.stats.cashHand.toLocaleString()}</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">New Physical Cash Balance</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300">৳</span>
                  <input 
                    required
                    type="number" 
                    className="w-full h-16 pl-12 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-3xl font-black outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={newCashBalance === 0 ? '' : newCashBalance}
                    onFocus={e => e.target.select()}
                    onChange={e => setNewCashBalance(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-2 italic uppercase">
                  * All future calculations will start from this balance.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAdjustingCash(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-4 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-bold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isAdjusting}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-4 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {isAdjusting ? 'Processing...' : 'Save & Sync'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
         <div className="lg:col-span-2 card-polish p-6">
            <div className="flex items-center justify-between mb-6">
               <div>
                  <h3 className="font-bold text-slate-900">Monthly Profit Overview</h3>
                  <p className="text-xs text-slate-500">Estimated earnings for the year {selectedYear}</p>
               </div>
               <select 
                 value={selectedYear}
                 onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                 className="text-[10px] border border-slate-200 rounded p-1 bg-slate-50 font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500/20"
               >
                  {data.availableYears?.map((y: number) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
               </select>
            </div>
            <div className="h-[300px] w-full">
               <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={data.chartData}>
                     <defs>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.05} />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                     <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: '#60a5fa', fontWeight: 'bold' }}
                        cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }}
                     />
                     <Area 
                        type="monotone" 
                        dataKey="profit" 
                        stroke="#3b82f6" 
                        strokeWidth={3} 
                        fillOpacity={1} 
                        fill="url(#colorProfit)" 
                        animationDuration={1500}
                     />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>

         <div className="card-polish flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
               <h3 className="font-bold text-slate-900 text-sm">Low Stock Alerts</h3>
               <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[9px] font-black rounded-full uppercase tracking-tighter">Urgent</span>
            </div>
            <div className="flex-1 overflow-auto p-4 no-scrollbar space-y-4">
               {data.lowStockProducts.length > 0 ? data.lowStockProducts.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-xs border border-slate-100">
                           📦
                        </div>
                        <div className="min-w-0">
                           <p className="text-xs font-bold truncate">{item.name}</p>
                           <p className="text-[9px] text-slate-500 font-medium tracking-tight">Category: {item.category}</p>
                        </div>
                     </div>
                     <div className="text-right shrink-0">
                        <p className={cn("text-xs font-black", Number(item.stockQuantity) < 5 ? "text-red-600" : "text-orange-500")}>{item.stockQuantity} left</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Restock Required</p>
                     </div>
                  </div>
               )) : (
                 <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <CheckCircle className="h-8 w-8 text-green-500 mb-2 opacity-20" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Stock levels optimal</p>
                 </div>
               )}
            </div>
            <div className="p-4 pt-0">
               <Link 
                 to="/products"
                 className="block w-full text-center text-[10px] text-blue-600 font-bold py-2 bg-blue-50 rounded hover:bg-blue-100 transition-colors uppercase tracking-widest"
               >
                  View Full Inventory Report
               </Link>
            </div>
         </div>
      </div>
      
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
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Items</th>
                    <th className="px-6 py-3">Total Price</th>
                    <th className="px-6 py-3">Profit</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentSales.length > 0 ? data.recentSales.map((sale: any, i: number) => (
                     <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-mono text-[10px] font-bold text-slate-400">#INV-{sale.id.slice(-6)}</td>
                        <td className="px-6 py-3 font-bold">{sale.customerName}</td>
                        <td className="px-6 py-3 text-slate-500 font-medium">{sale.items.length} products</td>
                        <td className="px-6 py-3 font-black">৳{sale.totalAmount.toLocaleString()}</td>
                        <td className="px-6 py-3 text-green-600 font-bold">+৳{sale.profit.toLocaleString()}</td>
                        <td className="px-6 py-3">
                           <span className={cn(
                             "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                             sale.dueAmount > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                           )}>
                              {sale.dueAmount > 0 ? 'DUE' : 'PAID'}
                           </span>
                        </td>
                     </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                        New transactions will appear here
                      </td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

// Layout Content - Needs to be inside Router
function AppContent() {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<any>({
    shopName: 'InvFlow Pro',
    ownerName: 'Administrator',
    address: 'Shop Address, Your City',
    phone: '+880 1XXX-XXXXXX',
    email: 'owner@example.com'
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (user) {
      // Ensure user profile exists in Firestore
      createUserProfile(user.uid, user.email || '');

      setSettingsLoading(true);
      fetchItems(user.uid, 'settings').then(res => {
        if (res && res.length > 0) {
          setSettings(res[0]);
        }
        setSettingsLoading(false);
      }).catch(err => {
        console.error('Error fetching settings:', err);
        setSettingsLoading(false);
      });
    } else {
      setSettingsLoading(false);
    }
    
    // Handle responsive sidebar state on resize
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [user]);

  // Close sidebar on navigation on mobile
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const handleSettingsUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSaving) return;
    
    setIsSaving(true);
    try {
      const { id, ...dataToSave } = settings;
      if (id) {
        await updateItem(user.uid, 'settings', id, dataToSave);
      } else {
        const result = await createItem(user.uid, 'settings', dataToSave);
        setSettings(result);
      }
      setIsSettingsOpen(false);
      // We could use a toast library here, but let's stick to alert for now or just close
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Failed to update settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Routes that don't require authentication
  const publicRoutes = ['/auth-action', '/reset-password'];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-page-bg">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user && !isPublicRoute) {
    return <AuthPage />;
  }

  // If it's a public route, render it without the sidebars/header layout
  if (isPublicRoute) {
    return (
      <div className="min-h-screen w-full">
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth-action" element={<AuthActionDispatcher />} />
        </Routes>
      </div>
    );
  }

  // We are skipping the emailVerified check because the app uses its own OTP logic
  if (false && !user.emailVerified) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-page-bg p-4">
        <div className="glass-card p-8 max-w-md w-full text-center border border-white/40 shadow-2xl">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 mb-6">
            <Mail className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-4">Verify Your Email</h2>
          <p className="text-slate-500 mb-8 font-medium">
            We've sent a verification link to <span className="font-bold text-slate-900">{user.email}</span>. 
            Please verify your email to access your dashboard.
          </p>
          <div className="space-y-4">
            <button 
              onClick={() => window.location.reload()}
              className="w-full h-12 rounded-xl bg-blue-600 text-sm font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              I've Verified
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="w-full h-12 rounded-xl border-2 border-slate-200 text-sm font-black text-slate-600 uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-page-bg relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && window.innerWidth < 1024 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-72 bg-sidebar-bg text-slate-400 flex flex-col transition-transform duration-300 shadow-2xl lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <Link 
            to="/"
            className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className="min-w-0">
               <span className="text-xl font-display font-black text-white tracking-tight truncate block">
                 {settingsLoading ? 'Loading...' : settings.shopName}
               </span>
            </div>
          </Link>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-slate-800 rounded-lg text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-6 overflow-y-auto no-scrollbar">
          {[
            { to: '/', label: 'Dashboard', icon: LayoutDashboard },
            { to: '/ledger', label: 'Cash Book', icon: BookOpen },
            { to: '/products', label: 'Inventory', icon: Package },
            { to: '/suppliers', label: 'Suppliers', icon: Users },
            { to: '/sales', label: 'Sales', icon: ShoppingCart },
            { to: '/expenses', label: 'Expenses', icon: TrendingUp },
            { to: '/customers', label: 'Customers', icon: UserCircle },
          ].map(item => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => {
                  setProfileMenuOpen(false);
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all relative group",
                  isActive 
                    ? "bg-blue-600/10 text-blue-400" 
                    : "hover:bg-white/5 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeNav"
                    className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full"
                  />
                )}
                <item.icon className={cn("h-5 w-5 transition-colors", isActive ? "text-blue-500" : "text-slate-500 group-hover:text-slate-300")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 mt-auto bg-sidebar-bg/50 backdrop-blur-md relative">
          <AnimatePresence>
            {profileMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full left-4 right-4 mb-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-2 z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-white/5 mb-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Signed in as</p>
                  <p className="text-xs font-bold text-white truncate">{user?.email}</p>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 text-slate-300 text-xs font-bold transition-all"
                >
                  <Settings className="h-4 w-4" />
                  Shop Settings
                </button>
                <button 
                  onClick={() => signOut(auth)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-500/10 text-red-400 text-xs font-bold transition-all"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all text-left group",
              profileMenuOpen ? "bg-white/5" : "hover:bg-white/5"
            )}
          >
            <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center font-black text-white border-2 border-slate-700 shadow-inner shrink-0 group-hover:border-blue-500/50 transition-all uppercase">
              {settings.shopName?.charAt(0) || 'S'}
            </div>
            <div className="min-w-0 text-left flex-1">
              <p className="text-sm font-bold text-white truncate leading-tight">{user?.displayName || 'User Profile'}</p>
            </div>
            <div className="shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors">
              <ChevronRight className={cn("h-4 w-4 transition-transform", profileMenuOpen ? "rotate-90" : "")} />
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300 w-full", 
        sidebarOpen && window.innerWidth >= 1024 ? "lg:pl-72" : "pl-0"
      )}>
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 shadow-sm z-30 sticky top-0">
          <div className="flex items-center gap-3 md:gap-4 text-slate-800">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-all"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-xl md:text-2xl font-black tracking-tight truncate max-w-[150px] md:max-w-none">
              {location.pathname === '/' ? 'Dashboard' : 
               location.pathname.slice(1).charAt(0).toUpperCase() + location.pathname.slice(2)}
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative group hidden xl:block">
              <input 
                type="text" 
                placeholder="Search resources..." 
                className="pl-11 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 w-64 transition-all"
              />
              <Search className="h-4 w-4 absolute left-4 top-3 text-slate-400 transition-colors group-focus-within:text-blue-500" />
            </div>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar bg-slate-50/30">
          <AnimatePresence mode="wait">
             <motion.div
               key={location.pathname}
               initial={{ opacity: 0, scale: 0.98 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 1.02 }}
               transition={{ duration: 0.25, ease: "easeOut" }}
               className="max-w-7xl mx-auto"
             >
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/ledger" element={<LedgerPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/suppliers" element={<SuppliersPage />} />
                  <Route path="/sales" element={<SalesPage />} />
                  <Route path="/expenses" element={<ExpensesPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/auth-action" element={<AuthActionDispatcher />} />
                </Routes>
             </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Shop Settings</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Update shop info & branding</p>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="rounded-full p-2 hover:bg-slate-100 transition-all"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSettingsUpdate} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Shop Name</label>
                <input 
                  required
                  type="text" 
                  placeholder="Shop Name"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={settings.shopName}
                  onChange={e => setSettings({ ...settings, shopName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Owner Name</label>
                <input 
                  required
                  type="text" 
                  placeholder="Your Name"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={settings.ownerName}
                  onChange={e => setSettings({ ...settings, ownerName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Address</label>
                <input 
                  required
                  type="text" 
                  placeholder="Address"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={settings.address}
                  onChange={e => setSettings({ ...settings, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Phone</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Phone Number"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                    value={settings.phone}
                    onChange={e => setSettings({ ...settings, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Email</label>
                  <input 
                    required
                    type="email" 
                    placeholder="Email"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                    value={settings.email}
                    onChange={e => setSettings({ ...settings, email: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="pt-6 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-4 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-4 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Profile'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Main App Entry
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}
