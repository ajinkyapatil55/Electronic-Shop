const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Middleware
const auth = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// Controllers
const additemController = require("../controllers/additemController");
const cartController = require("../controllers/cartController");
const newcategoryController = require("../controllers/newcategoryController");
const editController = require("../controllers/editController");
const allusersController = require("../controllers/allusersController");
const orderController = require("../controllers/orderController");
const wishlistController = require("../controllers/wishlistController");
const couponController = require("../controllers/couponController");
const reviewController = require("../controllers/reviewController");
const addressController = require("../controllers/addressController");
const deliveryboyinfoController = require("../controllers/deliveryboyinfoController");
const notificationController = require("../controllers/notificationController");

/* ============================================================================
   1) MULTER CONFIGURATION
============================================================================ */
const uploadDir = path.join(__dirname, "../../uploads");

// Create uploads folder if it does not exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

/* ============================================================================
   2) PRODUCT ROUTES
============================================================================ */

/**
 * Add new product
 * Admin only
 * Supports multiple product images
 */
router.post("/rest_api_save_product", auth, authorizeRoles("admin"), upload.array("productImages", 5), additemController.saveitems);

/**
 * Get all products
 */
router.get("/rest_api_get_all_products", additemController.getAllProducts);

// Public product search used by the storefront Navbar.
router.get("/rest_api_search_products", additemController.searchProducts);

/* ============================================================================
   3) CART ROUTES
============================================================================ */

/**
 * Add product to cart
 */
router.post("/rest_api_cart_add", cartController.addToCart);

/**
 * Get user cart items
 */
router.get("/rest_api_cart_user_cart", cartController.getCartItems);

/**
 * Update cart quantity
 */
router.put("/rest_api_cart_update", cartController.updateCartQty);

/**
 * Remove cart item by ID
 */
router.delete("/rest_api_cart_remove/:id", cartController.removeCartItem);

/* ============================================================================
   4) CATEGORY ROUTES
============================================================================ */

/**
 * Get all categories
 */
router.get("/rest_api_get_all_categories", newcategoryController.getCategories);

/**
 * Add category
 */
router.post("/rest_api_add_category", newcategoryController.addCategory);

/**
 * Update category by ID
 */
router.put("/rest_api_update_category/:id", newcategoryController.updateCategory);

/**
 * Delete category by ID
 */
router.delete("/rest_api_delete_category/:id", newcategoryController.deleteCategory);

/* ============================================================================
   5) PRODUCT EDIT / DELETE ROUTES
============================================================================ */

/**
 * Get single product by ID
 */
router.get("/rest_api_get_product/:id", editController.getProductById);

/**
 * Update product
 * Admin only
 * Supports multiple product images
 */
router.post("/rest_api_update_product", auth, authorizeRoles("admin"), upload.array("productImages", 5), editController.updateProduct);

/**
 * Delete product
 * Admin only
 */
router.post("/rest_api_delete_product", auth, authorizeRoles("admin"), editController.deleteProduct);

/* ============================================================================
   6) USER ROUTES
============================================================================ */

/**
 * Get all users
 * Admin only
 */
router.get("/rest_api_get_all_users", auth, authorizeRoles("admin"), allusersController.getAllUsers);

/* ============================================================================
   7) ORDER ROUTES
============================================================================ */

/**
 * Create new order
 */
router.post("/rest_api_create_order", auth, orderController.createOrder);

/**
 * Get logged-in user's orders
 */
router.get("/rest_api_get_user_orders", auth, orderController.getUserOrders);

/**
 * Get all orders (admin)
 */
router.get("/rest_api_get_all_orders", auth, orderController.getAllOrdersAdmin);

/**
 * Update order status (admin)
 */
router.post("/rest_api_update_order_status", auth, authorizeRoles("admin"), orderController.updateOrderStatusAdmin);

/**
 * Cancel order (user)
 */
router.delete('/cancel_order/:orderId', auth, orderController.cancelOrder);

/**
 * Get shipped orders for delivery boys also this order all info address amount all info fetch...
 */
router.get("/rest_api_get_shipped_orders", auth, orderController.getShippedOrdersForDelivery);


/* ============================================================================
   8) WISHLIST ROUTES
============================================================================ */

/**
 * Get logged-in user's wishlist
 */
router.get("/rest_api_get_user_wishlist", auth, wishlistController.getUserWishlist);

/**
 * Add item to wishlist
 */
router.post("/rest_api_add_to_wishlist", auth, wishlistController.addToWishlist);

/**
 * Remove wishlist item
 */
router.post("/rest_api_delete_wishlist_item", auth, wishlistController.deleteWishlistItem);

router.post("/notifications/fcm-token", auth, notificationController.registerToken);
router.delete("/notifications/fcm-token", auth, notificationController.removeToken);
router.get("/notifications/status", auth, authorizeRoles("admin"), notificationController.status);
router.post("/notifications/test", auth, notificationController.sendTest);

/* ============================================================================
   9) COUPON ROUTES
============================================================================ */

// Get active coupons
router.get("/rest_api_get_active_coupons", auth, couponController.getActiveCoupons);

// Create coupon
router.post("/rest_api_create_coupon", auth, couponController.createCoupon);

// Validate coupon
router.post("/rest_api_validate_coupon", auth, couponController.validateCoupon);

// Get used coupons
router.get("/rest_api_get_used_coupons", auth, couponController.getUsedCoupons);

// Delete coupon by ID Admin only
router.delete("/rest_api_delete_coupon/:id", auth, authorizeRoles("admin"), couponController.deleteCoupon);



// Get product reviews
router.get("/rest_api_get_product_reviews/:productId", reviewController.getProductReviews);

//  Add product review
router.post("/rest_api_submit_review", auth, upload.single("review_image"), reviewController.submitReview);

// delete product review
router.delete("/rest_api_delete_review/:reviewId", auth, reviewController.deleteReview);


// ===================================================================
// 10) ADDRESS ROUTES
// ===================================================================

router.post("/rest_api_save_address", auth, addressController.saveAddress);

/**
 * Get all saved addresses for the logged-in user
 * GET /api/user/rest_api_get_all_addresses
 */
router.get("/rest_api_get_all_addresses", auth, addressController.getUserAddresses);
/**
 * Delete a specific saved address
 * DELETE /api/user/rest_api_delete_address/:id
 */
router.delete("/rest_api_delete_address/:id", auth, addressController.deleteAddress);



// ===================================================================
// 11) DELIVERY BOY INFO
// ===================================================================

router.get("/rest_api_get_all_delivery_boys", auth, deliveryboyinfoController.getAllDeliveryBoys);
router.get("/rest_api_get_delivery_boy/:id", auth, deliveryboyinfoController.getDeliveryBoyById);
router.put("/rest_api_update_delivery_boy", auth, deliveryboyinfoController.updateDeliveryBoy);
router.delete("/rest_api_delete_delivery_boy/:id", auth, deliveryboyinfoController.deleteDeliveryBoy);

// assign delivery boy to order
router.post("/rest_api_assign_delivery_boy_to_order", auth, deliveryboyinfoController.assignDeliveryBoy);

// GET all orders assigned to a specific delivery boy
router.get("/get_assigned_orders_by_delivery_boy_id", auth, deliveryboyinfoController.getAssignedOrdersByDeliveryBoyId);

// delivery boy request accept or reject on assing delivery...
router.post("/respond_to_assignment", auth, deliveryboyinfoController.respondToAssignment);

// Delivery is completed only after the customer email OTP is verified.
router.post("/request_delivery_completion_otp", auth, deliveryboyinfoController.requestDeliveryCompletionOtp);
router.post("/verify_delivery_completion_otp", auth, deliveryboyinfoController.verifyDeliveryCompletionOtp);



module.exports = router;

















































// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // 1. Define Disk Storage with ABSOLUTE path
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         // This moves up from 'src/routes' to the main project folder
//         const uploadPath = path.join(__dirname, "../../uploads"); 

//         // Create folder if it doesn't exist
//         if (!fs.existsSync(uploadPath)) {
//             fs.mkdirSync(uploadPath, { recursive: true });
//         }
        
//         cb(null, uploadPath);
//     },
//     filename: function (req, file, cb) {
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//     }
// });

// const upload = multer({ storage: storage });

// const auth = require("../middleware/authMiddleware");
// const authorizeRoles = require("../middleware/roleMiddleware");
// const additemController = require("../controllers/additemController");
// const cartController = require("../controllers/cartController");
// const newcategoryController = require("../controllers/newcategoryController");
// const editController = require("../controllers/editController");
// const allusersController = require("../controllers/allusersController");
// const orderController = require('../controllers/orderController');
// const wishlistController = require('../controllers/wishlistController');
// const couponController = require('../controllers/couponController');

// // Routes
// // add product with multiple images
// router.post('/rest_api_save_product', auth, authorizeRoles('admin'), upload.array('productImages', 5), additemController.saveitems);
// router.get('/rest_api_get_all_products', additemController.getAllProducts);


// // add to cart products
// router.post('/rest_api_cart_add', cartController.addToCart);
// router.get('/rest_api_cart_user_cart', cartController.getCartItems);
// router.put('/rest_api_cart_update', cartController.updateCartQty);
// router.delete('/rest_api_cart_remove/:id', cartController.removeCartItem);



// //===================New category controller routes ===================
// // Category routes
// router.get('/rest_api_get_all_categories', newcategoryController.getCategories);
// router.post('/rest_api_add_category', newcategoryController.addCategory);
// router.put('/rest_api_update_category/:id', newcategoryController.updateCategory);
// router.delete('/rest_api_delete_category/:id', newcategoryController.deleteCategory);


// //===================Edit Product controller routes ===================
// // Edit product routes
// router.get('/rest_api_get_product/:id', editController.getProductById);
// router.post('/rest_api_update_product', auth, authorizeRoles('admin'), upload.array('productImages', 5), editController.updateProduct);
// router.post('/rest_api_delete_product', auth, authorizeRoles('admin'), editController.deleteProduct);


// //===================all user routes ===================
// router.get("/rest_api_get_all_users", auth, authorizeRoles("admin"), allusersController.getAllUsers);



// //===================order routes ===================
// router.post("/rest_api_create_order", auth, orderController.createOrder);
// router.get('/rest_api_get_user_orders', auth, orderController.getUserOrders);

// router.get("/rest_api_get_all_orders", auth, orderController.getAllOrdersAdmin);
// router.post("/rest_api_update_order_status", auth, orderController.updateOrderStatusAdmin);



// //===================wishlist routes ===================
// router.get('/rest_api_get_user_wishlist', auth, wishlistController.getUserWishlist);
// router.post('/rest_api_add_to_wishlist', auth, wishlistController.addToWishlist);
// router.post('/rest_api_delete_wishlist_item', auth, wishlistController.deleteWishlistItem);



// //===================coupon routes ===================
// router.get('/rest_api_get_active_coupons', auth, couponController.getActiveCoupons);
// router.post('/rest_api_create_coupon', auth, couponController.createCoupon);
// router.post('/rest_api_validate_coupon', auth, couponController.validateCoupon);
// router.get('/rest_api_get_used_coupons', auth, couponController.getUsedCoupons);
// router.delete('/rest_api_delete_coupon/:id', auth, authorizeRoles('admin'), couponController.deleteCoupon);


// module.exports = router;
