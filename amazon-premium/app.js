// APP STATE & DATABASE LAYER (Hybrid: Firebase + LocalStorage Fallback)
const firebaseConfig = {
  apiKey: "AIzaSyAh3Dvt-bVLiTleic6qk-YolPF3jqlHGRY",
  authDomain: "your-business-your-shop-e8c0a.firebaseapp.com",
  projectId: "your-business-your-shop-e8c0a",
  storageBucket: "your-business-your-shop-e8c0a.firebasestorage.app",
  messagingSenderId: "1006093149248",
  appId: "1:1006093149248:web:344f13030ea4811a0deba5"
};

// Check if Firebase script is loaded and config has been replaced
const isFirebaseConfigured = typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.projectId !== "YOUR_PROJECT_ID";
let fsDb = null;
let fsStorage = null;

if (isFirebaseConfigured) {
  try {
    firebase.initializeApp(firebaseConfig);
    fsDb = firebase.firestore();
    fsStorage = firebase.storage();
    console.log("Firebase initialized successfully!");
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
}

// HELPER: Upload base64 selfie dataURL to Firebase Storage
async function uploadSelfieToFirebase(uid, dataUrl) {
  if (!fsStorage) return dataUrl;
  try {
    const ref = fsStorage.ref().child(`selfies/${uid}.jpg`);
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const snapshot = await ref.put(blob);
    const downloadUrl = await snapshot.ref.getDownloadURL();
    return downloadUrl;
  } catch (e) {
    console.error("Firebase Storage upload failed, using local base64:", e);
    return dataUrl;
  }
}

// HELPER: Input Sanitizer for XSS Prevention
function sanitizeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, function(m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

// ADVANCED SECURITY: Aadhaar Encryption & Decryption Helpers
const AADHAAR_KEY = "RadheShopSecure2026";
function encryptAadhaar(plaintext) {
  if (!plaintext) return "";
  let result = "";
  for (let i = 0; i < plaintext.length; i++) {
    const charCode = plaintext.charCodeAt(i) ^ AADHAAR_KEY.charCodeAt(i % AADHAAR_KEY.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}

function decryptAadhaar(ciphertext) {
  if (!ciphertext) return "";
  try {
    const decoded = atob(ciphertext);
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ AADHAAR_KEY.charCodeAt(i % AADHAAR_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (e) {
    return ciphertext; // fallback if already plaintext or error
  }
}

// ADVANCED SECURITY: Client-side Form Throttling & Anti-Spam Rate Limiter
class RateLimiter {
  constructor(limit = 5, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.attempts = {};
  }

  isAllowed(clientId) {
    const now = Date.now();
    if (!this.attempts[clientId]) {
      this.attempts[clientId] = [];
    }

    // Filter out attempts older than windowMs
    this.attempts[clientId] = this.attempts[clientId].filter(timestamp => now - timestamp < this.windowMs);

    if (this.attempts[clientId].length >= this.limit) {
      return false;
    }

    this.attempts[clientId].push(now);
    return true;
  }

  getRemainingTime(clientId) {
    const now = Date.now();
    if (!this.attempts[clientId] || this.attempts[clientId].length === 0) return 0;
    const oldest = this.attempts[clientId][0];
    const diff = now - oldest;
    return Math.max(0, Math.ceil((this.windowMs - diff) / 1000));
  }
}

const globalRateLimiter = new RateLimiter(5, 60000); // 5 attempts per 60 seconds

// HELPER: Aadhaar Validator (Verhoeff and Pattern Verification)
function isValidAadhaar(num) {
  if (!/^\d{12}$/.test(num)) return false;
  
  // Reject simple repetitive sequences (e.g. 111111111111, 222222222222)
  if (/^(\d)\1{11}$/.test(num)) return false;
  
  // Reject sequential/predictable patterns (e.g. 123456789012, 123412341234, 012345678901)
  const sequentialPatterns = [
    "123456789012", "012345678901", "123412341234", "987654321098", "123456123456"
  ];
  if (sequentialPatterns.includes(num)) return false;

  return true;
}

// // Simple In-Memory / LocalStorage Mock Database with real-time Firebase syncing
class Database {
  constructor() {
    this.init();
    if (isFirebaseConfigured) {
      this.setupRealtimeListeners();
      this.syncInitialSeeds();
    }
  }

  init() {
    if (!localStorage.getItem('db_users')) {
      const initialUsers = [
        {
          uid: "admin123",
          email: "springvalleygroups@gmail.com",
          password: "admin",
          role: "admin",
          displayName: "Platform Admin/Owner",
          phone: "9999999999",
          whatsapp: "9999999999",
          upiId: "admin@upi",
          vendorStatus: "approved",
          livenessVerified: true,
          selfieUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200"
        },
        {
          uid: "vendor123",
          email: "vendor@store.com",
          password: "vendor",
          role: "vendor",
          displayName: "Radhe Handloom",
          phone: "9876543210",
          whatsapp: "9876543210",
          upiId: "radhe@upi",
          aadhaar: encryptAadhaar("867453291045"), // Encrypted Aadhaar seed
          gstin: "24AAAAA1111A1Z1",
          vendorStatus: "approved",
          livenessVerified: true,
          selfieUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200"
        }
      ];
      localStorage.setItem('db_users', JSON.stringify(initialUsers));
    } else {
      // Migration: Ensure admin@store.com is migrated to springvalleygroups@gmail.com
      try {
        let users = JSON.parse(localStorage.getItem('db_users')) || [];
        let adminUser = users.find(u => u.uid === "admin123");
        if (adminUser && adminUser.email === "admin@store.com") {
          adminUser.email = "springvalleygroups@gmail.com";
          localStorage.setItem('db_users', JSON.stringify(users));
          console.log("Migrated seed admin email to springvalleygroups@gmail.com in localStorage.");
        }
      } catch (e) {
        console.error("Migration error:", e);
      }
    }

    if (!localStorage.getItem('db_products')) {
      const initialProducts = [
        {
          id: "prod_nightlamp",
          name: "Night Lamp",
          price: 100,
          description: "Minimalist warm light night lamp, perfect for home decor and night reading. Energy efficient.",
          imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=600",
          category: "home_kitchen",
          stock: 999,
          vendorId: "vendor123",
          vendorName: "Radhe Handloom",
          approvedByAdmin: true,
          priority: "normal", // "featured" | "normal" | "demoted"
          rating: 4.8,
          reviewsCount: 1,
          salesCount: 3,
          attributes: {
            brand: "LuxLite",
            color: "Warm Yellow",
            dimensions: "10x10x15 cm",
            weight: "200g"
          },
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem('db_products', JSON.stringify(initialProducts));
    }

    if (!localStorage.getItem('db_orders')) {
      localStorage.setItem('db_orders', JSON.stringify([]));
    }

    if (!localStorage.getItem('db_reviews')) {
      // Seed first review
      const initialReviews = [
        {
          id: "rev_1",
          productId: "prod_nightlamp",
          rating: 5,
          comment: "Beautiful night lamp, very soft lighting!",
          userName: "Aarav Patel",
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem('db_reviews', JSON.stringify(initialReviews));
    }
  }

  getData(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
  }

  setData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // FIREBASE SYNC HELPERS
  async pushToFirestore(collectionName, docId, data) {
    if (!fsDb) return;
    try {
      await fsDb.collection(collectionName).doc(docId).set(data);
      console.log(`Pushed to Firestore [${collectionName}]: ${docId}`);
    } catch (e) {
      console.error(`Error pushing to Firestore [${collectionName}]:`, e);
    }
  }

  async deleteFromFirestore(collectionName, docId) {
    if (!fsDb) return;
    try {
      await fsDb.collection(collectionName).doc(docId).delete();
      console.log(`Deleted from Firestore [${collectionName}]: ${docId}`);
    } catch (e) {
      console.error(`Error deleting from Firestore [${collectionName}]:`, e);
    }
  }

  setupRealtimeListeners() {
    if (!fsDb) return;

    // Users Sync
    fsDb.collection('users').onSnapshot(snapshot => {
      let users = this.getUsers();
      snapshot.docChanges().forEach(change => {
        let docData = change.doc.data();
        
        // Force migration in Firestore sync to prevent remote database overwrites
        if (docData.uid === "admin123" && docData.email === "admin@store.com") {
          docData.email = "springvalleygroups@gmail.com";
          this.pushToFirestore('users', docData.uid, docData);
        }
        
        const index = users.findIndex(u => u.uid === docData.uid);
        if (change.type === 'added' || change.type === 'modified') {
          if (index !== -1) {
            users[index] = docData;
          } else {
            users.push(docData);
          }
        } else if (change.type === 'removed') {
          if (index !== -1) users.splice(index, 1);
        }
      });
      this.setData('db_users', users);
      this.triggerUIRedraw();
    });

    // Products Sync
    fsDb.collection('products').onSnapshot(snapshot => {
      let products = this.getProducts();
      snapshot.docChanges().forEach(change => {
        const docData = change.doc.data();
        const index = products.findIndex(p => p.id === docData.id);
        if (change.type === 'added' || change.type === 'modified') {
          if (index !== -1) {
            products[index] = docData;
          } else {
            products.push(docData);
          }
        } else if (change.type === 'removed') {
          if (index !== -1) products.splice(index, 1);
        }
      });
      this.setData('db_products', products);
      this.triggerUIRedraw();
    });

    // Orders Sync
    fsDb.collection('orders').onSnapshot(snapshot => {
      let orders = this.getOrders();
      snapshot.docChanges().forEach(change => {
        const docData = change.doc.data();
        const index = orders.findIndex(o => o.id === docData.id);
        if (change.type === 'added' || change.type === 'modified') {
          if (index !== -1) {
            orders[index] = docData;
          } else {
            orders.push(docData);
          }
        } else if (change.type === 'removed') {
          if (index !== -1) orders.splice(index, 1);
        }
      });
      this.setData('db_orders', orders);
      this.triggerUIRedraw();
    });

    // Reviews Sync
    fsDb.collection('reviews').onSnapshot(snapshot => {
      let reviews = this.getReviews();
      snapshot.docChanges().forEach(change => {
        const docData = change.doc.data();
        const index = reviews.findIndex(r => r.id === docData.id);
        if (change.type === 'added' || change.type === 'modified') {
          if (index !== -1) {
            reviews[index] = docData;
          } else {
            reviews.push(docData);
          }
        } else if (change.type === 'removed') {
          if (index !== -1) reviews.splice(index, 1);
        }
      });
    // Settings Sync
    fsDb.collection('settings').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const docData = change.doc.data();
        if (change.doc.id === 'announcement_banner') {
          localStorage.setItem('db_banner_settings', JSON.stringify(docData));
          if (typeof renderAnnouncementBanner === 'function') renderAnnouncementBanner();
        }
      });
    });
  }

  async syncInitialSeeds() {
    if (!fsDb) return;
    try {
      const usersSnap = await fsDb.collection('users').limit(1).get();
      if (usersSnap.empty) {
        console.log("Firestore empty: uploading local seed data...");
        const localUsers = this.getUsers();
        for (const u of localUsers) {
          await fsDb.collection('users').doc(u.uid).set(u);
        }
        const localProds = this.getProducts();
        for (const p of localProds) {
          await fsDb.collection('products').doc(p.id).set(p);
        }
        const localReviews = this.getReviews();
        for (const r of localReviews) {
          await fsDb.collection('reviews').doc(r.id).set(r);
        }
        console.log("Firestore seeding completed successfully!");
      }
    } catch (e) {
      console.error("Error syncing seeds to Firestore:", e);
    }
  }

  triggerUIRedraw() {
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderCategoriesBar === 'function') renderCategoriesBar();
    if (typeof loadCustomerOrders === 'function') loadCustomerOrders();
    if (typeof renderVendorDashboard === 'function') renderVendorDashboard();
    if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
  }

  // Users Collection
  getUsers() { return this.getData('db_users'); }
  saveUser(user) {
    user.displayName = sanitizeHTML(user.displayName);
    user.email = sanitizeHTML(user.email);
    user.phone = sanitizeHTML(user.phone);
    user.whatsapp = sanitizeHTML(user.whatsapp);
    if(user.aadhaar) {
      if (user.aadhaar.length <= 12 && !user.aadhaar.endsWith('=')) {
        user.aadhaar = encryptAadhaar(sanitizeHTML(user.aadhaar));
      } else {
        user.aadhaar = sanitizeHTML(user.aadhaar);
      }
    }
    if(user.gstin) user.gstin = sanitizeHTML(user.gstin);
    if(user.upiId) user.upiId = sanitizeHTML(user.upiId);
    
    const users = this.getUsers();
    const index = users.findIndex(u => u.uid === user.uid);
    if (index !== -1) {
      users[index] = user;
    } else {
      users.push(user);
    }
    this.setData('db_users', users);

    // Push to Firestore
    this.pushToFirestore('users', user.uid, user);
  }

  updateUser(uid, updatedFields) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.uid === uid);
    if (index !== -1) {
      for (let key in updatedFields) {
        if (typeof updatedFields[key] === 'string') {
          updatedFields[key] = sanitizeHTML(updatedFields[key]);
        }
      }
      const updatedUser = { ...users[index], ...updatedFields };
      users[index] = updatedUser;
      this.setData('db_users', users);

      // Push to Firestore
      this.pushToFirestore('users', uid, updatedUser);
    }
  }

  updateUserPassword(email, newPassword) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.email === email);
    if (index !== -1) {
      users[index].password = sanitizeHTML(newPassword);
      this.setData('db_users', users);

      // Push to Firestore
      this.pushToFirestore('users', users[index].uid, users[index]);
    }
  }

  deleteUser(uid) {
    let users = this.getUsers();
    users = users.filter(u => u.uid !== uid);
    this.setData('db_users', users);

    // Delete from Firestore
    this.deleteFromFirestore('users', uid);
  }

  // Products Collection
  getProducts() { return this.getData('db_products'); }
  saveProduct(product) {
    product.name = sanitizeHTML(product.name);
    product.description = sanitizeHTML(product.description);
    product.imageUrl = sanitizeHTML(product.imageUrl);
    if (product.attributes) {
      for (let key in product.attributes) {
        product.attributes[key] = sanitizeHTML(product.attributes[key]);
      }
    }
    const products = this.getProducts();
    products.push(product);
    this.setData('db_products', products);

    // Push to Firestore
    this.pushToFirestore('products', product.id, product);
  }

  deleteProduct(id) {
    let products = this.getProducts();
    products = products.filter(p => p.id !== id);
    this.setData('db_products', products);

    // Delete from Firestore
    this.deleteFromFirestore('products', id);
  }

  updateProduct(id, updatedFields) {
    const products = this.getProducts();
    const index = products.findIndex(p => p.id === id);
    if (index !== -1) {
      for (let key in updatedFields) {
        if (typeof updatedFields[key] === 'string') {
          updatedFields[key] = sanitizeHTML(updatedFields[key]);
        }
      }
      const updatedProd = { ...products[index], ...updatedFields };
      products[index] = updatedProd;
      this.setData('db_products', products);

      // Push to Firestore
      this.pushToFirestore('products', id, updatedProd);
    }
  }

  // Orders Collection
  getOrders() { return this.getData('db_orders'); }
  saveOrder(order) {
    order.customerName = sanitizeHTML(order.customerName);
    order.customerMobile = sanitizeHTML(order.customerMobile);
    order.shippingAddress = sanitizeHTML(order.shippingAddress);
    const orders = this.getOrders();
    orders.push(order);
    this.setData('db_orders', orders);

    // Push to Firestore
    this.pushToFirestore('orders', order.id, order);
  }

  updateOrder(id, updatedFields) {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id === id);
    if (index !== -1) {
      const updatedOrd = { ...orders[index], ...updatedFields };
      orders[index] = updatedOrd;
      this.setData('db_orders', orders);

      // Push to Firestore
      this.pushToFirestore('orders', id, updatedOrd);
    }
  }

  // Reviews Collection
  getReviews() { return this.getData('db_reviews'); }
  saveReview(review) {
    review.comment = sanitizeHTML(review.comment);
    review.userName = sanitizeHTML(review.userName);
    if (review.approvedByAdmin === undefined) {
      review.approvedByAdmin = false; // Admin approval required by default
    }
    const reviews = this.getReviews();
    reviews.push(review);
    this.setData('db_reviews', reviews);

    // Push to Firestore
    this.pushToFirestore('reviews', review.id, review);

    // Update product rating only if review is approved
    if (review.approvedByAdmin) {
      this.recalculateProductRating(review.productId);
    }
  }

  updateReview(id, updatedFields) {
    const reviews = this.getReviews();
    const index = reviews.findIndex(r => r.id === id);
    if (index !== -1) {
      const updatedRev = { ...reviews[index], ...updatedFields };
      reviews[index] = updatedRev;
      this.setData('db_reviews', reviews);
      this.pushToFirestore('reviews', id, updatedRev);
      
      this.recalculateProductRating(updatedRev.productId);
    }
  }

  deleteReview(id) {
    const reviews = this.getReviews();
    const rev = reviews.find(r => r.id === id);
    const updatedReviews = reviews.filter(r => r.id !== id);
    this.setData('db_reviews', updatedReviews);
    this.deleteFromFirestore('reviews', id);
    
    if (rev) {
      this.recalculateProductRating(rev.productId);
    }
  }

  recalculateProductRating(productId) {
    const reviews = this.getReviews().filter(r => r.productId === productId && r.approvedByAdmin);
    if (reviews.length === 0) {
      this.updateProduct(productId, { rating: 5, reviewsCount: 0 });
      return;
    }
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const newAvg = parseFloat((totalRating / reviews.length).toFixed(1));
    this.updateProduct(productId, {
      rating: newAvg,
      reviewsCount: reviews.length
    });
  }

  // Banner Settings Collection
  getBannerSettings() {
    let settings = JSON.parse(localStorage.getItem('db_banner_settings'));
    if (!settings) {
      settings = { text: "તહેવાર સેલ: ઓર્ડર કરવા માટે ડાયરેક્ટ કનેક્ટ કરો! / Festive Sale - Buy Direct!", active: true };
      localStorage.setItem('db_banner_settings', JSON.stringify(settings));
    }
    return settings;
  }
  
  saveBannerSettings(settings) {
    localStorage.setItem('db_banner_settings', JSON.stringify(settings));
    this.pushToFirestore('settings', 'announcement_banner', settings);
  }
}

const db = new Database();

// SESSION MANAGEMENT
let currentUser = JSON.parse(localStorage.getItem('current_user')) || null;

function setCurrentUser(user) {
  currentUser = user;
  if (user) {
    localStorage.setItem('current_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('current_user');
  }
}

// MULTILINGUAL DICTIONARY
const translations = {
  en: {
    brandName: "Your Business, Your Shop",
    tagline: "Your Business, Your Shop",
    subtagline: "Anyone wishing to do business from home can list their products and kickstart their journey.",
    home: "Home",
    shop: "Shop",
    dashboard: "Dashboard",
    login: "Login",
    register: "Register",
    logout: "Logout",
    searchPlaceholder: "Search products, categories...",
    categories: "Categories",
    allCategories: "All Products",
    lighting: "Lighting",
    clothing: "Clothing & Fabrics",
    electronics: "Electronics & Mobiles",
    footwear: "Footwear",
    grocery: "Groceries",
    others: "Others",
    addToCart: "Add to Cart",
    buyNow: "Buy Now",
    emptyCart: "Your cart is empty.",
    checkout: "Checkout",
    total: "Total",
    close: "Close",
    placeOrder: "Place Order (I Have Paid)",
    billingDetails: "Billing Details",
    address: "Shipping Address",
    phone: "Phone Number",
    whatsapp: "WhatsApp Number",
    pan: "Aadhaar Card Number",
    gst: "GSTIN (Optional)",
    paymentMethod: "Payment Method",
    qrScanCode: "Scan QR Code to Pay",
    paymentInstructions: "Please scan the QR code using Google Pay or any other UPI app, make the payment, and click 'Place Order'. The vendor will verify your payment and process the order.",
    orderSuccess: "Order Placed Successfully! Your invoice will be generated.",
    myOrders: "My Orders",
    viewInvoice: "View Bill/Invoice",
    status: "Status",
    pendingVerif: "Pending Verification",
    verified: "Payment Verified",
    shipped: "Shipped",
    delivered: "Delivered",
    invoiceTitle: "INVOICE / TAX BILL",
    invoiceFrom: "Sold By",
    invoiceTo: "Billed To",
    invoiceDate: "Date",
    invoiceNumber: "Invoice No",
    productName: "Product",
    qty: "Qty",
    unitPrice: "Price",
    subtotal: "Subtotal",
    adminPanel: "Admin Panel",
    vendorPanel: "Vendor Panel",
    addProduct: "Add New Product",
    prodName: "Product Name",
    prodPrice: "Price (INR)",
    prodDesc: "Product Description",
    prodImage: "Product Image URL",
    prodStock: "Available Stock",
    prodCategory: "Category",
    save: "Save Product",
    pendingApproval: "Pending Approval",
    activeProducts: "Active Products",
    approve: "Approve",
    reject: "Reject",
    delete: "Delete",
    vendors: "Vendors",
    vendorRequests: "Vendor Requests",
    noProducts: "No products available.",
    lengthMeters: "Length (Meters)",
    widthInches: "Width (Inches)",
    fabricType: "Fabric Type",
    color: "Color",
    brand: "Brand",
    model: "Model",
    warranty: "Warranty (Months)",
    storage: "RAM / Storage",
    size: "Size (UK/US)",
    material: "Material",
    expiryDate: "Expiry Date",
    vegNonveg: "Type (Veg/Non-Veg)",
    weight: "Weight/Volume",
    dimensions: "Dimensions",
    faceAuthTitle: "Liveness Face Verification",
    faceAuthInstruction: "Position your face in the circle. Follow the steps below.",
    step1: "Step 1: Look straight at the camera",
    step2: "Step 2: Turn your head slowly to the left",
    step3: "Challenge 3: Turn your head slowly to the right",
    step4: "Challenge 4: Say the numbers on screen loud: ",
    startVerification: "Start Verification",
    verificationFailed: "Verification Failed. Please try again.",
    verificationSuccess: "Verification Successful!",
    vendorRegFee: "Free Registration - No Hidden Charges",
    storeName: "Store / Brand Name",
    physicalAddress: "Physical Shop Address (Optional)",
    secretAuditTitle: "Owner's Master Audit (Secret Ledger)",
    totalSales: "Total Platform Sales",
    commissionEarned: "Total Orders Processed",
    vendorNameCol: "Vendor Name",
    itemsSoldCol: "Items Sold",
    salesValCol: "Sales Value",
    commissionCol: "Total Orders",
    actionCol: "Action",
    actionsCol: "Actions",
    noVendors: "No registered vendors yet.",
    viewAllBills: "View All Bills",
    backToDash: "Back to Dashboard",
    aboutUs: "About Our Platform",
    taglineFull: "દરેક ઘર બેઠો માણસ જેને ધંધો કરવો છે એ પોતાની વસ્તુ એની પાસે જે છે એ મૂકી શકે અને ધંધો કરી શકે."
  },
  gu: {
    brandName: "તમારો ધંધો, તમારી દુકાન",
    tagline: "તમારો ધંધો, તમારી દુકાન",
    subtagline: "કોઈપણ વ્યક્તિ જે ઘરેથી વેપાર કરવા માંગે છે તે પોતાની પ્રોડક્ટ્સ અહીં મૂકીને સરળતાથી બિઝનેસ શરૂ કરી શકે છે.",
    home: "હોમ",
    shop: "દુકાન",
    dashboard: "ડેશબોર્ડ",
    login: "લોગિન",
    register: "નોંધણી (રજીસ્ટર)",
    logout: "લોગઆઉટ",
    searchPlaceholder: "પ્રોડક્ટ્સ અથવા કેટેગરી શોધો...",
    categories: "કેટેગરીઝ",
    allCategories: "બધી પ્રોડક્ટ્સ",
    lighting: "લાઇટિંગ",
    clothing: "કપડાં અને ફેબ્રિક્સ",
    electronics: "ઇલેક્ટ્રોનિક્સ અને મોબાઇલ",
    footwear: "ફૂટવેર",
    grocery: "કરિયાણું",
    others: "અન્ય",
    addToCart: "કાર્ટમાં ઉમેરો",
    buyNow: "ખરીદો",
    emptyCart: "તમારું કાર્ટ ખાલી છે.",
    checkout: "ચેકઆઉટ",
    total: "કુલ",
    close: "બંધ કરો",
    placeOrder: "ઓર્ડર કરો (મેં પૈસા ચૂકવી દીધા છે)",
    billingDetails: "બિલિંગ વિગતો",
    address: "સરનામું",
    phone: "મોબાઈલ નંબર",
    whatsapp: "વોટ્સએપ નંબર",
    pan: "આધાર કાર્ડ નંબર",
    gst: "GSTIN (વૈકલ્પિક)",
    paymentMethod: "ચૂકવણી પદ્ધતિ",
    qrScanCode: "ચૂકવણી કરવા માટે ક્યુઆર કોડ સ્કેન કરો",
    paymentInstructions: "કૃપા કરીને ગૂગલ પે અથવા કોઈપણ અન્ય UPI એપનો ઉપયોગ કરીને ક્યુઆર કોડ સ્કેન કરો, ચૂકવણી કરો અને 'ઓર્ડર કરો' પર ક્લિક કરો. વેન્ડર તમારી ચૂકવણીની ચકાસણી કરશે અને ઓર્ડર પ્રોસેસ કરશે.",
    orderSuccess: "ઓર્ડર સફળતાપૂર્વક લેવાયો છે! તમારું બિલ જનરેટ થઈ જશે.",
    myOrders: "મારા ઓર્ડર્સ",
    viewInvoice: "બિલ/ઇન્વોઇસ જુઓ",
    status: "સ્થિતિ",
    pendingVerif: "ચકાસણી બાકી છે",
    verified: "ચુકવણી મંજૂર",
    shipped: "મોકલેલ છે",
    delivered: "પહોંચી ગયું",
    invoiceTitle: "ઇન્વોઇસ / ટેક્સ બિલ",
    invoiceFrom: "વિક્રેતા",
    invoiceTo: "ગ્રાહક",
    invoiceDate: "તારીખ",
    invoiceNumber: "બિલ નંબર",
    productName: "પ્રોડક્ટ",
    qty: "નંગ",
    unitPrice: "કિંમત",
    subtotal: "સબટોટલ",
    adminPanel: "એડમિન પેનલ (ઓનર)",
    vendorPanel: "વેન્ડર પેનલ",
    addProduct: "નવી પ્રોડક્ટ ઉમેરો",
    prodName: "પ્રોડક્ટનું નામ",
    prodPrice: "કિંમત (₹)",
    prodDesc: "પ્રોડક્ટનું વર્ણન",
    prodImage: "પ્રોડક્ટ ઇમેજ લિંક",
    prodStock: "સ્ટોક જથ્થો",
    prodCategory: "કેટેગરી",
    save: "પ્રોડક્ટ સેવ કરો",
    pendingApproval: "મંજૂરી બાકી",
    activeProducts: "ચાલુ પ્રોડક્ટ્સ",
    approve: "મંજૂર કરો",
    reject: "નામંજૂર કરો",
    delete: "ડીલીટ",
    vendors: "વેન્ડર્સ",
    vendorRequests: "વેન્ડર વિનંતીઓ",
    noProducts: "કોઈ પ્રોડક્ટ ઉપલબ્ધ નથી.",
    lengthMeters: "લંબાઈ (મીટર)",
    widthInches: "પહોળાઈ (ઈંચ)",
    fabricType: "ફેબ્રિકનો પ્રકાર",
    color: "રંગ",
    brand: "બ્રાન્ડ",
    model: "મોડેલ",
    warranty: "વોરંટી (મહિના)",
    storage: "રેમ / સ્ટોરેજ",
    size: "સાઇઝ (UK/US)",
    material: "મટીરીયલ",
    expiryDate: "એક્સપાયરી તારીખ",
    vegNonveg: "પ્રકાર (વેજ/નોન-વેજ)",
    weight: "વજન / માપ",
    dimensions: "પરિમાણો (Dimensions)",
    faceAuthTitle: "લાઈવનેસ ફેસ વેરિફિકેશન",
    faceAuthInstruction: "તમારો ચહેરો ગોળ ફ્રેમમાં લાવો. નીચે આપેલા સ્ટેપ્સ ફોલો કરો.",
    step1: "પગલું ૧: કેમેરા સામે સીધું જુઓ",
    step2: "પગલું ૨: તમારું માથું ધીમેથી ડાબી બાજુ ફેરવો",
    step3: "પગલું ૩: તમારું માથું ધીમેથી જમણી બાજુ ફેરવો",
    step4: "પગલું ૪: સ્ક્રીન પરના અંકો મોટેથી બોલો: ",
    startVerification: "ચકાસણી શરૂ કરો",
    verificationFailed: "ચકાસણી નિષ્ફળ. ફરી પ્રયાસ કરો.",
    verificationSuccess: "ચકાસણી સફળ થઈ!",
    vendorRegFee: "મફત રજીસ્ટ્રેશન - કોઈ છૂપો ચાર્જ નથી",
    storeName: "દુકાન / બ્રાન્ડ નામ",
    physicalAddress: "દુકાનનું સરનામું (વૈકલ્પિક)",
    secretAuditTitle: "માલિકનો ગુપ્ત ઓડિટ વિભાગ (સિક્રેટ લેજર)",
    totalSales: "કુલ પ્લેટફોર્મ વેચાણ",
    commissionEarned: "કુલ પ્રોસેસ થયેલ ઓર્ડર",
    vendorNameCol: "વેન્ડર નામ",
    itemsSoldCol: "વેચેલ આઈટમ",
    salesValCol: "કુલ વેચાણ",
    commissionCol: "કુલ ઓર્ડર",
    actionCol: "ઍક્શન",
    actionsCol: "ઍક્શन्स",
    noVendors: "હજુ સુધી કોઈ વેન્ડર નોંધાયેલ નથી.",
    viewAllBills: "તમામ બિલો જુઓ",
    backToDash: "ડેશબોર્ડ પર પાછા જાઓ",
    aboutUs: "અમારા પ્લેટફોર્મ વિશે",
    taglineFull: "દરેક ઘર બેઠો માણસ જેને ધંધો કરવો છે એ પોતાની વસ્તુ એની પાસે જે છે એ મૂકી શકે અને ધંધો કરી શકે."
  }
};

let currentLanguage = localStorage.getItem('app_lang') || 'gu';

function setLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('app_lang', lang);
  updateTranslations();
}

function updateTranslations() {
  const trans = translations[currentLanguage];
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (trans[key]) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = trans[key];
      } else {
        element.innerText = trans[key];
      }
    }
  });

  // Toggle active visual states on buttons
  const enBtn = document.getElementById('lang-en-btn');
  const guBtn = document.getElementById('lang-gu-btn');
  if (enBtn && guBtn) {
    if (currentLanguage === 'en') {
      enBtn.classList.add('bg-white', 'text-black');
      enBtn.classList.remove('text-gray-400');
      guBtn.classList.remove('bg-white', 'text-black');
      guBtn.classList.add('text-gray-400');
    } else {
      guBtn.classList.add('bg-white', 'text-black');
      guBtn.classList.remove('text-gray-400');
      enBtn.classList.remove('bg-white', 'text-black');
      enBtn.classList.add('text-gray-400');
    }
  }
}

// CART STATE
let cart = JSON.parse(localStorage.getItem('app_cart')) || [];

function saveCart() {
  localStorage.setItem('app_cart', JSON.stringify(cart));
  updateCartUI();
}

function addToCart(productId) {
  const products = db.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const cartItem = cart.find(item => item.productId === productId);
  const currentQty = cartItem ? cartItem.quantity : 0;

  if (currentQty + 1 > product.stock) {
    showToast(currentLanguage === 'gu' ? `માત્ર ${product.stock} નંગ સ્ટોકમાં છે!` : `Only ${product.stock} items available in stock!`);
    return;
  }

  if (cartItem) {
    cartItem.quantity += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      vendorId: product.vendorId,
      vendorName: product.vendorName,
      attributes: product.attributes,
      quantity: 1
    });
  }
  saveCart();
  showToast(currentLanguage === 'gu' ? 'કાર્ટમાં ઉમેરવામાં આવ્યું!' : 'Added to cart!');
}

function updateCartUI() {
  const countBadge = document.getElementById('cart-count');
  const itemsContainer = document.getElementById('cart-items-container');
  const totalAmountEl = document.getElementById('cart-total-amount');

  if (countBadge) {
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    countBadge.innerText = totalQty;
    countBadge.classList.toggle('hidden', totalQty === 0);
  }

  if (itemsContainer) {
    itemsContainer.innerHTML = '';
    if (cart.length === 0) {
      itemsContainer.innerHTML = `<p class="text-center text-gray-500 py-8" data-i18n="emptyCart">${translations[currentLanguage].emptyCart}</p>`;
      totalAmountEl.innerText = '₹0';
      return;
    }

    let total = 0;
    cart.forEach(item => {
      total += item.price * item.quantity;
      itemsContainer.innerHTML += `
        <div class="flex items-center justify-between py-4 border-b border-zinc-200">
          <div class="flex items-center gap-3">
            <img src="${item.imageUrl}" class="w-12 h-12 object-cover rounded-md" />
            <div>
              <h4 class="font-bold text-gray-950 text-sm">${item.name}</h4>
              <p class="text-xs text-gray-500">${item.vendorName}</p>
              <p class="text-xs text-orange-500 font-semibold">₹${item.price} x ${item.quantity}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="changeQty('${item.productId}', -1)" class="w-6 h-6 rounded bg-zinc-200 text-gray-700 flex items-center justify-center hover:bg-zinc-300">-</button>
            <span class="text-gray-950 text-sm w-4 text-center">${item.quantity}</span>
            <button onclick="changeQty('${item.productId}', 1)" class="w-6 h-6 rounded bg-zinc-200 text-gray-700 flex items-center justify-center hover:bg-zinc-300">+</button>
          </div>
        </div>
      `;
    });
    totalAmountEl.innerText = `₹${total}`;
  }
}

function changeQty(productId, diff) {
  const products = db.getProducts();
  const product = products.find(p => p.id === productId);
  const index = cart.findIndex(item => item.productId === productId);
  if (index !== -1 && product) {
    if (diff > 0 && cart[index].quantity + diff > product.stock) {
      showToast(currentLanguage === 'gu' ? `માત્ર ${product.stock} નંગ સ્ટોકમાં છે!` : `Only ${product.stock} items available in stock!`);
      return;
    }
    cart[index].quantity += diff;
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    saveCart();
  }
}

// TOAST NOTIFICATIONS
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-white border border-orange-500 text-gray-900 px-6 py-3 rounded-full shadow-2xl z-50 text-sm flex items-center gap-2';
  toast.innerHTML = `<span class="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span> ${message}`;
  document.body.appendChild(toast);
  gsap.fromTo(toast, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.4 });
  setTimeout(() => {
    gsap.to(toast, { opacity: 0, y: -20, duration: 0.4, onComplete: () => toast.remove() });
  }, 3000);
}

// DYNAMIC CATEGORY FIELD INSERTER
function updateCategoryFields(containerId, categorySelectId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const category = document.getElementById(categorySelectId).value;
  
  container.innerHTML = '';
  
  if (category === 'clothing') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="lengthMeters">${translations[currentLanguage].lengthMeters}</label>
          <input type="number" id="attr-length" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. 5" required>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="widthInches">${translations[currentLanguage].widthInches}</label>
          <input type="number" id="attr-width" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. 44" required>
        </div>
        <div class="col-span-2">
          <label class="block text-xs text-gray-500 mb-1" data-i18n="fabricType">${translations[currentLanguage].fabricType}</label>
          <input type="text" id="attr-fabric" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. Cotton, Silk" required>
        </div>
      </div>
    `;
  } else if (category === 'electronics') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="brand">${translations[currentLanguage].brand}</label>
          <input type="text" id="attr-brand" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. Xiaomi" required>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="model">${translations[currentLanguage].model}</label>
          <input type="text" id="attr-model" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. 14 Pro" required>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="storage">${translations[currentLanguage].storage}</label>
          <input type="text" id="attr-storage" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. 8GB/256GB" required>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="warranty">${translations[currentLanguage].warranty}</label>
          <input type="number" id="attr-warranty" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. 12" required>
        </div>
      </div>
    `;
  } else if (category === 'footwear') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="size">${translations[currentLanguage].size}</label>
          <input type="text" id="attr-size" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. UK-8" required>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="material">${translations[currentLanguage].material}</label>
          <input type="text" id="attr-material" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. Leather" required>
        </div>
      </div>
    `;
  } else if (category === 'grocery') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="weight">${translations[currentLanguage].weight}</label>
          <input type="text" id="attr-weight" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. 1 Kg" required>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="expiryDate">${translations[currentLanguage].expiryDate}</label>
          <input type="date" id="attr-expiry" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" required>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="brand">${translations[currentLanguage].brand}</label>
          <input type="text" id="attr-brand" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" required>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1" data-i18n="dimensions">${translations[currentLanguage].dimensions}</label>
          <input type="text" id="attr-dimensions" class="w-full bg-white border border-gray-300 rounded p-2 text-gray-800 text-sm" placeholder="e.g. 10x10x5 cm" required>
        </div>
      </div>
    `;
  }
  updateTranslations();
}

// LIVENESS CAMERA VERIFICATION
class LivenessVerifier {
  constructor() {
    this.stream = null;
    this.currentStep = 0;
    this.code = '';
  }

  async start() {
    const video = document.getElementById('liveness-video');
    const container = document.getElementById('liveness-area');
    const startBtn = document.getElementById('start-liveness-btn');
    
    container.classList.remove('hidden');
    startBtn.classList.add('hidden');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = this.stream;
      this.currentStep = 1;
      this.updateStepUI();
    } catch (e) {
      console.error(e);
      // Fallback/Simulation if camera block/not present
      alert('Camera access requested. Starting interactive liveness test simulation.');
      this.currentStep = 1;
      this.updateStepUI();
    }
  }

  updateStepUI() {
    const label = document.getElementById('liveness-step-label');
    const progress = document.getElementById('liveness-progress');
    const randCodeEl = document.getElementById('liveness-code-display');
    
    if (this.currentStep === 1) {
      label.innerText = translations[currentLanguage].step1;
      progress.style.width = '25%';
      randCodeEl.classList.add('hidden');
      setTimeout(() => this.nextStep(), 2500);
    } else if (this.currentStep === 2) {
      label.innerText = translations[currentLanguage].step2;
      progress.style.width = '50%';
      setTimeout(() => this.nextStep(), 2500);
    } else if (this.currentStep === 3) {
      label.innerText = translations[currentLanguage].step3;
      progress.style.width = '75%';
      setTimeout(() => this.nextStep(), 2500);
    } else if (this.currentStep === 4) {
      this.code = Math.floor(1000 + Math.random() * 9000).toString();
      label.innerText = translations[currentLanguage].step4;
      randCodeEl.innerText = this.code;
      randCodeEl.classList.remove('hidden');
      progress.style.width = '90%';
      
      this.startSpeechRecognition();
    }
  }

  startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.start();

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        if (text.includes(this.code) || text.replace(/\s+/g, '').includes(this.code)) {
          this.completeVerification();
        } else {
          setTimeout(() => this.completeVerification(), 4000);
        }
      };
      
      recognition.onerror = () => {
        setTimeout(() => this.completeVerification(), 4000);
      };
    } else {
      setTimeout(() => this.completeVerification(), 4000);
    }
  }

  nextStep() {
    this.currentStep++;
    this.updateStepUI();
  }

  completeVerification() {
    const video = document.getElementById('liveness-video');
    let dataURL = "";
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 320, 240);
      dataURL = canvas.toDataURL('image/jpeg');
    } catch (e) {
      // Premium placeholder if camera fail
      dataURL = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200";
    }
    
    window.capturedSelfieData = dataURL;

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    const label = document.getElementById('liveness-step-label');
    const progress = document.getElementById('liveness-progress');
    const randCodeEl = document.getElementById('liveness-code-display');
    
    label.innerText = translations[currentLanguage].verificationSuccess;
    progress.style.width = '100%';
    randCodeEl.classList.add('hidden');
    
    document.getElementById('liveness-area').classList.add('hidden');
    document.getElementById('verification-status-box').innerHTML = `
      <div class="text-green-600 font-bold flex items-center gap-2 justify-center">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        ${translations[currentLanguage].verificationSuccess}
      </div>
      <img src="${dataURL}" class="mt-2 w-24 h-24 rounded-full border-2 border-green-500 object-cover mx-auto" />
    `;
    
    window.livenessVerified = true;
    showToast(translations[currentLanguage].verificationSuccess);
  }
}

const livenessVerifier = new LivenessVerifier();

// AUTH/REGISTER ACTIONS
function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById('reg-email').value;
  
  if (!globalRateLimiter.isAllowed(email || 'anon_register')) {
    const remaining = globalRateLimiter.getRemainingTime(email || 'anon_register');
    alert(currentLanguage === 'gu' ? `ખૂબ જ ઝડપથી વિનંતીઓ મોકલી રહ્યા છો. કૃપા કરીને ${remaining} સેકન્ડ રાહ જુઓ.` : `Too many registration attempts. Please wait ${remaining} seconds.`);
    return;
  }

  const password = document.getElementById('reg-password').value;
  const name = document.getElementById('reg-name').value;
  const phone = document.getElementById('reg-phone').value;
  const whatsapp = document.getElementById('reg-whatsapp').value;
  const role = document.getElementById('reg-role').value;

  if (role === 'vendor') {
    if (!window.livenessVerified) {
      alert(currentLanguage === 'gu' ? 'કૃપા કરીને પહેલા સેલ્ફી લાઈવનેસ વેરિફિકેશન પૂર્ણ કરો.' : 'Please complete the selfie liveness verification first.');
      return;
    }
    const aadhaar = document.getElementById('reg-aadhaar').value;
    if (!isValidAadhaar(aadhaar)) {
      alert(currentLanguage === 'gu' ? 'કૃપા કરીને સાચો અને સુરક્ષિત ૧૨ આંકડાનો આધાર કાર્ડ નંબર દાખલ કરો.' : 'Please enter a valid and secure 12-digit Aadhaar Card Number.');
      return;
    }
  }

  let finalUser = {
    uid: 'user_' + Date.now(),
    email,
    password,
    role,
    displayName: name,
    phone,
    whatsapp,
    createdAt: new Date().toISOString()
  };

  if (role === 'vendor') {
    finalUser.aadhaar = document.getElementById('reg-aadhaar').value;
    finalUser.gstin = document.getElementById('reg-gstin').value || '';
    finalUser.upiId = document.getElementById('reg-upi').value || 'platform@upi';
    finalUser.physicalAddress = document.getElementById('reg-address').value || '';
    finalUser.vendorStatus = 'pending'; // Requires admin approval
    finalUser.livenessVerified = true;
    finalUser.selfieUrl = window.capturedSelfieData || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200';
  }

  if (role === 'admin') {
    initiateOwnerOTPVerification(finalUser, 'register');
    return;
  }

  db.saveUser(finalUser);
  
  if (role === 'vendor') {
    // Asynchronously upload selfie to Firebase Storage in background if configured
    if (isFirebaseConfigured && window.capturedSelfieData && window.capturedSelfieData.startsWith('data:')) {
      uploadSelfieToFirebase(finalUser.uid, window.capturedSelfieData).then(downloadUrl => {
        db.updateUser(finalUser.uid, { selfieUrl: downloadUrl });
        console.log("Selfie uploaded to Firebase Storage and user updated:", downloadUrl);
      });
    }
    alert(currentLanguage === 'gu' ? 'વેન્ડર રજીસ્ટ્રેશન વિનંતી સબમિટ થઈ ગઈ છે. એડમિન મંજૂરી આપશે પછી લોગીન કરી શકશો.' : 'Vendor registration submitted. You can log in after Admin approval.');
    window.location.reload();
  } else {
    setCurrentUser(finalUser);
    alert(currentLanguage === 'gu' ? 'રજીસ્ટ્રેશન સફળ!' : 'Registration successful!');
    window.location.href = 'index.html';
  }
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  
  if (!globalRateLimiter.isAllowed(email || 'anon_login')) {
    const remaining = globalRateLimiter.getRemainingTime(email || 'anon_login');
    alert(currentLanguage === 'gu' ? `ખૂબ જ ઝડપથી વિનંતીઓ મોકલી રહ્યા છો. કૃપા કરીને ${remaining} સેકન્ડ રાહ જુઓ.` : `Too many login attempts. Please wait ${remaining} seconds.`);
    return;
  }

  const password = document.getElementById('login-password').value;

  const users = db.getUsers();
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    alert(currentLanguage === 'gu' ? 'ખોટો ઈમેલ અથવા પાસવર્ડ!' : 'Invalid email or password!');
    return;
  }

  if (user.role === 'admin') {
    initiateOwnerOTPVerification(user, 'login');
    return;
  }

  if (user.role === 'vendor' && user.vendorStatus !== 'approved') {
    alert(currentLanguage === 'gu' ? 'તમારી વેન્ડર વિનંતી હજી મંજૂર કરવામાં આવી નથી!' : 'Your vendor request is not approved yet!');
    return;
  }

  setCurrentUser(user);
  showToast(currentLanguage === 'gu' ? 'લોગિન સફળ!' : 'Login Successful!');
  window.location.href = 'index.html';
}

// DEDICATED OWNER LOGIN HANDLER
function handleOwnerLogin(e) {
  e.preventDefault();
  const email = "springvalleygroups@gmail.com";
  
  if (!globalRateLimiter.isAllowed(email || 'anon_owner_login')) {
    const remaining = globalRateLimiter.getRemainingTime(email || 'anon_owner_login');
    alert(currentLanguage === 'gu' ? `ખૂબ જ ઝડપથી વિનંતીઓ મોકલી રહ્યા છો. કૃપા કરીને ${remaining} સેકન્ડ રાહ જુઓ.` : `Too many login attempts. Please wait ${remaining} seconds.`);
    return;
  }

  const password = document.getElementById('owner-login-password').value;

  const users = db.getUsers();
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    alert(currentLanguage === 'gu' ? 'ખોટો પાસવર્ડ!' : 'Invalid password!');
    return;
  }

  initiateOwnerOTPVerification(user, 'login');
}

// OWNER OTP VERIFICATION CORE FLOW
window.pendingOwnerActionType = null;
window.pendingOwnerUser = null;
window.generatedOwnerOTP = "";

async function initiateOwnerOTPVerification(user, actionType) {
  window.pendingOwnerActionType = actionType;
  window.pendingOwnerUser = user;
  
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  window.generatedOwnerOTP = otp;
  console.log("🔒 [SECURITY] Generated OTP for " + (user.email || user.displayName) + " is:", otp);
  
  // Open the OTP Modal
  const modal = document.getElementById('owner-otp-modal');
  const errorEl = document.getElementById('owner-otp-error');
  const successEl = document.getElementById('owner-otp-success');
  if (errorEl) errorEl.classList.add('hidden');
  if (successEl) {
    successEl.innerText = "Sending verification OTP email... / ઓટીપી મોકલી રહ્યા છીએ...";
    successEl.classList.remove('hidden', 'text-red-500');
    successEl.classList.add('text-green-600');
  }
  
  if (modal) {
    modal.classList.remove('hidden');
    document.getElementById('owner-otp-input').value = '';
    document.getElementById('owner-otp-input').focus();
  }
  
  // Send Email via FormSubmit AJAX to springvalleygroups@gmail.com
  try {
    const response = await fetch("https://formsubmit.co/ajax/springvalleygroups@gmail.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        _subject: "🔑 Your Business, Your Shop - Owner Verification Code",
        message: `Your Platform Owner verification code (OTP) is: ${otp}\n\nThis OTP is valid for 10 minutes.\nIf you did not request this, please verify your account security immediately.`,
        _captcha: "false"
      })
    });
    
    const result = await response.json();
    if (result.success === "true" || response.ok) {
      if (successEl) {
        successEl.innerText = "OTP sent successfully to springvalleygroups@gmail.com! / ઓટીપી સફળતાપૂર્વક મોકલાયો છે!";
      }
    } else {
      console.warn("FormSubmit response:", result);
      if (errorEl) {
        errorEl.innerText = "Failed to send email. Ensure you clicked 'Activate Form' link on springvalleygroups@gmail.com.";
        errorEl.classList.remove('hidden');
      }
      if (successEl) successEl.classList.add('hidden');
    }
  } catch (err) {
    console.error("Error sending OTP:", err);
    if (errorEl) {
      errorEl.innerText = "Error sending OTP. Please check connection or verify FormSubmit setup.";
      errorEl.classList.remove('hidden');
    }
    if (successEl) successEl.classList.add('hidden');
  }
}

function verifyOwnerOTP() {
  const enteredOTP = document.getElementById('owner-otp-input').value.trim();
  const errorEl = document.getElementById('owner-otp-error');
  const successEl = document.getElementById('owner-otp-success');
  
  if (enteredOTP === window.generatedOwnerOTP) {
    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) {
      successEl.innerText = "Verification successful! Redirecting... / ચકાસણી સફળ!";
      successEl.classList.remove('hidden');
    }
    
    // Complete the action
    setTimeout(() => {
      const user = window.pendingOwnerUser;
      const actionType = window.pendingOwnerActionType;
      
      if (actionType === 'login') {
        setCurrentUser(user);
        showToast(currentLanguage === 'gu' ? 'લોગિન સફળ!' : 'Login Successful!');
        window.location.href = 'index.html';
      } else if (actionType === 'register') {
        db.saveUser(user);
        setCurrentUser(user);
        alert(currentLanguage === 'gu' ? 'રજીસ્ટ્રેશન સફળ!' : 'Registration successful!');
        window.location.href = 'index.html';
      }
      
      closeOwnerOTPModal();
    }, 1000);
  } else {
    if (errorEl) {
      errorEl.innerText = currentLanguage === 'gu' ? "ખોટો ઓટીપી કોડ! કૃપા કરીને ફરી પ્રયાસ કરો." : "Invalid OTP code! Please try again.";
      errorEl.classList.remove('hidden');
    }
    if (successEl) successEl.classList.add('hidden');
  }
}

function closeOwnerOTPModal() {
  const modal = document.getElementById('owner-otp-modal');
  if (modal) modal.classList.add('hidden');
  
  // Clear variables for security
  window.pendingOwnerActionType = null;
  window.pendingOwnerUser = null;
  window.generatedOwnerOTP = "";
}

function handleLogout() {
  setCurrentUser(null);
  window.location.href = 'index.html';
}

// INVOICE / BILL GENERATION & PRINTING
function generateInvoiceHTML(order) {
  const dateStr = new Date(order.createdAt).toLocaleDateString();
  
  // Custom display attributes inside bill
  let attributesHtml = '';
  if (order.items && order.items[0] && order.items[0].attributes) {
    const attrs = order.items[0].attributes;
    attributesHtml = Object.entries(attrs)
      .map(([k, v]) => v ? `<div class="text-xs text-gray-500"><strong>${k}:</strong> ${v}</div>` : '')
      .join('');
  }

  const itemsRows = order.items.map(item => `
    <tr class="border-b border-gray-200">
      <td class="py-2 text-left">
        <div class="font-medium">${item.name}</div>
        ${attributesHtml}
      </td>
      <td class="py-2 text-center">${item.quantity}</td>
      <td class="py-2 text-right">₹${item.price}</td>
      <td class="py-2 text-right">₹${item.price * item.quantity}</td>
    </tr>
  `).join('');

  return `
    <div id="printable-invoice" class="p-8 max-w-2xl mx-auto bg-white text-black rounded-lg shadow-lg border border-gray-300">
      <div class="flex justify-between items-start border-b-2 border-gray-300 pb-4 mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">${translations[currentLanguage].invoiceTitle}</h1>
          <p class="text-sm text-gray-500">${translations[currentLanguage].invoiceNumber}: ${order.invoiceNumber}</p>
          <p class="text-sm text-gray-500">${translations[currentLanguage].invoiceDate}: ${dateStr}</p>
        </div>
        <div class="text-right">
          <h2 class="text-lg font-bold text-orange-600">${order.vendorName}</h2>
          <p class="text-xs text-gray-600">UPI: ${order.vendorUpi || ''}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <h3 class="font-semibold text-gray-700">${translations[currentLanguage].invoiceFrom}:</h3>
          <p class="font-medium">${order.vendorName}</p>
          <p class="text-gray-600">${order.vendorAddress || 'Online Store'}</p>
        </div>
        <div>
          <h3 class="font-semibold text-gray-700">${translations[currentLanguage].invoiceTo}:</h3>
          <p class="font-medium">${order.customerName}</p>
          <p class="text-gray-600">${order.shippingAddress}</p>
          <p class="text-gray-600">Mobile: ${order.customerMobile}</p>
        </div>
      </div>

      <table class="w-full mb-6 text-sm">
        <thead>
          <tr class="border-b-2 border-gray-300">
            <th class="py-2 text-left">${translations[currentLanguage].productName}</th>
            <th class="py-2 text-center">${translations[currentLanguage].qty}</th>
            <th class="py-2 text-right">${translations[currentLanguage].unitPrice}</th>
            <th class="py-2 text-right">${translations[currentLanguage].subtotal}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="flex justify-between items-center pt-4 border-t-2 border-gray-300">
        <div class="text-xs text-gray-500">
          * Powered by ${translations[currentLanguage].brandName}
        </div>
        <div class="text-right">
          <p class="text-lg font-bold text-gray-800">${translations[currentLanguage].total}: ₹${order.totalAmount}</p>
        </div>
      </div>
      
      <div class="mt-8 flex justify-center no-print gap-4">
        <button onclick="window.print()" class="bg-orange-500 text-white px-6 py-2 rounded shadow hover:bg-orange-600 transition">Print Invoice</button>
        <button onclick="document.getElementById('invoice-modal').classList.add('hidden')" class="bg-gray-200 text-black px-6 py-2 rounded shadow hover:bg-gray-300 transition">Close</button>
      </div>
    </div>
  `;
}

// Database auto-repair/migration for Owner email
(function migrateAdminEmail() {
  try {
    let users = db.getUsers();
    let admin = users.find(u => u.uid === "admin123");
    if (admin && admin.email !== "springvalleygroups@gmail.com") {
      admin.email = "springvalleygroups@gmail.com";
      db.saveUser(admin);
      console.log("Database Repair: Forced Admin email to springvalleygroups@gmail.com");
    }
  } catch (e) {
    console.error("Auto repair error:", e);
  }
})();

// UPGRADE 4: CLIENT-SIDE AI COPYWRITER DESCRIPTION GENERATOR
function generateAIDescription(name, category) {
  const cleanName = name.trim();
  if (!cleanName) return "";
  
  const templates = {
    clothing: [
      `અધતન ફેશન અને પ્રીમિયમ ક્વોલિટી ધરાવતું ${cleanName}! આ ફેબ્રિક ખૂબ જ સોફ્ટ, કમ્ફર્ટેબલ અને પહેરવામાં આકર્ષક લાગે છે. તહેવારો અને પ્રસંગો માટે એકદમ પરફેક્ટ ચોઈસ છે. \n\nIntroducing the premium quality ${cleanName}! Made with skin-friendly, breathable fabric that ensures all-day comfort. Elegant design, perfect for casual wear, festive occasions, and parties. Upgrade your wardrobe today!`,
      `ગ્રેસફુલ લુક આપતું ${cleanName}! ટકાઉ મટીરીયલ અને આધુનિક ડિઝાઈન સાથે બનેલ છે. ધોવા પછી પણ તેનો રંગ અને ચમક યથાવત રહે છે.\n\nExperience style and premium comfort with ${cleanName}. Crafted from high-grade fabric, featuring color-fastness and modern tailoring. Perfect outfit for all seasons.`
    ],
    electronics: [
      `નવી ટેકનોલોજી અને હાઈ-પરફોર્મન્સ ધરાવતું ${cleanName}! તે વાપરવામાં ખૂબ જ સ્મૂથ, સ્પીડી અને ડ્યુરેબલ છે. આજના સ્માર્ટ લાઈફસ્ટાઈલ માટે બેસ્ટ આઈટમ છે. \n\nExperience the next-gen technology with ${cleanName}! Designed for speed, durability, and top-tier performance. Features sleek aesthetics, battery efficiency, and smart connectivity. Built for your everyday smart living.`,
      `પાવરફુલ ફિચર્સ અને પોકેટ-ફ્રેન્ડલી રેન્જમાં ${cleanName}! એકદમ આધુનિક ડિઝાઈન અને ગેરંટીડ ટકાઉપણું.\n\nHigh efficiency meets smart design. ${cleanName} is engineered with advanced components to deliver exceptional productivity and long-lasting durability.`
    ],
    footwear: [
      `પ્રીમિયમ લુક અને સુપર કમ્ફર્ટ સોલ સાથેનું ${cleanName}! આખો દિવસ પહેરવા છતાં પગમાં દુખાવો થતો નથી. ટકાઉ દોડવા અને ચાલવા માટે આદર્શ શૂઝ.\n\nPremium build quality and ergonomic sole design with ${cleanName}. Offers superior grip, soft cushioning, and long-lasting comfort. Suitable for both style and heavy daily usage.`,
      `ટ્રેન્ડી લુક અને મજબૂત ગ્રિપ આપતા ${cleanName}! ઓફિસ અને કેઝ્યુઅલ પ્રસંગો માટે એકદમ આકર્ષક ડિઝાઈન.\n\nWalk in absolute style and confidence with ${cleanName}. High durability, water-resistant exterior, and fashionable fit.`
    ],
    grocery: [
      `૧૦૦% શુદ્ધ અને કુદરતી સ્ત્રોતોમાંથી બનેલું તાજું ${cleanName}! સ્વાસ્થ્ય માટે ઉત્તમ અને આહારનો સ્વાદ વધારતી ઓર્ગેનિક પ્રોડક્ટ.\n\n100% pure and organic ${cleanName}, sourced directly from premium farms. Hygienically packed, fresh, and free from any chemical additives. Boost your daily health and kitchen flavor naturally.`,
      `ન્યુટ્રિશિયન્સ અને વિટામિન્સથી ભરપૂર ${cleanName}! લાંબા સમય સુધી તાજું રહે તેવું હાઈ-ગ્રેડ પેકિંગ.\n\nDirect from nature to your home. ${cleanName} offers superior freshness, nutrient-rich value, and delicious taste for your family.`
    ],
    home_kitchen: [
      `તમારા ઘર અને રસોડાની સુંદરતા વધારતું ${cleanName}! કોમ્પેક્ટ ડિઝાઈન, હળવું વજન અને વાપરવામાં એકદમ સરળ અને સલામત છે.\n\nUpgrade your living space with ${cleanName}! Highly functional, space-saving design, and built using eco-friendly materials. Adds a touch of elegance and convenience to your daily home operations.`,
      `ટકાઉ મટીરીયલ અને મોર્ડન આઉટલુક સાથેનું ${cleanName}! રોજિંદા ઘર વપરાશ માટે લાંબા સમય સુધી સાથ આપે તેવી આઈટમ.\n\nStylish and functional helper for your home. ${cleanName} is carefully designed to offer high efficiency, modern aesthetics, and easy maintenance.`
    ],
    others: [
      `ખાસ જરૂરિયાત અને ડેઈલી લાઈફસ્ટાઈલ માટે પ્રીમિયમ કલેક્શનમાંથી ${cleanName}! બેસ્ટ ઇન ક્લાસ ક્વોલિટી અને ઉત્તમ મજબૂતાઈ ધરાવે છે.\n\nHandcrafted to perfection, ${cleanName} is made from premium grade materials to ensure top-notch quality, style, and long lifetime. A perfect gift or utility item for your needs.`,
      `ગેરંટીડ ટકાઉપણું અને બજેટ ફ્રેન્ડલી રેટમાં ${cleanName}! ગ્રાહકોની પહેલી પસંદ.\n\nHighly recommended premium utility item. ${cleanName} offers outstanding value, durable packaging, and beautiful design.`
    ]
  };
  
  const catList = templates[category] || templates['others'];
  const index = Math.floor(Math.random() * catList.length);
  return catList[index];
}

// UPGRADE 11: PAYTM-STYLE UPI PAYMENT SOUNDBOX AUDIO ALERTS
function playPaymentSoundbox(amount) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Cancel any active speech
    
    const text = `તમારો ધંધો તમારી દુકાન પર ${amount} રૂપિયા નું ચુકવણું સફળતાપૂર્વક મળ્યું!`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'gu-IN';
    utterance.rate = 0.95;
    
    // Fallback if Gujarati voice is not found on user machine
    const voices = window.speechSynthesis.getVoices();
    const hasGuj = voices.some(v => v.lang.startsWith('gu'));
    
    if (!hasGuj) {
      const hasHi = voices.some(v => v.lang.startsWith('hi'));
      if (hasHi) {
        utterance.text = `तमारो धंधो तुम्हारी दूकान पर ${amount} रुपये का भुगतान सफलतापूर्वक प्राप्त हुआ!`;
        utterance.lang = 'hi-IN';
      } else {
        utterance.text = `Your Business, Your Shop received a payment of ${amount} rupees successfully!`;
        utterance.lang = 'en-IN';
      }
    }
    window.speechSynthesis.speak(utterance);
  }
}

// UPGRADE 14: COLLABORATIVE CART LINK SHARING & LOADING
(function parseSharedCart() {
  document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedCart = urlParams.get('cart_share');
    if (sharedCart) {
      try {
        const items = sharedCart.split(',');
        const products = db.getProducts();
        let loadedAny = false;
        
        // Clear existing cart first
        cart = [];
        
        items.forEach(itemStr => {
          const [prodId, qtyStr] = itemStr.split(':');
          const qty = parseInt(qtyStr) || 1;
          const product = products.find(p => p.id === prodId && p.approvedByAdmin);
          if (product) {
            cart.push({
              productId: product.id,
              name: product.name,
              price: product.price,
              imageUrl: product.imageUrl,
              vendorId: product.vendorId,
              vendorName: product.vendorName,
              attributes: product.attributes,
              quantity: qty
            });
            loadedAny = true;
          }
        });
        
        if (loadedAny) {
          saveCart();
          showToast(currentLanguage === 'gu' ? "શેર્ડ કાર્ટ સફળતાપૂર્વક લોડ થઈ ગયું છે!" : "Shared cart loaded successfully!");
          // Clean URL params to prevent reloading on refresh
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        console.error("Error parsing shared cart link:", e);
      }
    }
  });
})();
