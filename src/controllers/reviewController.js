const db = require("../config/db");

// ==========================================================
// HELPER: DETECT REVIEW SENTIMENT
// ==========================================================
const detectSentiment = (rating, reviewTitle = "", reviewText = "") => {
    const fullText = `${reviewTitle || ""} ${reviewText || ""}`.toLowerCase().trim();

    const positiveWords = [
        "good", "great", "excellent", "amazing", "awesome", "nice", "best",
        "perfect", "love", "loved", "satisfied", "happy", "worth", "quality",
        "super", "fantastic", "recommend"
    ];

    const negativeWords = [
        "bad", "worst", "poor", "waste", "useless", "hate", "damaged",
        "broken", "cheap", "problem", "issue", "not good", "terrible",
        "disappointed", "refund"
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    for (const word of positiveWords) {
        if (fullText.includes(word)) positiveScore++;
    }

    for (const word of negativeWords) {
        if (fullText.includes(word)) negativeScore++;
    }

    if (Number(rating) >= 4) positiveScore += 2;
    if (Number(rating) <= 2) negativeScore += 2;

    if (positiveScore > negativeScore) return "positive";
    if (negativeScore > positiveScore) return "negative";
    return "neutral";
};

// ==========================================================
// HELPER: GET USER ID FROM AUTH TOKEN ONLY
// ==========================================================
const getUserIdFromRequest = (req) => {
    if (req.user && req.user.id) return Number(req.user.id);
    if (req.user && req.user.user_id) return Number(req.user.user_id);
    return null;
};

// ==========================================================
// 1) GET PRODUCT REVIEWS + SUMMARY + MY REVIEW
// API: GET /api/reviews/rest_api_get_product_reviews/:productId
// Used by frontend loadReviews()
// ==========================================================
exports.getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;

        if (!productId || isNaN(Number(productId))) {
            return res.status(400).json({
                success: false,
                message: "Valid productId is required."
            });
        }

        // logged-in user (optional)
        let currentUserId = null;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(" ")[1];
                const decoded = require("jsonwebtoken").verify(token, process.env.JWT_SECRET);
                if (decoded && decoded.id) currentUserId = Number(decoded.id);
                else if (decoded && decoded.user_id) currentUserId = Number(decoded.user_id);
            } catch (err) {
                console.log("Optional jwt verify failed inside getProductReviews:", err.message);
            }
        }

        // ----------------------------------------------------------
        // STEP 1: CHECK PRODUCT EXISTS
        // products.id is assumed to be the real product id
        // ----------------------------------------------------------
        const [productRows] = await db.query(
            `SELECT id, product_id, name
             FROM products
             WHERE id = ? OR product_id = ?
             LIMIT 1`,
            [Number(productId), String(productId)]
        );

        if (productRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        const actualProductId = productRows[0].id;

        // ----------------------------------------------------------
        // STEP 2: GET ALL ACTIVE REVIEWS OF THIS PRODUCT
        // NOTE:
        // If your users table has different name column, change u.name
        // ----------------------------------------------------------
        const [reviews] = await db.query(
            `SELECT
                pr.id,
                pr.product_id,
                pr.user_id,
                pr.rating,
                pr.review_title,
                pr.review_text,
                pr.review_image,
                pr.sentiment,
                pr.created_at,
                pr.updated_at,
                COALESCE(u.name, 'Anonymous') AS user_name
             FROM product_reviews pr
             LEFT JOIN users u ON u.id = pr.user_id
             WHERE pr.product_id = ?
               AND pr.status = 'active'
             ORDER BY pr.created_at DESC`,
            [actualProductId]
        );

        // ----------------------------------------------------------
        // STEP 3: GET REVIEW SUMMARY
        // This matches your frontend summary keys exactly:
        // total_reviews, average_rating, one_star_count... etc.
        // ----------------------------------------------------------
        const [summaryRows] = await db.query(
            `SELECT
                COUNT(*) AS total_reviews,
                ROUND(AVG(rating), 1) AS average_rating,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS one_star_count,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS two_star_count,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS three_star_count,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS four_star_count,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five_star_count,
                SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_count,
                SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) AS neutral_count,
                SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_count
             FROM product_reviews
             WHERE product_id = ?
               AND status = 'active'`,
            [actualProductId]
        );

        const summaryRow = summaryRows[0] || {};

        const summary = {
            total_reviews: Number(summaryRow.total_reviews || 0),
            average_rating: Number(summaryRow.average_rating || 0),
            one_star_count: Number(summaryRow.one_star_count || 0),
            two_star_count: Number(summaryRow.two_star_count || 0),
            three_star_count: Number(summaryRow.three_star_count || 0),
            four_star_count: Number(summaryRow.four_star_count || 0),
            five_star_count: Number(summaryRow.five_star_count || 0),
            positive_count: Number(summaryRow.positive_count || 0),
            neutral_count: Number(summaryRow.neutral_count || 0),
            negative_count: Number(summaryRow.negative_count || 0)
        };

        // ----------------------------------------------------------
        // STEP 4: GET CURRENT USER'S REVIEW (myReview)
        // Frontend uses:
        // setMyReview(res.data.myReview || null)
        // ----------------------------------------------------------
        let myReview = null;

        if (currentUserId) {
            const [myReviewRows] = await db.query(
                `SELECT
                    id,
                    product_id,
                    user_id,
                    rating,
                    review_title,
                    review_text,
                    review_image,
                    sentiment,
                    created_at,
                    updated_at
                 FROM product_reviews
                 WHERE product_id = ?
                   AND user_id = ?
                   AND status = 'active'
                 LIMIT 1`,
                [actualProductId, currentUserId]
            );

            if (myReviewRows.length > 0) {
                myReview = myReviewRows[0];
            }
        }

        let canReview = false;
        if (currentUserId) {
            const [purchaseRows] = await db.query(
                `SELECT 1 
                 FROM orders o
                 INNER JOIN order_items oi ON oi.order_id = o.id
                 WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered'
                 LIMIT 1`,
                [currentUserId, actualProductId]
            );
            if (purchaseRows.length > 0) {
                canReview = true;
            }
        }

        return res.status(200).json({
            success: true,
            reviews,
            summary,
            myReview,
            canReview
        });

    } catch (error) {
        console.error("getProductReviews error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};

// ==========================================================
// 2) ADD REVIEW OR UPDATE EXISTING REVIEW
// API: POST /api/reviews/rest_api_submit_review
// Used by frontend handleSubmit()
// Body:
// {
//   product_id,
//   user_id,
//   rating,
//   review_title,
//   review_text
// }
// ==========================================================
exports.submitReview = async (req, res) => {
    try {
        const { product_id, rating, review_title, review_text } = req.body;
        const user_id = getUserIdFromRequest(req);

        // ----------------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------------
        if (!user_id) {
            return res.status(401).json({
                success: false,
                message: "Please log in first."
            });
        }

        if (!product_id || isNaN(Number(product_id))) {
            return res.status(400).json({
                success: false,
                message: "Valid product_id is required."
            });
        }

        if (!rating || isNaN(Number(rating))) {
            return res.status(400).json({
                success: false,
                message: "Rating is required."
            });
        }

        const numericRating = Number(rating);

        if (numericRating < 1 || numericRating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5."
            });
        }

        if (!review_text || !String(review_text).trim()) {
            return res.status(400).json({
                success: false,
                message: "Review text is required."
            });
        }

        const cleanTitle = review_title ? String(review_title).trim() : null;
        const cleanText = String(review_text).trim();

        // ----------------------------------------------------------
        // CHECK PRODUCT EXISTS
        // ----------------------------------------------------------
        const [productRows] = await db.query(
            `SELECT id, product_id, name
             FROM products
             WHERE id = ? OR product_id = ?
             LIMIT 1`,
            [Number(product_id), String(product_id)]
        );

        if (productRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        const actualProductId = productRows[0].id;

        // ----------------------------------------------------------
        // CHECK IF USER PURCHASED AND RECEIVED THE PRODUCT
        // ----------------------------------------------------------
        const [purchaseRows] = await db.query(
            `SELECT 1 
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered'
             LIMIT 1`,
            [user_id, actualProductId]
        );

        if (purchaseRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "You can only review products that have been successfully delivered to your address."
            });
        }

        // ----------------------------------------------------------
        // CHECK IF USER ALREADY REVIEWED THIS PRODUCT (any status)
        // If active  -> UPDATE
        // If deleted -> RE-ACTIVATE + UPDATE
        // If none    -> INSERT
        // ----------------------------------------------------------
        const [existingReviewRows] = await db.query(
            `SELECT id, status
             FROM product_reviews
             WHERE product_id = ?
               AND user_id = ?
             LIMIT 1`,
            [actualProductId, user_id]
        );

        const sentiment = detectSentiment(numericRating, cleanTitle, cleanText);

        // ---------------- UPDATE OR RE-ACTIVATE EXISTING REVIEW ----------------
        if (existingReviewRows.length > 0) {
            const reviewId = Number(existingReviewRows[0].id);
            const existingStatus = existingReviewRows[0].status;

            let queryStr = `UPDATE product_reviews
                 SET rating = ?,
                     review_title = ?,
                     review_text = ?,
                     sentiment = ?,
                     status = 'active',
                     updated_at = NOW()`;
            let queryParams = [numericRating, cleanTitle, cleanText, sentiment];

            if (req.file) {
                queryStr += `, review_image = ?`;
                const fileVal = (req.file.path && (req.file.path.startsWith('http://') || req.file.path.startsWith('https://'))) ? req.file.path : `uploads/${req.file.filename}`;
                queryParams.push(fileVal);
            }

            queryStr += ` WHERE id = ?`;
            queryParams.push(reviewId);

            await db.query(queryStr, queryParams);

            return res.status(200).json({
               success: true,
               message: existingStatus === "deleted"
                   ? "Review submitted successfully."
                   : "Review updated successfully.",
               reviewId,
               action: existingStatus === "deleted" ? "created" : "updated"
            });
        }

        // ---------------- INSERT NEW REVIEW ----------------
        const review_image = req.file 
            ? ((req.file.path && (req.file.path.startsWith('http://') || req.file.path.startsWith('https://'))) ? req.file.path : `uploads/${req.file.filename}`)
            : null;
        const [insertResult] = await db.query(
            `INSERT INTO product_reviews
             (product_id, user_id, rating, review_title, review_text, review_image, sentiment, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
            [actualProductId, user_id, numericRating, cleanTitle, cleanText, review_image, sentiment]
        );

        return res.status(200).json({
            success: true,
            message: "Review submitted successfully.",
            reviewId: insertResult.insertId,
            action: "created"
        });

    } catch (error) {
        console.error("submitReview error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};

// ==========================================================
// 3) DELETE REVIEW
// API: DELETE /api/reviews/rest_api_delete_review/:reviewId
// Used by frontend handleDelete()
// ==========================================================
exports.deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const user_id = getUserIdFromRequest(req);

        if (!user_id) {
            return res.status(401).json({
                success: false,
                message: "Please log in first."
            });
        }

        if (!reviewId || isNaN(Number(reviewId))) {
            return res.status(400).json({
                success: false,
                message: "Valid reviewId is required."
            });
        }

        // ----------------------------------------------------------
        // FIND REVIEW
        // ----------------------------------------------------------
        const [reviewRows] = await db.query(
            `SELECT id, product_id, user_id, status
             FROM product_reviews
             WHERE id = ?
             LIMIT 1`,
            [Number(reviewId)]
        );

        if (reviewRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Review not found."
            });
        }

        const review = reviewRows[0];

        if (review.status === "deleted") {
            return res.status(400).json({
                success: false,
                message: "Review already deleted."
            });
        }

        // ----------------------------------------------------------
        // ONLY REVIEW OWNER CAN DELETE
        // ----------------------------------------------------------
        if (Number(review.user_id) !== Number(user_id)) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to delete this review."
            });
        }

        // ----------------------------------------------------------
        // SOFT DELETE
        // ----------------------------------------------------------
        await db.query(
            `UPDATE product_reviews
             SET status = 'deleted',
                 updated_at = NOW()
             WHERE id = ?`,
            [Number(reviewId)]
        );

        return res.status(200).json({
            success: true,
            message: "Review deleted successfully."
        });

    } catch (error) {
        console.error("deleteReview error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};