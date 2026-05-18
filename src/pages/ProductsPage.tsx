import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  MoreHorizontal,
  Package,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { fetchItems, createItem, updateItem, deleteItem } from '../services/firestoreService';
import { cn } from '../lib/utils';

export const ProductsPage = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState<any>({
    name: '',
    category: '',
    purchasePrice: 0,
    stockQuantity: 0,
    supplierId: ''
  });

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [prods, supps] = await Promise.all([
        fetchItems(user.uid, 'products'),
        fetchItems(user.uid, 'suppliers')
      ]);
      setProducts(prods.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
      setSuppliers(supps);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNumericChange = (field: string, value: string) => {
    // If user clears the input, keep it as empty string to allow typing
    if (value === '') {
      setFormData((prev: any) => ({ ...prev, [field]: '' }));
      return;
    }
    
    // Remove leading zero if it's followed by another digit
    const cleanedValue = value.replace(/^0+(?=\d)/, '');
    
    const parsed = cleanedValue.includes('.') ? parseFloat(cleanedValue) : parseInt(cleanedValue);
    if (!isNaN(parsed)) {
      setFormData((prev: any) => ({ ...prev, [field]: parsed }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const payload = {
      ...formData,
      purchasePrice: Number(formData.purchasePrice) || 0,
      stockQuantity: Number(formData.stockQuantity) || 0,
      sellingPrice: Number(formData.sellingPrice) || (Number(formData.purchasePrice) * 1.2)
    };
    
    try {
      if (editingProduct) {
        await updateItem(user.uid, 'products', editingProduct.id, payload);
      } else {
        await createItem(user.uid, 'products', payload);
      }
      await loadData();
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', category: '', purchasePrice: 0, stockQuantity: 0, supplierId: '' });
    } catch (error) {
      console.error('Error saving product:', error);
    }
  };

  const handleDeleteClick = (id: string) => {
    if (!id) {
      alert('Error: Product ID is missing.');
      return;
    }
    console.log(`[CLIENT] Opening custom delete confirmation for ID: ${id}`);
    setProductToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete || !user) return;
    
    try {
      await deleteItem(user.uid, 'products', productToDelete);
      await loadData();
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const totalStockValue = products.reduce((acc, p) => {
    if (p.batches && p.batches.length > 0) {
      return acc + p.batches.reduce((batchAcc: number, batch: any) => batchAcc + (Number(batch.purchasePrice) * Number(batch.quantity)), 0);
    }
    return acc + (p.purchasePrice * (p.stockQuantity || 0));
  }, 0);

  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your inventory items and stock levels.</p>
        </div>
        <button 
          onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </header>

      {/* Stock Value Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-polish p-6 border-l-4 border-l-blue-600 bg-white">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Stock Value</p>
              <p className="text-2xl font-black text-slate-900 tracking-tighter">৳{totalStockValue.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="card-polish p-6 border-l-4 border-l-slate-600 bg-white">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
              <MoreHorizontal className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total SKU Count</p>
              <p className="text-2xl font-black text-slate-900 tracking-tighter">{products.length}</p>
            </div>
          </div>
        </div>
        <div className="card-polish p-6 border-l-4 border-l-red-600 bg-white">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Out of Stock</p>
              <p className="text-2xl font-black text-slate-900 tracking-tighter">
                {products.filter(p => (p.stockQuantity || 0) <= 0).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search products..." 
            className="w-full rounded-lg border bg-card py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
            <Filter className="h-4 w-4" />
            Filter
          </button>
          <button className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="overflow-hidden card-polish">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Product Name</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4 text-right">Price</th>
                <th className="px-6 py-4 text-right">Stock</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic-none">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8">
                       <div className="h-10 bg-slate-100 rounded-lg w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <React.Fragment key={product.id}>
                    <tr 
                      className={cn(
                        "hover:bg-slate-50/50 transition-colors cursor-pointer",
                        expandedProduct === product.id && "bg-blue-50/20"
                      )}
                      onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-1.5 h-10 rounded-full transition-all",
                            expandedProduct === product.id ? "bg-blue-600 scale-y-110" : "bg-slate-200"
                          )} />
                          <div>
                            <div className="font-bold text-slate-900">{product.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">ID: {product.id.slice(-6)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 uppercase tracking-tighter">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        <div className="text-blue-600 font-black">৳{product.purchasePrice}</div>
                        {product.batches && product.batches.length > 1 && (
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {product.batches.length} Cost Batches
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={cn(
                          "font-black text-lg leading-none",
                          product.stockQuantity < 10 ? "text-red-500" : "text-slate-900"
                        )}>
                          {product.stockQuantity}
                        </div>
                        {product.stockQuantity < 10 && (
                          <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mt-1">Low Stock</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProduct(product);
                              setFormData({ ...product });
                              setIsModalOpen(true);
                            }}
                            className="rounded-md p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(product.id);
                            }}
                            className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete Product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Batches Expanded View */}
                    <AnimatePresence>
                      {expandedProduct === product.id && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-slate-50/50"
                        >
                          <td colSpan={5} className="px-12 py-6 border-b border-blue-100">
                             <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Inventory Cost Breakdown (FIFO)</p>
                                   <div className="h-px flex-1 bg-slate-200 mx-4" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                   {product.batches && product.batches.length > 0 ? (
                                     product.batches.map((batch: any, bi: number) => (
                                       <div key={bi} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                          <div>
                                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Batch #{bi + 1}</p>
                                             <p className="text-xs font-bold text-slate-500">{new Date(batch.date || Date.now()).toLocaleDateString()}</p>
                                          </div>
                                          <div className="text-right">
                                             <p className="text-sm font-black text-slate-900">৳{batch.purchasePrice}</p>
                                             <p className="text-[10px] font-bold text-blue-600">{batch.quantity} units left</p>
                                          </div>
                                       </div>
                                     ))
                                   ) : (
                                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                        <div>
                                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Default Batch</p>
                                           <p className="text-xs font-bold text-slate-500">Legacy Stock</p>
                                        </div>
                                        <div className="text-right">
                                           <p className="text-sm font-black text-slate-900">৳{product.purchasePrice}</p>
                                           <p className="text-[10px] font-bold text-blue-600">{product.stockQuantity} units left</p>
                                        </div>
                                     </div>
                                   )}
                                </div>
                             </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Package className="h-10 w-10 text-slate-200 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No products found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Product Name</label>
                <input 
                  required
                  type="text" 
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Category</label>
                  <select 
                    required
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">Select Category</option>
                    <option value="Router">Router</option>
                    <option value="ONU">ONU</option>
                    <option value="WGP">WGP</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Supplier</label>
                  <select 
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                    value={formData.supplierId}
                    onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.companyName})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Stock Quantity</label>
                  <input 
                    required
                    type="number" 
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={formData.stockQuantity === 0 ? '' : (formData.stockQuantity || '')}
                    onFocus={e => e.target.select()}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={e => handleNumericChange('stockQuantity', e.target.value)}
                  />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Purchase Price</label>
                    <input 
                      required
                      type="number" 
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      value={formData.purchasePrice === 0 ? '' : (formData.purchasePrice || '')}
                      onFocus={e => e.target.select()}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={e => handleNumericChange('purchasePrice', e.target.value)}
                    />
                  </div>
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
                  Save Product
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl text-center"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
              <Trash2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Confirm Delete</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">Are you sure you want to delete this product? This action cannot be undone.</p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setProductToDelete(null);
                }}
                className="flex-1 rounded-lg border border-slate-200 py-3 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-bold"
              >
                No, Keep it
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 font-bold"
              >
                Yes, Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

