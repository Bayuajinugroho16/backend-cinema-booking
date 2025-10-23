const express = require('express');
const router = express.Router();

// ✅ SIMPLE VERSION - tanpa database dulu
router.get('/', async (req, res) => {
  console.log('🎬 Fetching movies...');
  
  try {
    // Data movies sementara (tanpa database)
    const movies = [
      {
        id: 1,
        title: "Avengers: Endgame",
        genre: "Action",
        duration: "3h 1m",
        showtimes: ["10:00", "14:00", "18:00", "21:00"],
        price: 50000,
        poster: "/images/movie1.jpg"
      },
      {
        id: 2,
        title: "The Batman", 
        genre: "Action",
        duration: "2h 56m",
        showtimes: ["11:00", "15:00", "19:00", "22:00"],
        price: 45000,
        poster: "/images/movie2.jpg"
      },
      {
        id: 3,
        title: "Spider-Man: No Way Home",
        genre: "Action",
        duration: "2h 28m",
        showtimes: ["12:00", "16:00", "20:00"],
        price: 48000,
        poster: "/images/movie3.jpg"
      },
      {
        id: 4,
        title: "Black Panther: Wakanda Forever",
        genre: "Adventure", 
        duration: "2h 41m",
        showtimes: ["13:00", "17:00", "20:30"],
        price: 52000,
        poster: "/images/movie4.jpg"
      }
    ];

    console.log('✅ Sending', movies.length, 'movies');

    res.json({
      success: true,
      data: movies,
      total: movies.length,
      message: "Movies retrieved successfully"
    });

  } catch (error) {
    console.error('❌ Movies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch movies',
      error: error.message
    });
  }
});

// GET movie by ID
router.get('/:id', (req, res) => {
  const movies = [
    {
      id: 1,
      title: "Avengers: Endgame",
      genre: "Action",
      duration: "3h 1m",
      showtimes: ["10:00", "14:00", "18:00"],
      price: 50000,
      poster: "/images/movie1.jpg"
    }
  ];

  const movie = movies.find(m => m.id === parseInt(req.params.id));
  
  if (!movie) {
    return res.status(404).json({
      success: false,
      message: 'Movie not found'
    });
  }

  res.json({
    success: true,
    data: movie
  });
});

module.exports = router;