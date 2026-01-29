const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ===== MODELS =====

// User Model
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', userSchema);

// Expense Model
const expenseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['food', 'transport', 'shopping', 'entertainment', 'bills', 'health', 'other']
  },
  date: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Expense = mongoose.model('Expense', expenseSchema);

// ===== ROUTES =====

// @route   GET /api/health
// @desc    Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// ===== USER ROUTES =====

// @route   POST /api/users/register
// @desc    Register a new user
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user (in production, hash the password!)
    const user = new User({ name, email, password });
    await user.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/users/login
// @desc    Login user
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password (in production, compare hashed passwords!)
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== EXPENSE ROUTES =====

// @route   POST /api/expenses
// @desc    Create a new expense
app.post('/api/expenses', async (req, res) => {
  try {
    const { userId, title, amount, category, date, description } = req.body;

    const expense = new Expense({
      userId,
      title,
      amount,
      category,
      date,
      description
    });

    await expense.save();
    res.status(201).json({
      message: 'Expense created successfully',
      expense
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/expenses/:userId
// @desc    Get all expenses for a user
app.get('/api/expenses/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { category, startDate, endDate, limit, sort } = req.query;

    // Build query
    let query = { userId };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Execute query
    let expenses = Expense.find(query);

    // Sort (default: newest first)
    const sortOption = sort === 'oldest' ? 'date' : '-date';
    expenses = expenses.sort(sortOption);

    // Limit results
    if (limit) {
      expenses = expenses.limit(parseInt(limit));
    }

    const result = await expenses;

    res.json({
      count: result.length,
      expenses: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/expenses/detail/:id
// @desc    Get a single expense by ID
app.get('/api/expenses/detail/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/expenses/:id
// @desc    Update an expense
app.put('/api/expenses/:id', async (req, res) => {
  try {
    const { title, amount, category, date, description } = req.body;

    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { title, amount, category, date, description },
      { new: true, runValidators: true }
    );

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({
      message: 'Expense updated successfully',
      expense
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete an expense
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({
      message: 'Expense deleted successfully',
      expense
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/expenses/stats/:userId
// @desc    Get expense statistics for a user
app.get('/api/expenses/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) dateFilter.date.$gte = new Date(startDate);
      if (endDate) dateFilter.date.$lte = new Date(endDate);
    }

    // Total expenses
    const totalResult = await Expense.aggregate([
      { $match: { userId: new  mongoose.Types.ObjectId(userId), ...dateFilter } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    const total = totalResult[0]?.total || 0;
    const count = totalResult[0]?.count || 0;

    // By category
    const byCategory = await Expense.aggregate([
      { $match: { userId: new  mongoose.Types.ObjectId(userId), ...dateFilter } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);

    // Monthly breakdown
    const monthlyBreakdown = await Expense.aggregate([
      { $match: { userId: new  mongoose.Types.ObjectId(userId), ...dateFilter } },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      summary: {
        total,
        count,
        average: count > 0 ? total / count : 0
      },
      byCategory: byCategory.map(cat => ({
        category: cat._id,
        total: cat.total,
        count: cat.count
      })),
      monthlyBreakdown: monthlyBreakdown.map(m => ({
        year: m._id.year,
        month: m._id.month,
        total: m.total,
        count: m.count
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3500;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});