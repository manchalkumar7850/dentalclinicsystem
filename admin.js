// admin.js - Admin Dashboard Interface (Frontend String Export)
// This file exports the HTML, CSS, and JS for the admin page, following the strict 4-file architecture.

module.exports = function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard | SmileCraft Dental Studio</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
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
            --shadow-out: 8px 8px 20px rgba(70, 50, 100, 0.08), -6px -6px 18px rgba(255, 255, 255, 0.9);
            --shadow-in: inset 3px 3px 8px rgba(70, 50, 100, 0.05), inset -3px -3px 8px rgba(255, 255, 255, 0.9);
            --radius: 20px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg); color: var(--text-main); line-height: 1.6; }
        h1, h2, h3 { font-family: 'Plus Jakarta Sans', sans-serif; }

        /* Claymorphism Utilities */
        .clay-card {
            background: var(--bg); border-radius: var(--radius);
            box-shadow: var(--shadow-out); padding: 24px;
            border: 2px solid rgba(255,255,255,0.6);
        }
        .clay-btn {
            background: var(--primary); color: var(--white);
            border-radius: 30px; padding: 10px 20px; border: none; font-weight: 600; cursor: pointer;
            box-shadow: 4px 4px 10px rgba(167, 139, 250, 0.4), -4px -4px 10px rgba(255, 255, 255, 0.8), inset 2px 2px 5px rgba(255, 255, 255, 0.4);
            transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;
        }
        .clay-btn:hover { transform: translateY(-2px); }
        .clay-btn:active { box-shadow: var(--shadow-in); transform: translateY(0); }
        .clay-btn.danger { background: #FF9B9B; box-shadow: 4px 4px 10px rgba(255, 155, 155, 0.4), -4px -4px 10px rgba(255, 255, 255, 0.8), inset 2px 2px 5px rgba(255, 255, 255, 0.4); }
        .clay-input {
            background: var(--bg); border: 2px solid transparent; border-radius: 16px; padding: 12px 16px;
            box-shadow: var(--shadow-in); width: 100%; outline: none; font-family: 'Inter', sans-serif; color: var(--text-main);
            transition: border-color 0.2s;
        }
        .clay-input:focus { border-color: var(--primary); }

        /* Login Layout */
        #login-view { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .login-box { width: 100%; max-width: 400px; text-align: center; }
        .login-box h2 { margin-bottom: 24px; color: var(--secondary); }
        .form-group { margin-bottom: 16px; text-align: left; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 500; font-size: 0.9rem; }

        /* Dashboard Layout */
        #dashboard-view { display: none; min-height: 100vh; grid-template-columns: 250px 1fr; }
        .sidebar { padding: 30px; box-shadow: 4px 0 20px rgba(70,50,100,0.05); z-index: 10; display: flex; flex-direction: column; }
        .sidebar h2 { color: var(--secondary); margin-bottom: 40px; font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
        .nav-item { padding: 12px 20px; margin-bottom: 12px; border-radius: 16px; cursor: pointer; font-weight: 500; color: var(--text-sec); transition: all 0.2s; display: flex; align-items: center; gap: 12px; }
        .nav-item:hover, .nav-item.active { background: var(--white); color: var(--primary); box-shadow: var(--shadow-out); }
        .nav-bottom { margin-top: auto; }
        
        .main-content { padding: 40px; overflow-y: auto; height: 100vh; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-bottom: 40px; }
        .stat-card { text-align: center; }
        .stat-card h3 { font-size: 2.5rem; color: var(--primary); margin-bottom: 8px; }
        .stat-card p { color: var(--text-sec); font-weight: 500; }

        /* Tables */
        .table-container { overflow-x: auto; border-radius: var(--radius); }
        table { width: 100%; border-collapse: collapse; min-width: 800px; }
        th, td { padding: 16px; text-align: left; border-bottom: 1px solid rgba(167, 139, 250, 0.1); }
        th { font-weight: 600; color: var(--text-sec); background: rgba(255,255,255,0.5); }
        tr:last-child td { border-bottom: none; }
        .badge { padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
        .badge.pending { background: var(--butter); color: #B45309; }
        .badge.confirmed { background: var(--mint); color: #065F46; }
        .badge.completed { background: var(--sky); color: #075985; }
        .badge.cancelled { background: var(--peach); color: #991B1B; }

        .action-btns { display: flex; gap: 8px; }
        .btn-icon { background: none; border: none; cursor: pointer; color: var(--text-sec); transition: 0.2s; padding: 4px; border-radius: 8px; }
        .btn-icon:hover { color: var(--primary); background: rgba(255,255,255,0.8); }
        
        .toast { position: fixed; bottom: 20px; right: 20px; background: var(--white); padding: 16px 24px; border-radius: 16px; box-shadow: var(--shadow-out); display: flex; gap: 12px; align-items: center; transform: translateY(100px); opacity: 0; transition: 0.3s; z-index: 1000;}
        .toast.show { transform: translateY(0); opacity: 1; }
        
        .section-view { display: none; }
        .section-view.active { display: block; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;}

        @media (max-width: 768px) {
            #dashboard-view { grid-template-columns: 1fr; }
            .sidebar { display: none; } /* Mobile sidebar hidden for simplicity, add hamburger to extend */
            .main-content { padding: 20px; }
        }
    </style>
</head>
<body>

    <!-- Login View -->
    <div id="login-view">
        <div class="clay-card login-box">
            <i data-lucide="smile" style="width: 48px; height: 48px; color: var(--primary); margin-bottom: 16px;"></i>
            <h2>Admin Secure Login</h2>
            <form id="login-form">
                <div class="form-group">
                    <label>Admin Email</label>
                    <input type="email" id="email" class="clay-input" required placeholder="admin@example.com">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="password" class="clay-input" required placeholder="••••••••">
                </div>
                <p id="login-error" style="color: red; font-size: 0.9rem; margin-bottom: 16px; display: none;"></p>
                <button type="submit" class="clay-btn" style="width: 100%; justify-content: center;">Access Dashboard</button>
            </form>
        </div>
    </div>

    <!-- Dashboard View -->
    <div id="dashboard-view">
        <div class="sidebar">
            <h2><i data-lucide="smile"></i> SmileCraft</h2>
            <div class="nav-item active" data-target="dashboard-sec"><i data-lucide="layout-dashboard"></i> Overview</div>
            <div class="nav-item" data-target="appointments-sec"><i data-lucide="calendar"></i> Appointments</div>
            <div class="nav-item" data-target="services-sec"><i data-lucide="briefcase-medical"></i> Services</div>
            <div class="nav-item" data-target="dentists-sec"><i data-lucide="users"></i> Dentists</div>
            <div class="nav-bottom">
                <div class="nav-item" id="logout-btn"><i data-lucide="log-out"></i> Logout</div>
            </div>
        </div>

        <div class="main-content">
            
            <!-- Dashboard Overview -->
            <div id="dashboard-sec" class="section-view active">
                <div class="header">
                    <h1>Dashboard Overview</h1>
                    <button class="clay-btn" onclick="fetchDashboardData()"><i data-lucide="refresh-cw"></i> Refresh</button>
                </div>
                <div class="stats-grid">
                    <div class="clay-card stat-card"><h3 id="stat-total">0</h3><p>Total Appointments</p></div>
                    <div class="clay-card stat-card"><h3 id="stat-pending">0</h3><p>Pending</p></div>
                    <div class="clay-card stat-card"><h3 id="stat-today">0</h3><p>Today's Visits</p></div>
                    <div class="clay-card stat-card"><h3 id="stat-revenue">-</h3><p>Demo Mode</p></div>
                </div>
                <div class="clay-card">
                    <h3>Recent Bookings</h3>
                    <div class="table-container" style="margin-top: 16px;">
                        <table>
                            <thead><tr><th>Ref</th><th>Patient</th><th>Date</th><th>Status</th></tr></thead>
                            <tbody id="recent-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Appointments Section -->
            <div id="appointments-sec" class="section-view">
                <div class="header">
                    <h1>Manage Appointments</h1>
                </div>
                <div class="clay-card">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Ref</th><th>Patient</th><th>Service</th><th>Date & Time</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody id="appointments-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>

             <!-- Services Section -->
             <div id="services-sec" class="section-view">
                <div class="header">
                    <h1>Dental Services</h1>
                </div>
                <div class="clay-card">
                    <p style="margin-bottom:16px; color: var(--text-sec);">Edit active services below. Changes reflect on the public booking form.</p>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Service Name</th><th>Duration (m)</th><th>Price (₹)</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody id="services-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Dentists Section -->
            <div id="dentists-sec" class="section-view">
                <div class="header">
                    <h1>Our Dentists</h1>
                </div>
                <div class="clay-card">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Name</th><th>Specialty</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody id="dentists-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <div id="toast" class="toast"><i data-lucide="check-circle" style="color:var(--mint)"></i><span id="toast-msg">Success</span></div>

    <script>
        lucide.createIcons();
        
        const loginView = document.getElementById('login-view');
        const dashboardView = document.getElementById('dashboard-view');
        
        function showToast(msg, isError=false) {
            const toast = document.getElementById('toast');
            document.getElementById('toast-msg').textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        async function checkAuth() {
            try {
                const res = await fetch('/api/admin/me');
                if (res.ok) {
                    loginView.style.display = 'none';
                    dashboardView.style.display = 'grid';
                    fetchDashboardData();
                    fetchAllAppointments();
                    fetchServices();
                    fetchDentists();
                } else {
                    loginView.style.display = 'flex';
                    dashboardView.style.display = 'none';
                }
            } catch(e) { console.error(e); }
        }

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errDiv = document.getElementById('login-error');
            
            const res = await fetch('/api/admin/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                errDiv.style.display = 'none';
                checkAuth();
                showToast('Login successful');
            } else {
                errDiv.textContent = data.message || 'Invalid credentials';
                errDiv.style.display = 'block';
            }
        });

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await fetch('/api/admin/logout', { method: 'POST' });
            window.location.reload();
        });

        // Navigation
        document.querySelectorAll('.nav-item[data-target]').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
                document.getElementById(item.getAttribute('data-target')).classList.add('active');
            });
        });

        // Data Fetching
        async function fetchDashboardData() {
            const res = await fetch('/api/admin/dashboard');
            if(res.ok) {
                const data = await res.json();
                document.getElementById('stat-total').textContent = data.total;
                document.getElementById('stat-pending').textContent = data.pending;
                document.getElementById('stat-today').textContent = data.today;
                
                const tbody = document.getElementById('recent-table-body');
                tbody.innerHTML = '';
                data.recent.forEach(appt => {
                    tbody.innerHTML += '<tr>' +
                        '<td>' + appt.bookingReference + '</td>' +
                        '<td>' + appt.patientName + '</td>' +
                        '<td>' + new Date(appt.appointmentDate).toLocaleDateString() + '</td>' +
                        '<td><span class="badge ' + appt.status.toLowerCase() + '">' + appt.status + '</span></td>' +
                    '</tr>';
                });
            }
        }

        async function fetchAllAppointments() {
            const res = await fetch('/api/admin/appointments');
            if(res.ok) {
                const data = await res.json();
                const tbody = document.getElementById('appointments-table-body');
                tbody.innerHTML = '';
                data.forEach(appt => {
                    tbody.innerHTML += '<tr>' +
                        '<td>' + appt.bookingReference + '</td>' +
                        '<td>' + appt.patientName + '<br><small>' + appt.phone + '</small></td>' +
                        '<td>' + appt.serviceName + '</td>' +
                        '<td>' + new Date(appt.appointmentDate).toLocaleDateString() + '<br><small>' + appt.startTime + '</small></td>' +
                        '<td><span class="badge ' + appt.status.toLowerCase() + '">' + appt.status + '</span></td>' +
                        '<td class="action-btns">' +
                            (appt.status === 'Pending' ? '<button class="btn-icon" onclick="updateStatus(\\'' + appt._id + '\\', \\'Confirmed\\')" title="Confirm"><i data-lucide="check"></i></button>' : '') +
                            (appt.status === 'Confirmed' ? '<button class="btn-icon" onclick="updateStatus(\\'' + appt._id + '\\', \\'Completed\\')" title="Complete"><i data-lucide="check-double"></i></button>' : '') +
                            (appt.status !== 'Cancelled' && appt.status !== 'Completed' ? '<button class="btn-icon" onclick="updateStatus(\\'' + appt._id + '\\', \\'Cancelled\\')" title="Cancel"><i data-lucide="x"></i></button>' : '') +
                        '</td>' +
                    '</tr>';
                });
                lucide.createIcons();
            }
        }

        async function updateStatus(id, status) {
            if(!confirm('Change status to ' + status + '?')) return;
            const res = await fetch('/api/admin/appointments/' + id + '/status', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if(res.ok) {
                showToast('Status updated');
                fetchAllAppointments();
                fetchDashboardData();
            } else {
                showToast('Failed to update status', true);
            }
        }

        async function fetchServices() {
            const res = await fetch('/api/services');
            if(res.ok) {
                const data = await res.json();
                const tbody = document.getElementById('services-table-body');
                tbody.innerHTML = '';
                data.forEach(srv => {
                    tbody.innerHTML += '<tr>' +
                        '<td>' + srv.name + '</td>' +
                        '<td>' + srv.durationMinutes + '</td>' +
                        '<td>' + srv.price + '</td>' +
                        '<td><span class="badge confirmed">' + (srv.active ? 'Active' : 'Inactive') + '</span></td>' +
                        '<td><button class="btn-icon" title="Edit disabled in demo"><i data-lucide="edit"></i></button></td>' +
                    '</tr>';
                });
                lucide.createIcons();
            }
        }

        async function fetchDentists() {
            const res = await fetch('/api/dentists');
            if(res.ok) {
                const data = await res.json();
                const tbody = document.getElementById('dentists-table-body');
                tbody.innerHTML = '';
                data.forEach(d => {
                    tbody.innerHTML += '<tr>' +
                        '<td>' + d.name + '</td>' +
                        '<td>' + d.specialty + '</td>' +
                        '<td><span class="badge confirmed">' + (d.active ? 'Active' : 'Inactive') + '</span></td>' +
                        '<td><button class="btn-icon" title="Edit disabled in demo"><i data-lucide="edit"></i></button></td>' +
                    '</tr>';
                });
                lucide.createIcons();
            }
        }

        checkAuth();
    </script>
</body>
</html>`;
};
