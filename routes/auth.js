// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Register user
router.post('/register', async (req, res) => {
  const { email, password, role, firstName, lastName, subjects } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    user = new User({
      email,
      password,
      role,
      profile: {
        firstName,
        lastName,
        subjects: role === 'tutor' ? subjects : []
      }
    });

    await user.save();

    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: 3600 },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: 3600 },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Update profile (for tutors)
router.put('/profile', auth, async (req, res) => {
  const { subjects, availability, bio, price } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (subjects) user.profile.subjects = subjects;
    if (availability) user.profile.availability = availability;
    if (bio) user.profile.bio = bio;
    if (price) user.profile.price = price;

    await user.save();
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;

// routes/messages.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const auth = require('../middleware/auth');

// Get conversation between two users
router.get('/:userId', auth, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user.id, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.user.id }
      ]
    })
    .sort({ timestamp: 1 })
    .populate('sender', 'profile firstName lastName')
    .populate('recipient', 'profile firstName lastName');
    
    res.json(messages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Send message
router.post('/', auth, async (req, res) => {
  try {
    const { recipient, content } = req.body;
    
    const newMessage = new Message({
      sender: req.user.id,
      recipient,
      content
    });
    
    await newMessage.save();
    
    // Populate sender info before sending response
    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'profile firstName lastName');
    
    res.json(populatedMessage);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Mark messages as read
router.put('/mark-read', auth, async (req, res) => {
  try {
    const { senderId } = req.body;
    
    await Message.updateMany(
      { sender: senderId, recipient: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    
    res.json({ msg: 'Messages marked as read' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

// routes/lessons.js
const express = require('express');
const router = express.Router();
const Lesson = require('../models/Lesson');
const auth = require('../middleware/auth');

// Get all lessons for a user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const lessons = await Lesson.find({
      $or: [{ tutor: userId }, { student: userId }]
    })
    .populate('tutor', 'profile firstName lastName')
    .populate('student', 'profile firstName lastName')
    .sort({ startTime: 1 });
    
    res.json(lessons);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Schedule a new lesson
router.post('/', auth, async (req, res) => {
  try {
    const { tutorId, studentId, subject, startTime, endTime } = req.body;
    
    const newLesson = new Lesson({
      tutor: tutorId,
      student: studentId,
      subject,
      startTime,
      endTime
    });
    
    await newLesson.save();
    
    // Populate user details before sending response
    const populatedLesson = await Lesson.findById(newLesson._id)
      .populate('tutor', 'profile firstName lastName')
      .populate('student', 'profile firstName lastName');
    
    res.json(populatedLesson);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Update a lesson
router.put('/:id', auth, async (req, res) => {
  try {
    const { startTime, endTime, status, notes, rating, feedback } = req.body;
    
    const lesson = await Lesson.findById(req.params.id);
    
    if (!lesson) {
      return res.status(404).json({ msg: 'Lesson not found' });
    }
    
    // Check if user is authorized to update this lesson
    if (lesson.tutor.toString() !== req.user.id && lesson.student.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    
    if (startTime) lesson.startTime = startTime;
    if (endTime) lesson.endTime = endTime;
    if (status) lesson.status = status;
    if (notes) lesson.notes = notes;
    if (rating) lesson.rating = rating;
    if (feedback) lesson.feedback = feedback;
    
    await lesson.save();
    
    res.json(lesson);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Generate meeting link for a lesson
router.post('/:id/generate-link', auth, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    
    if (!lesson) {
      return res.status(404).json({ msg: 'Lesson not found' });
    }
    
    // Check if user is authorized
    if (lesson.tutor.toString() !== req.user.id && lesson.student.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    
    // Generate a unique meeting link (in a real app, this would use a service like Daily.co)
    const meetingLink = `https://educonnect.video/meeting/${lesson._id}-${Math.random().toString(36).substr(2, 9)}`;
    lesson.meetingLink = meetingLink;
    
    await lesson.save();
    
    res.json({ meetingLink });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Submit quiz results
router.post('/:id/quiz', auth, async (req, res) => {
  try {
    const { quizResults } = req.body;
    
    const lesson = await Lesson.findById(req.params.id);
    
    if (!lesson) {
      return res.status(404).json({ msg: 'Lesson not found' });
    }
    
    // Only tutor can submit quiz results
    if (lesson.tutor.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    
    lesson.quizResults = quizResults;
    await lesson.save();
    
    res.json(lesson);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

// routes/tutors.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Get all tutors
router.get('/', auth, async (req, res) => {
  try {
    const tutors = await User.find({ role: 'tutor' })
      .select('profile firstName lastName subjects availability rating price')
      .sort({ 'profile.rating': -1 });
    
    res.json(tutors);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get tutors by subject
router.get('/subject/:subject', auth, async (req, res) => {
  try {
    const tutors = await User.find({ 
      role: 'tutor',
      'profile.subjects': req.params.subject 
    })
    .select('profile firstName lastName subjects availability rating price')
    .sort({ 'profile.rating': -1 });
    
    res.json(tutors);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get tutor details
router.get('/:id', auth, async (req, res) => {
  try {
    const tutor = await User.findById(req.params.id)
      .select('-password');
    
    if (!tutor || tutor.role !== 'tutor') {
      return res.status(404).json({ msg: 'Tutor not found' });
    }
    
    res.json(tutor);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;