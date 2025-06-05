const express = require('express');
const router = express.Router();
const groupBudgetController = require('../grp_expenses/group-budget.controller');
const { checkToken } = require('../../auth/token_validation');
const groupAuth = require('../../auth/groupAuth');
const pool = require('../../config/database');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const groupPhotosDir = path.join(__dirname, '../../uploads/group-photos');
if (!fs.existsSync(groupPhotosDir)) {
  fs.mkdirSync(groupPhotosDir, { recursive: true });
}

const upload = multer({
  dest: 'uploads/tmp/', // temporary storage
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/tmp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

router.use(checkToken);
// Budget routes
router.route('/groups/:groupId/budget')
  .get(groupAuth('member'), groupBudgetController.getBudget) // Get budget
  .post(groupAuth('admin'), groupBudgetController.addBudget) // Add budget
  .put(groupAuth('admin'), groupBudgetController.updateBudget) // Update budget
  
router.get('/groups/:groupId/budgets', 
  checkToken, 
  groupAuth('member'), 
  groupBudgetController.getBudgetsByGroup
);

router.put('/groups/:groupId/members/:memberId/promote',
  checkToken, 
  groupAuth('admin'), 
  async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();
      const { groupId, memberId } = req.params;
      
      // 1. First verify the member exists and is not already an admin
      const [memberCheck] = await connection.query(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, memberId]
      );
      
      if (memberCheck.length === 0) {
        return res.status(404).json({
          success: 0,
          message: "Member not found in this group"
        });
      }
      
      if (memberCheck[0].role === 'admin') {
        return res.status(400).json({
          success: 0,
          message: "Member is already an admin"
        });
      }
      
      await connection.query(
        `UPDATE group_members 
         SET role = 'admin' 
         WHERE group_id = ? AND user_id = ?`,
        [groupId, memberId]
      );

      const [updatedMember] = await connection.query(
        `SELECT user_id as id, username, email, role 
         FROM group_members 
         JOIN users ON group_members.user_id = users.id
         WHERE group_id = ? AND user_id = ?`,
        [groupId, memberId]
      );
      
      return res.json({
        success: 1,
        message: "Member promoted to admin successfully",
        data: updatedMember[0]
      });
    } catch (err) {
      console.error('Promote member error:', err);
      return res.status(500).json({
        success: 0,
        message: "Failed to promote member"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

  router.delete('/groups/:groupId/leave', 
  checkToken,
  groupAuth('member'),
  async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();
      const userId = req.user.userId;
      const groupId = req.params.groupId;

      const [admins] = await connection.query(
        'SELECT user_id FROM group_members WHERE group_id = ? AND role = "admin"',
        [groupId]
      );

      const [userRole] = await connection.query(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );

      if (userRole[0].role === 'admin' && admins.length === 1) {
        return res.status(400).json({
          success: 0,
          message: "You are the last admin. Please assign another admin before leaving."
        });
      }

      await connection.query(
        'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );

      return res.json({
        success: 1,
        message: "You have left the group successfully"
      });
    } catch (err) {
      console.error('Leave group error:', err);
      return res.status(500).json({
        success: 0,
        message: "Failed to leave group"
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

router.route('/groups/:groupId/contributions')
  .get(groupAuth('member'), async (req, res) => {
    try {
      const { groupId } = req.params;
      
      const [group] = await pool.query('SELECT id FROM groups WHERE id = ?', [groupId]);
      if (!group.length) {
        return res.status(404).json({ success: 0, message: 'Group not found' });
      }
      
      const [contributions] = await pool.query(
        `SELECT 
          c.id,
          c.user_id,
          u.username,
          c.amount,
          c.created_at as date,
          c.status
         FROM contributions c
         JOIN users u ON c.user_id = u.id
         WHERE c.group_id = ?
         ORDER BY c.created_at DESC`,
        [groupId]
      );

      return res.json({ success: 1, contributions });
    } catch (err) {
      console.error('Error fetching contributions:', err);
      return res.status(500).json({ success: 0, message: 'Failed to fetch contributions' });
    }
  })
  .post(groupAuth('member'), async (req, res) => {
    try {
      const { groupId } = req.params;
      const { amount, user_id } = req.body;

      if (!amount || isNaN(amount)) {
        return res.status(400).json({ success: 0, message: 'Invalid amount' });
      }

      const [membership] = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, user_id]
      );
      
      if (!membership.length) {
        return res.status(403).json({ success: 0, message: 'User is not a member of this group' });
      }

      await pool.query(
        'INSERT INTO contributions (group_id, user_id, amount, status) VALUES (?, ?, ?, ?)',
        [groupId, user_id, amount, 'completed']
      );

      return res.json({ success: 1, message: 'Contribution saved successfully' });
    } catch (err) {
      console.error('Error saving contribution:', err);
      return res.status(500).json({ success: 0, message: 'Failed to save contribution' });
    }
  });

  router.get('/groups/:groupId/contributions', groupAuth('member'), async (req, res) => {
    try {
      const { groupId } = req.params;
      console.log(`Fetching contributions for group ${groupId}`); 
      // Verify group exists
      const [group] = await pool.query('SELECT id FROM groups WHERE id = ?', [groupId]);
    if (!group.length) {
      return res.status(404).json({ success: 0, message: 'Group not found' });
    }

    const [contributions] = await pool.query(
      `SELECT 
        c.id,
        c.user_id,
        u.username,
        c.amount,
        DATE_FORMAT(c.created_at, '%Y-%m-%d') as date,
        c.status,
        c.group_id  
       FROM contributions c
       JOIN users u ON c.user_id = u.id
       WHERE c.group_id = ?
       ORDER BY c.created_at DESC`,
      [groupId]
    );

    console.log(`Found ${contributions.length} contributions for group ${groupId}`);
    console.log('Sample contribution:', contributions[0]); // Log first contribution if exists

    return res.json({ 
      success: 1, 
      contributions,
      groupId: parseInt(groupId) 
    });
  } catch (err) {
    console.error('Error fetching contributions:', err);
    return res.status(500).json({ success: 0, message: 'Failed to fetch contributions' });
  }
});

  router.get('/groups/:groupId/contribution-history', groupAuth('member'), async (req, res) => {
    try {
      const { groupId } = req.params;
      const { user_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ success: 0, message: 'User ID is required' });
      }

      const [membership] = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, user_id]
      );
      
      if (!membership.length) {
        return res.status(403).json({ success: 0, message: 'User is not a member of this group' });
      }

      const [history] = await pool.query(
        `SELECT 
          id,
          amount, 
          DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as date,
          status 
         FROM contributions 
         WHERE group_id = ? AND user_id = ?
         ORDER BY created_at DESC`,
        [groupId, user_id]  
      );

    return res.json({ success: 1, history });
  } catch (err) {
    console.error('Error fetching contribution history:', err);
    return res.status(500).json({ success: 0, message: 'Failed to fetch contribution history' });
  }
});

router.post('/groups/:groupId/contributions', groupAuth('member'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { amount, user_id } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: 0, message: 'Invalid amount' });
    }

    const [membership] = await pool.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, user_id]
    );
    
    if (!membership.length) {
      return res.status(403).json({ success: 0, message: 'User is not a member of this group' });
    }

    const [expenses] = await pool.query(
      'SELECT 1 FROM group_expenses WHERE group_id = ? LIMIT 1',
      [groupId]
    );

    if (!expenses.length) {
      return res.status(400).json({ 
        success: 0, 
        message: 'Cannot add contributions - group has no expenses yet' 
      });
    }

    await pool.query('START TRANSACTION');

    const [result] = await pool.query(
      'INSERT INTO contributions (group_id, user_id, amount, status) VALUES (?, ?, ?, ?)',
      [groupId, user_id, amount, 'pending']
    );

    const [newContribution] = await pool.query(
      `SELECT 
        c.id,
        c.user_id,
        u.username,
        c.amount,
        DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') as date,
        c.status
       FROM contributions c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [result.insertId]
    );

    await pool.query('COMMIT');

    return res.json({ 
      success: 1, 
      message: 'Contribution added successfully',
      contributionId: result.insertId 
    });
  } catch (err) {

    await pool.query('ROLLBACK');
    console.error('Error adding contribution:', err);
    return res.status(500).json({ success: 0, message: 'Failed to add contribution' });
  }
});

router.put('/groups/:groupId/contributions/:contributionId', groupAuth('member'), async (req, res) => {
  let connection;
  try {
    const { groupId, contributionId } = req.params;
    const { amount } = req.body;

    // Validate input
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ 
        success: 0, 
        message: 'Invalid amount - must be a positive number' 
      });
    }

    connection = await pool.getConnection();
    await connection.query('START TRANSACTION');

    const [contribution] = await connection.query(
      'SELECT id, user_id FROM contributions WHERE id = ? AND group_id = ? FOR UPDATE',
      [contributionId, groupId]
    );

    if (!contribution.length) {
      await connection.query('ROLLBACK');
      return res.status(404).json({ 
        success: 0, 
        message: 'Contribution not found in this group' 
      });
    }

    if (contribution[0].user_id !== req.user.userId) {
      await connection.query('ROLLBACK');
      return res.status(403).json({ 
        success: 0, 
        message: 'You can only edit your own contributions' 
      });
    }

    // Update the contribution
    await connection.query(
      'UPDATE contributions SET amount = ? WHERE id = ?',
      [amount, contributionId]
    );

    await connection.query('COMMIT');

    return res.json({ 
      success: 1, 
      message: 'Contribution updated successfully',
      data: {
        id: contributionId,
        amount: parseFloat(amount)
      }
    });
  } catch (err) {
    if (connection) await connection.query('ROLLBACK');
    console.error('Error updating contribution:', err);
    return res.status(500).json({ 
      success: 0, 
      message: 'Failed to update contribution',
      error: err.message 
    });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/groups/:groupId/contributions/:contributionId/status', groupAuth('member'), async (req, res) => {
  try {
    const { groupId, contributionId } = req.params;
    const { status } = req.body;

    if (!['completed', 'pending'].includes(status)) {
      return res.status(400).json({ success: 0, message: 'Invalid status' });
    }

    await pool.query(
      'UPDATE contributions SET status = ? WHERE id = ? AND group_id = ?',
      [status, contributionId, groupId]
    );

    return res.json({ success: 1, message: 'Contribution status updated' });
  } catch (err) {
    console.error('Error updating contribution status:', err);
    return res.status(500).json({ success: 0, message: 'Failed to update status' });
  }
});

router.route('/groups/:groupId/photos')
  .get(groupAuth('member'), async (req, res) => {
    try {
      const { groupId } = req.params;
      
      const [photos] = await pool.query(
        `SELECT 
          gp.id,
          gp.image_url,
          gp.description,
          gp.created_at,
          u.id as user_id,
          u.username
         FROM group_photos gp
         JOIN users u ON gp.user_id = u.id
         WHERE gp.group_id = ?
         ORDER BY gp.created_at DESC`,
        [groupId]
      );
      
      return res.json({ success: 1, photos });
    } catch (err) {
      console.error('Error fetching photos:', err);
      return res.status(500).json({ success: 0, message: 'Failed to fetch photos' });
    }
  })

  router.post('/groups/:groupId/photos', 
  groupAuth('member'), 
  upload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: 0, message: 'No photo uploaded' });
      }
      
      const { description } = req.body;
      const { groupId } = req.params;
      const userId = req.user.userId;
      
      const ext = path.extname(req.file.originalname);
      const filename = `${Date.now()}${ext}`;
      const uploadPath = path.join(__dirname, '../../uploads/group-photos', filename);
      
      fs.renameSync(req.file.path, uploadPath);
      
      const imageUrl = `/uploads/group-photos/${filename}`;
      
      // Save to database
      const [result] = await pool.query(
        `INSERT INTO group_photos 
          (group_id, user_id, image_url, description) 
         VALUES (?, ?, ?, ?)`,
        [groupId, userId, imageUrl, description]
      );
      
      const fullImageUrl = `${req.protocol}://${req.get('host')}${imageUrl}`;
      
      return res.json({ 
        success: 1, 
        message: 'Photo uploaded successfully',
        photo: {
          id: result.insertId,
          image_url: fullImageUrl,
          description
        }
      });
    } catch (err) {
      console.error('Error uploading photo:', err);
      // Clean up if file was uploaded but DB failed
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ success: 0, message: 'Failed to upload photo' });
    }
  }
);

router.put('/groups/:groupId/photos/:photoId', 
  groupAuth('member'), 
  upload.single('photo'), 
  async (req, res) => {
    let connection;
    try {
      const { groupId, photoId } = req.params;
      const { description } = req.body;
      const userId = req.user.userId;
      
      connection = await pool.getConnection();
      await connection.query('START TRANSACTION');
      
      const [photo] = await connection.query(
        `SELECT user_id, image_url FROM group_photos 
         WHERE id = ? AND group_id = ?`,
        [photoId, groupId]
      );
      
      if (!photo.length) {
        await connection.query('ROLLBACK');
        return res.status(404).json({ success: 0, message: 'Photo not found' });
      }
      
      // Only photo owner can edit
      if (photo[0].user_id !== userId) {
        await connection.query('ROLLBACK');
        return res.status(403).json({ 
          success: 0, 
          message: 'Only the photo owner can edit this photo' 
        });
      }
      
      let imageUrl = photo[0].image_url;
      
      // If new file was uploaded
      if (req.file) {
        // Delete old file
        const oldFilePath = path.join(__dirname, '../../', imageUrl);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
        
        // Generate new filename and path
        const ext = path.extname(req.file.originalname);
        const filename = `${Date.now()}${ext}`;
        const uploadPath = path.join(__dirname, '../../uploads/group-photos', filename);
        
        // Move file from temp to permanent location
        fs.renameSync(req.file.path, uploadPath);
        
        // Update image URL
        imageUrl = `/uploads/group-photos/${filename}`;
      }
      
      // Update in database
      await connection.query(
        `UPDATE group_photos 
         SET description = ?, 
             image_url = ?
         WHERE id = ?`,
        [description, imageUrl, photoId]
      );
      
      await connection.query('COMMIT');
      
      // Return full URL if it was updated
      const fullImageUrl = req.file 
        ? `${req.protocol}://${req.get('host')}${imageUrl}`
        : null;
      
      return res.json({ 
        success: 1, 
        message: 'Photo updated successfully',
        photo: {
          id: photoId,
          image_url: fullImageUrl || undefined, // Only include if changed
          description
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
        message: 'Failed to update photo' 
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

router.delete('/groups/:groupId/photos/:photoId', 
  groupAuth('member'), 
  async (req, res) => {
    let connection;
    try {
      const { groupId, photoId } = req.params;
      const userId = req.user.userId;
      
      connection = await pool.getConnection();
      await connection.query('START TRANSACTION');
      
      // Verify photo exists and user has permission
      const [photo] = await connection.query(
        `SELECT 
          gp.id, 
          gp.image_url, 
          gp.user_id,
          gm.role
         FROM group_photos gp
         JOIN group_members gm ON gp.group_id = gm.group_id AND gm.user_id = ?
         WHERE gp.id = ? AND gp.group_id = ?`,
        [userId, photoId, groupId]
      );
      
      if (!photo.length) {
        await connection.query('ROLLBACK');
        return res.status(404).json({ success: 0, message: 'Photo not found' });
      }
      
      // Only admin or photo owner can delete
      if (photo[0].user_id !== userId) {
        await connection.query('ROLLBACK');
        return res.status(403).json({ 
          success: 0, 
          message: 'Only the photo owner can delete this photo' 
        });
      }
      
      // Delete file from filesystem
      const filePath = path.join(__dirname, '../../', photo[0].image_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Delete from database
      await connection.query(
        'DELETE FROM group_photos WHERE id = ?',
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