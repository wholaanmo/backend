const { 
    createUser, 
    getUserByUserId, 
    getUsers, 
    updateUsers, 
    deleteUser,
    login,
    logout,
    deleteAccount,
    forgotPassword,
    verifyOTP,
    resetPasswordWithOTP
} = require("./user.controller");
const router = require("express").Router();
const { checkToken } = require ("../../auth/token_validation");

router.post('/', createUser);
router.get("/", checkToken, getUsers);
router.get("/:id", checkToken, getUserByUserId);
router.patch("/", checkToken, updateUsers);
//router.delete("/:id", checkToken, deleteUser); 
router.post('/login', login);
router.post('/logout', checkToken, logout);
router.delete('/', checkToken, deleteAccount);

router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password-otp', resetPasswordWithOTP);

module.exports = router;