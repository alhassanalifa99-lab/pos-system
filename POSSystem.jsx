import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, DollarSign, TrendingUp, Plus, Minus, Trash2, Search, BarChart, Settings, Download } from 'lucide-react';

const defaultUserForm = { name: '', pin: '' };
const SESSION_COMPANY_KEY = 'pos_session_company_id';
const SESSION_USER_KEY = 'pos_session_user';

// Small fetch helper so every call gets consistent error handling
async function api(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
}

// Postgres NUMERIC columns come back as strings — normalize to numbers once, at the boundary
const normalizeProduct = (p) => ({ ...p, cost: parseFloat(p.cost) || 0, price: parseFloat(p.price) || 0, stock: parseInt(p.stock) || 0 });
const normalizeSale = (s) => ({ ...s, total: parseFloat(s.total) || 0, date: new Date(s.sale_date).toLocaleString(), cashierName: s.cashier_name });

const POSSystem = () => {
    const [view, setView] = useState('loading');
    const [companyName, setCompanyName] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [isSetupComplete, setIsSetupComplete] = useState(false);
    const [staffUsers, setStaffUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loginPin, setLoginPin] = useState('');
    const [staffCompanyIdInput, setStaffCompanyIdInput] = useState('');
    const [managerCompanyIdInput, setManagerCompanyIdInput] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [newStaffUser, setNewStaffUser] = useState(defaultUserForm);
    const [authMode, setAuthMode] = useState('staff-login');
    const [managerAccessTarget, setManagerAccessTarget] = useState('reports');
    const [companyLookupId, setCompanyLookupId] = useState('');

    // Security States
    const [securityPin, setSecurityPin] = useState('');
    const [isPinAuthenticated, setIsPinAuthenticated] = useState(false);

    // Edit Product States
    const [editingProduct, setEditingProduct] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editFormData, setEditFormData] = useState({});

    // Cart Price Editing States
    const [editingCartItemId, setEditingCartItemId] = useState(null);
    const [editingCartPrice, setEditingCartPrice] = useState('');

    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [sales, setSales] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [newProduct, setNewProduct] = useState({ name: '', price: '', stock: '', category: '', cost: '' });
    const [busy, setBusy] = useState(false);

    // ---- Data loaders (replace the old localStorage reads) ----
    const loadStaff = async (cid) => setStaffUsers(await api(`/api/staff?companyId=${encodeURIComponent(cid)}`));
    const loadProducts = async (cid) => setProducts((await api(`/api/products?companyId=${encodeURIComponent(cid)}`)).map(normalizeProduct));
    const loadSales = async (cid) => setSales((await api(`/api/sales?companyId=${encodeURIComponent(cid)}`)).map(normalizeSale));

    const loadCompanyData = async (cid) => {
        await Promise.all([loadStaff(cid), loadProducts(cid), loadSales(cid)]);
    };

    // On mount: try to resume a session from a previous login on this device
    useEffect(() => {
        const restoreSession = async () => {
            const savedCompanyId = localStorage.getItem(SESSION_COMPANY_KEY);
            const savedUser = localStorage.getItem(SESSION_USER_KEY);

            if (!savedCompanyId) {
                setView('manager-signup');
                return;
            }

            try {
                const company = await api(`/api/company?companyId=${encodeURIComponent(savedCompanyId)}`);
                setCompanyId(company.company_id);
                setCompanyName(company.company_name);
                await loadCompanyData(company.company_id);

                if (savedUser) {
                    setCurrentUser(JSON.parse(savedUser));
                    setView('pos');
                } else {
                    setView('login');
                }
            } catch (err) {
                // Session pointed at a company that no longer resolves — start fresh
                localStorage.removeItem(SESSION_COMPANY_KEY);
                localStorage.removeItem(SESSION_USER_KEY);
                setView('manager-signup');
            }
        };
        restoreSession();
    }, []);

    // Persist session (not app data — just "who's logged in on this device")
    useEffect(() => {
        if (companyId) localStorage.setItem(SESSION_COMPANY_KEY, companyId);
    }, [companyId]);

    useEffect(() => {
        if (currentUser) localStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
        else localStorage.removeItem(SESSION_USER_KEY);
    }, [currentUser]);

    useEffect(() => {
        if (staffUsers.length > 0) {
            const userExists = staffUsers.some(user => user.id.toString() === selectedUserId);
            if (!selectedUserId || !userExists) setSelectedUserId(staffUsers[0].id.toString());
        } else if (selectedUserId) {
            setSelectedUserId('');
        }
        if (staffUsers.length === 0) setAuthMode('staff-signup');
    }, [staffUsers]);

    // ---- Cart logic (unchanged — cart stays client-only until checkout) ----
    const addToCart = (product) => {
        const existing = cart.find(item => item.id === product.id);
        if (existing) {
            setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
        } else {
            setCart([...cart, { ...product, quantity: 1, salePrice: product.price }]);
        }
    };

    const updateQuantity = (id, delta) => {
        setCart(cart.map(item => {
            if (item.id === id) {
                const newQty = item.quantity + delta;
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

    const updateSalePrice = (id, newPrice) => {
        setCart(cart.map(item => item.id === id ? { ...item, salePrice: parseFloat(newPrice) || item.price } : item));
        setEditingCartItemId(null);
        setEditingCartPrice('');
    };

    // ---- Sale: now a real POST, and stock is decremented server-side ----
    const completeSale = async () => {
        if (cart.length === 0) return;
        if (!currentUser) {
            alert('Please log in before making a sale.');
            setView('login');
            return;
        }
        const total = cart.reduce((sum, item) => sum + ((item.salePrice || item.price) * item.quantity), 0);

        setBusy(true);
        try {
            await api('/api/sales', {
                method: 'POST',
                body: JSON.stringify({
                    companyId,
                    cashierId: currentUser.id,
                    cashierName: currentUser.name,
                    total,
                    items: cart,
                }),
            });
            await Promise.all([loadSales(companyId), loadProducts(companyId)]);
            setCart([]);
            alert(`Sale completed! Total: GH₵${total.toFixed(2)}`);
        } catch (err) {
            alert(`Could not complete sale: ${err.message}`);
        } finally {
            setBusy(false);
        }
    };

    const openManagerLogin = (targetView) => {
        setManagerAccessTarget(targetView);
        setManagerCompanyIdInput('');
        setView('manager-login');
    };

    const handleManagerLogin = async () => {
        if (!managerCompanyIdInput.trim()) {
            alert('Enter your company ID.');
            return;
        }
        setBusy(true);
        try {
            await api('/api/login', {
                method: 'POST',
                body: JSON.stringify({ type: 'manager', companyId, pin: managerCompanyIdInput.trim() }),
            });
            setIsPinAuthenticated(true);
            setManagerCompanyIdInput('');
            setView(managerAccessTarget);
        } catch (err) {
            alert(err.message || 'Incorrect company ID.');
        } finally {
            setBusy(false);
        }
    };

    const lockInventory = () => {
        setIsPinAuthenticated(false);
        setView('pos');
    };

    // ---- Manager signup: creates the company row in Neon ----
    const completeManagerSignup = async () => {
        if (!companyName.trim()) {
            alert('Please enter your company name.');
            return;
        }
        if (!companyId.trim()) {
            alert('Please create a company ID.');
            return;
        }
        setBusy(true);
        try {
            await api('/api/company', {
                method: 'POST',
                body: JSON.stringify({ companyName: companyName.trim(), companyId: companyId.trim(), securityPin: securityPin || null }),
            });
            await loadCompanyData(companyId.trim());
            setView('setup');
        } catch (err) {
            alert(err.message || 'Could not create company.');
        } finally {
            setBusy(false);
        }
    };

    // Returning manager/staff on a new device: look up an existing company by ID
    const handleCompanyLookup = async () => {
        if (!companyLookupId.trim()) {
            alert('Enter your company ID.');
            return;
        }
        setBusy(true);
        try {
            const company = await api(`/api/company?companyId=${encodeURIComponent(companyLookupId.trim())}`);
            setCompanyId(company.company_id);
            setCompanyName(company.company_name);
            await loadCompanyData(company.company_id);
            setIsSetupComplete(true);
            setCompanyLookupId('');
            setView('login');
        } catch (err) {
            alert('No company found with that ID.');
        } finally {
            setBusy(false);
        }
    };

    const addStaffUser = async (options = {}) => {
        if (!newStaffUser.name.trim() || !newStaffUser.pin.trim()) {
            alert('Please enter a staff name and PIN.');
            return;
        }
        setBusy(true);
        try {
            await api('/api/staff', {
                method: 'POST',
                body: JSON.stringify({ companyId, name: newStaffUser.name.trim(), pin: newStaffUser.pin.trim() }),
            });
            await loadStaff(companyId);
            setNewStaffUser(defaultUserForm);
            if (options.switchToLogin) setAuthMode('staff-login');
        } catch (err) {
            alert(err.message || 'Could not add staff user.');
        } finally {
            setBusy(false);
        }
    };

    const deleteStaffUser = async (id) => {
        if (staffUsers.length === 1) {
            alert('At least one staff user is required.');
            return;
        }
        if (currentUser?.id === id) {
            alert('Log out this user before deleting the account.');
            return;
        }
        const userToDelete = staffUsers.find(user => user.id === id);
        if (!userToDelete) return;

        if (confirm(`Delete staff user "${userToDelete.name}"?`)) {
            try {
                await api(`/api/staff?id=${id}`, { method: 'DELETE' });
                await loadStaff(companyId);
            } catch (err) {
                alert(err.message || 'Could not delete staff user.');
            }
        }
    };

    const handleLogin = async () => {
        if (!staffCompanyIdInput.trim()) {
            alert('Enter your company ID.');
            return;
        }
        if (staffCompanyIdInput.trim().toLowerCase() !== companyId.trim().toLowerCase()) {
            alert('Company ID does not match this business.');
            return;
        }
        if (!selectedUserId || !loginPin.trim()) {
            alert('Select a user and enter the PIN to continue.');
            return;
        }

        setBusy(true);
        try {
            const result = await api('/api/login', {
                method: 'POST',
                body: JSON.stringify({ type: 'staff', companyId, staffId: selectedUserId, pin: loginPin.trim() }),
            });
            setCurrentUser({ id: result.id, name: result.name });
            setLoginPin('');
            setStaffCompanyIdInput('');
            setView('pos');
        } catch (err) {
            alert(err.message || 'Incorrect user or PIN.');
            setLoginPin('');
        } finally {
            setBusy(false);
        }
    };

    const logoutUser = () => {
        setCurrentUser(null);
        setCart([]);
        setIsPinAuthenticated(false);
        setAuthMode('staff-login');
        setView('login');
    };

    // ---- Products ----
    const addProduct = async () => {
        if (!newProduct.name || !newProduct.price || !newProduct.stock) {
            alert('Please fill all required fields');
            return;
        }
        setBusy(true);
        try {
            await api('/api/products', {
                method: 'POST',
                body: JSON.stringify({
                    companyId,
                    name: newProduct.name,
                    category: newProduct.category || 'General',
                    cost: newProduct.cost ? parseFloat(newProduct.cost) : 0,
                    price: parseFloat(newProduct.price),
                    stock: parseInt(newProduct.stock),
                }),
            });
            await loadProducts(companyId);
            setNewProduct({ name: '', price: '', stock: '', category: '', cost: '' });
        } catch (err) {
            alert(err.message || 'Could not add product.');
        } finally {
            setBusy(false);
        }
    };

    const deleteProduct = async (id) => {
        if (confirm('Are you sure you want to delete this product?')) {
            try {
                await api(`/api/products?id=${id}`, { method: 'DELETE' });
                await loadProducts(companyId);
            } catch (err) {
                alert(err.message || 'Could not delete product.');
            }
        }
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        setEditFormData({ ...product });
        setShowEditModal(true);
    };

    const updateProduct = async () => {
        if (!editFormData.name || !editFormData.price || !editFormData.stock) {
            alert('Please fill all required fields');
            return;
        }
        setBusy(true);
        try {
            await api('/api/products', {
                method: 'PUT',
                body: JSON.stringify({
                    id: editingProduct.id,
                    name: editFormData.name,
                    category: editFormData.category,
                    cost: parseFloat(editFormData.cost) || 0,
                    price: parseFloat(editFormData.price),
                    stock: parseInt(editFormData.stock),
                }),
            });
            await loadProducts(companyId);
            setShowEditModal(false);
            setEditingProduct(null);
            setEditFormData({});
            alert('Product updated successfully!');
        } catch (err) {
            alert(err.message || 'Could not update product.');
        } finally {
            setBusy(false);
        }
    };

    const completeSetup = () => {
        if (products.length === 0) {
            alert('Please add at least one product');
            return;
        }
        if (staffUsers.length === 0) {
            alert('Please add at least one staff login before completing setup.');
            return;
        }
        setIsSetupComplete(true);
        setView('login');
    };

    // Export still works the same way — just pulls from state (which now mirrors the DB) instead of localStorage
    const exportData = () => {
        const data = { companyName, companyId, products, sales, exportDate: new Date().toLocaleString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pos-data-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // "Reset" now only clears this device's session — the data itself lives in Neon.
    // Deleting the actual company/products/sales should be a deliberate server-side action, not a client button.
    const logOutOfDevice = () => {
        if (confirm('Log out of this device? Your company data stays safely stored — you can log back in anytime with your Company ID.')) {
            localStorage.removeItem(SESSION_COMPANY_KEY);
            localStorage.removeItem(SESSION_USER_KEY);
            setCompanyName('');
            setCompanyId('');
            setProducts([]);
            setSales([]);
            setCart([]);
            setStaffUsers([]);
            setCurrentUser(null);
            setIsSetupComplete(false);
            setView('manager-signup');
        }
    };

    const cartTotal = cart.reduce((sum, item) => sum + ((item.salePrice || item.price) * item.quantity), 0);
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const totalProfit = sales.reduce((sum, sale) => {
        const saleProfit = sale.items.reduce((itemSum, item) => {
            return itemSum + (((item.salePrice || item.price) - (item.cost || 0)) * item.quantity);
        }, 0);
        return sum + saleProfit;
    }, 0);
    const totalSales = sales.length;

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (view === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <p className="text-gray-500 text-lg">Loading your business...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 overflow-x-hidden">
            {/* Header */}
            <div className="bg-blue-600 text-white p-3 sm:p-4 shadow-lg">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold">{companyName || 'POS System'}</h1>
                        <p className="text-sm opacity-90">
                            Complete Point of Sale Solution
                            {currentUser ? ` - Logged in as ${currentUser.name}` : ''}
                        </p>
                    </div>
                    {isSetupComplete && (
                        <div className="grid grid-cols-2 sm:flex gap-2">
                            {currentUser && (
                                <button onClick={logoutUser} className="bg-blue-800 text-white px-3 py-2 rounded hover:bg-blue-900 text-sm sm:text-base">
                                    Log Out
                                </button>
                            )}
                            <button onClick={exportData} className="bg-white text-blue-600 px-3 py-2 rounded flex items-center justify-center gap-2 hover:bg-blue-50 text-sm sm:text-base">
                                <Download size={18} />
                                Export Data
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {view === 'manager-signup' ? (
                <div className="max-w-md mx-auto p-3 sm:p-6">
                    <div className="bg-white rounded-lg shadow-lg p-5 sm:p-8">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-center text-blue-600">Manager Sign Up</h2>
                        <p className="text-gray-600 text-center mb-6">
                            Create your business profile and company ID. Staff will use this company ID to log in to the right business.
                        </p>

                        <label className="block mb-2 font-semibold">Company Name *</label>
                        <input type="text" placeholder="Enter your company name" value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-4" />

                        <label className="block mb-2 font-semibold">Create Company ID *</label>
                        <input type="text" placeholder="e.g. acme-001" value={companyId}
                            onChange={(e) => setCompanyId(e.target.value)}
                            className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-6" />

                        <button onClick={completeManagerSignup} disabled={busy}
                            className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 disabled:opacity-50">
                            {busy ? 'Creating...' : 'Continue to Setup'}
                        </button>

                        <div className="mt-6 pt-6 border-t text-center">
                            <p className="text-sm text-gray-600 mb-3">Already set up on another device?</p>
                            <input type="text" placeholder="Enter your existing Company ID" value={companyLookupId}
                                onChange={(e) => setCompanyLookupId(e.target.value)}
                                className="w-full p-2 border rounded-lg mb-2" />
                            <button onClick={handleCompanyLookup} disabled={busy}
                                className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50">
                                {busy ? 'Looking up...' : 'Continue to Login'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : !isSetupComplete ? (
                <div className="max-w-4xl mx-auto p-3 sm:p-6">
                    <div className="bg-white rounded-lg shadow-lg p-4 sm:p-8">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center text-blue-600">Welcome! Let's Set Up Your POS</h2>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                            <p className="text-green-800 font-semibold">✓ Your data is saved to your account, not just this device.</p>
                            <p className="text-sm text-green-700">Log in with your Company ID from any device to see the same products and sales.</p>
                        </div>

                        <div className="mb-8 pb-8 border-b">
                            <h3 className="text-xl font-bold mb-4">Step 1: Company Information</h3>
                            <label className="block mb-2 font-semibold">Company Name *</label>
                            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-4" />

                            <label className="block mb-2 font-semibold">Company ID *</label>
                            <input type="text" value={companyId} disabled
                                className="w-full p-3 border-2 border-gray-200 bg-gray-100 rounded-lg text-lg mb-4" />

                            <label className="block mb-2 font-semibold">Manager PIN (Optional)</label>
                            <input type="password" placeholder="Enter a PIN to protect inventory/reports" value={securityPin}
                                onChange={(e) => setSecurityPin(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg" maxLength="6" />
                            <p className="text-sm text-gray-600 mt-1">🔒 This PIN protects Inventory and Reports from staff access</p>
                        </div>

                        <div className="mb-8 pb-8 border-b">
                            <h3 className="text-xl font-bold mb-4">Step 2: Staff Login Accounts</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Add each worker who should be able to log in and make sales.
                            </p>

                            <div className="bg-gray-50 p-4 rounded-lg mb-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    <input type="text" placeholder="Staff name *" value={newStaffUser.name}
                                        onChange={(e) => setNewStaffUser({ ...newStaffUser, name: e.target.value })}
                                        className="p-2 border rounded" />
                                    <input type="password" placeholder="Staff PIN *" value={newStaffUser.pin}
                                        onChange={(e) => setNewStaffUser({ ...newStaffUser, pin: e.target.value })}
                                        className="p-2 border rounded" maxLength="6" />
                                </div>
                                <button onClick={() => addStaffUser()} disabled={busy}
                                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 font-semibold disabled:opacity-50">
                                    {busy ? 'Adding...' : '+ Add Staff Login'}
                                </button>
                            </div>

                            {staffUsers.length > 0 ? (
                                <div className="space-y-2">
                                    {staffUsers.map(user => (
                                        <div key={user.id} className="bg-white p-3 rounded border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                            <div>
                                                <h5 className="font-semibold">{user.name}</h5>
                                                <p className="text-sm text-gray-600">Can log in and make sales</p>
                                            </div>
                                            <button onClick={() => deleteStaffUser(user.id)}
                                                className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 self-start sm:self-auto">
                                                Delete
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 py-4">Add at least one staff login to continue.</p>
                            )}
                        </div>

                        <div className="mb-8">
                            <h3 className="text-xl font-bold mb-4">Step 3: Add Your Products</h3>
                            <div className="bg-gray-50 p-4 rounded-lg mb-4">
                                <h4 className="font-semibold mb-3">Add a New Product:</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    <input type="text" placeholder="Product Name *" value={newProduct.name}
                                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                        className="p-2 border rounded" />
                                    <input type="text" placeholder="Category (e.g., Beverages, Food)" value={newProduct.category}
                                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                                        className="p-2 border rounded" />
                                    <input type="number" placeholder="Cost Price * (e.g., 1.50)" value={newProduct.cost}
                                        onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
                                        className="p-2 border rounded" step="0.01" />
                                    <input type="number" placeholder="Selling Price * (e.g., 3.50)" value={newProduct.price}
                                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                                        className="p-2 border rounded" step="0.01" />
                                    <input type="number" placeholder="Stock Quantity * (e.g., 100)" value={newProduct.stock}
                                        onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                                        className="p-2 border rounded" />
                                </div>
                                <button onClick={addProduct} disabled={busy}
                                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 font-semibold disabled:opacity-50">
                                    {busy ? 'Adding...' : '+ Add Product'}
                                </button>
                            </div>

                            {products.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-3">Your Products ({products.length}):</h4>
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {products.map(product => (
                                            <div key={product.id} className="bg-white p-3 rounded border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                                <div>
                                                    <h5 className="font-semibold">{product.name}</h5>
                                                    <p className="text-sm text-gray-600">
                                                        {product.category} • Cost: GH₵{product.cost.toFixed(2)} • Price: GH₵{product.price.toFixed(2)} • Profit: GH₵{(product.price - product.cost).toFixed(2)} • Stock: {product.stock}
                                                    </p>
                                                </div>
                                                <button onClick={() => deleteProduct(product.id)}
                                                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 self-start sm:self-auto">
                                                    Delete
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {products.length === 0 && (
                                <p className="text-center text-gray-500 py-8">No products added yet. Add your first product above!</p>
                            )}
                        </div>

                        <button onClick={completeSetup} className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700">
                            Complete Setup & Start Using POS
                        </button>
                    </div>
                </div>
            ) : (view === 'manager-login' || (view === 'login' && !currentUser)) ? (
                <div className="max-w-md mx-auto p-3 sm:p-6">
                    <div className="bg-white rounded-lg shadow-lg p-5 sm:p-8">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-center text-blue-600">
                            {view === 'manager-login' ? 'Manager Login' : 'Staff Login'}
                        </h2>
                        <p className="text-gray-600 text-center mb-6">
                            {view === 'manager-login'
                                ? `Enter your manager PIN to unlock ${managerAccessTarget}.`
                                : staffUsers.length === 0
                                    ? `Create your first account to start making sales for ${companyName}.`
                                    : `Log in to start making sales for ${companyName}.`}
                        </p>

                        {view !== 'manager-login' && (
                            <div className="grid grid-cols-2 gap-2 mb-5">
                                <button onClick={() => setAuthMode('staff-login')} disabled={staffUsers.length === 0}
                                    className={`py-2 rounded-lg font-semibold ${authMode === 'staff-login' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'} ${staffUsers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    Log In
                                </button>
                                <button onClick={() => setAuthMode('staff-signup')}
                                    className={`py-2 rounded-lg font-semibold ${authMode === 'staff-signup' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                                    Sign Up
                                </button>
                            </div>
                        )}

                        {view === 'manager-login' ? (
                            <>
                                <label className="block mb-2 font-semibold">Manager PIN</label>
                                <input type="password" placeholder="Enter manager PIN" value={managerCompanyIdInput}
                                    onChange={(e) => setManagerCompanyIdInput(e.target.value)}
                                    onKeyPress={(e) => { if (e.key === 'Enter') handleManagerLogin(); }}
                                    className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-6" />
                                <button onClick={handleManagerLogin} disabled={busy}
                                    className="w-full bg-gray-800 text-white py-4 rounded-lg font-bold text-lg hover:bg-gray-900 disabled:opacity-50">
                                    {busy ? 'Checking...' : 'Unlock Manager Access'}
                                </button>
                                <button onClick={() => setView('login')}
                                    className="w-full mt-3 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300">
                                    Back to Staff Login
                                </button>
                            </>
                        ) : authMode === 'staff-signup' || staffUsers.length === 0 ? (
                            <>
                                <label className="block mb-2 font-semibold">Staff Name</label>
                                <input type="text" placeholder="Enter your name" value={newStaffUser.name}
                                    onChange={(e) => setNewStaffUser({ ...newStaffUser, name: e.target.value })}
                                    className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-4" />

                                <label className="block mb-2 font-semibold">Create PIN</label>
                                <input type="password" placeholder="Create your PIN" value={newStaffUser.pin}
                                    onChange={(e) => setNewStaffUser({ ...newStaffUser, pin: e.target.value })}
                                    onKeyPress={(e) => { if (e.key === 'Enter') addStaffUser({ switchToLogin: true }); }}
                                    className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-6" maxLength="6" />

                                <button onClick={() => addStaffUser({ switchToLogin: true })} disabled={busy}
                                    className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 disabled:opacity-50">
                                    {busy ? 'Creating...' : 'Create Account'}
                                </button>
                            </>
                        ) : (
                            <>
                                <label className="block mb-2 font-semibold">Company ID</label>
                                <input type="text" placeholder="Enter company ID" value={staffCompanyIdInput}
                                    onChange={(e) => setStaffCompanyIdInput(e.target.value)}
                                    className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-4" />

                                <label className="block mb-2 font-semibold">Staff User</label>
                                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
                                    className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-4">
                                    {staffUsers.map(user => (
                                        <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                </select>

                                <label className="block mb-2 font-semibold">PIN</label>
                                <input type="password" placeholder="Enter your PIN" value={loginPin}
                                    onChange={(e) => setLoginPin(e.target.value)}
                                    onKeyPress={(e) => { if (e.key === 'Enter') handleLogin(); }}
                                    className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-6" maxLength="6" />

                                <button onClick={handleLogin} disabled={busy}
                                    className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 disabled:opacity-50">
                                    {busy ? 'Logging in...' : 'Log In'}
                                </button>

                                <button onClick={() => openManagerLogin('reports')}
                                    className="w-full mt-3 bg-gray-800 text-white py-3 rounded-lg font-semibold hover:bg-gray-900">
                                    Manager Login
                                </button>
                                <button onClick={logOutOfDevice}
                                    className="w-full mt-3 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300">
                                    Not your business? Switch Company
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    <div className="bg-white shadow-md">
                        <div className="grid grid-cols-2 sm:flex gap-2 p-2">
                            <button onClick={() => setView('pos')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-sm sm:text-base ${view === 'pos' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                                <ShoppingCart size={20} />
                                Point of Sale
                            </button>
                            <button onClick={() => { if (!isPinAuthenticated) openManagerLogin('inventory'); else setView('inventory'); }}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-sm sm:text-base ${view === 'inventory' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                                <Package size={20} />
                                Inventory <span className="text-xs">👨‍💼</span>
                            </button>
                            <button onClick={() => { if (!isPinAuthenticated) openManagerLogin('reports'); else setView('reports'); }}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-sm sm:text-base ${view === 'reports' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                                <BarChart size={20} />
                                Reports <span className="text-xs">👨‍💼</span>
                            </button>
                            <button onClick={() => setView('settings')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-sm sm:text-base ${view === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                                <Settings size={20} />
                                Settings
                            </button>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4">
                        {view === 'pos' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-2 bg-white rounded-lg shadow p-4">
                                    <div className="mb-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                                            <input type="text" placeholder="Search products..." value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border rounded-lg" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto">
                                        {filteredProducts.map(product => (
                                            <button key={product.id} onClick={() => addToCart(product)} disabled={product.stock === 0}
                                                className={`p-4 rounded-lg text-left transition ${product.stock === 0 ? 'bg-gray-200 cursor-not-allowed' : 'bg-blue-50 hover:bg-blue-100'}`}>
                                                <h3 className="font-semibold text-lg">{product.name}</h3>
                                                <p className="text-blue-600 font-bold">GH₵{product.price.toFixed(2)}</p>
                                                <p className={`text-sm ${product.stock === 0 ? 'text-red-600' : 'text-gray-600'}`}>Stock: {product.stock}</p>
                                                <p className="text-xs text-gray-500">{product.category}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-white rounded-lg shadow p-4">
                                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <ShoppingCart />
                                        Current Sale
                                    </h2>

                                    <div className="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
                                        {cart.length === 0 ? (
                                            <p className="text-gray-500 text-center py-8">Cart is empty</p>
                                        ) : (
                                            cart.map(item => (
                                                <div key={item.id} className="bg-gray-50 p-3 rounded flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold">{item.name}</h4>
                                                        <p className="text-sm text-gray-600">
                                                            {editingCartItemId === item.id ? (
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-xs">GH₵</span>
                                                                    <input type="number" value={editingCartPrice}
                                                                        onChange={(e) => setEditingCartPrice(e.target.value)}
                                                                        placeholder="Enter price" className="w-20 p-1 border rounded text-sm" step="0.01" autoFocus />
                                                                    <button onClick={() => updateSalePrice(item.id, editingCartPrice)}
                                                                        className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600">✓</button>
                                                                    <button onClick={() => { setEditingCartItemId(null); setEditingCartPrice(''); }}
                                                                        className="bg-gray-400 text-white px-2 py-1 rounded text-xs hover:bg-gray-500">✕</button>
                                                                </div>
                                                            ) : (
                                                                <span onClick={() => { setEditingCartItemId(item.id); setEditingCartPrice(item.salePrice || item.price); }}
                                                                    className="cursor-pointer hover:text-blue-600 hover:underline" title="Click to edit price">
                                                                    GH₵{(item.salePrice || item.price).toFixed(2)} × {item.quantity}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                                        <button onClick={() => updateQuantity(item.id, -1)} className="bg-gray-300 p-1 rounded hover:bg-gray-400"><Minus size={16} /></button>
                                                        <span className="font-bold w-8 text-center">{item.quantity}</span>
                                                        <button onClick={() => updateQuantity(item.id, 1)} className="bg-gray-300 p-1 rounded hover:bg-gray-400"><Plus size={16} /></button>
                                                        <button onClick={() => removeFromCart(item.id)} className="bg-red-500 text-white p-1 rounded hover:bg-red-600"><Trash2 size={16} /></button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="border-t pt-4">
                                        <div className="flex justify-between text-2xl font-bold mb-4">
                                            <span>Total:</span>
                                            <span className="text-blue-600">GH₵{cartTotal.toFixed(2)}</span>
                                        </div>
                                        <button onClick={completeSale} disabled={cart.length === 0 || busy}
                                            className={`w-full py-3 rounded-lg font-bold text-white ${cart.length === 0 || busy ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
                                            {busy ? 'Processing...' : 'Complete Sale'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {view === 'inventory' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-2 bg-white rounded-lg shadow p-4">
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                                        <h2 className="text-xl font-bold">Product Inventory</h2>
                                        {isPinAuthenticated && (
                                            <button onClick={lockInventory} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center gap-2">
                                                🔒 Lock Inventory
                                            </button>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[700px]">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="p-2 text-left">Name</th>
                                                    <th className="p-2 text-left">Category</th>
                                                    <th className="p-2 text-right">Cost</th>
                                                    <th className="p-2 text-right">Price</th>
                                                    <th className="p-2 text-right">Profit</th>
                                                    <th className="p-2 text-right">Stock</th>
                                                    <th className="p-2 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {products.map(product => (
                                                    <tr key={product.id} className="border-b hover:bg-gray-50">
                                                        <td className="p-2">{product.name}</td>
                                                        <td className="p-2">{product.category}</td>
                                                        <td className="p-2 text-right">GH₵{product.cost.toFixed(2)}</td>
                                                        <td className="p-2 text-right">GH₵{product.price.toFixed(2)}</td>
                                                        <td className="p-2 text-right font-semibold text-green-600">GH₵{(product.price - product.cost).toFixed(2)}</td>
                                                        <td className="p-2 text-right">
                                                            <span className={product.stock < 20 ? 'text-red-600 font-bold' : ''}>{product.stock}</span>
                                                        </td>
                                                        <td className="p-2 text-center space-x-1">
                                                            <button onClick={() => openEditModal(product)} className="bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600">Edit</button>
                                                            <button onClick={() => deleteProduct(product.id)} className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600">Delete</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="bg-white rounded-lg shadow p-4">
                                    <h2 className="text-xl font-bold mb-4">Add New Product</h2>
                                    <div className="space-y-3">
                                        <input type="text" placeholder="Product Name" value={newProduct.name}
                                            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className="w-full p-2 border rounded" />
                                        <input type="number" placeholder="Cost Price" value={newProduct.cost}
                                            onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })} className="w-full p-2 border rounded" step="0.01" />
                                        <input type="number" placeholder="Selling Price" value={newProduct.price}
                                            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} className="w-full p-2 border rounded" step="0.01" />
                                        <input type="number" placeholder="Stock Quantity" value={newProduct.stock}
                                            onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })} className="w-full p-2 border rounded" />
                                        <input type="text" placeholder="Category" value={newProduct.category}
                                            onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} className="w-full p-2 border rounded" />
                                        <button onClick={addProduct} disabled={busy} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
                                            {busy ? 'Adding...' : 'Add Product'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {view === 'reports' && (
                            <>
                                {!isPinAuthenticated ? (
                                    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-5 sm:p-8 text-center">
                                        <div className="text-6xl mb-4">🔒</div>
                                        <h2 className="text-2xl font-bold mb-4 text-red-600">Access Denied</h2>
                                        <p className="text-gray-600 mb-6">Reports are only accessible to managers.</p>
                                        <button onClick={() => openManagerLogin('reports')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
                                            Manager Login
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                                            <h2 className="text-xl font-bold">Reports & Analytics</h2>
                                            <button onClick={lockInventory} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center gap-2">
                                                🔒 Lock Reports
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="bg-white rounded-lg shadow p-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0">
                                                        <p className="text-gray-600 text-sm">Total Sales</p>
                                                        <p className="text-3xl font-bold">{totalSales}</p>
                                                    </div>
                                                    <TrendingUp className="text-blue-600" size={40} />
                                                </div>
                                            </div>
                                            <div className="bg-white rounded-lg shadow p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-gray-600 text-sm">Total Revenue</p>
                                                        <p className="text-2xl sm:text-3xl font-bold break-all">GH₵{totalRevenue.toFixed(2)}</p>
                                                    </div>
                                                    <DollarSign className="text-green-600" size={40} />
                                                </div>
                                            </div>
                                            <div className="bg-white rounded-lg shadow p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-gray-600 text-sm">Total Profit</p>
                                                        <p className="text-2xl sm:text-3xl font-bold text-green-600 break-all">GH₵{totalProfit.toFixed(2)}</p>
                                                    </div>
                                                    <TrendingUp className="text-green-600" size={40} />
                                                </div>
                                            </div>
                                            <div className="bg-white rounded-lg shadow p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-gray-600 text-sm">Products</p>
                                                        <p className="text-3xl font-bold">{products.length}</p>
                                                    </div>
                                                    <Package className="text-purple-600" size={40} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-lg shadow p-4">
                                            <h2 className="text-xl font-bold mb-4">Sales History</h2>
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-[760px]">
                                                    <thead className="bg-gray-100">
                                                        <tr>
                                                            <th className="p-2 text-left">Date</th>
                                                            <th className="p-2 text-left">Cashier</th>
                                                            <th className="p-2 text-left">Items</th>
                                                            <th className="p-2 text-right">Revenue</th>
                                                            <th className="p-2 text-right">Profit</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sales.length === 0 ? (
                                                            <tr>
                                                                <td colSpan="5" className="p-4 text-center text-gray-500">No sales recorded yet</td>
                                                            </tr>
                                                        ) : (
                                                            sales.map(sale => {
                                                                const saleProfit = sale.items.reduce((sum, item) => {
                                                                    return sum + (((item.salePrice || item.price) - (item.cost || 0)) * item.quantity);
                                                                }, 0);
                                                                return (
                                                                    <tr key={sale.id} className="border-b">
                                                                        <td className="p-2">{sale.date}</td>
                                                                        <td className="p-2">{sale.cashierName || 'Unknown User'}</td>
                                                                        <td className="p-2">
                                                                            {sale.items.map(item => {
                                                                                const displayPrice = item.salePrice || item.price;
                                                                                const priceNote = item.salePrice && item.salePrice !== item.price ? ` (GH₵${displayPrice.toFixed(2)})` : '';
                                                                                return `${item.name} (${item.quantity})${priceNote}`;
                                                                            }).join(', ')}
                                                                        </td>
                                                                        <td className="p-2 text-right font-bold">GH₵{sale.total.toFixed(2)}</td>
                                                                        <td className="p-2 text-right font-bold text-green-600">GH₵{saleProfit.toFixed(2)}</td>
                                                                    </tr>
                                                                );
                                                            })
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {view === 'settings' && (
                            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-4 sm:p-6">
                                <h2 className="text-xl font-bold mb-4">Settings</h2>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block mb-2 font-semibold">Company Name</label>
                                        <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                                            className="w-full p-3 border rounded-lg" />
                                        <p className="text-sm text-gray-600 mt-1">Editing here updates local state only — a "Save" API call can be wired up if you want this persisted.</p>
                                    </div>

                                    <div>
                                        <label className="block mb-2 font-semibold">Company ID</label>
                                        <input type="text" value={companyId} disabled className="w-full p-3 border rounded-lg bg-gray-100" />
                                        <p className="text-sm text-gray-600 mt-1">Staff and manager must enter this ID before access.</p>
                                    </div>

                                    <div className="border-t pt-6">
                                        <h3 className="font-semibold mb-3">Staff Logins</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                            <input type="text" value={newStaffUser.name}
                                                onChange={(e) => setNewStaffUser({ ...newStaffUser, name: e.target.value })}
                                                placeholder="Staff name" className="w-full p-3 border rounded-lg" />
                                            <input type="password" value={newStaffUser.pin}
                                                onChange={(e) => setNewStaffUser({ ...newStaffUser, pin: e.target.value })}
                                                placeholder="Staff PIN" className="w-full p-3 border rounded-lg" maxLength="6" />
                                        </div>
                                        <button onClick={() => addStaffUser()} disabled={busy} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
                                            {busy ? 'Adding...' : 'Add Staff Login'}
                                        </button>
                                        <div className="space-y-2 mt-4">
                                            {staffUsers.map(user => (
                                                <div key={user.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50 border rounded-lg p-3">
                                                    <div>
                                                        <p className="font-semibold">{user.name}</p>
                                                        <p className="text-sm text-gray-600">Login enabled for sales</p>
                                                    </div>
                                                    <button onClick={() => deleteStaffUser(user.id)} className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">Delete</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="border-t pt-6">
                                        <h3 className="font-semibold mb-3 text-red-600">Device Session</h3>
                                        <button onClick={logOutOfDevice} className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700">
                                            Log Out of This Device
                                        </button>
                                        <p className="text-sm text-gray-600 mt-2">Your products, sales, and staff stay safe in your account — this only signs you out here.</p>
                                    </div>

                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <h4 className="font-semibold text-blue-800 mb-2">💾 Data Storage Info</h4>
                                        <p className="text-sm text-blue-700">Your data is now stored in your account's database — it syncs across every device you log into with your Company ID.</p>
                                        <p className="text-sm text-blue-700 mt-2">Use the "Export Data" button in the header to download a backup anytime.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {showEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
                    <div className="bg-white rounded-lg shadow-xl p-5 sm:p-8 max-w-md w-full max-h-[92vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold mb-6 text-center">Edit Product</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-semibold mb-1">Product Name</label>
                                <input type="text" value={editFormData.name || ''} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                    className="w-full p-2 border rounded-lg" placeholder="Product name" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Category</label>
                                <input type="text" value={editFormData.category || ''} onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                                    className="w-full p-2 border rounded-lg" placeholder="Category" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Cost Price</label>
                                <input type="number" value={editFormData.cost || ''} onChange={(e) => setEditFormData({ ...editFormData, cost: e.target.value })}
                                    className="w-full p-2 border rounded-lg" placeholder="Cost price" step="0.01" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Selling Price</label>
                                <input type="number" value={editFormData.price || ''} onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })}
                                    className="w-full p-2 border rounded-lg" placeholder="Selling price" step="0.01" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Stock Quantity</label>
                                <input type="number" value={editFormData.stock || ''} onChange={(e) => setEditFormData({ ...editFormData, stock: e.target.value })}
                                    className="w-full p-2 border rounded-lg" placeholder="Stock quantity" />
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 mt-6">
                            <button onClick={() => { setShowEditModal(false); setEditingProduct(null); setEditFormData({}); }}
                                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400">
                                Cancel
                            </button>
                            <button onClick={updateProduct} disabled={busy} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                                {busy ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POSSystem;
