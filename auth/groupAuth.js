const pool = require('../config/database');

module.exports = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.userId;
      
      console.log(`Checking group access for user ${userId} in group ${groupId}`);

      const [membership] = await pool.query(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      

      console.log('Membership check for user', userId, 'in group', groupId, 'result:', membership);
      
      if (membership.length === 0) {
        console.log('User not a member of group');
        return res.status(403).json({ success: 0, message: 'Not a group member' });
      }
      
      if (requiredRole === 'admin' && membership[0].role !== 'admin') {
        console.log('User lacks admin privileges');
        return res.status(403).json({ success: 0, message: 'Admin access required' });
      }
      
      console.log('Access granted');
      next();
    } catch (err) {
      console.error('Group auth error:', err);
      res.status(500).json({ success: 0, message: 'Server error' });
    }
  };
};