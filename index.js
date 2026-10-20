// index.js - Full Stack Express Backend & Public Frontend
// Handles API routes, MongoDB connection, rate limiting, and serves the public interface.

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const getAdminHTML = require('./admin.js');
require('dotenv').config();

const app = express();

// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.APP_URL || '*', credentials: true }));
// Helmet is configured to allow inline styles/scripts for our one-file embedded frontend
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: 'Too many requests' });
app.use('/api/', apiLimiter);

// ==========================================
// MONGODB CONNECTION (Serverless Optimized)
// ==========================================
let cachedDb = null;
async function connectDB() {
    if (cachedDb) return cachedDb;
    if (!process.env.MONGODB_URI) {
        console.warn('MONGODB_URI missing. Proceeding without database (mock mode not supported).');
        return null;
    }
    try {
        cachedDb = await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('MongoDB Connected');
        await seedInitialData();
        return cachedDb;
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        throw err;
    }
}
// Middleware to ensure DB connection on every API request
app.use('/api', async (req, res, next) => {
    try { await connectDB(); next(); } 
    catch (e) { res.status(503).json({ error: 'Database unavailable' }); }
});

// ==========================================
// MONGOOSE MODELS
// ==========================================
const ServiceSchema = new mongoose.Schema({
    name: String, description: String, price: Number, durationMinutes: Number, icon: String, color: String, active: { type: Boolean, default: true }
});
const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);

const DentistSchema = new mongoose.Schema({
    name: String, specialty: String, bio: String, experienceYears: Number, active: { type: Boolean, default: true }
});
const Dentist = mongoose.models.Dentist || mongoose.model('Dentist', DentistSchema);

const AppointmentSchema = new mongoose.Schema({
    bookingReference: { type: String, unique: true },
    patientName: String, email: String, phone: String,
    serviceId: mongoose.Schema.Types.ObjectId, serviceName: String,
    dentistId: mongoose.Schema.Types.ObjectId,
    appointmentDate: String, // YYYY-MM-DD
    startTime: String, // HH:MM
    endTime: String,   // HH:MM
    status: { type: String, enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});
const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);

// ==========================================
// DATA SEEDING (Run once on fresh DB)
// ==========================================
async function seedInitialData() {
    const sCount = await Service.countDocuments();
    if (sCount === 0) {
        await Service.insertMany([
            { name: 'General Consultation', description: 'Routine checkup and advice.', price: 500, durationMinutes: 30, icon: 'stethoscope', color: 'var(--mint)' },
            { name: 'Teeth Cleaning', description: 'Professional scale and polish.', price: 1200, durationMinutes: 45, icon: 'sparkles', color: 'var(--sky)' },
            { name: 'Root Canal', description: 'Advanced endodontic therapy.', price: 4500, durationMinutes: 60, icon: 'activity', color: 'var(--peach)' },
            { name: 'Teeth Whitening', description: 'Brighten your smile naturally.', price: 3000, durationMinutes: 60, icon: 'sun', color: 'var(--butter)' }
        ]);
    }
    const dCount = await Dentist.countDocuments();
    if (dCount === 0) {
        await Dentist.insertMany([
            { name: 'Dr. Aanya Sharma', specialty: 'General & Cosmetic Dentistry', experienceYears: 12 },
            { name: 'Dr. Rohan Mehta', specialty: 'Orthodontics', experienceYears: 8 },
            { name: 'Dr. Kiara Verma', specialty: 'Pediatric Dentistry', experienceYears: 5 }
        ]);
    }
}

// ==========================================
// HELPERS
// ==========================================
function timeToMins(t) { const [h, m] = t.split(':'); return parseInt(h) * 60 + parseInt(m); }
function minsToTime(m) { return Math.floor(m / 60).toString().padStart(2, '0') + ':' + (m % 60).toString().padStart(2, '0'); }

// ==========================================
// PUBLIC API ROUTES
// ==========================================
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.get('/api/services', async (req, res) => {
    const services = await Service.find({ active: true });
    res.json(services);
});

app.get('/api/dentists', async (req, res) => {
    const dentists = await Dentist.find({ active: true });
    res.json(dentists);
});

// Slot availability calculation
app.get('/api/availability', async (req, res) => {
    try {
        const { date, dentistId, serviceId } = req.query;
        if (!date || !serviceId) return res.status(400).json({ error: 'Missing parameters' });
        
        const dateObj = new Date(date);
        if (dateObj.getDay() === 0) return res.json({ slots: [], message: 'Closed on Sundays' });
        if (dateObj < new Date(new Date().setHours(0,0,0,0))) return res.json({ slots: [] });

        const service = await Service.findById(serviceId);
        if (!service) return res.status(404).json({ error: 'Service not found' });
        
        const targetDentistId = dentistId || (await Dentist.findOne())._id;

        // Clinic hours: 09:00 to 19:00
        const clinicStart = 9 * 60; 
        const clinicEnd = 19 * 60;
        const dur = service.durationMinutes;

        // Fetch existing active appointments for this dentist & date
        const existing = await Appointment.find({
            appointmentDate: date,
            dentistId: targetDentistId,
            status: { $ne: 'Cancelled' }
        });

        const slots = [];
        for (let t = clinicStart; t <= clinicEnd - dur; t += 30) {
            const reqStart = t;
            const reqEnd = t + dur;
            let overlap = false;
            for (let appt of existing) {
                const exStart = timeToMins(appt.startTime);
                const exEnd = timeToMins(appt.endTime);
                if (reqStart < exEnd && reqEnd > exStart) { overlap = true; break; }
            }
            if (!overlap) slots.push(minsToTime(t));
        }
        res.json({ slots, targetDentistId });
    } catch (err) {
        res.status(500).json({ error: 'Server error calculating availability' });
    }
});

app.post('/api/appointments', async (req, res) => {
    try {
        const { patientName, email, phone, serviceId, dentistId, appointmentDate, startTime } = req.body;
        if (!patientName || !phone || !serviceId || !appointmentDate || !startTime) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const dateObj = new Date(appointmentDate);
        if (dateObj.getDay() === 0) return res.status(400).json({ error: 'Cannot book on Sunday' });

        const service = await Service.findById(serviceId);
        if (!service) return res.status(404).json({ error: 'Service not found' });
        
        const endMins = timeToMins(startTime) + service.durationMinutes;
        const endTime = minsToTime(endMins);

        // Server-side overlap prevention
        const existing = await Appointment.findOne({
            appointmentDate, dentistId, status: { $ne: 'Cancelled' },
            $or: [
                { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
            ]
        });
        if (existing) return res.status(409).json({ error: 'Time slot is no longer available' });

        const ref = 'SMC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const appt = new Appointment({
            bookingReference: ref, patientName, email, phone, serviceId,
            serviceName: service.name, dentistId, appointmentDate, startTime, endTime
        });
        await appt.save();
        res.status(201).json({ success: true, bookingReference: ref });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Booking failed. Try again.' });
    }
});

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback_secret_do_not_use_in_prod';

app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@smilecraft.example';
    const adminHash = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10); // default fallback demo

    if (email !== adminEmail) return res.status(401).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, adminHash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ role: 'admin' }, SESSION_SECRET, { expiresIn: '8h' });
    res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ success: true });
});

app.get('/api/admin/me', (req, res) => {
    const token = req.cookies.admin_token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        jwt.verify(token, SESSION_SECRET);
        res.json({ authorized: true });
    } catch (e) { res.status(401).json({ message: 'Invalid token' }); }
});

// Admin Auth Middleware
const authMiddleware = (req, res, next) => {
    try {
        jwt.verify(req.cookies.admin_token, SESSION_SECRET);
        next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized access' }); }
};

// ==========================================
// ADMIN PROTECTED ROUTES
// ==========================================
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
    const total = await Appointment.countDocuments();
    const pending = await Appointment.countDocuments({ status: 'Pending' });
    const todayStr = new Date().toISOString().split('T')[0];
    const today = await Appointment.countDocuments({ appointmentDate: todayStr, status: { $ne: 'Cancelled' } });
    const recent = await Appointment.find().sort({ createdAt: -1 }).limit(5);
    res.json({ total, pending, today, recent });
});

app.get('/api/admin/appointments', authMiddleware, async (req, res) => {
    const appts = await Appointment.find().sort({ appointmentDate: -1, startTime: -1 });
    res.json(appts);
});

app.patch('/api/admin/appointments/:id/status', authMiddleware, async (req, res) => {
    const { status } = req.body;
    if (!['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await Appointment.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true });
});

// ==========================================
// FRONTEND ROUTES
// ==========================================
app.get('/admin', (req, res) => {
    res.send(getAdminHTML());
});

app.get('/', (req, res) => {
    const publicHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SmileCraft Dental Studio | Book Your Dental Appointment</title>
    <meta name="description" content="Experience gentle, modern dental care designed around you. Book your appointment online today.">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        :root {
            --primary: #A78BFA;
            --secondary: #8B5CF6;
            --mint: #B8F2D0;
            --sky: #BAE6FD;
            --peach: #FFD6C9;
            --butter: #FDE68A;
            --bg: #FFF9F5;
            --text-main: #302B45;
            --text-sec: #77738B;
            --white: #FFFFFF;
            --shadow-out: 8px 8px 20px rgba(70, 50, 100, 0.08), -6px -6px 18px rgba(255, 255, 255, 0.95);
            --shadow-in: inset 4px 4px 10px rgba(70, 50, 100, 0.05), inset -4px -4px 10px rgba(255, 255, 255, 0.9);
            --radius: 28px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg); color: var(--text-main); line-height: 1.6; overflow-x: hidden; }
        h1, h2, h3, h4 { font-family: 'Plus Jakarta Sans', sans-serif; color: var(--text-main); }
        
        /* Clay Components */
        .clay-card {
            background: var(--bg); border-radius: var(--radius);
            box-shadow: var(--shadow-out); padding: 32px;
            border: 2px solid rgba(255,255,255,0.7);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .clay-card:hover { transform: translateY(-5px); }
        
        .clay-btn {
            background: var(--primary); color: var(--white); text-decoration: none;
            border-radius: 40px; padding: 14px 28px; border: none; font-weight: 600; font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 1.05rem; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
            box-shadow: 4px 4px 12px rgba(167, 139, 250, 0.5), -4px -4px 12px rgba(255, 255, 255, 0.9), inset 2px 2px 6px rgba(255, 255, 255, 0.3);
            transition: all 0.2s;
        }
        .clay-btn:hover { filter: brightness(1.05); transform: scale(1.02); }
        .clay-btn:active { box-shadow: var(--shadow-in); transform: scale(0.98); }
        .clay-btn.secondary { background: var(--bg); color: var(--primary); box-shadow: var(--shadow-out); }
        
        /* Layout */
        .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
        section { padding: 100px 0; position: relative; }
        .section-header { text-align: center; margin-bottom: 60px; }
        .section-header h2 { font-size: 2.5rem; margin-bottom: 16px; }
        .section-header p { color: var(--text-sec); font-size: 1.1rem; max-width: 600px; margin: 0 auto; }

        /* Navigation */
        nav { position: fixed; top: 0; width: 100%; padding: 20px 0; z-index: 100; transition: 0.3s; }
        nav.scrolled { background: rgba(255, 249, 245, 0.9); backdrop-filter: blur(10px); box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
        .nav-content { display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 1.5rem; font-weight: 800; font-family: 'Plus Jakarta Sans', sans-serif; color: var(--secondary); display: flex; align-items: center; gap: 8px; text-decoration: none;}
        .nav-links { display: flex; gap: 32px; align-items: center; }
        .nav-links a { text-decoration: none; color: var(--text-main); font-weight: 500; transition: color 0.2s; }
        .nav-links a:hover { color: var(--primary); }
        .mobile-menu-btn { display: none; background: none; border: none; cursor: pointer; color: var(--text-main); }

        /* Hero */
        .hero { padding-top: 160px; padding-bottom: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
        .hero h1 { font-size: 4rem; line-height: 1.1; margin-bottom: 24px; color: var(--text-main); }
        .hero p { font-size: 1.2rem; color: var(--text-sec); margin-bottom: 40px; }
        .hero-btns { display: flex; gap: 16px; }
        .hero-img-wrap { position: relative; }
        .hero-img { width: 100%; border-radius: 40px; box-shadow: var(--shadow-out); border: 4px solid var(--white); }
        .floating-badge { position: absolute; background: var(--white); padding: 16px 24px; border-radius: 20px; box-shadow: var(--shadow-out); display: flex; align-items: center; gap: 12px; font-weight: 600; }
        .badge-1 { top: 40px; left: -30px; animation: float 4s ease-in-out infinite; }
        .badge-2 { bottom: 40px; right: -20px; animation: float 5s ease-in-out infinite alternate; }
        @keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }

        /* Stats */
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-top: -40px; position: relative; z-index: 10; }
        .stat-card { text-align: center; background: var(--white); padding: 32px; border-radius: var(--radius); box-shadow: var(--shadow-out); }
        .stat-card h3 { font-size: 2.5rem; color: var(--primary); margin-bottom: 8px; }
        .stat-card p { color: var(--text-sec); font-weight: 500; font-size: 0.9rem; }

        /* Services Grid */
        .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px; }
        .service-card { text-align: center; display: flex; flex-direction: column; height: 100%; }
        .s-icon { width: 64px; height: 64px; border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; box-shadow: var(--shadow-out); }
        .service-card h3 { margin-bottom: 12px; }
        .service-card p { color: var(--text-sec); margin-bottom: 24px; flex-grow: 1; }
        .s-meta { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 24px; font-size: 0.9rem; color: var(--text-main); background: rgba(255,255,255,0.4); padding: 12px; border-radius: 12px;}

        /* Dentists Grid */
        .dentist-card { text-align: center; }
        .d-img { width: 120px; height: 120px; border-radius: 50%; margin: 0 auto 20px auto; background: var(--sky); border: 4px solid var(--white); box-shadow: var(--shadow-out); display: flex; align-items: center; justify-content: center;}
        .dentist-card h3 { margin-bottom: 8px; }
        .dentist-card p { color: var(--primary); font-weight: 500; margin-bottom: 16px; }

        /* Modals & Forms */
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(48, 43, 69, 0.4); backdrop-filter: blur(4px); z-index: 1000; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; }
        .modal-overlay.show { display: flex; opacity: 1; }
        .modal-content { background: var(--bg); width: 100%; max-width: 600px; border-radius: 32px; padding: 40px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); position: relative; max-height: 90vh; overflow-y: auto; }
        .close-modal { position: absolute; top: 24px; right: 24px; background: none; border: none; cursor: pointer; color: var(--text-sec); }
        
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: var(--text-main); }
        .clay-input { width: 100%; background: var(--bg); border: 2px solid transparent; border-radius: 16px; padding: 14px 16px; box-shadow: var(--shadow-in); outline: none; font-family: 'Inter', sans-serif; font-size: 1rem; color: var(--text-main); transition: border-color 0.2s; }
        .clay-input:focus { border-color: var(--primary); }
        select.clay-input { appearance: none; cursor: pointer; }

        .time-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; margin-top: 12px; }
        .time-slot { background: var(--bg); box-shadow: var(--shadow-out); border-radius: 12px; padding: 10px; text-align: center; cursor: pointer; border: 2px solid transparent; transition: 0.2s; font-weight: 500;}
        .time-slot:hover { transform: translateY(-2px); }
        .time-slot.selected { border-color: var(--primary); background: var(--white); color: var(--primary); box-shadow: var(--shadow-in); }
        .time-slot.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }

        /* Animation Classes */
        .fade-in { opacity: 0; transform: translateY(30px); transition: 0.8s all ease; }
        .fade-in.visible { opacity: 1; transform: translateY(0); }

        /* Disclaimer */
        .disclaimer { background: var(--peach); color: #991B1B; text-align: center; padding: 10px; font-size: 0.85rem; font-weight: 600; }

        @media (max-width: 900px) {
            .hero { grid-template-columns: 1fr; text-align: center; padding-top: 120px; }
            .hero h1 { font-size: 3rem; }
            .hero-btns { justify-content: center; }
            .stats { grid-template-columns: 1fr 1fr; margin-top: 40px; }
            .nav-links { display: none; }
            .mobile-menu-btn { display: block; }
        }
        @media (max-width: 500px) {
            .stats { grid-template-columns: 1fr; }
            .modal-content { padding: 24px; border-radius: 20px; }
        }
    </style>
</head>
<body>
    <div class="disclaimer">DEMONSTRATION ONLY: SmileCraft Dental Studio is a fictional project. Do not enter real personal data.</div>
    
    <nav id="navbar">
        <div class="container nav-content">
            <a href="#" class="logo"><i data-lucide="smile"></i> SmileCraft</a>
            <div class="nav-links">
                <a href="#about">About</a>
                <a href="#services">Services</a>
                <a href="#dentists">Dentists</a>
                <a href="#contact">Contact</a>
                <button class="clay-btn" onclick="openBookingModal()">Book Online</button>
            </div>
            <button class="mobile-menu-btn"><i data-lucide="menu"></i></button>
        </div>
    </nav>

    <header class="hero container">
        <div class="hero-text fade-in">
            <h1>A Healthier Smile Starts Here.</h1>
            <p>Experience gentle, modern dental care designed around you. From routine checkups to complete smile transformations, we make every visit comfortable.</p>
            <div class="hero-btns">
                <button class="clay-btn" onclick="openBookingModal()">Book Appointment <i data-lucide="arrow-right"></i></button>
                <a href="#services" class="clay-btn secondary">Explore Services</a>
            </div>
            <div style="margin-top: 32px; display:flex; gap: 16px; color: var(--text-sec); font-weight: 500;">
                <span><i data-lucide="shield-check" style="color:var(--mint); vertical-align:middle;"></i> Gentle Care</span>
                <span><i data-lucide="star" style="color:var(--butter); vertical-align:middle;"></i> 4.9/5 Rating</span>
            </div>
        </div>
        <div class="hero-img-wrap fade-in" style="transition-delay: 0.2s;">
            <img src="https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80" alt="Modern Dental Clinic" class="hero-img">
            <div class="floating-badge badge-1"><i data-lucide="users" style="color:var(--primary)"></i> 8.5K+ Happy Patients</div>
            <div class="floating-badge badge-2"><i data-lucide="award" style="color:var(--secondary)"></i> 12+ Years Exp</div>
        </div>
    </header>

    <div class="container stats fade-in">
        <div class="stat-card"><h3>8,500+</h3><p>Happy Patients</p></div>
        <div class="stat-card"><h3>12+</h3><p>Years Experience</p></div>
        <div class="stat-card"><h3>15+</h3><p>Treatments</p></div>
        <div class="stat-card"><h3>4.9</h3><p>Demo Rating</p></div>
    </div>

    <section id="services" class="container fade-in">
        <div class="section-header">
            <h2>Our Dental Services</h2>
            <p>Comprehensive care for your entire family under one roof.</p>
        </div>
        <div class="services-grid" id="services-container">
            <!-- Populated by JS -->
        </div>
    </section>

    <section id="dentists" class="container fade-in" style="background: rgba(255,255,255,0.4); border-radius: 40px; padding: 80px 40px;">
        <div class="section-header">
            <h2>Meet Our Dentists</h2>
            <p>Fictional demonstration profiles representing top-tier dental professionals.</p>
        </div>
        <div class="services-grid" id="dentists-container">
            <!-- Populated by JS -->
        </div>
    </section>

    <section id="cta" class="container fade-in" style="text-align:center; padding: 120px 0;">
        <h2>Ready to Love Your Smile?</h2>
        <p style="color:var(--text-sec); margin: 20px auto 40px auto; max-width: 500px;">Take the first step toward your next dental visit. Request an appointment securely online.</p>
        <button class="clay-btn" onclick="openBookingModal()" style="font-size: 1.2rem; padding: 16px 40px;">Book Your Appointment Now</button>
    </section>

    <footer style="background: var(--white); padding: 60px 0 20px 0; margin-top: 60px;">
        <div class="container" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 40px; margin-bottom: 40px;">
            <div>
                <h3 style="margin-bottom: 20px; color: var(--secondary);"><i data-lucide="smile"></i> SmileCraft</h3>
                <p style="color:var(--text-sec);">Your Smile, Our Passion.<br>24 Park Street, Jaipur, Rajasthan, India</p>
                <p style="margin-top:10px; font-weight:600;">+91 98765 43210</p>
            </div>
            <div>
                <h4 style="margin-bottom:20px;">Quick Links</h4>
                <ul style="list-style:none; color:var(--text-sec); line-height:2;">
                    <li><a href="#services" style="color:inherit;text-decoration:none;">Services</a></li>
                    <li><a href="#dentists" style="color:inherit;text-decoration:none;">Dentists</a></li>
                    <li><a href="/admin" style="color:var(--primary);text-decoration:none;font-weight:600;">Admin Login</a></li>
                </ul>
            </div>
        </div>
        <div class="container" style="text-align:center; color:var(--text-sec); font-size: 0.9rem; border-top: 1px solid #eee; padding-top: 20px;">
            &copy; 2026 SmileCraft Dental Studio Demo. All data is fictional. Designed with Claymorphism.
        </div>
    </footer>

    <!-- Booking Modal -->
    <div class="modal-overlay" id="booking-modal">
        <div class="modal-content clay-card">
            <button class="close-modal" onclick="closeBookingModal()"><i data-lucide="x"></i></button>
            <h2 style="margin-bottom: 8px;">Book Appointment</h2>
            <p style="color:var(--text-sec); margin-bottom: 24px;">Complete the form to schedule your visit.</p>
            
            <form id="booking-form">
                <div class="form-group">
                    <label>Select Service *</label>
                    <select id="book-service" class="clay-input" required onchange="checkAvailability()">
                        <option value="">-- Choose a Service --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Select Dentist</label>
                    <select id="book-dentist" class="clay-input" onchange="checkAvailability()">
                        <option value="">Any Available Dentist</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Appointment Date * (Closed Sundays)</label>
                    <input type="date" id="book-date" class="clay-input" required onchange="checkAvailability()">
                </div>
                
                <div class="form-group" id="slots-container" style="display:none;">
                    <label>Available Times *</label>
                    <div id="loading-slots" style="font-size: 0.9rem; color: var(--text-sec);">Checking availability...</div>
                    <div class="time-slots" id="time-slots"></div>
                    <input type="hidden" id="selected-time" required>
                </div>

                <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" id="book-name" class="clay-input" required placeholder="John Doe">
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                    <div class="form-group">
                        <label>Phone Number *</label>
                        <input type="tel" id="book-phone" class="clay-input" required placeholder="+91 98765 43210">
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="book-email" class="clay-input" placeholder="john@example.com">
                    </div>
                </div>
                
                <div class="form-group" style="margin-top: 10px;">
                    <label style="display:flex; align-items:center; gap:8px; font-weight: normal; font-size: 0.9rem;">
                        <input type="checkbox" required style="width:16px; height:16px;">
                        I consent to the clinic contacting me regarding this appointment.
                    </label>
                </div>

                <div id="booking-error" style="color: #991B1B; background: var(--peach); padding: 10px; border-radius: 8px; margin-bottom: 16px; display:none;"></div>
                
                <button type="submit" class="clay-btn" id="submit-btn" style="width:100%; justify-content:center;">Confirm Booking</button>
            </form>

            <div id="success-message" style="display:none; text-align:center; padding: 20px 0;">
                <i data-lucide="check-circle" style="width:64px; height:64px; color:var(--mint); margin-bottom: 16px;"></i>
                <h3>Booking Confirmed!</h3>
                <p style="color:var(--text-sec); margin:10px 0;">Your reference number is:</p>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary); letter-spacing: 2px; margin-bottom: 24px;" id="ref-display"></div>
                <button class="clay-btn secondary" onclick="closeBookingModal()">Close</button>
            </div>
        </div>
    </div>

    <script>
        lucide.createIcons();

        // UI Interactions
        window.addEventListener('scroll', () => {
            document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add('visible');
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

        // Setup Date Input Min
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('book-date').setAttribute('min', today);

        // Fetch Data
        let servicesData = [];
        let dentistsData = [];

        async function loadPublicData() {
            try {
                const sRes = await fetch('/api/services');
                servicesData = await sRes.json();
                const dRes = await fetch('/api/dentists');
                dentistsData = await dRes.json();
                renderServices();
                renderDentists();
                populateDropdowns();
            } catch (e) { console.error('Failed to load data', e); }
        }

        function renderServices() {
            const container = document.getElementById('services-container');
            container.innerHTML = '';
            servicesData.forEach(s => {
                container.innerHTML += '<div class="clay-card service-card fade-in">' +
                    '<div class="s-icon" style="background:' + s.color + '"><i data-lucide="' + s.icon + '" style="color:#fff"></i></div>' +
                    '<h3>' + s.name + '</h3>' +
                    '<p>' + s.description + '</p>' +
                    '<div class="s-meta"><span>₹' + s.price + '</span><span><i data-lucide="clock" style="width:14px;"></i> ' + s.durationMinutes + 'm</span></div>' +
                    '<button class="clay-btn secondary" style="width:100%; justify-content:center;" onclick="openBookingModal(\\'' + s._id + '\\')">Book Service</button>' +
                '</div>';
            });
            lucide.createIcons();
            document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        }

        function renderDentists() {
            const container = document.getElementById('dentists-container');
            container.innerHTML = '';
            dentistsData.forEach(d => {
                container.innerHTML += '<div class="clay-card dentist-card fade-in">' +
                    '<div class="d-img"><i data-lucide="user" style="width:48px; height:48px; color:var(--white);"></i></div>' +
                    '<h3>' + d.name + '</h3>' +
                    '<p>' + d.specialty + '</p>' +
                    '<span style="color:var(--text-sec); font-size:0.9rem;">' + d.experienceYears + '+ Years Experience</span><br><br>' +
                    '<button class="clay-btn" style="padding: 8px 16px; font-size:0.9rem;" onclick="openBookingModal(null, \\'' + d._id + '\\')">Book Doctor</button>' +
                '</div>';
            });
            lucide.createIcons();
            document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        }

        function populateDropdowns() {
            const sSelect = document.getElementById('book-service');
            const dSelect = document.getElementById('book-dentist');
            servicesData.forEach(s => sSelect.add(new Option(s.name, s._id)));
            dentistsData.forEach(d => dSelect.add(new Option(d.name, d._id)));
        }

        // Booking Logic
        const modal = document.getElementById('booking-modal');
        function openBookingModal(serviceId = null, dentistId = null) {
            document.getElementById('booking-form').style.display = 'block';
            document.getElementById('success-message').style.display = 'none';
            document.getElementById('booking-form').reset();
            document.getElementById('slots-container').style.display = 'none';
            document.getElementById('selected-time').value = '';
            
            if (serviceId) document.getElementById('book-service').value = serviceId;
            if (dentistId) document.getElementById('book-dentist').value = dentistId;
            
            modal.classList.add('show');
            if (serviceId && document.getElementById('book-date').value) checkAvailability();
        }

        function closeBookingModal() {
            modal.classList.remove('show');
        }

        async function checkAvailability() {
            const sId = document.getElementById('book-service').value;
            const dId = document.getElementById('book-dentist').value;
            const date = document.getElementById('book-date').value;
            
            const slotsContainer = document.getElementById('slots-container');
            const loader = document.getElementById('loading-slots');
            const slotsDiv = document.getElementById('time-slots');
            document.getElementById('selected-time').value = '';
            
            if (!sId || !date) {
                slotsContainer.style.display = 'none';
                return;
            }

            const dObj = new Date(date);
            if (dObj.getDay() === 0) {
                alert("We are closed on Sundays. Please select another date.");
                document.getElementById('book-date').value = '';
                return;
            }

            slotsContainer.style.display = 'block';
            loader.style.display = 'block';
            slotsDiv.innerHTML = '';

            try {
                const res = await fetch('/api/availability?date=' + date + '&serviceId=' + sId + (dId ? '&dentistId='+dId : ''));
                const data = await res.json();
                loader.style.display = 'none';

                if (data.slots && data.slots.length > 0) {
                    data.slots.forEach(t => {
                        const div = document.createElement('div');
                        div.className = 'time-slot';
                        div.textContent = t;
                        div.onclick = () => selectTime(div, t);
                        slotsDiv.appendChild(div);
                    });
                } else {
                    slotsDiv.innerHTML = '<div style="grid-column: 1/-1; color: var(--peach);">No slots available for this date.</div>';
                }
            } catch (e) {
                loader.textContent = 'Error loading slots.';
            }
        }

        function selectTime(element, time) {
            document.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
            element.classList.add('selected');
            document.getElementById('selected-time').value = time;
        }

        document.getElementById('booking-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const time = document.getElementById('selected-time').value;
            if (!time) return alert("Please select an appointment time.");

            const btn = document.getElementById('submit-btn');
            const errDiv = document.getElementById('booking-error');
            btn.disabled = true;
            btn.textContent = 'Processing...';
            errDiv.style.display = 'none';

            const payload = {
                serviceId: document.getElementById('book-service').value,
                dentistId: document.getElementById('book-dentist').value || dentistsData[0]._id, // fallback to first if Any
                appointmentDate: document.getElementById('book-date').value,
                startTime: time,
                patientName: document.getElementById('book-name').value,
                phone: document.getElementById('book-phone').value,
                email: document.getElementById('book-email').value
            };

            try {
                const res = await fetch('/api/appointments', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (res.ok) {
                    document.getElementById('booking-form').style.display = 'none';
                    document.getElementById('success-message').style.display = 'block';
                    document.getElementById('ref-display').textContent = data.bookingReference;
                } else {
                    errDiv.textContent = data.error || 'Booking failed';
                    errDiv.style.display = 'block';
                }
            } catch (err) {
                errDiv.textContent = 'Network error occurred.';
                errDiv.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = 'Confirm Booking';
            }
        });

        loadPublicData();
    </script>
</body>
</html>`;
    res.send(publicHTML);
});

// ==========================================
// SERVER STARTUP
// ==========================================
const PORT = process.env.PORT || 3000;

// Export for Vercel
module.exports = app;

// Local Development Fallback
if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`Server running on port ${PORT}`);
        try {
            await connectDB();
        } catch (e) {
            console.log("Started without DB connection. API calls may fail.");
        }
    });
}
