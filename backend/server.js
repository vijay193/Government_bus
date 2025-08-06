


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.APP_PORT || 3000;

// --- Middleware ---
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' })); // Increased limit for potentially large text pastes

// --- Database Connection Pool ---
let dbPool;
try {
  dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    flags: ['-FOUND_ROWS'] // Important for knowing if an UPDATE actually changed a row
  });
  console.log('Database connection pool created.');
} catch (error) {
  console.error('Failed to create database pool:', error);
  process.exit(1);
}

// --- In-memory store for OTP simulation ---
const otpStore = {}; // In-memory: { 'phone': { otp: '123456', expires: Date.now() + 300000 } }

// --- Helper Functions ---

const handleDBError = (res, error, context) => {
  console.error(`Database error in ${context}:`, error);
  return res.status(500).json({ message: `An internal server error occurred in ${context}.` });
};
/**
 * Fetch system settings from the settings table.
 * Returns a map of key/value pairs, with boolean values.
 */
const getSettings = async (connection) => {
  const [rows] = await connection.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('isBookingSystemOnline', 'isFreeBookingEnabled', 'isDiscountSystemEnabled')");
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value === 'true';
    return acc;
  }, {});
};

/**
 * A helper to format time strings from 'HH:mm:ss' to 'HH:mm' for display.
 * @param {string} timeStr - The time string from the database.
 * @returns {string|null} The formatted time or null if input is invalid.
 */
const formatTime = (timeStr) => {
    if (typeof timeStr !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
        return null; // Return null if format is not as expected
    }
    return timeStr.substring(0, 5); // Extracts 'HH:mm'
};

/**
 * Fetches schedules and their full route details, including per-stop fares.
 * @param {object} connection - A database connection or pool.
 * @param {string|null} scheduleId - Optional: The specific schedule ID to fetch.
 * @returns {Promise<Object>} A map of schedule objects, keyed by schedule ID.
 */
const fetchAndAssembleSchedules = async (connection, scheduleId = null) => {
    const [[settingsRows], [discountedDistrictRows]] = await Promise.all([
        connection.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('isBookingSystemOnline', 'isFreeBookingEnabled', 'isDiscountSystemEnabled')"),
        connection.query("SELECT district_name FROM discounted_districts")
    ]);
    const settings = settingsRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value === 'true' }), {});
    const discountedDistricts = new Set(discountedDistrictRows.map(r => r.district_name));
    
    const isSystemOnline = settings.isBookingSystemOnline || false;
    const isFreeBookingEnabled = settings.isFreeBookingEnabled || false;
    const isDiscountSystemEnabled = settings.isDiscountSystemEnabled || false;

    const params = [];
    let scheduleFilter = '';
    if (scheduleId) {
        scheduleFilter = 'WHERE s.id = ?';
        params.push(scheduleId);
    }

    const query = `
        SELECT
            s.id, s.busName, s.seatLayout, s.bookingEnabled,
            rs.stopName, rs.stopOrder, rs.arrivalTime, rs.departureTime, rs.fare
        FROM schedules s
        JOIN routestops rs ON s.id = rs.scheduleId
        ${scheduleFilter}
        ORDER BY s.id, rs.stopOrder;
    `;
    
    const [rows] = await connection.query(query, params);

    if (rows.length === 0) {
        return {};
    }

    const schedulesMap = rows.reduce((acc, row) => {
        if (!acc[row.id]) {
            acc[row.id] = {
                id: row.id,
                busName: row.busName,
                seatLayout: row.seatLayout,
                bookingEnabled: isSystemOnline && row.bookingEnabled === '1',
                isFreeBookingEnabled: isSystemOnline && isFreeBookingEnabled && row.bookingEnabled === '1',
                isDiscountEnabled: false, // will be set below
                fare: 0,
                stops: [],
            };
        }
        acc[row.id].stops.push({
            name: row.stopName,
            order: row.stopOrder,
            arrival: row.arrivalTime,
            departure: row.departureTime,
            fare: row.fare,
        });
        return acc;
    }, {});

    for (const id in schedulesMap) {
        const schedule = schedulesMap[id];
        
        const validStops = schedule.stops
            .filter(stop => typeof stop.name === 'string' && stop.name.trim() !== '')
            .sort((a, b) => a.order - b.order);

        if (validStops.length === 0) {
            delete schedulesMap[id];
            continue;
        }

        schedule.origin = validStops[0].name;
        schedule.departureTime = formatTime(validStops[0].departure) || 'N/A';
        schedule.isDiscountEnabled = isDiscountSystemEnabled && discountedDistricts.has(schedule.origin);

        if (validStops.length > 1) {
            const lastStop = validStops[validStops.length - 1];
            schedule.destination = lastStop.name;
            schedule.arrivalTime = formatTime(lastStop.arrival) || 'N/A';
            schedule.fare = Number(lastStop.fare) || 0;
        } else {
            schedule.destination = validStops[0].name;
            schedule.arrivalTime = formatTime(validStops[0].arrival) || 'N/A';
            schedule.fare = Number(validStops[0].fare) || 0;
        }
        
        schedule.via = validStops.slice(1, -1).map(stop => stop.name);

        schedule.fullRouteStops = validStops.map(stop => ({
            name: stop.name,
            normalizedName: stop.name.trim().toLowerCase(),
            arrival: stop.arrival,
            departure: stop.departure,
            fare: Number(stop.fare) || 0,
            order: stop.order,
        }));
        
        schedule.fullNormalizedRoute = schedule.fullRouteStops.map(s => s.normalizedName);
        
        delete schedule.stops;
    }

    return schedulesMap;
};


// --- API Routes ---
const apiRouter = express.Router();

// [GET] /api/districts
apiRouter.get('/districts', async (req, res) => {
    try {
        const [rows] = await dbPool.query( 
            `SELECT DISTINCT stopName 
             FROM routestops 
             WHERE stopName IS NOT NULL 
               AND TRIM(stopName) <> '' 
             ORDER BY stopName ASC`
        );
        const districts = rows.map(row => row.stopName);
        res.json(districts);
    } catch (error) {
        handleDBError(res, error, 'getDistricts');
    }
});


// [POST] /api/auth/register
apiRouter.post('/auth/register', async (req, res) => {
  const { fullName, email, phone, password, gender, dob } = req.body;
  if (!fullName || !email || !phone || !password || !gender || !dob) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const userId = uuidv4();
    const newUser = { id: userId, fullName, email, phone, password, gender, dob, role: 'USER' };

    await dbPool.query(
      'INSERT INTO users (id, fullName, email, phone, password, gender, dob, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newUser.id, newUser.fullName, newUser.email, newUser.phone, newUser.password, newUser.gender, newUser.dob, newUser.role]
    );

    const { password: _, ...userToReturn } = newUser;
    res.status(201).json(userToReturn);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A user with this email or phone number already exists.' });
    }
    handleDBError(res, error, 'registration');
  }
});

// [POST] /api/auth/login
apiRouter.post('/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ message: 'Phone and password are required.' });
  }

  try {
    const [rows] = await dbPool.query('SELECT * FROM users WHERE phone = ?', [phone]);
    const user = rows[0];

    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Invalid phone number or password.' });
    }
    if (user.password === null) {
      return res.status(401).json({ message: 'This account uses OTP login. Please use the "Login with OTP" option.' });
    }

    if (user.role === 'SUB_ADMIN') {
        const [districtRows] = await dbPool.query('SELECT district FROM subadmindistricts WHERE userId = ?', [user.id]);
        user.assignedDistricts = districtRows.map(r => r.district);
    }

    const { password: _, ...userToReturn } = user;
    res.json(userToReturn);
  } catch (error) {
    handleDBError(res, error, 'login');
  }
});

// [POST] /api/auth/send-otp
apiRouter.post('/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ message: 'Phone number is required.' });
    }

    try {
        // Fetch both password and registration number to make a decision
        const [rows] = await dbPool.query('SELECT password, govtExamRegistrationNumber FROM users WHERE phone = ?', [phone]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'No account found with this phone number.' });
        }
        
        const user = rows[0];

        // Block OTP login ONLY if the user has a password AND is NOT a govt beneficiary.
        // Beneficiaries should be able to use OTP regardless of password status.
        if (user.password !== null && !user.govtExamRegistrationNumber) {
            return res.status(400).json({ message: 'This account uses a password. Please use the standard login.' });
        }
        
        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000; // 5 minutes validity

        // Store OTP (in-memory for this project)
        otpStore[phone] = { otp, expires };
        console.log(`OTP for ${phone}: ${otp}`); // Log for simulation

        // In a real app, you would use an SMS gateway here.
        // For this project, we return the OTP in the response for the user to see and enter.
        res.json({ message: 'OTP has been generated.', otp });
    } catch (error) {
        handleDBError(res, error, 'sendOtp');
    }
});

// [POST] /api/auth/verify-otp
apiRouter.post('/auth/verify-otp', async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
        return res.status(400).json({ message: 'Phone and OTP are required.' });
    }

    const storedOtpData = otpStore[phone];
    if (!storedOtpData || storedOtpData.otp !== otp) {
        return res.status(401).json({ message: 'Invalid OTP.' });
    }
    if (Date.now() > storedOtpData.expires) {
        delete otpStore[phone];
        return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // OTP is valid, fetch user and log them in
    try {
        const [rows] = await dbPool.query('SELECT * FROM users WHERE phone = ?', [phone]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found after OTP verification.' });
        }

        delete otpStore[phone]; // Clean up used OTP
        const { password: _, ...userToReturn } = user;
        res.json(userToReturn);

    } catch (error) {
        handleDBError(res, error, 'verifyOtpLogin');
    }
});


// --- Settings Routes (Admin) ---
// In a real app, these should be protected by an admin-only middleware.

// [GET] /api/settings/:key
apiRouter.get('/settings/:key', async (req, res) => {
    try {
        const [rows] = await dbPool.query("SELECT value FROM settings WHERE `key` = ?", [req.params.key]);
        if (rows.length > 0) {
            res.json({ key: req.params.key, value: rows[0].value === 'true' });
        } else {
            // If setting doesn't exist, create it with a default of 'false'
            if (['isFreeBookingEnabled', 'isBookingSystemOnline', 'isDiscountSystemEnabled'].includes(req.params.key)) {
                await dbPool.query("INSERT INTO settings (`key`, `value`) VALUES (?, ?)", [req.params.key, 'false']);
                res.json({ key: req.params.key, value: false });
            } else {
                res.status(404).json({ message: 'Setting not found.' });
            }
        }
    } catch (error) {
        handleDBError(res, error, 'getSetting');
    }
});

// [PUT] /api/settings
apiRouter.put('/settings', async (req, res) => {
    const { key, value } = req.body;
    // Loosen validation: check for presence, not just boolean type.
    if (!key || value === undefined || value === null) {
        return res.status(400).json({ message: 'A key and value are required.' });
    }

    // Coerce the incoming value to a strict boolean, then to a string for the DB.
    // This handles `true`, `"true"`, `false`, and `"false"`.
    const booleanValue = String(value).toLowerCase() === 'true';

    try {
        const [result] = await dbPool.query(
            "INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
            [key, booleanValue.toString(), booleanValue.toString()]
        );
        
        res.status(200).json({ message: 'Setting updated successfully.' });
    } catch (error) {
        handleDBError(res, error, 'updateSetting');
    }
});

// --- Discount District Routes ---
apiRouter.get('/discounts/districts', async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT district_name FROM discounted_districts');
        res.json(rows.map(r => r.district_name));
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
             return res.json([]);
        }
        handleDBError(res, error, 'getDiscountedDistricts');
    }
});

apiRouter.put('/discounts/districts', async (req, res) => {
    const { districts } = req.body; // Expects an array of district names
    if (!Array.isArray(districts)) {
        return res.status(400).json({ message: 'Districts must be provided as an array.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Clear all existing discounted districts
        await connection.query('TRUNCATE TABLE discounted_districts');

        // Insert the new list of discounted districts, if any
        if (districts.length > 0) {
            const values = districts.map(district => [district]);
            await connection.query('INSERT INTO discounted_districts (district_name) VALUES ?', [values]);
        }
        
        await connection.commit();
        res.status(200).json({ message: 'Discount districts updated successfully.' });
    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'updateDiscountedDistricts');
    } finally {
        connection.release();
    }
});


// --- Schedule Routes (Ordered from most specific to most generic) ---

// [GET] /api/schedules
apiRouter.get('/schedules', async (req, res) => {
    const { userId } = req.query;
    try {
        let userRole = null;
        let assignedDistricts = [];

        if (userId) {
            const [userRows] = await dbPool.query('SELECT role FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) {
                userRole = userRows[0].role;
                if (userRole === 'SUB_ADMIN') {
                    const [districtRows] = await dbPool.query('SELECT district FROM subadmindistricts WHERE userId = ?', [userId]);
                    assignedDistricts = districtRows.map(r => r.district);
                }
            } else {
                return res.json([]); // Invalid user ID
            }
        }

        const schedulesMap = await fetchAndAssembleSchedules(dbPool);
        let allSchedules = Object.values(schedulesMap);

        let schedulesToReturn = allSchedules;

        if (userRole === 'SUB_ADMIN') {
            if (assignedDistricts.length === 0) {
                schedulesToReturn = [];
            } else {
                schedulesToReturn = allSchedules.filter(schedule =>
                    assignedDistricts.includes(schedule.origin)
                );
            }
        }

        const cleanedSchedules = schedulesToReturn.map(s => {
            const { fullRouteStops, fullNormalizedRoute, ...cleaned } = s;
            return cleaned;
        });

        res.json(cleanedSchedules);
    } catch (error) {
        handleDBError(res, error, 'getAllSchedules');
    }
});


// [POST] /api/schedules/batch-upload
apiRouter.post('/schedules/batch-upload', async (req, res) => {
    const { schedules, userId } = req.body;

    if (!userId || !Array.isArray(schedules) || schedules.length === 0) {
        return res.status(400).json({ message: 'User ID and a non-empty array of schedules are required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        // --- Authorization Check ---
        const [userRows] = await connection.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            connection.release();
            return res.status(404).json({ message: 'Uploader user not found.' });
        }
        const user = userRows[0];

        if (user.role === 'SUB_ADMIN') {
            const [districtRows] = await connection.query('SELECT district FROM subadmindistricts WHERE userId = ?', [userId]);
            const assignedDistricts = districtRows.map(r => r.district);
            
            if (assignedDistricts.length === 0) {
                connection.release();
                return res.status(403).json({ message: 'You have no districts assigned to you.' });
            }

            for (const schedule of schedules) {
                const originDistrict = schedule.stops?.[0]?.stopName;
                if (!originDistrict || !assignedDistricts.includes(originDistrict)) {
                    connection.release();
                    return res.status(403).json({ message: `You are not authorized to manage schedules for the district: '${originDistrict}'. Please upload schedules for your assigned districts only.` });
                }
            }
        }
        // Admins can proceed without district checks

        // --- Database Insertion ---
        await connection.beginTransaction();
        
        // This logic is critical to prevent NULL IDs in the routestops table.
        // 1. We lock the table to prevent other uploads from running at the same time and causing ID conflicts.
        // 2. We find the current highest ID. If the table is empty, we start from 0.
        // 3. We create a counter `nextStopId` that starts from `maxId + 1`.
        const [maxIdRows] = await connection.query('SELECT MAX(id) as maxId FROM routestops FOR UPDATE');
        let nextStopId = (maxIdRows[0]?.maxId || 0) + 1; // Start from the next available ID

        for (const schedule of schedules) {
            // If an ID is provided (from CSV or AI), use it. Otherwise, create a new unique ID.
            // This addresses the issue of inconsistent ID formats.
            const scheduleId = schedule.id || uuidv4();
            
            // Check if schedule ID already exists to prevent duplicates
            const [existingSchedule] = await connection.query('SELECT id FROM schedules WHERE id = ?', [scheduleId]);
            if (existingSchedule.length > 0) {
                await connection.rollback();
                connection.release();
                return res.status(409).json({ message: `A schedule with ID '${scheduleId}' already exists. Please use a unique scheduleIdentifier.` });
            }

            // Insert the main schedule record
            await connection.query(
                'INSERT INTO schedules (id, busName, seatLayout, bookingEnabled) VALUES (?, ?, ?, ?)',
                [String(schedule.busName), String(schedule.seatLayout), schedule.bookingEnabled ? '1' : '0']
            );

            // Loop through each stop for the current schedule
            for (let i = 0; i < schedule.stops.length; i++) {
                const stop = schedule.stops[i];
                // Use the counter for the stop's primary key `id`.
                // The order of parameters here MUST match the order of columns in the INSERT statement.
                await connection.query(
                    'INSERT INTO routestops (id, scheduleId, stopName, stopOrder, arrivalTime, departureTime, fare) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        nextStopId,           // id
                        scheduleId,           // scheduleId
                        stop.stopName,        // stopName
                        i,                    // stopOrder (using loop index for guaranteed sequence)
                        stop.arrivalTime,     // arrivalTime
                        stop.departureTime,   // departureTime
                        stop.fareFromOrigin   // fare
                    ]
                );
                // IMPORTANT: Increment the counter for the next stop to have a unique ID.
                nextStopId++;
            }
        }

        await connection.commit();
        res.status(201).json({ message: `${schedules.length} schedule(s) uploaded successfully.` });

    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'batchUploadSchedules');
    } finally {
        connection.release();
    }
});

// [PUT] /api/schedules/:id
apiRouter.put('/schedules/:id', async (req, res) => {
    const { id } = req.params;
    const { busName, seatLayout, bookingEnabled, userId, stops } = req.body;

    // Validate required fields
    if (!busName || !seatLayout || typeof bookingEnabled !== 'boolean' || !userId) {
        return res.status(400).json({ message: 'Missing required schedule details.' });
    }
    if (stops && (!Array.isArray(stops) || stops.length === 0)) {
        return res.status(400).json({ message: 'Stops data, if provided, must be a non-empty array.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        // --- Authorization ---
        const [userRows] = await connection.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'User not found.' });
        }
        const user = userRows[0];
        
        if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
             await connection.rollback();
             return res.status(403).json({ message: 'You are not authorized to perform this action.' });
        }

        if (user.role === 'SUB_ADMIN') {
            const [districtRows] = await connection.query('SELECT district FROM subadmindistricts WHERE userId = ?', [userId]);
            const assignedDistricts = districtRows.map(r => r.district);

            // If stops are being updated, we check the NEW origin district.
            // This prevents a sub-admin from changing a route to a district they don't own.
            const newOriginDistrict = stops?.[0]?.stopName;
            if (!newOriginDistrict) {
                 await connection.rollback();
                 return res.status(400).json({ message: 'An updated route must have a valid origin stop.' });
            }

            if (!assignedDistricts.includes(newOriginDistrict)) {
                await connection.rollback();
                return res.status(403).json({ message: 'You are not authorized to manage schedules for this district.' });
            }
        }
        // Admin can edit any schedule.

        // --- Update basic schedule details ---
        const [result] = await connection.query(
            'UPDATE schedules SET busName = ?, seatLayout = ?, bookingEnabled = ? WHERE id = ?',
            [busName, seatLayout, bookingEnabled ? '1' : '0', id]
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        
        // --- Replace route stops if provided ---
        if (stops) {
            // Delete old stops for this schedule
            await connection.query('DELETE FROM routestops WHERE scheduleId = ?', [id]);

            // Get the next available primary key ID for routestops to prevent collisions
            const [maxIdRows] = await connection.query('SELECT MAX(id) as maxId FROM routestops FOR UPDATE');
            let nextStopId = (maxIdRows[0]?.maxId || 0) + 1;

            // Insert new stops in the provided order
            for (let i = 0; i < stops.length; i++) {
                const stop = stops[i];
                await connection.query(
                    'INSERT INTO routestops (id, scheduleId, stopName, stopOrder, arrivalTime, departureTime, fare) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        nextStopId++,
                        id,
                        stop.stopName,
                        i, // The array index from the client dictates the new stop order
                        stop.arrivalTime || null,
                        stop.departureTime,
                        stop.fareFromOrigin,
                    ]
                );
            }
        }
        
        await connection.commit();
        
        // Return the full, updated schedule object
        const schedulesMap = await fetchAndAssembleSchedules(connection, id);
        res.status(200).json(schedulesMap[id]);

    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'updateSchedule');
    } finally {
        connection.release();
    }
});


// [GET] /api/schedules/route
apiRouter.get('/schedules/route', async (req, res) => {
  const { origin, destination } = req.query;
  if (!origin || !destination) {
    return res.status(400).json({ message: 'Origin and destination are required.' });
  }

  try {
    const schedulesMap = await fetchAndAssembleSchedules(dbPool);
    const systemSettings = await getSettings(dbPool);
    const isBookingOnline = systemSettings.isBookingSystemOnline === true;

    const searchOrigin = origin.trim().toLowerCase();
    const searchDestination = destination.trim().toLowerCase();

    const matchedSchedules = Object.values(schedulesMap).reduce((acc, schedule) => {
      if (!Array.isArray(schedule.fullRouteStops)) return acc;

      const originIndex = schedule.fullRouteStops.findIndex(
        s => s.normalizedName === searchOrigin
      );
      const destIndex = schedule.fullRouteStops.findIndex(
        s => s.normalizedName === searchDestination
      );

      if (originIndex > -1 && destIndex > -1 && originIndex < destIndex) {
        const originStop = schedule.fullRouteStops[originIndex];
        const destStop = schedule.fullRouteStops[destIndex];

        const fare = Number(destStop.fare || 0) - Number(originStop.fare || 0);
        const viaStops = schedule.fullRouteStops.slice(originIndex + 1, destIndex)
          .map(s => s.name || s.stopName || '');

        const fullRouteStops = [...schedule.fullRouteStops].sort((a, b) => a.stopOrder - b.stopOrder);
        const fullRouteStart = fullRouteStops[0]?.name || 'Unknown';
        const fullRouteEnd = fullRouteStops.at(-1)?.name || 'Unknown';

        acc.push({
          id: schedule.id,
          busName: schedule.busName,
          seatLayout: schedule.seatLayout,
          bookingEnabled: isBookingOnline && schedule.bookingEnabled,
          isFreeBookingEnabled: schedule.isFreeBookingEnabled,
          isDiscountEnabled: schedule.isDiscountEnabled,
          userOrigin: origin.trim(),
          userDestination: destination.trim(),
          fullRoute: `${fullRouteStart} to ${fullRouteEnd}`,
          departureTime: formatTime(originStop.departure),
          arrivalTime: formatTime(destStop.arrival),
          fare: Math.max(0, fare),
          via: viaStops,
        });
      }

      return acc;
    }, []);

    res.json(matchedSchedules);
  } catch (error) {
    handleDBError(res, error, 'getSchedulesByRoute');
  }
});


// [GET] /api/schedules/district/:district
apiRouter.get('/schedules/district/:district', async (req, res) => {
  const { district } = req.params;
  if (!district) {
    return res.status(400).json({ message: 'District is required.' });
  }

  try {
    const schedulesMap = await fetchAndAssembleSchedules(dbPool);
    const systemSettings = await getSettings(dbPool);
    const isBookingOnline = systemSettings.isBookingSystemOnline === true;
    const searchDistrict = district.trim().toLowerCase();

    const matchedSchedules = Object.values(schedulesMap).reduce((acc, schedule) => {
      if (!Array.isArray(schedule.fullRouteStops)) return acc;

      const sortedStops = [...schedule.fullRouteStops].sort((a, b) => a.stopOrder - b.stopOrder);
      const firstStop = sortedStops[0];
      const lastStop = sortedStops.at(-1);

      if (!firstStop || firstStop.normalizedName !== searchDistrict) return acc;

      acc.push({
        id: schedule.id,
        routeId: schedule.id,
        busName: schedule.busName,
        seatLayout: schedule.seatLayout,
        bookingEnabled: isBookingOnline && schedule.bookingEnabled,
        isFreeBookingEnabled: schedule.isFreeBookingEnabled,
        isDiscountEnabled: schedule.isDiscountEnabled,
        fullRoute: `${firstStop.name} to ${lastStop?.name || 'Unknown'}`,
        departureTime: formatTime(firstStop.departure),
        arrivalTime: formatTime(lastStop?.arrival),
        fare: Number(lastStop?.fare || 0),
        via: sortedStops.slice(1, -1).map(stop => stop.name || stop.stopName || ''),
      });

      return acc;
    }, []);

    res.json(matchedSchedules);
  } catch (error) {
    console.error('Error in /schedules/district/:district:', error);
    handleDBError(res, error, 'getSchedulesByDistrict');
  }
});


// [GET] /api/schedules/:id
apiRouter.get('/schedules/:id', async (req, res) => {
  try {
    const schedulesMap = await fetchAndAssembleSchedules(dbPool, req.params.id);
    const schedule = schedulesMap[req.params.id];

    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found.' });
    }
    
    // Return the full schedule object, including the detailed stops array
    res.json(schedule);
  } catch (error) {
    handleDBError(res, error, 'getScheduleById');
  }
});


// --- Booking Routes ---

// [GET] /api/bookings/user/:userId
apiRouter.get('/bookings/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await dbPool.query(
      `SELECT 
         b.id AS bookingId,
         b.scheduleId,
         b.fare,
         b.isFreeTicket,
         b.govtExamRegistrationNumber,
         b.bookingDate,
         b.origin,
         b.destination,
         b.discountType,
         b.aadhaarNumber,
         bs.seatId
       FROM bookings b
       LEFT JOIN bookedseats bs ON b.id = bs.bookingId
       WHERE b.userId = ?
       ORDER BY b.bookingDate DESC`,
      [userId]
    );

    // Group seatIds by bookingId
    const bookingsMap = {};
    for (const row of rows) {
      if (!bookingsMap[row.bookingId]) {
        bookingsMap[row.bookingId] = {
          id: row.bookingId,
          scheduleId: row.scheduleId,
          fare: Number(row.fare) || 0,
          isFreeTicket: row.isFreeTicket,
          govtExamRegistrationNumber: row.govtExamRegistrationNumber,
          bookingDate: row.bookingDate,
          origin: row.origin,
          destination: row.destination,
          discountType: row.discountType,
          aadhaarNumber: row.aadhaarNumber,
          seatIds: [],
        };
      }
      if (row.seatId) {
        bookingsMap[row.bookingId].seatIds.push(row.seatId);
      }
    }

    const bookings = Object.values(bookingsMap);
    res.status(200).json(bookings);
  } catch (error) {
    handleDBError(res, error, 'getUserBookingsWithSeats');
  }
});

// [GET] /api/bookings/seats/:scheduleId
apiRouter.get('/bookings/seats/:scheduleId', async (req, res) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT bs.seatId FROM bookedseats bs 
       JOIN bookings b ON bs.bookingId = b.id 
       WHERE b.scheduleId = ?`,
      [req.params.scheduleId]
    );
    res.json(rows.map(row => row.seatId));
  } catch (error) {
    handleDBError(res, error, 'getBookedSeats');
  }
});

// [POST] /api/bookings/free
apiRouter.post('/bookings/free', async (req, res) => {
    const { userId, scheduleId, seatIds, origin, destination, registrationNumber, phone } = req.body;

    if (!userId || !scheduleId || !Array.isArray(seatIds) || seatIds.length === 0 || !origin || !destination || !registrationNumber || !phone) {
        return res.status(400).json({ message: 'All booking and verification fields are required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const [settingsRows] = await connection.query("SELECT `value` FROM settings WHERE `key` = 'isFreeBookingEnabled'");
        const isFreeBookingEnabled = settingsRows.length > 0 && settingsRows[0].value === 'true';

        if (!isFreeBookingEnabled) {
            await connection.rollback();
            return res.status(403).json({ message: 'Free booking is currently disabled by the administrator.' });
        }
        
        const [beneficiaryRows] = await connection.query(
            "SELECT * FROM govtbeneficiaries WHERE govtExamRegistrationNumber = ? AND phone = ? FOR UPDATE",
            [registrationNumber, phone]
        );

        if (beneficiaryRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Mismatch/Invalid: Registration number or phone did not match.' });
        }

        const beneficiary = beneficiaryRows[0];
        if (beneficiary.ticketClaimed) {
            await connection.rollback();
            return res.status(409).json({ message: 'This beneficiary has already claimed their free ticket.' });
        }
        
        const bookingId = uuidv4();
        await connection.query(
          'INSERT INTO bookings (id, userId, scheduleId, fare, origin, destination, isFreeTicket, govtExamRegistrationNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [bookingId, userId, scheduleId, 0, origin, destination, true, registrationNumber]
        );


        const seatInsertPromises = seatIds.map(seatId =>
            connection.query('INSERT INTO bookedseats (bookingId, seatId, origin, destination) VALUES (?, ?, ?, ?)', [bookingId, seatId, origin, destination])
        );
        await Promise.all(seatInsertPromises);
        
        // Mark the ticket as claimed in the beneficiaries table
        await connection.query(
            "UPDATE govtbeneficiaries SET ticketClaimed = 1 WHERE id = ?",
            [beneficiary.id]
        );
        
        // Also update the user's registration number if it's not already set
        await connection.query(
            "UPDATE users SET govtExamRegistrationNumber = ? WHERE id = ? AND govtExamRegistrationNumber IS NULL",
            [registrationNumber, userId]
        );

        await connection.commit();
        res.status(201).json({ bookingId });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_TABLE_NOT_FOUND' && error.message.includes('govtbeneficiaries')) {
            return res.status(500).json({ message: 'The free booking system is not fully configured. Please contact the administrator.' });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'One or more selected seats have just been booked. Please refresh and try again.' });
        }
        console.error('Free Booking Error:', error);
        handleDBError(res, error, 'createFreeBooking');
    } finally {
        connection.release();
    }
});


// [POST] /api/bookings
apiRouter.post("/bookings", async (req, res) => {
    const { userId, scheduleId, seatIds, origin, destination, farePerSeat, discountType, aadhaarNumber } = req.body;

    if (!userId || !scheduleId || !Array.isArray(seatIds) || seatIds.length === 0 || !origin || !destination || typeof farePerSeat !== 'number') {
        return res.status(400).json({ message: 'Missing or invalid required booking information.' });
    }
    
    if (discountType && discountType !== 'NONE' && (!aadhaarNumber || aadhaarNumber.length !== 12)) {
        return res.status(400).json({ message: 'A valid 12-digit Aadhaar number is required for discounted tickets.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const bookingId = uuidv4();
        const totalFare = seatIds.length * farePerSeat;
        const bookingDate = new Date();

        await connection.execute(
            `INSERT INTO bookings (id, userId, scheduleId, fare, bookingDate, isFreeTicket, origin, destination, discountType, aadhaarNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [bookingId, userId, scheduleId, totalFare, bookingDate, false, origin, destination, discountType || 'NONE', aadhaarNumber || null]
        );

        const seatInsertPromises = seatIds.map(seatId =>
            connection.execute(
                `INSERT INTO bookedseats (bookingId, seatId, origin, destination) VALUES (?, ?, ?, ?)`,
                [bookingId, seatId, origin, destination]
            )
        );
        await Promise.all(seatInsertPromises);

        await connection.commit();
        res.status(201).json({ bookingId });
    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'One or more selected seats were just booked. Please refresh and try again.' });
        }
        handleDBError(res, err, 'createBooking');
    } finally {
        connection.release();
    }
});


// [GET] /api/tracking/:busId
apiRouter.get('/tracking/:busId', async (req, res) => {
  const schedulesMap = await fetchAndAssembleSchedules(dbPool, req.params.busId);
  const schedule = schedulesMap[req.params.busId];
  
  res.json({
    busId: req.params.busId,
    lat: 28.8955,
    lng: 76.6066,
    lastUpdated: new Date().toISOString(),
    route: schedule ? schedule.fullRouteStops.map((_, i) => ({ lat: 28.8 + i*0.1, lng: 76.6 + i*0.1 })) : [] 
  });
});

// --- User Management Routes (Admin) ---

// [PUT] /api/users/profile/:id - For a user to update their own profile
apiRouter.put('/users/profile/:id', async (req, res) => {
    const { id } = req.params;
    const { fullName, email, phone, gender, password, dob } = req.body;

    if (!id) {
        return res.status(400).json({ message: 'User ID is required.' });
    }
    
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        const fieldsToUpdate = { fullName, email, phone, gender, dob };
        let sql = 'UPDATE users SET ';
        const params = [];
        
        Object.keys(fieldsToUpdate).forEach((key) => {
            if (fieldsToUpdate[key] !== undefined) {
                if (params.length > 0) sql += ', ';
                sql += `\`${key}\` = ?`;
                params.push(fieldsToUpdate[key]);
            }
        });

        if (password) {
            if (params.length > 0) sql += ', ';
            sql += '`password` = ?';
            params.push(password);
        }

        if (params.length === 0) {
            connection.release();
            return res.status(400).json({ message: 'No fields to update.' });
        }

        sql += ' WHERE id = ?';
        params.push(id);

        await connection.query(sql, params);

        // If phone number was changed, sync it to the govtbeneficiaries table
        if (phone) {
            await connection.query(
                `UPDATE govtbeneficiaries gb
                 JOIN users u ON gb.govtExamRegistrationNumber = u.govtExamRegistrationNumber
                 SET gb.phone = ?
                 WHERE u.id = ?`,
                 [phone, id]
            );
        }

        await connection.commit();

        // Fetch and return the updated user data (without password)
        const [rows] = await connection.query('SELECT * FROM users WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found after update.' });
        }
        const { password: _, ...updatedUser } = rows[0];

        res.status(200).json(updatedUser);

    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email or phone number already in use.' });
        }
        handleDBError(res, error, 'updateUserProfile');
    } finally {
        if (connection) connection.release();
    }
});

// [POST] /api/users/bulk-beneficiaries - For an admin to create multiple beneficiary users
apiRouter.post('/users/bulk-beneficiaries', async (req, res) => {
    const { beneficiaries, adminId } = req.body;
    
    if (!adminId) {
        return res.status(403).json({ message: 'Admin authentication is required.' });
    }
    if (!Array.isArray(beneficiaries) || beneficiaries.length === 0) {
        return res.status(400).json({ message: 'A non-empty array of beneficiaries is required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        // --- Authorization Check ---
        const [adminRows] = await connection.query('SELECT role FROM users WHERE id = ?', [adminId]);
        if (adminRows.length === 0 || adminRows[0].role !== 'ADMIN') {
            connection.release();
            return res.status(403).json({ message: 'Permission denied. This action is for administrators only.' });
        }

        await connection.beginTransaction();

        let createdCount = 0;
        let skippedCount = 0;
        
        for (const bene of beneficiaries) {
            const { govtExamRegistrationNumber, phone, fullName, email, dob } = bene;

            // Basic validation for each record
            if (!govtExamRegistrationNumber || !phone || !fullName) {
                console.log('Skipping invalid record:', bene);
                skippedCount++;
                continue;
            }

            // Check if user already exists
            const [existingUser] = await connection.query('SELECT id FROM users WHERE phone = ? OR govtExamRegistrationNumber = ?', [phone, govtExamRegistrationNumber]);
            if (existingUser.length > 0) {
                console.log(`Skipping existing user: phone=${phone}, regNo=${govtExamRegistrationNumber}`);
                skippedCount++;
                continue;
            }
            
            const userId = uuidv4();
            // Insert into users table with NULL password
            await connection.query(
                `INSERT INTO users (id, fullName, email, phone, password, role, govtExamRegistrationNumber, isFreeTicketEligible, dob) VALUES (?, ?, ?, ?, NULL, 'USER', ?, 1, ?)`,
                [userId, fullName, email || null, phone, govtExamRegistrationNumber, dob || null]
            );

            // Insert into govtbeneficiaries table, or update if it exists
            await connection.query(
                `INSERT INTO govtbeneficiaries (id, govtExamRegistrationNumber, phone, ticketClaimed) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE phone = VALUES(phone)`,
                [uuidv4(), govtExamRegistrationNumber, phone]
            );

            createdCount++;
        }

        await connection.commit();
        res.status(201).json({ 
            message: 'Bulk user creation process completed.',
            created: createdCount,
            skipped: skippedCount
        });

    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'bulkCreateBeneficiaries');
    } finally {
        connection.release();
    }
});


// [GET] /api/users
apiRouter.get('/users', async (req, res) => {
    try {
        const [users] = await dbPool.query("SELECT id, fullName, email, phone, role FROM users ORDER BY role, fullName");
        const [subAdminDistricts] = await dbPool.query("SELECT userId, district FROM subadmindistricts");

        const districtsMap = subAdminDistricts.reduce((acc, row) => {
            if (!acc[row.userId]) {
                acc[row.userId] = [];
            }
            acc[row.userId].push(row.district);
            return acc;
        }, {});

        const usersWithDistricts = users.map(user => ({
            ...user,
            assignedDistricts: user.role === 'SUB_ADMIN' ? (districtsMap[user.id] || []) : undefined,
        }));
        
        res.json(usersWithDistricts);
    } catch (error) {
        handleDBError(res, error, 'getUsers');
    }
});

// [POST] /api/users/subadmin
apiRouter.post('/users/subadmin', async (req, res) => {
    const { fullName, email, phone, password, assignedDistricts } = req.body;
    if (!fullName || !phone || !password || !Array.isArray(assignedDistricts)) {
        return res.status(400).json({ message: 'Full name, phone, password, and assigned districts are required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        
        const userId = uuidv4();
        const newUser = { id: userId, fullName, email, phone, password, role: 'SUB_ADMIN' };

        await connection.query(
          'INSERT INTO users (id, fullName, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)',
          [newUser.id, newUser.fullName, newUser.email, newUser.phone, newUser.password, newUser.role]
        );

        if (assignedDistricts.length > 0) {
            const districtInsertPromises = assignedDistricts.map(district =>
                connection.query('INSERT INTO subadmindistricts (userId, district) VALUES (?, ?)', [userId, district])
            );
            await Promise.all(districtInsertPromises);
        }

        await connection.commit();
        
        const { password: _, ...userToReturn } = newUser;
        userToReturn.assignedDistricts = assignedDistricts;
        res.status(201).json(userToReturn);
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'A user with this email or phone number already exists.' });
        }
        handleDBError(res, error, 'createSubAdmin');
    } finally {
        connection.release();
    }
});

// [PUT] /api/users/admin/:id - For an admin to update any user's profile
apiRouter.put('/users/admin/:id', async (req, res) => {
    const { id } = req.params; // user to edit
    const { adminId, ...updateData } = req.body;

    if (!adminId) {
        return res.status(403).json({ message: 'Admin authentication is required.' });
    }

    let connection;
    try {
        connection = await dbPool.getConnection();
        await connection.beginTransaction();

        // --- Authorization Check ---
        const [adminRows] = await connection.query('SELECT role FROM users WHERE id = ?', [adminId]);
        if (adminRows.length === 0 || adminRows[0].role !== 'ADMIN') {
            await connection.rollback();
            return res.status(403).json({ message: 'Permission denied. This action is for administrators only.' });
        }
        
        const { fullName, email, phone, gender, password, dob } = updateData;

        // Dynamic query building
        const fieldsToUpdate = { fullName, email, phone, gender, dob };
        let sql = 'UPDATE users SET ';
        const params = [];
        
        Object.keys(fieldsToUpdate).forEach((key) => {
            if (fieldsToUpdate[key] !== undefined && fieldsToUpdate[key] !== null) {
                if (params.length > 0) sql += ', ';
                sql += `\`${key}\` = ?`;
                params.push(fieldsToUpdate[key]);
            }
        });

        if (password) {
            if (params.length > 0) sql += ', ';
            sql += '`password` = ?';
            params.push(password);
        }

        if (params.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'No fields to update.' });
        }

        sql += ' WHERE id = ?';
        params.push(id);
        
        const [result] = await connection.query(sql, params);
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'User to update not found.' });
        }

        // Sync phone number to govtbeneficiaries if changed
        if (phone) {
            await connection.query(
                `UPDATE govtbeneficiaries gb
                 JOIN users u ON gb.govtExamRegistrationNumber = u.govtExamRegistrationNumber
                 SET gb.phone = ?
                 WHERE u.id = ?`,
                 [phone, id]
            );
        }

        await connection.commit();
        
        // Fetch and return updated user
        const [rows] = await connection.query('SELECT * FROM users WHERE id = ?', [id]);
        if (rows.length === 0) {
             return res.status(404).json({ message: 'User not found after update.' });
        }
        const { password: _, ...userToReturn } = rows[0];

        res.status(200).json(userToReturn);

    } catch (error) {
        if(connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email or phone number already in use by another account.' });
        }
        handleDBError(res, error, 'adminUpdateUser');
    } finally {
        if (connection) connection.release();
    }
});


// [PUT] /api/users/subadmin/:id
apiRouter.put('/users/subadmin/:id', async (req, res) => {
    const { id } = req.params;
    const { fullName, email, phone, password, gender, dob, assignedDistricts } = req.body;

    if (!fullName || !phone || !Array.isArray(assignedDistricts)) {
        return res.status(400).json({ message: 'Full name, phone, and assigned districts are required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        // Build the user update query dynamically
        const userFields = { fullName, email, phone, gender, dob };
        const userUpdateParts = [];
        const userParams = [];

        for (const [key, value] of Object.entries(userFields)) {
            if (value !== undefined) {
                userUpdateParts.push(`\`${key}\` = ?`);
                userParams.push(value);
            }
        }
        if (password) {
            userUpdateParts.push('`password` = ?');
            userParams.push(password);
        }
        
        if (userUpdateParts.length > 0) {
            const userUpdateSql = `UPDATE users SET ${userUpdateParts.join(', ')} WHERE id = ?`;
            userParams.push(id);
            await connection.query(userUpdateSql, userParams);
        }

        // If phone number was changed, sync it to the govtbeneficiaries table
        if (phone) {
             await connection.query(
                `UPDATE govtbeneficiaries gb
                 JOIN users u ON gb.govtExamRegistrationNumber = u.govtExamRegistrationNumber
                 SET gb.phone = ?
                 WHERE u.id = ?`,
                 [phone, id]
            );
        }
        
        // Resync assigned districts
        await connection.query('DELETE FROM subadmindistricts WHERE userId = ?', [id]);
        if (assignedDistricts.length > 0) {
            const districtInsertPromises = assignedDistricts.map(district =>
                connection.query('INSERT INTO subadmindistricts (userId, district) VALUES (?, ?)', [id, district])
            );
            await Promise.all(districtInsertPromises);
        }

        await connection.commit();
        res.status(200).json({ message: 'Sub-admin updated successfully.' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email or phone number already in use.' });
        }
        handleDBError(res, error, 'updateSubAdmin');
    } finally {
        connection.release();
    }
});


// [DELETE] /api/users/:id
apiRouter.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        const [users] = await connection.query('SELECT role FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'User not found.' });
        }
        if (users[0].role !== 'SUB_ADMIN') {
            await connection.rollback();
            return res.status(403).json({ message: 'Only sub-admin accounts can be deleted.' });
        }
        
        await connection.query('DELETE FROM subadmindistricts WHERE userId = ?', [id]);
        await connection.query('DELETE FROM users WHERE id = ?', [id]);

        await connection.commit();
        res.status(204).send();
    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'deleteUser');
    } finally {
        connection.release();
    }
});

// [GET] /api/analytics/revenue
apiRouter.get('/analytics/revenue', async (req, res) => {
    const { userId } = req.query;
    let assignedDistricts = [];
    const queryParams = [];

    try {
        // Fetch assigned districts for sub-admins
        if (userId) {
            const [districtRows] = await dbPool.query(
                'SELECT district FROM subadmindistricts WHERE userId = ?',
                [userId]
            );
            assignedDistricts = districtRows.map(r => r.district);

            if (assignedDistricts.length === 0) {
                return res.json({
                    summary: { totalRevenue: 0, totalPaidBookings: 0, totalFreeTickets: 0, totalBookings: 0 },
                    byDistrict: [],
                    byRoute: [],
                });
            }
        }

        // --- District-level aggregation ---
        let districtQuery = `
            SELECT
                rs.stopName AS district,
                SUM(b.fare) AS revenue,
                SUM(CASE WHEN b.isFreeTicket = 0 THEN 1 ELSE 0 END) AS paidBookings,
                SUM(CASE WHEN b.isFreeTicket = 1 THEN 1 ELSE 0 END) AS freeTickets
            FROM bookings b
            JOIN routestops rs ON b.scheduleId = rs.scheduleId
            WHERE rs.stopOrder = 0 AND rs.stopName IS NOT NULL AND TRIM(rs.stopName) <> ''
        `;

        if (assignedDistricts.length > 0) {
            districtQuery += ` AND rs.stopName IN (?)`;
            queryParams.push(assignedDistricts);
        }

        districtQuery += ` GROUP BY rs.stopName ORDER BY revenue DESC`;

        const [districtData] = await dbPool.query(districtQuery, queryParams);

        const byDistrict = districtData.map(d => {
            const paid = parseInt(d.paidBookings, 10) || 0;
            const free = parseInt(d.freeTickets, 10) || 0;
            return {
                district: d.district,
                revenue: parseFloat(d.revenue) || 0,
                paidBookings: paid,
                freeTickets: free,
                totalBookings: paid + free,
            };
        });

        // --- Summary ---
        const summary = byDistrict.reduce((acc, item) => {
            acc.totalRevenue += item.revenue;
            acc.totalPaidBookings += item.paidBookings;
            acc.totalFreeTickets += item.freeTickets;
            acc.totalBookings += item.totalBookings;
            return acc;
        }, {
            totalRevenue: 0,
            totalPaidBookings: 0,
            totalFreeTickets: 0,
            totalBookings: 0
        });

        const responsePayload = { summary, byDistrict };

        // --- Route-level aggregation if sub-admin ---
        if (assignedDistricts.length > 0) {
            const routeQuery = `
                SELECT
                    b.scheduleId,
                    s.busName,
                    (SELECT stopName FROM routestops WHERE scheduleId = b.scheduleId AND stopOrder = 0 LIMIT 1) AS origin,
                    (SELECT stopName FROM routestops WHERE scheduleId = b.scheduleId ORDER BY stopOrder DESC LIMIT 1) AS destination,
                    SUM(b.fare) AS revenue,
                    COUNT(b.id) AS totalBookings
                FROM bookings b
                JOIN schedules s ON b.scheduleId = s.id
                WHERE (
                    SELECT stopName
                    FROM routestops
                    WHERE scheduleId = b.scheduleId AND stopOrder = 0 LIMIT 1
                ) IN (?)
                GROUP BY b.scheduleId, s.busName
                ORDER BY revenue DESC
            `;

            const [routeData] = await dbPool.query(routeQuery, [assignedDistricts]);

            responsePayload.byRoute = routeData.map(r => ({
                ...r,
                revenue: parseFloat(r.revenue) || 0,
                totalBookings: parseInt(r.totalBookings, 10) || 0
            }));
        }

        res.json(responsePayload);

    } catch (error) {
        handleDBError(res, error, 'getRevenueAnalytics');
    }
});


app.use('/api', apiRouter);

// --- Server Startup ---
app.listen(port, async () => {
  try {
    const connection = await dbPool.getConnection();
    console.log('Successfully connected to the database.');
    connection.release();
    console.log(`Backend server running on http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to connect to the database on startup:', error.message);
    process.exit(1);
  }
});
