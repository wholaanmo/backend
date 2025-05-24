const { blacklistToken } = require("../../auth/token_validation");
const { verify } = require("jsonwebtoken");

const { 
    create, 
    getUserByUserId, 
    getUsers, 
    updateUser, 
    deleteUser, 
    getUserByUserEmail,
    checkUsernameExists,
    checkEmailExists,
    updateLoginInfo,
    invalidateToken ,
    generateOTP,
    storeOTP,
    sendEmail,
    verifyOTP,
    clearOTP,
    updatePassword
} = require ("../users/user.service");

const {genSaltSync, hashSync, compareSync } = require("bcrypt");
const { sign } = require ("jsonwebtoken");
const pool = require("../../config/database");

module.exports = {
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;
            
            if (!email) {
                return res.status(400).json({
                    success: 0,
                    message: "Email is required"
                });
            }

            const user = await getUserByUserEmail(email);
            if (!user) {
                return res.json({  
                    success: 1,
                    message: "If this email is registered, you'll receive an OTP"
                });
            }
            
            // Generate and store OTP
            const otp = generateOTP();
            await storeOTP(email, otp);
            
            // Send email with OTP
            const subject = 'Your Money Log Password Reset Code';

            const text = `Good day,

            We received a request to reset your password on Money Log.
            
            🔐 Your One-Time Password (OTP): ${otp}

            
            This code is valid for the next 15 minutes. 
            If you didn’t request a password reset, you can safely ignore this message.`;
            
            try {
            await sendEmail(email, subject, text);
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Clear the OTP since we failed to send email
            await clearOTP(email);
            return res.status(500).json({
                success: 0,
                message: "Failed to send OTP email. Please try again later.",
                error: emailError.message
            });
        }

            return res.json({
                success: 1,
                message: "OTP sent to email"
            });
        } catch (err) {
            console.error('Forgot password error:', err);
            return res.status(500).json({
                success: 0,
                message: "Failed to process forgot password request",
                error: err.message 
            });
        }
    },
    
    verifyOTP: async (req, res) => {
        try {
            const { email, otp } = req.body;
            
            if (!email || !otp) {
                return res.status(400).json({
                    success: 0,
                    message: "Email and OTP are required"
                });
            }

            const otpString = String(otp).trim();

            if (!/^\d{6}$/.test(otpString)) {
                console.log('Invalid OTP format received:', otpString);
                return res.status(400).json({
                    success: 0,
                    message: "OTP must be exactly 6 digits",
                    received: otpString
                });
            }

            const isValid = await verifyOTP(email, otpString);

            if (!isValid) {
                return res.status(400).json({
                    success: 0,
                    message: "Invalid or expired OTP"
                });
            }
            
                const token = sign({ email }, "qwe1234", { expiresIn: '15m' });
                
                return res.json({
                    success: 1,
                    message: "OTP verified",
                    token
                });
            } catch (err) {
                console.error('OTP verification error:', err);
                return res.status(500).json({
                    success: 0,
                    message: "Failed to verify OTP",
                    error: err.message,
                    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
                });
            }
        },        
    
    resetPasswordWithOTP: async (req, res) => {
        try {
            const { email, newPassword, token } = req.body;
            
            if (!email || !newPassword || !token) {
                return res.status(400).json({
                    success: 0,
                    message: "Email, new password and token are required"
                });
            }

            // Verify token
            let decoded;
            try {
                decoded = verify(token, "qwe1234");
                if (decoded.email !== email) {
                    return res.status(401).json({
                        success: 0,
                        message: "Token does not match email"
                    });
                }
            } catch (err) {
                console.error('Token verification error:', err);
                return res.status(401).json({
                    success: 0,
                    message: "Invalid or expired token",
                    error: err.message
                });
            }
            
            // Validate password length
            if (newPassword.length < 8) {
                return res.status(400).json({
                  success: 0,
                  message: "Password must be at least 8 characters"
                });
              }
              
            // Update password
            const updated = await updatePassword(email, newPassword);
            
            if (!updated) {
                return res.status(400).json({
                    success: 0,
                    message: "Failed to update password"
                });
            }
    
            await clearOTP(email);
                
                return res.json({
                    success: 1,
                    message: "Password updated successfully"
                });
              } catch (err) {
        console.error('Password reset error:', err);
        return res.status(500).json({
            success: 0,
            message: "Failed to reset password",
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
},

    deleteAccount: async (req, res) => {
        try {
            const userId = req.user.userId;
            console.log(`Starting account deletion for user ${userId}`);
    
            // Verify the user exists before proceeding
            const [user] = await pool.execute(
                'SELECT id FROM users WHERE id = ?',
                [userId]
            );
    
            if (user.length === 0) {
                console.log(`User ${userId} not found in database`);
                return res.status(404).json({
                    success: 0,
                    message: "User not found"
                });
            }
    
            // Invalidate token
            console.log(`Invalidating tokens for user ${userId}`);
            await invalidateToken(userId);
            
            // Delete user
            console.log(`Deleting user ${userId}`);
            const results = await deleteUser(userId);
            
            if (!results) {
                console.log(`No results returned for user ${userId}`);
                return res.status(404).json({
                    success: 0,
                    message: "User not found during deletion"
                });
            }
            
            if (results.affectedRows === 0) {
                console.log(`No rows affected for user ${userId}`);
                return res.status(404).json({
                    success: 0,
                    message: "User not found or already deleted"
                });
            }
            
            console.log(`Successfully deleted user ${userId}`);
            return res.json({
                success: 1,
                message: "Account deleted successfully"
            });
        } catch (err) {
            console.error('Account deletion error:', err);
            return res.status(500).json({
                success: 0,
                message: err.message || "Failed to delete account"
            });
        }
    },

    deleteUser: async (req, res) => {
        try {
            const id = req.params.id;
            const results = await deleteUser(id);
            
            if (!results || results.affectedRows === 0) {
                return res.status(404).json({
                    success: 0,
                    message: "User not found"
                });
            }
            
            return res.json({
                success: 1,
                message: "User deleted successfully"
            });
        } catch (err) {
            console.error(err);
            
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return res.status(400).json({
                    success: 0,
                    message: "Cannot delete user - please delete related data first"
                });
            }
            
            return res.status(500).json({
                success: 0,
                message: "Database error"
            });
        }
    },

    createUser: async (req, res) => {
        try {
        const body = req.body;

        const usernameExists = await checkUsernameExists(body.username);
        if (usernameExists) {
            return res.status(400).json({
                success: 0,
                message: "Username already exists"
            });
        }
        
        const emailExists = await checkEmailExists(body.email);
        if (emailExists) {
            return res.status(400).json({
                success: 0,
                message: "Email already exists"
            });
        }

        const salt = genSaltSync(10);
        body.password = hashSync(body.password, salt);
        body.registration_date = new Date();

        const results = await create(body);
            
         return res.status(200).json({
            success: 1,
            data: results
        });
    } catch (err) {
        console.error(err);
        // Handle specific error messages from service
        if (err.message === 'Username already exists' || err.message === 'Email already exists') {
            return res.status(400).json({
                success: 0,
                message: err.message
            });
        }
        return res.status(500).json({
            success: 0,
            message: "Database connection error"
        });
    }
},

getUserByUserId: async (req, res) => {
    try {
        const id = req.params.id;
        const results = await getUserByUserId(id);
        
        if (!results) {
            return res.json({
                success: 0,
                message: "Record not Found"
            });
        }
        
        return res.json({
            success: 1,
            data: results
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: 0,
            message: "Database error"
        });
    }
},
getUsers: async (req, res) => {
    try {
        const results = await getUsers();
        return res.json({
            success: 1,
            data: results
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: 0,
            message: "Database error"
        });
    }
},

updateUsers: async (req, res) => {
    try {
        const body = req.body;

        const [existingUsername] = await pool.execute(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [body.username, body.id]
        );
        if (existingUsername.length > 0) {
            return res.status(400).json({
                success: 0,
                message: "Username already taken by another user"
            });
        }
        
        const [existingEmail] = await pool.execute(
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [body.email, body.id]
        );
        if (existingEmail.length > 0) {
            return res.status(400).json({
                success: 0,
                message: "Email already taken by another user"
            });
        }

        if (body.password) {
            const salt = genSaltSync(10);
            body.password = hashSync(body.password, salt);
        }
        
        const results = await updateUser(body);
        
        if (!results || results.affectedRows === 0) {
            return res.json({
                success: 0,
                message: "Failed to update user or user not found"
            });
        }
        
        return res.json({
            success: 1,
            message: "Updated successfully"
        });
    } catch (err) {
        console.error(err);
        // Handle specific error messages from service
        if (err.message.includes('already taken')) {
            return res.status(400).json({
                success: 0,
                message: err.message
            });
        }
        return res.status(500).json({
            success: 0,
            message: "Database error"
        });
    }
},

deleteUser: async (req, res) => {
    try {
        const id = req.params.id;
        const results = await deleteUser(id);
        
        if (!results || results.affectedRows === 0) {
            return res.json({
                success: 0,
                message: "User not Found"
            });
        }
        
        return res.json({
            success: 1,
            message: "User deleted successfully"
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: 0,
            message: "Database error"
        });
    }
},
login: async (req, res) => {
    try {
        const body = req.body;
        const results = await getUserByUserEmail(body.email);
        
        if (!results) {
            return res.json({
                success: 0,
                message: "Invalid email or password"
            });
        }
        
        const isPasswordValid = compareSync(body.password, results.password);
        if (isPasswordValid) {
            const isFirstLogin = await updateLoginInfo(results.id);

            await pool.execute(
                'UPDATE users SET token_valid = TRUE WHERE id = ?',
                [results.id]
            );

            results.password = undefined;
            const jsontoken = sign({ userId: results.id }, "qwe1234", {
                expiresIn: "5h",
            });
            
            return res.json({
                success: 1,
                message: "Login successful",
                token: jsontoken,
                user: {
                    id: results.id,
                    username: results.username, 
                    email: results.email
                },
                isFirstLogin: isFirstLogin
            });
        } else {
            return res.json({
                success: 0,
                message: "Invalid email or password"
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: 0,
            message: "Database error"
        });
    }
},
logout: async (req, res) => {
    try {
        const userId = req.user.userId; // From decoded token
        await invalidateToken(userId);
        
        return res.json({
            success: 1,
            message: "Logout successful"
        });
    } catch (err) {
        console.error('Logout error:', err);
        return res.json({
            success: 0,
            message: "Logout failed"
        });
    }
}
};