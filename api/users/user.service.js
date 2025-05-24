const pool = require('../../config/database');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { genSaltSync, hashSync } = require('bcrypt'); 

module.exports = {
    generateOTP: () => {
        return crypto.randomInt(100000, 999999).toString();
    },
    
    storeOTP: async (email, otp) => {
        try {
            const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry
            
            await pool.execute(
                'INSERT INTO password_reset_otps (email, otp, expiry) VALUES (?, ?, ?) ' +
                'ON DUPLICATE KEY UPDATE otp = ?, expiry = ?',
                [email, otp, expiry, otp, expiry]
            );
            
            return true;
        } catch (error) {
            throw error;
        }
    },
    
    verifyOTP: async (email, otp) => {
        try {
            if (!email || !otp) {
                throw new Error('Email and OTP are required');
            }
    
            const otpString = String(otp).trim();
        
            // Check OTP format (exactly 6 digits)
            if (!/^\d{6}$/.test(otpString)) {
                console.log('Invalid OTP format received:', otpString);
                throw new Error('OTP must be exactly 6 digits');
            }

            const [results] = await pool.execute(
                'SELECT * FROM password_reset_otps WHERE email = ? AND otp = ? AND expiry > NOW()',
                [email, otpString]  // Use the string version
            );
            
            if (results.length === 0) {
                console.log('No valid OTP found for:', email);
                return false;
            }

        return true;
    } catch (error) {
        console.error('OTP verification failed:', error);
        throw error;
    }
},
    
    clearOTP: async (email) => {
        try {
            await pool.execute(
                'DELETE FROM password_reset_otps WHERE email = ?',
                [email]
            );
            return true;
        } catch (error) {
            throw error;
        }
    },

    updatePassword: async (email, newPassword) => {
        try {
            if (!email || !newPassword) {
                throw new Error('Email and new password are required');
            }

            const salt = genSaltSync(10);
            const hashedPassword = hashSync(newPassword, salt);
            
            const [results] = await pool.execute(
                'UPDATE users SET password = ? WHERE email = ?',
                [hashedPassword, email]
            );

            if (results.affectedRows === 0) {
                throw new Error('No user found with that email');
            }
            
            return results.affectedRows > 0;
        } catch (error) {
            console.error('Password update error:', error);
            throw error;
        }
    },
    
    sendEmail: async (to, subject, text) => {
        try {
            // Create a transporter with more robust configuration
            const transporter = nodemailer.createTransport({
                service: process.env.EMAIL_SERVICE || 'gmail',
                host: 'smtp.gmail.com',
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });    
            
            const mailOptions = {
                from: `"Money Log" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                text,
                html: `<p>${text.replace(/\n/g, '<br>')}</p>`
            };
            
            const info = await transporter.sendMail(mailOptions);
            console.log('Message sent: %s', info.messageId);
            return true;
        } catch (error) {
            console.error('Email sending error:', error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    },
    
    deleteUser: async (id) => {
        const connection = await pool.getConnection();
        try {
            console.log(`[DELETE USER] Starting deletion for user ${id}`);
        
            const [verifyUser] = await connection.execute(
                'SELECT id FROM users WHERE id = ?',
                [id]
            );
            
            if (verifyUser.length === 0) {
                console.log(`User ${id} not found in initial check`);
                return null;
            }
    
            await connection.beginTransaction();

        await connection.execute('DELETE FROM contributions WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM group_expenses WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM group_members WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM group_budgets WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM expenses WHERE userId = ?', [id]);
        await connection.execute('DELETE FROM personal_budgets WHERE user_id = ?', [id]);

        const [groups] = await connection.execute(
            'SELECT id FROM groups WHERE created_by = ?', 
            [id]
        );
        
        for (const group of groups) {
            await connection.execute('DELETE FROM contributions WHERE group_id = ?', [group.id]);
            await connection.execute('DELETE FROM group_expenses WHERE group_id = ?', [group.id]);
            await connection.execute('DELETE FROM group_members WHERE group_id = ?', [group.id]);
            await connection.execute('DELETE FROM group_budgets WHERE group_id = ?', [group.id]);
            await connection.execute('DELETE FROM groups WHERE id = ?', [group.id]);
        }

        const [results] = await connection.execute(
            'DELETE FROM users WHERE id = ?',
            [id]
        );
        
        await connection.commit();
        console.log(`Successfully deleted user ${id}`);
        return results;
    } catch (error) {
        await connection.rollback();
        console.error('Transaction error:', error);
        throw error;
    } finally {
        connection.release();
    }
},


    invalidateToken: async (userId) => {
        try {
            await pool.execute(
                'UPDATE users SET token_valid = FALSE WHERE id = ?',
                [userId]
            );
            return true;
        } catch (error) {
            throw error;
        }
    },

    isTokenValid: async (userId) => {
        try {
            const [results] = await pool.execute(
                'SELECT token_valid FROM users WHERE id = ?',
                [userId]
            );
            return results[0]?.token_valid !== 0; //invalid 0
        } catch (error) {
            throw error;
        }
    },

    checkUsernameExists: async (username) => {
        try {
            const [results] = await pool.execute(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );
            return results.length > 0;
        } catch (error) {
            throw error;
        }
    },

    checkEmailExists: async (email) => {
        try {
            const [results] = await pool.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
            return results.length > 0;
        } catch (error) {
            throw error;
        }
    },

    create: async (userdata) => {
        try {

            const usernameExists = await module.exports.checkUsernameExists(userdata.username);
            if (usernameExists) {
                throw new Error('Username already exists');
            }
            
            // Check if email already exists
            const emailExists = await module.exports.checkEmailExists(userdata.email);
            if (emailExists) {
                throw new Error('Email already exists');
            }

            const [results] = await pool.execute(
            'INSERT INTO users (username, email, password, registration_date) values (?,?,?,?)',
            [
                userdata.username,
                userdata.email,
                userdata.password,
                userdata.registration_date
            ]
            );
            return results;
        } catch (error) {
            throw error;
        }
    },
    getUsers: async () => {
        try {
            const [results] = await pool.execute(
            'SELECT username, email, registration_date from users',
            );
            return results;
        } catch (error) {
            throw error;
        }
    },

    getUserByUserId: async (id) => {
        try {
            const [results] = await pool.execute(
            'SELECT username, email, registration_date from users where id = ?',
            [id]
            );
            return results[0];
        } catch (error) {
            throw error;
        }
    },

    updateUser: async (userdata) => {
        try {

            const [existingUsername] = await pool.execute(
                'SELECT id FROM users WHERE username = ? AND id != ?',
                [userdata.username, userdata.id]
            );
            if (existingUsername.length > 0) {
                throw new Error('Username already taken by another user');
            }
            
            // Check if the new email is already taken by another user
            const [existingEmail] = await pool.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [userdata.email, userdata.id]
            );
            if (existingEmail.length > 0) {
                throw new Error('Email already taken by another user');
            }

            const [results] = await pool.execute(
            'UPDATE users set username=?, email=?, password=?, registration_date=? WHERE id= ?',
            [
                userdata.username,
                userdata.email,
                userdata.password,
                userdata.registration_date,
                userdata.id
            ]
            );
            return results;
        } catch (error) {
            throw error;
        }
    },

    getUserByUserEmail: async (email) => {
        try {
            const [results] = await pool.execute(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
            return results[0];
        } catch (error) {
            throw error;
        }
    },

    updateLoginInfo: async (userId) => {
        try {
            // First get current login count to determine if this is first login
            const [user] = await pool.execute(
                'SELECT login_count FROM users WHERE id = ?', 
                [userId]
            );
            
            const isFirstLogin = user[0].login_count === 0;
            
            // Update login count and set first login date if needed
            await pool.execute(
                `UPDATE users 
                 SET login_count = login_count + 1,
                     first_login_date = IF(login_count = 0, NOW(), first_login_date)
                 WHERE id = ?`,
                [userId]
            );
            
            return isFirstLogin;
        } catch (error) {
            throw error;
        }
    }   
};