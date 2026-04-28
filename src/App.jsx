import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, DollarSign, TrendingUp, Plus, Minus, Trash2, Search, BarChart, Settings, Download } from 'lucide-react';

const POSSystem = () => {
    const [view, setView] = useState('setup');
    const [companyName, setCompanyName] = useState('');
    const [isSetupComplete, setIsSetupComplete] = useState(false);

    // PIN Security States
    const [securityPin, setSecurityPin] = useState('');
    const [managerPin, setManagerPin] = useState('');
    const [isPinAuthenticated, setIsPinAuthenticated] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [showPinPrompt, setShowPinPrompt] = useState(false);
    const [pinPurpose, setPinPurpose] = useState(''); // 'inventory' or 'settings'

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

    // Load data from storage on mount
    useEffect(() => {
        const loadData = () => {
            const savedCompany = localStorage.getItem('pos_company_name');
            const savedProducts = localStorage.getItem('pos_products');
            const savedSales = localStorage.getItem('pos_sales');
            const savedSetup = localStorage.getItem('pos_setup_complete');
            const savedPin = localStorage.getItem('pos_security_pin');
            const savedManagerPin = localStorage.getItem('pos_manager_pin');

            if (savedCompany) setCompanyName(savedCompany);
            if (savedProducts) setProducts(JSON.parse(savedProducts));
            if (savedSales) setSales(JSON.parse(savedSales));
            if (savedPin) setSecurityPin(savedPin);
            if (savedManagerPin) setManagerPin(savedManagerPin);
            if (savedSetup === 'true') {
                setIsSetupComplete(true);
                setView('pos');
            }
        };

        loadData();

    }, []);

    // Save company name
    useEffect(() => {
        if (companyName) {
            localStorage.setItem('pos_company_name', companyName);
        }
    }, [companyName]);

    // Save products
    useEffect(() => {
        if (products.length > 0) {
            localStorage.setItem('pos_products', JSON.stringify(products));
        }
    }, [products]);

    // Save sales
    useEffect(() => {
        if (sales.length > 0) {
            localStorage.setItem('pos_sales', JSON.stringify(sales));
        }
    }, [sales]);

    // Save setup status
    useEffect(() => {
        localStorage.setItem('pos_setup_complete', isSetupComplete.toString());
    }, [isSetupComplete]);

    // Save PIN
    useEffect(() => {
        if (securityPin) {
            localStorage.setItem('pos_security_pin', securityPin);
        }
    }, [securityPin]);

    // Save Manager PIN
    useEffect(() => {
        if (managerPin) {
            localStorage.setItem('pos_manager_pin', managerPin);
        }
    }, [managerPin]);

    // Add to cart
    const addToCart = (product) => {
        const existing = cart.find(item => item.id === product.id);
        if (existing) {
            setCart(cart.map(item =>
                item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
            ));
        } else {
            setCart([...cart, { ...product, quantity: 1, salePrice: product.price }]);
        }
    };

    // Update quantity
    const updateQuantity = (id, delta) => {
        setCart(cart.map(item => {
            if (item.id === id) {
                const newQty = item.quantity + delta;
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    // Remove from cart
    const removeFromCart = (id) => {
        setCart(cart.filter(item => item.id !== id));
    };

    // Update sale price for cart item
    const updateSalePrice = (id, newPrice) => {
        setCart(cart.map(item =>
            item.id === id ? { ...item, salePrice: parseFloat(newPrice) || item.price } : item
        ));
        setEditingCartItemId(null);
        setEditingCartPrice('');
    };

    // Complete sale
    const completeSale = () => {
        if (cart.length === 0) return;
        const total = cart.reduce((sum, item) => sum + ((item.salePrice || item.price) * item.quantity), 0);
        const sale = {
            id: Date.now(),
            items: cart,
            total: total,
            date: new Date().toLocaleString()
        };

        setSales([sale, ...sales]);

        // Update inventory
        setProducts(products.map(product => {
            const cartItem = cart.find(item => item.id === product.id);
            if (cartItem) {
                return { ...product, stock: product.stock - cartItem.quantity };
            }
            return product;
        }));

        setCart([]);
        alert(`Sale completed! Total: GH₵${total.toFixed(2)}`);

    };

    // PIN Authentication Functions
    const handlePinSubmit = () => {
        if (pinPurpose === 'inventory' || pinPurpose === 'reports') {
            if (pinInput === managerPin) {
                setIsPinAuthenticated(true);
                setShowPinPrompt(false);
                setPinInput('');
                setView(pinPurpose);
                setPinPurpose('');
            } else {
                alert('Incorrect Manager PIN! Please try again.');
                setPinInput('');
            }
        }
    };

    const requestInventoryAccess = () => {
        if (managerPin) {
            setPinPurpose('inventory');
            setShowPinPrompt(true);
            setPinInput('');
        } else {
            setView('inventory');
        }
    };

    const lockInventory = () => {
        setIsPinAuthenticated(false);
        setView('pos');
    };

    // Add new product
    const addProduct = () => {
        if (!newProduct.name || !newProduct.price || !newProduct.stock) {
            alert('Please fill all required fields');
            return;
        }
        const product = {
            id: Date.now(),
            name: newProduct.name,
            price: parseFloat(newProduct.price),
            cost: newProduct.cost ? parseFloat(newProduct.cost) : 0,
            stock: parseInt(newProduct.stock),
            category: newProduct.category || 'General'
        };

        setProducts([...products, product]);
        setNewProduct({ name: '', price: '', stock: '', category: '', cost: '' });

    };

    // Delete product
    const deleteProduct = (id) => {
        if (confirm('Are you sure you want to delete this product?')) {
            setProducts(products.filter(p => p.id !== id));
        }
    };

    // Edit product - open modal
    const openEditModal = (product) => {
        setEditingProduct(product);
        setEditFormData({ ...product });
        setShowEditModal(true);
    };

    // Update product
    const updateProduct = () => {
        if (!editFormData.name || !editFormData.price || !editFormData.stock) {
            alert('Please fill all required fields');
            return;
        }

        setProducts(products.map(p => 
            p.id === editingProduct.id 
                ? {
                    ...p,
                    name: editFormData.name,
                    price: parseFloat(editFormData.price),
                    cost: parseFloat(editFormData.cost) || 0,
                    stock: parseInt(editFormData.stock),
                    category: editFormData.category
                }
                : p
        ));

        setShowEditModal(false);
        setEditingProduct(null);
        setEditFormData({});
        alert('Product updated successfully!');
    };

    // Complete setup
    const completeSetup = () => {
        if (!companyName.trim()) {
            alert('Please enter your company name');
            return;
        }
        if (products.length === 0) {
            alert('Please add at least one product');
            return;
        }
        setIsSetupComplete(true);
        setView('pos');
    };

    // Export data
    const exportData = () => {
        const data = {
            companyName,
            products,
            sales,
            exportDate: new Date().toLocaleString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pos-data-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

    };

    // Reset all data
    const resetAllData = () => {
        if (confirm('Are you sure? This will delete ALL data including products, sales, and company info. This cannot be undone!')) {
            if (confirm('Really sure? This is your last chance!')) {
                localStorage.removeItem('pos_company_name');
                localStorage.removeItem('pos_products');
                localStorage.removeItem('pos_sales');
                localStorage.removeItem('pos_setup_complete');
                localStorage.removeItem('pos_security_pin');
                localStorage.removeItem('pos_manager_pin');
                setCompanyName('');
                setProducts([]);
                setSales([]);
                setCart([]);
                setIsSetupComplete(false);
                setSecurityPin('');
                setManagerPin('');
                setIsPinAuthenticated(false);
                setView('setup');

                alert('All data has been reset. Starting fresh!');
            }
        }

    };

    // Calculate totals
    const cartTotal = cart.reduce((sum, item) => sum + ((item.salePrice || item.price) * item.quantity), 0);
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const totalProfit = sales.reduce((sum, sale) => {
        const saleProfit = sale.items.reduce((itemSum, item) => {
            return itemSum + (((item.salePrice || item.price) - (item.cost || 0)) * item.quantity);
        }, 0);
        return sum + saleProfit;
    }, 0);
    const totalSales = sales.length;

    // Filter products
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-blue-600 text-white p-4 shadow-lg">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">{companyName || 'POS System'}</h1>
                        <p className="text-sm opacity-90">Complete Point of Sale Solution</p>
                    </div>
                    {isSetupComplete && (
                        <div className="flex gap-2">
                            <button
                                onClick={exportData}
                                className="bg-white text-blue-600 px-3 py-2 rounded flex items-center gap-2 hover:bg-blue-50"
                            >
                                <Download size={18} />
                                Export Data
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {/* Setup View */}
            {!isSetupComplete ? (
                <div className="max-w-4xl mx-auto p-6">
                    <div className="bg-white rounded-lg shadow-lg p-8">
                        <h2 className="text-3xl font-bold mb-6 text-center text-blue-600">Welcome! Let's Set Up Your POS</h2>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                            <p className="text-green-800 font-semibold">✓ All your data will be saved automatically!</p>
                            <p className="text-sm text-green-700">Your company info, products, and sales are stored securely in your browser.</p>
                        </div>

                        {/* Company Name Section */}
                        <div className="mb-8 pb-8 border-b">
                            <h3 className="text-xl font-bold mb-4">Step 1: Company Information</h3>
                            <label className="block mb-2 font-semibold">Company Name *</label>
                            <input
                                type="text"
                                placeholder="Enter your company name (e.g., Joe's Coffee Shop)"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg mb-4"
                            />

                            <label className="block mb-2 font-semibold">Security PIN (Optional)</label>
                            <input
                                type="password"
                                placeholder="Enter a 4-6 digit PIN to protect your inventory"
                                value={securityPin}
                                onChange={(e) => setSecurityPin(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg"
                                maxLength="6"
                            />
                            <p className="text-sm text-gray-600 mt-1">🔒 This PIN will protect your inventory from unauthorized access</p>
                        </div>

                        {/* Products Section */}
                        <div className="mb-8">
                            <h3 className="text-xl font-bold mb-4">Step 2: Add Your Products</h3>

                            <div className="bg-gray-50 p-4 rounded-lg mb-4">
                                <h4 className="font-semibold mb-3">Add a New Product:</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    <input
                                        type="text"
                                        placeholder="Product Name *"
                                        value={newProduct.name}
                                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                        className="p-2 border rounded"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Category (e.g., Beverages, Food)"
                                        value={newProduct.category}
                                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                                        className="p-2 border rounded"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Cost Price * (e.g., 1.50)"
                                        value={newProduct.cost}
                                        onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
                                        className="p-2 border rounded"
                                        step="0.01"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Selling Price * (e.g., 3.50)"
                                        value={newProduct.price}
                                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                                        className="p-2 border rounded"
                                        step="0.01"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Stock Quantity * (e.g., 100)"
                                        value={newProduct.stock}
                                        onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                                        className="p-2 border rounded"
                                    />
                                </div>
                                <button
                                    onClick={addProduct}
                                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 font-semibold"
                                >
                                    + Add Product
                                </button>
                            </div>

                            {/* Product List */}
                            {products.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-3">Your Products ({products.length}):</h4>
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {products.map(product => (
                                            <div key={product.id} className="bg-white p-3 rounded border flex justify-between items-center">
                                                <div>
                                                    <h5 className="font-semibold">{product.name}</h5>
                                                    <p className="text-sm text-gray-600">
                                                        {product.category} • Cost: GH₵{(product.cost || 0).toFixed(2)} • Price: GH₵{product.price.toFixed(2)} • Profit: GH₵{(product.price - (product.cost || 0)).toFixed(2)} • Stock: {product.stock}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => deleteProduct(product.id)}
                                                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                                                >
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

                        {/* Complete Setup Button */}
                        <button
                            onClick={completeSetup}
                            className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700"
                        >
                            Complete Setup & Start Using POS
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Navigation */}
                    <div className="bg-white shadow-md">
                        <div className="flex gap-2 p-2">
                            <button
                                onClick={() => setView('pos')}
                                className={`flex items-center gap-2 px-4 py-2 rounded ${view === 'pos' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                                    }`}
                            >
                                <ShoppingCart size={20} />
                                Point of Sale
                            </button>
                            <button
                                onClick={() => {
                                    if (managerPin && !isPinAuthenticated) {
                                        requestInventoryAccess();
                                    } else {
                                        setView('inventory');
                                    }
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded ${view === 'inventory' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                                    }`}
                            >
                                <Package size={20} />
                                Inventory {managerPin && <span className="text-xs">👨‍💼</span>}
                            </button>
                            <button
                                onClick={() => {
                                    if (managerPin && !isPinAuthenticated) {
                                        setPinPurpose('reports');
                                        setShowPinPrompt(true);
                                        setPinInput('');
                                    } else if (!managerPin) {
                                        setView('reports');
                                    } else {
                                        setView('reports');
                                    }
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded ${view === 'reports' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                                    }`}
                            >
                                <BarChart size={20} />
                                Reports {managerPin && <span className="text-xs">👨‍💼</span>}
                            </button>
                            <button
                                onClick={() => setView('settings')}
                                className={`flex items-center gap-2 px-4 py-2 rounded ${view === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                                    }`}
                            >
                                <Settings size={20} />
                                Settings
                            </button>
                        </div>
                    </div>

                    <div className="p-4">
                        {/* POS View */}
                        {view === 'pos' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {/* Product Selection */}
                                <div className="lg:col-span-2 bg-white rounded-lg shadow p-4">
                                    <div className="mb-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                                            <input
                                                type="text"
                                                placeholder="Search products..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border rounded-lg"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto">
                                        {filteredProducts.map(product => (
                                            <button
                                                key={product.id}
                                                onClick={() => addToCart(product)}
                                                disabled={product.stock === 0}
                                                className={`p-4 rounded-lg text-left transition ${product.stock === 0
                                                    ? 'bg-gray-200 cursor-not-allowed'
                                                    : 'bg-blue-50 hover:bg-blue-100'
                                                    }`}
                                            >
                                                <h3 className="font-semibold text-lg">{product.name}</h3>
                                                <p className="text-blue-600 font-bold">GH₵{product.price.toFixed(2)}</p>
                                                <p className={`text-sm ${product.stock === 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                                    Stock: {product.stock}
                                                </p>
                                                <p className="text-xs text-gray-500">{product.category}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Cart */}
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
                                                <div key={item.id} className="bg-gray-50 p-3 rounded flex justify-between items-center">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold">{item.name}</h4>
                                                        <p className="text-sm text-gray-600">
                                                            {editingCartItemId === item.id ? (
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-xs">GH₵</span>
                                                                    <input
                                                                        type="number"
                                                                        value={editingCartPrice}
                                                                        onChange={(e) => setEditingCartPrice(e.target.value)}
                                                                        placeholder="Enter price"
                                                                        className="w-20 p-1 border rounded text-sm"
                                                                        step="0.01"
                                                                        autoFocus
                                                                    />
                                                                    <button
                                                                        onClick={() => updateSalePrice(item.id, editingCartPrice)}
                                                                        className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600"
                                                                    >
                                                                        ✓
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingCartItemId(null);
                                                                            setEditingCartPrice('');
                                                                        }}
                                                                        className="bg-gray-400 text-white px-2 py-1 rounded text-xs hover:bg-gray-500"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span 
                                                                    onClick={() => {
                                                                        setEditingCartItemId(item.id);
                                                                        setEditingCartPrice(item.salePrice || item.price);
                                                                    }}
                                                                    className="cursor-pointer hover:text-blue-600 hover:underline"
                                                                    title="Click to edit price"
                                                                >
                                                                    GH₵{(item.salePrice || item.price).toFixed(2)} × {item.quantity}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => updateQuantity(item.id, -1)}
                                                            className="bg-gray-300 p-1 rounded hover:bg-gray-400"
                                                        >
                                                            <Minus size={16} />
                                                        </button>
                                                        <span className="font-bold w-8 text-center">{item.quantity}</span>
                                                        <button
                                                            onClick={() => updateQuantity(item.id, 1)}
                                                            className="bg-gray-300 p-1 rounded hover:bg-gray-400"
                                                        >
                                                            <Plus size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => removeFromCart(item.id)}
                                                            className="bg-red-500 text-white p-1 rounded hover:bg-red-600"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
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
                                        <button
                                            onClick={completeSale}
                                            disabled={cart.length === 0}
                                            className={`w-full py-3 rounded-lg font-bold text-white ${cart.length === 0
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-green-600 hover:bg-green-700'
                                                }`}
                                        >
                                            Complete Sale
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Inventory View */}
                        {view === 'inventory' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-2 bg-white rounded-lg shadow p-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <h2 className="text-xl font-bold">Product Inventory</h2>
                                        {securityPin && isPinAuthenticated && (
                                            <button
                                                onClick={lockInventory}
                                                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center gap-2"
                                            >
                                                🔒 Lock Inventory
                                            </button>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
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
                                                        <td className="p-2 text-right">GH₵{(product.cost || 0).toFixed(2)}</td>
                                                        <td className="p-2 text-right">GH₵{product.price.toFixed(2)}</td>
                                                        <td className="p-2 text-right font-semibold text-green-600">GH₵{(product.price - (product.cost || 0)).toFixed(2)}</td>
                                                        <td className="p-2 text-right">
                                                            <span className={product.stock < 20 ? 'text-red-600 font-bold' : ''}>
                                                                {product.stock}
                                                            </span>
                                                        </td>
                                                        <td className="p-2 text-center space-x-1">
                                                            <button
                                                                onClick={() => openEditModal(product)}
                                                                className="bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => deleteProduct(product.id)}
                                                                className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600"
                                                            >
                                                                Delete
                                                            </button>
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
                                        <input
                                            type="text"
                                            placeholder="Product Name"
                                            value={newProduct.name}
                                            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                            className="w-full p-2 border rounded"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Cost Price"
                                            value={newProduct.cost}
                                            onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
                                            className="w-full p-2 border rounded"
                                            step="0.01"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Selling Price"
                                            value={newProduct.price}
                                            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                                            className="w-full p-2 border rounded"
                                            step="0.01"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Stock Quantity"
                                            value={newProduct.stock}
                                            onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                                            className="w-full p-2 border rounded"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Category"
                                            value={newProduct.category}
                                            onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                                            className="w-full p-2 border rounded"
                                        />
                                        <button
                                            onClick={addProduct}
                                            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                                        >
                                            Add Product
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Reports View */}
                        {view === 'reports' && (
                            <>
                                {managerPin && !isPinAuthenticated ? (
                                    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-8 text-center">
                                        <div className="text-6xl mb-4">🔒</div>
                                        <h2 className="text-2xl font-bold mb-4 text-red-600">Access Denied</h2>
                                        <p className="text-gray-600 mb-6">Reports are only accessible to managers. Please authenticate with your manager PIN to view reports.</p>
                                        <button
                                            onClick={() => {
                                                setPinPurpose('reports');
                                                setShowPinPrompt(true);
                                                setPinInput('');
                                            }}
                                            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700"
                                        >
                                            Enter Manager PIN
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="text-xl font-bold">Reports & Analytics</h2>
                                            {managerPin && isPinAuthenticated && (
                                                <button
                                                    onClick={lockInventory}
                                                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center gap-2"
                                                >
                                                    🔒 Lock Reports
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="bg-white rounded-lg shadow p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
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
                                                        <p className="text-3xl font-bold">GH₵{totalRevenue.toFixed(2)}</p>
                                                    </div>
                                                    <DollarSign className="text-green-600" size={40} />
                                                </div>
                                            </div>

                                            <div className="bg-white rounded-lg shadow p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-gray-600 text-sm">Total Profit</p>
                                                        <p className="text-3xl font-bold text-green-600">GH₵{totalProfit.toFixed(2)}</p>
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
                                                <table className="w-full">
                                                    <thead className="bg-gray-100">
                                                        <tr>
                                                            <th className="p-2 text-left">Date</th>
                                                            <th className="p-2 text-left">Items</th>
                                                            <th className="p-2 text-right">Revenue</th>
                                                            <th className="p-2 text-right">Profit</th>
                                                        </tr>
                                                    </thead>
                                            <tbody>
                                                {sales.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="4" className="p-4 text-center text-gray-500">
                                                            No sales recorded yet
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sales.map(sale => {
                                                        const saleProfit = sale.items.reduce((sum, item) => {
                                                            return sum + (((item.salePrice || item.price) - (item.cost || 0)) * item.quantity);
                                                        }, 0);
                                                        return (
                                                            <tr key={sale.id} className="border-b">
                                                                <td className="p-2">{sale.date}</td>
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

                        {/* Settings View */}
                        {view === 'settings' && (
                            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
                                <h2 className="text-xl font-bold mb-4">Settings</h2>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block mb-2 font-semibold">Company Name</label>
                                        <input
                                            type="text"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            className="w-full p-3 border rounded-lg"
                                        />
                                        <p className="text-sm text-gray-600 mt-1">Changes save automatically</p>
                                    </div>

                                    <div className="border-t pt-6">
                                        <label className="block mb-2 font-semibold">Manager PIN</label>
                                        <input
                                            type="password"
                                            value={managerPin}
                                            onChange={(e) => {
                                                setManagerPin(e.target.value);
                                                setIsPinAuthenticated(false);
                                            }}
                                            placeholder="Enter 4-6 digit Manager PIN"
                                            className="w-full p-3 border rounded-lg"
                                            maxLength="6"
                                        />
                                        <p className="text-sm text-gray-600 mt-1">
                                            {managerPin ? '👨‍💼 Manager PIN is active - Only managers can access inventory' : 'No Manager PIN set - Inventory is open to all'}
                                        </p>
                                    </div>

                                    <div className="border-t pt-6">
                                        <label className="block mb-2 font-semibold">Security PIN (Legacy)</label>
                                        <input
                                            type="password"
                                            value={securityPin}
                                            onChange={(e) => {
                                                setSecurityPin(e.target.value);
                                            }}
                                            placeholder="Enter 4-6 digit PIN (optional)"
                                            className="w-full p-3 border rounded-lg"
                                            maxLength="6"
                                        />
                                        <p className="text-sm text-gray-600 mt-1">
                                            This PIN is no longer used. Use Manager PIN instead for inventory access.
                                        </p>
                                    </div>

                                    <div className="border-t pt-6">
                                        <h3 className="font-semibold mb-3 text-red-600">Danger Zone</h3>
                                        <button
                                            onClick={resetAllData}
                                            className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
                                        >
                                            Reset All Data
                                        </button>
                                        <p className="text-sm text-gray-600 mt-2">This will permanently delete all products, sales, and settings.</p>
                                    </div>

                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <h4 className="font-semibold text-blue-800 mb-2">💾 Data Storage Info</h4>
                                        <p className="text-sm text-blue-700">All data is saved automatically in your browser's local storage. Your data persists even after closing the browser.</p>
                                        <p className="text-sm text-blue-700 mt-2">Use the "Export Data" button in the header to download a backup.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* PIN Prompt Modal */}
            {showPinPrompt && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
                        <h2 className="text-2xl font-bold mb-4 text-center">�‍💼 Manager PIN Required</h2>
                        <p className="text-gray-600 mb-6 text-center">
                            {pinPurpose === 'inventory' && 'Please enter your manager PIN to access inventory management'}
                            {pinPurpose === 'reports' && 'Please enter your manager PIN to view reports and analytics'}
                        </p>
                        <input
                            type="password"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handlePinSubmit();
                                }
                            }}
                            placeholder="Enter Manager PIN"
                            className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg text-center mb-4"
                            maxLength="6"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowPinPrompt(false);
                                    setPinInput('');
                                }}
                                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePinSubmit}
                                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700"
                            >
                                Unlock
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Product Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
                        <h2 className="text-2xl font-bold mb-6 text-center">Edit Product</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-semibold mb-1">Product Name</label>
                                <input
                                    type="text"
                                    value={editFormData.name || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Product name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Category</label>
                                <input
                                    type="text"
                                    value={editFormData.category || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Category"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Cost Price</label>
                                <input
                                    type="number"
                                    value={editFormData.cost || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, cost: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Cost price"
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Selling Price</label>
                                <input
                                    type="number"
                                    value={editFormData.price || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Selling price"
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Stock Quantity</label>
                                <input
                                    type="number"
                                    value={editFormData.stock || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, stock: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Stock quantity"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowEditModal(false);
                                    setEditingProduct(null);
                                    setEditFormData({});
                                }}
                                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={updateProduct}
                                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POSSystem;
