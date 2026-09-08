const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { toBase64DataUri } = require('../src/utils/imageProcessor');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

async function migrate() {
  console.log('🚀 Starting Database Image Migration to Persistent Base64 Data URIs...');
  console.log('Uploads directory:', UPLOADS_DIR);

  // 1. MIGRATE PRODUCTS
  console.log('\n--- 1. Migrating Products ---');
  const [products] = await pool.query('SELECT id, name, image_url FROM products');
  let migratedProducts = 0;

  for (const product of products) {
    if (!product.image_url) continue;

    let images = [];
    try {
      images = JSON.parse(product.image_url);
      if (!Array.isArray(images)) images = [images];
    } catch {
      images = [product.image_url];
    }

    let changed = false;
    const newImages = [];

    for (const img of images) {
      if (typeof img !== 'string') continue;

      if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) {
        newImages.push(img);
        continue;
      }

      // Clean local file name
      const cleanFileName = img.replace(/^uploads\//, '').replace(/[\[\]"]/g, '').trim();
      const filePath = path.join(UPLOADS_DIR, cleanFileName);

      if (fs.existsSync(filePath)) {
        try {
          const buffer = fs.readFileSync(filePath);
          const dataUri = await toBase64DataUri(buffer, { maxWidth: 1200, maxHeight: 1200, quality: 80 });
          newImages.push(dataUri);
          changed = true;
          console.log(`  ✓ Converted product [${product.id}] image: ${cleanFileName}`);
        } catch (err) {
          console.warn(`  ⚠️ Failed to convert ${cleanFileName}:`, err.message);
          newImages.push(img);
        }
      } else {
        console.warn(`  ⚠️ File not found on disk: ${filePath}`);
        newImages.push(img);
      }
    }

    if (changed) {
      await pool.query('UPDATE products SET image_url = ? WHERE id = ?', [
        JSON.stringify(newImages),
        product.id,
      ]);
      migratedProducts++;
    }
  }
  console.log(`✅ Products updated: ${migratedProducts} of ${products.length}`);

  // 2. MIGRATE PRODUCT REVIEWS
  console.log('\n--- 2. Migrating Product Reviews ---');
  const [reviews] = await pool.query(
    'SELECT id, review_image FROM product_reviews WHERE review_image IS NOT NULL AND review_image != ""'
  );
  let migratedReviews = 0;

  for (const review of reviews) {
    const img = review.review_image;
    if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) {
      continue;
    }

    const cleanFileName = img.replace(/^uploads\//, '').trim();
    const filePath = path.join(UPLOADS_DIR, cleanFileName);

    if (fs.existsSync(filePath)) {
      try {
        const buffer = fs.readFileSync(filePath);
        const dataUri = await toBase64DataUri(buffer, { maxWidth: 1200, maxHeight: 1200, quality: 80 });
        await pool.query('UPDATE product_reviews SET review_image = ? WHERE id = ?', [
          dataUri,
          review.id,
        ]);
        migratedReviews++;
        console.log(`  ✓ Converted review [${review.id}] image: ${cleanFileName}`);
      } catch (err) {
        console.warn(`  ⚠️ Failed to convert review image ${cleanFileName}:`, err.message);
      }
    } else {
      console.warn(`  ⚠️ Review file not found: ${filePath}`);
    }
  }
  console.log(`✅ Reviews updated: ${migratedReviews} of ${reviews.length}`);

  // 3. MIGRATE USERS AVATARS
  console.log('\n--- 3. Migrating User Avatars ---');
  const [users] = await pool.query(
    'SELECT id, profile_image FROM users WHERE profile_image IS NOT NULL AND profile_image != ""'
  );
  let migratedUsers = 0;

  for (const user of users) {
    const img = user.profile_image;
    if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) {
      continue;
    }

    if (img.includes('undefined')) {
      await pool.query('UPDATE users SET profile_image = NULL WHERE id = ?', [user.id]);
      continue;
    }

    const cleanFileName = img.replace(/^uploads\//, '').trim();
    const filePath = path.join(UPLOADS_DIR, cleanFileName);

    if (fs.existsSync(filePath)) {
      try {
        const buffer = fs.readFileSync(filePath);
        const dataUri = await toBase64DataUri(buffer, { maxWidth: 400, maxHeight: 400, quality: 80 });
        await pool.query('UPDATE users SET profile_image = ? WHERE id = ?', [dataUri, user.id]);
        migratedUsers++;
        console.log(`  ✓ Converted user [${user.id}] avatar: ${cleanFileName}`);
      } catch (err) {
        console.warn(`  ⚠️ Failed to convert user avatar ${cleanFileName}:`, err.message);
      }
    } else {
      console.warn(`  ⚠️ User avatar not found: ${filePath}`);
    }
  }
  console.log(`✅ Users updated: ${migratedUsers} of ${users.length}`);

  // 4. MIGRATE DELIVERY BOYS
  console.log('\n--- 4. Migrating Delivery Boys Photos ---');
  const [boys] = await pool.query('SELECT id, profile_photo, aadhaar_photo, pan_photo, driving_license_photo, vehicle_rc_photo FROM delivery_boys');
  let migratedBoys = 0;

  for (const boy of boys) {
    const photoFields = ['profile_photo', 'aadhaar_photo', 'pan_photo', 'driving_license_photo', 'vehicle_rc_photo'];
    let changed = false;
    const updates = {};

    for (const field of photoFields) {
      const val = boy[field];
      if (!val || val.startsWith('data:') || val.startsWith('http://') || val.startsWith('https://')) {
        continue;
      }

      const cleanFileName = val.replace(/^uploads\//, '').trim();
      const filePath = path.join(UPLOADS_DIR, cleanFileName);

      if (fs.existsSync(filePath)) {
        try {
          const buffer = fs.readFileSync(filePath);
          const dataUri = await toBase64DataUri(buffer, { maxWidth: 1200, maxHeight: 1200, quality: 80 });
          updates[field] = dataUri;
          changed = true;
          console.log(`  ✓ Converted delivery boy [${boy.id}] ${field}: ${cleanFileName}`);
        } catch (err) {
          console.warn(`  ⚠️ Failed to convert ${field}:`, err.message);
        }
      }
    }

    if (changed) {
      const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const setVals = [...Object.values(updates), boy.id];
      await pool.query(`UPDATE delivery_boys SET ${setClause} WHERE id = ?`, setVals);
      migratedBoys++;
    }
  }
  console.log(`✅ Delivery boys updated: ${migratedBoys} of ${boys.length}`);

  console.log('\n🎉 ALL DATABASE IMAGES ARE NOW COMPLETELY SELF-CONTAINED & PERSISTENT!');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
