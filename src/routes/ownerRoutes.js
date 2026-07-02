const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 1. Define Disk Storage with ABSOLUTE path
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // This moves up from 'src/routes' to the main project folder
        const uploadPath = path.join(__dirname, "../../uploads"); 

        // Create folder if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const auth = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const additemController = require("../controllers/additemController");
const cartController = require("../controllers/cartController");
const newcategoryController = require("../controllers/newcategoryController");
const editController = require("../controllers/editController");
const allUsersController = require("../controllers/allUsersController");
const orderController = require('../controllers/orderController');
const wishlistController = require('../controllers/wishlistControlles');
const couponController = require('../controllers/couponController');

// Routes
// add product with multiple images
router.post('/rest_api_save_product', auth, authorizeRoles('admin'), upload.array('productImages', 5), additemController.saveitems);
router.get('/rest_api_get_all_products', additemController.getAllProducts);


// add to cart products
router.post('/rest_api_cart_add', cartController.addToCart);
router.get('/rest_api_cart_user_cart', cartController.getCartItems);
router.put('/rest_api_cart_update', cartController.updateCartQty);
router.delete('/rest_api_cart_remove/:id', cartController.removeCartItem);



//===================New category controller routes ===================
// Category routes
router.get('/rest_api_get_all_categories', newcategoryController.getCategories);
router.post('/rest_api_add_category', newcategoryController.addCategory);
router.put('/rest_api_update_category/:id', newcategoryController.updateCategory);
router.delete('/rest_api_delete_category/:id', newcategoryController.deleteCategory);


//===================Edit Product controller routes ===================
// Edit product routes
router.get('/rest_api_get_product/:id', editController.getProductById);
router.post('/rest_api_update_product', auth, authorizeRoles('admin'), upload.array('productImages', 5), editController.updateProduct);
router.post('/rest_api_delete_product', auth, authorizeRoles('admin'), editController.deleteProduct);


//===================all user routes ===================
router.get("/rest_api_get_all_users", auth, authorizeRoles("admin"), allUsersController.getAllUsers);



//===================order routes ===================
router.post("/rest_api_create_order", auth, orderController.createOrder);
router.get('/rest_api_get_user_orders', auth, orderController.getUserOrders);

router.get("/rest_api_get_all_orders", auth, orderController.getAllOrdersAdmin);
router.post("/rest_api_update_order_status", auth, orderController.updateOrderStatusAdmin);



//===================wishlist routes ===================
router.get('/rest_api_get_user_wishlist', auth, wishlistController.getUserWishlist);
router.post('/rest_api_add_to_wishlist', auth, wishlistController.addToWishlist);
router.post('/rest_api_delete_wishlist_item', auth, wishlistController.deleteWishlistItem);



//===================coupon routes ===================
router.get('/rest_api_get_active_coupons', auth, couponController.getActiveCoupons);
router.post('/rest_api_create_coupon', auth, couponController.createCoupon);
router.post('/rest_api_validate_coupon', auth, couponController.validateCoupon);
router.get('/rest_api_get_used_coupons', auth, couponController.getUsedCoupons);
router.delete('/rest_api_delete_coupon/:id', auth, authorizeRoles('admin'), couponController.deleteCoupon);


module.exports = router;