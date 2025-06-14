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

app.get('/api/healthcheck', (req, res) => {
  console.log('Received headers:', req.headers);
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    origin: req.headers.origin
  });
});

//ROUTERS
const userRouter = require("./api/users/user.router");
const expenseRouter = require("./api/expenses/expenses.router");
const personal_budgetRouter = require("./api/expenses/personal-budgets.router");
const groupRouter = require('./api/grp_expenses/group.router');
const groupExpensesRouter = require('./api/grp_expenses/groupExpenses.router');
const groupBudgetRouter = require('./api/grp_expenses/group-budget.router');
const photoRouter = require("./api/expenses/photos.router");
const cors = require('cors')

const allowedOrigins = [
  'https://wholaanmo.github.io',
  'https://wholaanmo.github.io/moneyy-logg',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowedOrigin => 
      origin === allowedOrigin || 
      origin.startsWith(allowedOrigin)
    )) {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Add OPTIONS for preflight
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

app.get('/api/db-test', async (req, res) => {
  const [rows] = await connection.query('SELECT 1 + 1 AS result');
  res.json(rows);
});

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

app.get('/', (req, res) => {
  res.send('Backend is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});