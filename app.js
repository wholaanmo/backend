require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = process.env.APP_PORT || 3000;

const upload = multer({
  dest: 'uploads/tmp/', // temporary storage
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const uploadDir = path.join(__dirname, 'uploads/tmp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


//ROUTERS
const userRouter = require("./api/users/user.router");
const expenseRouter = require("./api/expenses/expenses.router");
const personal_budgetRouter = require("./api/expenses/personal-budgets.router");
const groupRouter = require('./api/grp_expenses/group.router');
const groupExpensesRouter = require('./api/grp_expenses/groupExpenses.router');
const groupBudgetRouter = require('./api/grp_expenses/group-budget.router');
const photoRouter = require("./api/expenses/photos.router");
const cors = require('cors')

app.use(cors({
  origin: 'http://localhost:5173', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'] 
}));

app.use(express.json());

app.use((req, res, next) => {
  console.log(`Incoming ${req.method} request to: ${req.url}`);
  next();
}); 

app.use(express.urlencoded({ extended: true })); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/users', userRouter);
app.use('/api/expenses', expenseRouter)
app.use('/api/personal-budgets', personal_budgetRouter)
app.use('/api/grp_expenses', groupRouter);
app.use('/api/grp_expenses', groupExpensesRouter); 
app.use('/api/grp_expenses', groupBudgetRouter);
app.use('/api/photos', photoRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});