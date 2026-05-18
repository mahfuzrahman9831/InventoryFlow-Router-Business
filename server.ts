import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.json");

// Middleware
app.use(express.json());

// Simple File-based DB Initialization
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    products: [],
    suppliers: [],
    sales: [],
    customers: [],
    payments: [],
    purchases: [],
    settings: {
      shopName: 'InvFlow Pro',
      ownerName: 'Administrator',
      address: 'Shop Address, Your City',
      phone: '+880 1XXX-XXXXXX',
      email: 'owner@example.com'
    }
  }, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
const saveDB = (data: any) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// API Routes
app.get("/api/purchases", (req, res) => res.json(getDB().purchases || []));

app.post("/api/purchases", (req, res) => {
  const db = getDB();
  const purchase = { 
    ...req.body, 
    id: Date.now().toString(), 
    date: new Date().toISOString() 
  };
  
  if (!db.purchases) db.purchases = [];
  
  // Update stock levels for each item
  purchase.items.forEach((item: any) => {
    if (item.productId) {
      // Existing product
      const product = db.products.find((p: any) => p.id === item.productId);
      if (product) {
        product.stockQuantity += Number(item.quantity);
        product.purchasePrice = Number(item.purchasePrice);
        product.supplierId = purchase.supplierId;
      }
    } else {
      // New product
      const newProduct = {
        id: Math.random().toString(36).substr(2, 9),
        name: item.name,
        category: item.category || 'General',
        purchasePrice: Number(item.purchasePrice),
        sellingPrice: Number(item.purchasePrice) * 1.2, // Default markup
        stockQuantity: Number(item.quantity),
        supplierId: purchase.supplierId,
        minStock: 5,
        unit: 'pcs'
      };
      db.products.push(newProduct);
    }
  });

  db.purchases.push(purchase);

  // Update supplier dueAmount
  if (purchase.supplierId && purchase.dueAmount) {
    const supplier = db.suppliers.find((s: any) => s.id === purchase.supplierId);
    if (supplier) {
      supplier.dueAmount = (Number(supplier.dueAmount) || 0) + Number(purchase.dueAmount);
    }
  }

  saveDB(db);
  res.status(201).json(purchase);
});

app.get("/api/dashboard", (req, res) => {
  const db = getDB();
  const yearStr = req.query.year as string;
  const currentYear = new Date().getFullYear();
  const selectedYear = yearStr ? parseInt(yearStr) : currentYear;

  const totalProducts = db.products.length;
  const totalStockValue = db.products.reduce((acc: number, p: any) => acc + ((Number(p.purchasePrice) || 0) * (Number(p.stockQuantity) || 0)), 0);
  
  // Aggregate sales for total stats (all time or filtered by year?)
  // User usually wants to see current snapshot, but sales/profit should maybe respect the year filter.
  // For now, let's keep totalSales as "Total Sales Ever" or "Current Year Sales"?
  // Usually "Total Sales" in a dashboard card is all-time or year-to-date.
  // Let's make sales stats filter by year too if requested.

  const filteredSales = db.sales.filter((s: any) => {
    const saleYear = new Date(s.date).getFullYear();
    return saleYear === selectedYear;
  });

  const totalSales = filteredSales.reduce((acc: number, s: any) => acc + s.totalAmount, 0);
  const totalDue = db.customers.reduce((acc: number, c: any) => acc + (c.dueAmount || 0), 0);
  
  // Calculate monthly profit for selected year
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyProfitMap = filteredSales.reduce((acc: any, s: any) => {
    const monthIndex = new Date(s.date).getMonth();
    const month = months[monthIndex];
    acc[month] = (acc[month] || 0) + (s.profit || 0);
    return acc;
  }, {});

  // Generate complete chart data including months with 0 profit
  const chartData = months.map(month => ({
    name: month,
    profit: monthlyProfitMap[month] || 0
  }));

  // Available years for dropdown
  const yearsSet = new Set<number>();
  yearsSet.add(currentYear);
  db.sales.forEach((s: any) => yearsSet.add(new Date(s.date).getFullYear()));
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  // Recent Sales with customer names (global recent or yearly recent?)
  const recentSales = db.sales.slice(-5).reverse().map((s: any) => {
    const customer = db.customers.find((c: any) => c.id === s.customerId);
    return {
      ...s,
      customerName: customer ? customer.name : (s.customerName || 'Walk-in Customer')
    };
  });

  // Low stock products
  const lowStockProducts = db.products.filter((p: any) => p.stockQuantity < 10).slice(0, 5);

  res.json({
    stats: {
      totalProducts,
      totalStockValue,
      totalSales,
      totalDue
    },
    chartData,
    recentSales,
    lowStockProducts,
    availableYears,
    selectedYear
  });
});

// Products
app.get("/api/products", (req, res) => res.json(getDB().products));
app.post("/api/products", (req, res) => {
  const db = getDB();
  const newProduct = { ...req.body, id: Date.now().toString() };
  db.products.push(newProduct);
  saveDB(db);
  res.status(201).json(newProduct);
});
app.put("/api/products/:id", (req, res) => {
  const db = getDB();
  const index = db.products.findIndex((p: any) => p.id === req.params.id);
  if (index !== -1) {
    db.products[index] = { ...db.products[index], ...req.body };
    saveDB(db);
    res.json(db.products[index]);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});
app.delete("/api/products/:id", (req, res) => {
  try {
    const db = getDB();
    const productId = String(req.params.id).trim();
    const initialLength = db.products.length;
    
    console.log(`[DELETE] Attempting to delete product with ID: "${productId}"`);
    // Use loose comparison or convert both to string for safety
    db.products = db.products.filter((p: any) => String(p.id).trim() !== productId);
    
    if (db.products.length < initialLength) {
      saveDB(db);
      console.log(`[DELETE] Successfully deleted product ${productId}`);
      res.json({ success: true, message: "Product deleted" });
    } else {
      console.log(`[DELETE] Product ${productId} not found in DB`);
      res.status(404).json({ error: "Product not found" });
    }
  } catch (err: any) {
    console.error(`[DELETE] Error deleting product:`, err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Suppliers
app.get("/api/suppliers", (req, res) => res.json(getDB().suppliers));
app.post("/api/suppliers", (req, res) => {
  const db = getDB();
  const newSupplier = { ...req.body, id: Date.now().toString(), dueAmount: Number(req.body.dueAmount) || 0 };
  db.suppliers.push(newSupplier);
  saveDB(db);
  res.status(201).json(newSupplier);
});

app.delete("/api/suppliers/:id", (req, res) => {
  try {
    const db = getDB();
    const supplierId = String(req.params.id).trim();
    const initialLength = db.suppliers.length;
    
    console.log(`[DELETE SUPPLIER] Attempting to delete supplier with ID: "${supplierId}"`);
    db.suppliers = db.suppliers.filter((s: any) => String(s.id).trim() !== supplierId);
    
    if (db.suppliers.length < initialLength) {
      saveDB(db);
      console.log(`[DELETE SUPPLIER] Successfully deleted supplier ${supplierId}`);
      res.json({ success: true, message: "Supplier deleted" });
    } else {
      console.log(`[DELETE SUPPLIER] Supplier ${supplierId} not found in DB`);
      res.status(404).json({ error: "Supplier not found" });
    }
  } catch (err: any) {
    console.error(`[DELETE SUPPLIER] Error:`, err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Sales
app.get("/api/sales", (req, res) => {
  const db = getDB();
  const sales = db.sales.map((s: any) => {
    const customer = db.customers.find((c: any) => c.id === s.customerId);
    return { ...s, customerName: customer ? customer.name : 'Unknown' };
  });
  res.json(sales);
});

app.post("/api/sales", (req, res) => {
  const db = getDB();
  const sale = { ...req.body, id: Date.now().toString(), date: req.body.date || new Date().toISOString() };
  
  // Update stock levels (ONLY if NOT a historical/skip-stock entry)
  if (!sale.isHistorical) {
    sale.items.forEach((item: any) => {
      const product = db.products.find((p: any) => p.id === item.productId);
      if (product) {
        product.stockQuantity -= Number(item.quantity) || 0;
      }
    });
  }

  // Update customer due if applicable
  if (sale.customerId && sale.dueAmount > 0) {
    const customer = db.customers.find((c: any) => c.id === sale.customerId);
    if (customer) {
      customer.dueAmount = (Number(customer.dueAmount) || 0) + Number(sale.dueAmount);
    }
  }

  db.sales.push(sale);
  saveDB(db);
  res.status(201).json(sale);
});

app.delete("/api/sales/:id", (req, res) => {
  try {
    const db = getDB();
    const saleId = req.params.id;
    const saleIndex = db.sales.findIndex((s: any) => s.id === saleId);
    
    if (saleIndex === -1) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const sale = db.sales[saleIndex];

    // 1. Restore Stock (if it wasn't historical)
    if (!sale.isHistorical) {
      sale.items.forEach((item: any) => {
        const product = db.products.find((p: any) => p.id === item.productId);
        if (product) {
          product.stockQuantity += Number(item.quantity) || 0;
        }
      });
    }

    // 2. Revert Customer Due
    if (sale.customerId && (Number(sale.dueAmount) || 0) > 0) {
      const customer = db.customers.find((c: any) => c.id === sale.customerId);
      if (customer) {
        customer.dueAmount = Math.max(0, (Number(customer.dueAmount) || 0) - Number(sale.dueAmount));
      }
    }

    // Remove the sale record
    db.sales.splice(saleIndex, 1);
    
    saveDB(db);
    res.json({ success: true, message: "Sale deleted and stock/due reverted" });
  } catch (err) {
    console.error("Delete Sale Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Customers
app.get("/api/customers", (req, res) => res.json(getDB().customers));
app.post("/api/customers", (req, res) => {
  const db = getDB();
  const newCustomer = { ...req.body, id: Date.now().toString(), dueAmount: req.body.dueAmount || 0 };
  db.customers.push(newCustomer);
  saveDB(db);
  res.status(201).json(newCustomer);
});

// Suppliers - standalone payments
app.post("/api/suppliers/:id/payments", (req, res) => {
  const db = getDB();
  const supplierId = req.params.id;
  const { amount, note, memoImage } = req.body;
  const supplier = db.suppliers.find((s: any) => s.id === supplierId);
  
  if (!supplier) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  const oldDue = Number(supplier.dueAmount) || 0;
  supplier.dueAmount = Math.max(0, oldDue - Number(amount));
  
  const paymentRecord = {
    id: Date.now().toString(),
    supplierId,
    amount: Number(amount),
    date: new Date().toISOString(),
    previousDue: oldDue,
    newDue: supplier.dueAmount,
    note: note || 'Standalone Payment',
    type: 'payment',
    memoImage
  };

  if (!db.supplierPayments) db.supplierPayments = [];
  db.supplierPayments.push(paymentRecord);
  
  saveDB(db);
  res.json(supplier);
});

app.get("/api/suppliers/:id/transactions", (req, res) => {
  const db = getDB();
  const supplierId = req.params.id;
  const purchases = (db.purchases || []).filter((p: any) => String(p.supplierId) === String(supplierId)).map((s: any) => ({ ...s, type: 'purchase' }));
  const payments = (db.supplierPayments || []).filter((p: any) => String(p.supplierId) === String(supplierId));
  
  const allTransactions = [...purchases, ...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json(allTransactions);
});

app.get("/api/customers/:id/transactions", (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const sales = (db.sales || []).filter((s: any) => s.customerId === customerId).map((s: any) => ({ ...s, type: 'sale' }));
  const payments = (db.payments || []).filter((p: any) => p.customerId === customerId).map((p: any) => ({ ...p, type: 'payment' }));
  
  const allTransactions = [...sales, ...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json(allTransactions);
});

app.get("/api/settings", (req, res) => res.json(getDB().settings || {
  shopName: 'InvFlow Pro',
  ownerName: 'Administrator',
  address: 'Shop Address, Your City',
  phone: '+880 1XXX-XXXXXX',
  email: 'owner@example.com'
}));

app.post("/api/settings", (req, res) => {
  const db = getDB();
  db.settings = { ...db.settings, ...req.body };
  saveDB(db);
  res.json(db.settings);
});

app.delete("/api/customers/:id", (req, res) => {
  try {
    const db = getDB();
    const customerId = String(req.params.id).trim();
    const initialLength = db.customers.length;
    
    console.log(`[DELETE CUSTOMER] Attempting to delete customer with ID: "${customerId}"`);
    db.customers = db.customers.filter((c: any) => String(c.id).trim() !== customerId);
    
    if (db.customers.length < initialLength) {
      saveDB(db);
      console.log(`[DELETE CUSTOMER] Successfully deleted customer ${customerId}`);
      res.json({ success: true, message: "Customer deleted" });
    } else {
      console.log(`[DELETE CUSTOMER] Customer ${customerId} not found in DB`);
      res.status(404).json({ error: "Customer not found" });
    }
  } catch (err: any) {
    console.error(`[DELETE CUSTOMER] Error:`, err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/api/customers/:id/payments", (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { amount } = req.body;
  const customer = db.customers.find((c: any) => c.id === customerId);
  
  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const oldDue = customer.dueAmount || 0;
  customer.dueAmount = Math.max(0, oldDue - amount);
  
  const paymentRecord = {
    id: Date.now().toString(),
    customerId,
    amount,
    date: new Date().toISOString(),
    previousDue: oldDue,
    newDue: customer.dueAmount
  };

  if (!db.payments) db.payments = [];
  db.payments.push(paymentRecord);
  
  saveDB(db);
  res.json(customer);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
