const express = require('express');
const router = express.Router();
const { checkToken } = require('../../auth/token_validation');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../../config/database');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/personal-photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `photo-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and GIF images are allowed'), false);
    }
  }
});

// Get all photos
router.get('/', checkToken, async (req, res) => {
  try {
    const [photos] = await pool.query(
      `SELECT 
        gp.id,
        gp.image_url,
        gp.description,
        gp.created_at,
        u.id as user_id,
        u.username
       FROM personal_photos gp
       JOIN users u ON gp.user_id = u.id
       ORDER BY gp.created_at DESC`
    );
    
    return res.json({ success: 1, photos });
  } catch (err) {
    console.error('Error fetching photos:', err);
    return res.status(500).json({ success: 0, message: 'Failed to fetch photos' });
  }
});

// Upload a photo
router.post('/', checkToken, upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: 0, 
      message: 'No file uploaded or file type not allowed' 
    });
  }

  if (!req.user?.userId) {
    // Clean up the uploaded file if auth fails
    fs.unlinkSync(req.file.path);
    return res.status(401).json({ 
      success: 0, 
      message: 'Not authenticated' 
    });
  }

  try {
    const { description } = req.body;
    const userId = req.user.userId;

    const uploadDir = path.join(__dirname, '../../uploads/personal-photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }


    const ext = path.extname(req.file.originalname);
    const filename = `photo-${Date.now()}${ext}`;
    const newPath = path.join(uploadDir, filename);
    
    fs.renameSync(req.file.path, newPath);
    
    const imageUrl = `/uploads/personal-photos/${filename}`;
    
    const [result] = await pool.query(
      `INSERT INTO personal_photos (user_id, image_url, description) VALUES (?, ?, ?)`,
      [userId, imageUrl, description]
    );
    
    const fullImageUrl = `${req.protocol}://${req.get('host')}${imageUrl}`;
    
    return res.json({
      success: 1,
      message: 'Photo uploaded successfully',
      photo: {
        id: result.insertId,
        image_url: fullImageUrl,
        description: description,
        user_id: userId
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    
    // Clean up if file was uploaded but DB failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({ 
      success: 0, 
      message: err.message || 'Failed to process upload' 
    });
  }
});

// Update photo description and image
router.put('/:photoId', checkToken, upload.single('photo'), async (req, res) => {
  let connection;
  try {
    const { photoId } = req.params;
    const userId = req.user.userId;
    const { description } = req.body;

    connection = await pool.getConnection();
    await connection.query('START TRANSACTION');

    // Check if photo exists and user owns it
    const [photo] = await connection.query(
      `SELECT id, image_url, user_id FROM personal_photos WHERE id = ?`,
      [photoId]
    );

    if (!photo.length) {
      await connection.query('ROLLBACK');
      return res.status(404).json({ success: 0, message: 'Photo not found' });
    }

    if (photo[0].user_id !== userId) {
      await connection.query('ROLLBACK');
      return res.status(403).json({ success: 0, message: 'Not authorized to edit this photo' });
    }

    let imageUrl = photo[0].image_url;
    let oldFilePath = null;

    // If a new file was uploaded
    if (req.file) {
      // Set up upload directory
      const uploadDir = path.join(__dirname, '../../uploads/personal-photos');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Get old file path for cleanup
      oldFilePath = path.join(__dirname, '../..', photo[0].image_url);

      // Generate new filename
      const ext = path.extname(req.file.originalname);
      const filename = `photo-${Date.now()}${ext}`;
      const newPath = path.join(uploadDir, filename);
      
      // Move the new file
      fs.renameSync(req.file.path, newPath);
      imageUrl = `/uploads/personal-photos/${filename}`;
    }

    // Update the photo record
    await connection.query(
      `UPDATE personal_photos 
       SET description = ?, 
           image_url = IFNULL(?, image_url),
           created_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [description, req.file ? imageUrl : null, photoId]
    );

    // Delete old file if a new one was uploaded
    if (req.file && oldFilePath && fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath);
    }

    await connection.query('COMMIT');

    // Get updated photo data
    const [updatedPhoto] = await connection.query(
      `SELECT * FROM personal_photos WHERE id = ?`,
      [photoId]
    );

    // Construct full URL for response
    const fullImageUrl = req.file 
      ? `${req.protocol}://${req.get('host')}${imageUrl}`
      : updatedPhoto[0].image_url; // Keep existing URL if no new file uploaded

    return res.json({
      success: 1,
      message: 'Photo updated successfully',
      photo: {
        id: updatedPhoto[0].id,
        description: updatedPhoto[0].description,
        image_url: fullImageUrl,
        created_at: updatedPhoto[0].created_at
      }
    });
  } catch (err) {
    if (connection) await connection.query('ROLLBACK');
    console.error('Error updating photo:', err);
    
    // Clean up if file was uploaded but DB failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({ 
      success: 0, 
      message: err.message || 'Failed to update photo' 
    });
  } finally {
    if (connection) connection.release();
  }
});

// Delete a photo
router.delete('/:photoId', checkToken, async (req, res) => {
  let connection;
  try {
    const { photoId } = req.params;
    const userId = req.user.userId;

    connection = await pool.getConnection();
    await connection.query('START TRANSACTION');

    const [photo] = await connection.query(
      `SELECT id, image_url, user_id FROM personal_photos WHERE id = ?`,
      [photoId]
    );

    if (!photo.length) {
      await connection.query('ROLLBACK');
      return res.status(404).json({ success: 0, message: 'Photo not found' });
    }

    // Only owner can delete
    if (photo[0].user_id !== userId) {
      await connection.query('ROLLBACK');
      return res.status(403).json({ success: 0, message: 'Not authorized to delete this photo' });
    }

    const filePath = path.join(__dirname, '../../', photo[0].image_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await connection.query(
      'DELETE FROM personal_photos WHERE id = ?',
      [photoId]
    );

    await connection.query('COMMIT');
    
    return res.json({ success: 1, message: 'Photo deleted successfully' });
  } catch (err) {
    if (connection) await connection.query('ROLLBACK');
    console.error('Error deleting photo:', err);
    return res.status(500).json({ success: 0, message: 'Failed to delete photo' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
