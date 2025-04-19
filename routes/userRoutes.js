const express = require('express');
const router = express.Router();
const {
  loginUser,
  registerUser,
  getUserProfile,
  getPhotographers,
} = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

// @route   POST /api/users/login
router.post('/login', loginUser);

// @route   POST /api/users
router.post('/', registerUser);

// @route   GET /api/users/profile
router.get('/profile', protect, getUserProfile);

// @route   GET /api/users/photographers
router.get('/photographers', protect, admin, getPhotographers);

module.exports = router; 