const express = require('express');
const router = express.Router();
const { getCountries /*, other get functions */ } = require('../controllers/cache');

// Get all countries
router.get('/countries', async (req, res) => {
  try {
    const countries = await getCountries();
    res.json(countries);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add similar routes for other entities

module.exports = router;