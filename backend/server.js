

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

// --- Authentication Middleware ---
const authenticate = async (req, res, next) => {
  const token = req.headers['x-auth-token'];
  if (!token) {
    return next(); // No token, proceed as anonymous user
  }

  try {
    const [rows] = await dbPool.query('SELECT * FROM users WHERE id = ?', [token]);
    if (rows.length === 0) {
        return next(); // Invalid token
    }
    
    const user = rows[0];
    // For Sub-Admins, fetch their assigned districts and attach to the user object
    if (user.role === 'SUB_ADMIN') {
        const [districtRows] = await dbPool.query('SELECT district FROM subadmindistricts WHERE userId = ?', [user.id]);
        user.assignedDistricts = districtRows.map(r => r.district);
    }

    const { password, ...userToExpose } = user;
    req.user = userToExpose; // Attach user to the request object
    next();
  } catch (error) {
    // This is a server error, not an authentication failure
    console.error('Authentication middleware error:', error);
    next(error);
  }
};

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Permission denied. Administrator access required.' });
  }
  next();
};

const requireSubAdminOrAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUB_ADMIN')) {
    return res.status(403).json({ message: 'Permission denied. Administrator or Sub-Administrator access required.' });
  }
  next();
};

// --- Validation Constants ---
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const passwordHint = "Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).";


// --- API Routes ---
const apiRouter = express.Router();

// Public route for districts
apiRouter.get('/districts', async (req, res) => {
    try {
        const [rows] = await dbPool.query( 
            `SELECT DISTINCT stopName 
             FROM routestops 
             WHERE stopOrder = 0 
               AND stopName IS NOT NULL 
               AND TRIM(stopName) <> '' 
             ORDER BY stopName ASC`
        );
        const districts = rows.map(row => row.stopName);
        res.json(districts);
    } catch (error) {
        handleDBError(res, error, 'getDistricts');
    }
});

// Auth routes (public)
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
    res.json({ token: user.id, user: userToReturn });
  } catch (error) {
    handleDBError(res, error, 'login');
  }
});

apiRouter.post('/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ message: 'Phone number is required.' });
    }

    try {
        const [rows] = await dbPool.query('SELECT password, govtExamRegistrationNumber FROM users WHERE phone = ?', [phone]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'No account found with this phone number.' });
        }
        
        const user = rows[0];
        if (user.password !== null && !user.govtExamRegistrationNumber) {
            return res.status(400).json({ message: 'This account uses a password. Please use the standard login.' });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000;
        otpStore[phone] = { otp, expires };
        console.log(`OTP for ${phone}: ${otp}`);

        res.json({ message: 'OTP has been generated.', otp });
    } catch (error) {
        handleDBError(res, error, 'sendOtp');
    }
});

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

    try {
        const [rows] = await dbPool.query('SELECT * FROM users WHERE phone = ?', [phone]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found after OTP verification.' });
        }

        if (user.role === 'SUB_ADMIN') {
            const [districtRows] = await dbPool.query('SELECT district FROM subadmindistricts WHERE userId = ?', [user.id]);
            user.assignedDistricts = districtRows.map(r => r.district);
        }

        delete otpStore[phone];
        const { password: _, ...userToReturn } = user;
        res.json({ token: user.id, user: userToReturn });

    } catch (error) {
        handleDBError(res, error, 'verifyOtpLogin');
    }
});

// All subsequent routes will be authenticated
apiRouter.use(authenticate);

// --- Settings Routes ---
apiRouter.get('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const [rows] = await dbPool.query("SELECT value FROM settings WHERE `key` = ?", [key]);
        if (rows.length > 0) {
            res.json({ key: key, value: rows[0].value });
        } else {
            const defaultSettings = {
                isFreeBookingEnabled: 'false',
                isBookingSystemOnline: 'false',
                isDiscountSystemEnabled: 'false',
                isPassCardSystemEnabled: 'false',
                isCancellationEnabled: 'false',
                childDiscountPercentage: '40',
                seniorDiscountPercentage: '50'
            };
            if (key in defaultSettings) {
                const defaultValue = defaultSettings[key];
                await dbPool.query("INSERT INTO settings (`key`, `value`) VALUES (?, ?)", [key, defaultValue]);
                res.json({ key: key, value: defaultValue });
            } else {
                res.status(404).json({ message: 'Setting not found.' });
            }
        }
    } catch (error) {
        handleDBError(res, error, 'getSetting');
    }
});

apiRouter.put('/settings', requireAdmin, async (req, res) => {
    const { key, value } = req.body;
    if (!key || value === undefined || value === null) {
        return res.status(400).json({ message: 'A key and value are required.' });
    }
    
    const valueToStore = String(value);

    try {
        await dbPool.query(
            "INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
            [key, valueToStore, valueToStore]
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

apiRouter.put('/discounts/districts', requireAdmin, async (req, res) => {
    const { districts } = req.body;
    if (!Array.isArray(districts)) {
        return res.status(400).json({ message: 'Districts must be provided as an array.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('TRUNCATE TABLE discounted_districts');

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

// --- Schedule Routes ---
apiRouter.get('/schedules', async (req, res) => {
    const user = req.user;
    try {
        const schedulesMap = await fetchAndAssembleSchedules(dbPool);
        let allSchedules = Object.values(schedulesMap);
        let schedulesToReturn = allSchedules;

        if (user && user.role === 'SUB_ADMIN') {
            const assignedDistricts = user.assignedDistricts || [];
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

apiRouter.post('/schedules/batch-upload', requireSubAdminOrAdmin, async (req, res) => {
    const { schedules } = req.body;
    const user = req.user;

    if (!Array.isArray(schedules) || schedules.length === 0) {
        return res.status(400).json({ message: 'A non-empty array of schedules is required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        if (user.role === 'SUB_ADMIN') {
            const assignedDistricts = user.assignedDistricts || [];
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

        await connection.beginTransaction();
        const [maxIdRows] = await connection.query('SELECT MAX(id) as maxId FROM routestops FOR UPDATE');
        let nextStopId = (maxIdRows[0]?.maxId || 0) + 1;

        for (const schedule of schedules) {
            const scheduleId = schedule.id || uuidv4();
            const [existingSchedule] = await connection.query('SELECT id FROM schedules WHERE id = ?', [scheduleId]);
            if (existingSchedule.length > 0) {
                await connection.rollback();
                connection.release();
                return res.status(409).json({ message: `A schedule with ID '${scheduleId}' already exists. Please use a unique scheduleIdentifier.` });
            }

            await connection.query(
                'INSERT INTO schedules (id, busName, seatLayout, bookingEnabled) VALUES (?, ?, ?, ?)',
                [scheduleId, schedule.busName, schedule.seatLayout, schedule.bookingEnabled ? '1' : '0']
            );

            for (let i = 0; i < schedule.stops.length; i++) {
                const stop = schedule.stops[i];
                await connection.query(
                    'INSERT INTO routestops (id, scheduleId, stopName, stopOrder, arrivalTime, departureTime, fare) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [nextStopId++, scheduleId, stop.stopName, i, stop.arrivalTime || null, stop.departureTime, stop.fareFromOrigin]
                );
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

apiRouter.put('/schedules/:id', requireSubAdminOrAdmin, async (req, res) => {
    const { id } = req.params;
    const { busName, seatLayout, bookingEnabled, stops } = req.body;
    const user = req.user;

    if (!busName || !seatLayout || typeof bookingEnabled !== 'boolean' || !stops || !Array.isArray(stops) || stops.length === 0) {
        return res.status(400).json({ message: 'Missing required schedule details.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        if (user.role === 'SUB_ADMIN') {
            const assignedDistricts = user.assignedDistricts || [];
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

        const [result] = await connection.query(
            'UPDATE schedules SET busName = ?, seatLayout = ?, bookingEnabled = ? WHERE id = ?',
            [busName, seatLayout, bookingEnabled ? '1' : '0', id]
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        
        await connection.query('DELETE FROM routestops WHERE scheduleId = ?', [id]);
        const [maxIdRows] = await connection.query('SELECT MAX(id) as maxId FROM routestops FOR UPDATE');
        let nextStopId = (maxIdRows[0]?.maxId || 0) + 1;

        for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];
            await connection.query(
                'INSERT INTO routestops (id, scheduleId, stopName, stopOrder, arrivalTime, departureTime, fare) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [nextStopId++, id, stop.stopName, i, stop.arrivalTime || null, stop.departureTime, stop.fareFromOrigin]
            );
        }
        
        await connection.commit();
        const schedulesMap = await fetchAndAssembleSchedules(connection, id);
        res.status(200).json(schedulesMap[id]);

    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'updateSchedule');
    } finally {
        connection.release();
    }
});


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
      const originIndex = schedule.fullRouteStops.findIndex(s => s.normalizedName === searchOrigin);
      const destIndex = schedule.fullRouteStops.findIndex(s => s.normalizedName === searchDestination);

      if (originIndex > -1 && destIndex > -1 && originIndex < destIndex) {
        const originStop = schedule.fullRouteStops[originIndex];
        const destStop = schedule.fullRouteStops[destIndex];
        const fare = Number(destStop.fare || 0) - Number(originStop.fare || 0);
        const viaStops = schedule.fullRouteStops.slice(originIndex + 1, destIndex).map(s => s.name || s.stopName || '');
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


apiRouter.get('/schedules/:id', async (req, res) => {
  try {
    const schedulesMap = await fetchAndAssembleSchedules(dbPool, req.params.id);
    const schedule = schedulesMap[req.params.id];
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found.' });
    }
    res.json(schedule);
  } catch (error) {
    handleDBError(res, error, 'getScheduleById');
  }
});

// --- Booking Routes ---
apiRouter.get('/bookings/user/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (req.user.id !== userId) {
      return res.status(403).json({ message: 'Permission denied. You can only view your own bookings.' });
  }

  try {
    const [rows] = await dbPool.query(
      `SELECT b.id AS bookingId, b.scheduleId, b.fare, b.originalFare, b.status, b.isFreeTicket, b.govtExamRegistrationNumber, b.bookingDate, b.origin, b.destination, b.discountType, b.passengerDetails, bs.seatId
       FROM bookings b
       LEFT JOIN bookedseats bs ON b.id = bs.bookingId
       WHERE b.userId = ?
       ORDER BY b.bookingDate DESC`,
      [userId]
    );

    const bookingsMap = {};
    for (const row of rows) {
      if (!bookingsMap[row.bookingId]) {
        bookingsMap[row.bookingId] = {
          id: row.bookingId,
          scheduleId: row.scheduleId,
          fare: Number(row.fare || 0),
          originalFare: Number(row.originalFare || 0),
          status: row.status,
          isFreeTicket: row.isFreeTicket,
          govtExamRegistrationNumber: row.govtExamRegistrationNumber,
          bookingDate: row.bookingDate,
          origin: row.origin,
          destination: row.destination,
          discountType: row.discountType,
          passengerDetails: row.passengerDetails ? JSON.parse(row.passengerDetails) : [],
          seatIds: [],
        };
      }
      if (row.seatId) {
        bookingsMap[row.bookingId].seatIds.push(row.seatId);
      }
    }

    res.status(200).json(Object.values(bookingsMap));
  } catch (error) {
    handleDBError(res, error, 'getUserBookingsWithSeats');
  }
});

apiRouter.get('/bookings/seats/:scheduleId', async (req, res) => {
    const { scheduleId } = req.params;
    const { origin: userOrigin, destination: userDestination } = req.query;

    if (!userOrigin || !userDestination) {
        return res.status(400).json({ message: 'Origin and destination query parameters are required.' });
    }

    try {
        const schedulesMap = await fetchAndAssembleSchedules(dbPool, scheduleId);
        const schedule = schedulesMap[scheduleId];

        if (!schedule || !schedule.fullRouteStops) {
            return res.status(404).json({ message: 'Schedule not found or has no stops.' });
        }
        
        const stopOrderMap = schedule.fullRouteStops.reduce((acc, stop) => {
            acc[stop.normalizedName] = stop.order;
            return acc;
        }, {});

        const userOriginOrder = stopOrderMap[userOrigin.trim().toLowerCase()];
        const userDestinationOrder = stopOrderMap[userDestination.trim().toLowerCase()];

        if (userOriginOrder === undefined || userDestinationOrder === undefined || userOriginOrder >= userDestinationOrder) {
            return res.status(400).json({ message: 'Invalid origin or destination for this route.' });
        }
        
        // A bus trip is considered "current" if it was booked within the last 24 hours.
        // This simulates daily schedule resets without needing explicit dates on schedules,
        // fulfilling the requirement that seats reset after a trip is complete.
        const [bookedSegments] = await dbPool.query(
            `SELECT bs.seatId, b.origin, b.destination
             FROM bookedseats bs
             JOIN bookings b ON bs.bookingId = b.id
             WHERE b.scheduleId = ? AND b.bookingDate >= NOW() - INTERVAL 24 HOUR`,
            [scheduleId]
        );

        const unavailableSeats = new Set();
        for (const segment of bookedSegments) {
            const bookingOriginOrder = stopOrderMap[segment.origin.trim().toLowerCase()];
            const bookingDestinationOrder = stopOrderMap[segment.destination.trim().toLowerCase()];
            
            if (bookingOriginOrder === undefined || bookingDestinationOrder === undefined) {
                continue;
            }

            if (Math.max(userOriginOrder, bookingOriginOrder) < Math.min(userDestinationOrder, bookingDestinationOrder)) {
                 unavailableSeats.add(segment.seatId);
            }
        }
        
        res.json(Array.from(unavailableSeats));

    } catch (error) {
        handleDBError(res, error, 'getBookedSeatsForSegment');
    }
});

apiRouter.post('/bookings/free', requireAuth, async (req, res) => {
    const { scheduleId, seatIds, origin, destination, registrationNumber, phone } = req.body;
    const userId = req.user.id;

    if (!scheduleId || !Array.isArray(seatIds) || !origin || !destination || !registrationNumber || !phone) {
        return res.status(400).json({ message: 'All booking and verification fields are required.' });
    }
    if (seatIds.length !== 1) {
        return res.status(400).json({ message: 'Free ticket bookings are limited to one seat per user per transaction.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const [settingsRows] = await connection.query("SELECT `value` FROM settings WHERE `key` = 'isFreeBookingEnabled'");
        if (!(settingsRows.length > 0 && settingsRows[0].value === 'true')) {
            await connection.rollback();
            return res.status(403).json({ message: 'Free booking is currently disabled by the administrator.' });
        }
        
        const [beneficiaryRows] = await connection.query("SELECT * FROM govtbeneficiaries WHERE govtExamRegistrationNumber = ? AND phone = ? FOR UPDATE", [registrationNumber, phone]);
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
        // Explicitly set bookingDate for consistency with paid bookings.
        await connection.query(
          'INSERT INTO bookings (id, userId, scheduleId, fare, originalFare, bookingDate, origin, destination, isFreeTicket, govtExamRegistrationNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [bookingId, userId, scheduleId, 0, 0, new Date(), origin, destination, true, registrationNumber]
        );
        
        const seatInsertPromises = seatIds.map(seatId => connection.query('INSERT INTO bookedseats (bookingId, seatId, origin, destination) VALUES (?, ?, ?, ?)', [bookingId, seatId, origin, destination]));
        await Promise.all(seatInsertPromises);
        
        await connection.query("UPDATE govtbeneficiaries SET ticketClaimed = 1 WHERE id = ?", [beneficiary.id]);
        await connection.query("UPDATE users SET govtExamRegistrationNumber = ? WHERE id = ? AND govtExamRegistrationNumber IS NULL", [registrationNumber, userId]);

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
        handleDBError(res, error, 'createFreeBooking');
    } finally {
        connection.release();
    }
});

apiRouter.post("/bookings", requireAuth, async (req, res) => {
    const { scheduleId, seats, origin, destination } = req.body;
    const userId = req.user.id;

    if (!scheduleId || !Array.isArray(seats) || seats.length === 0 || !origin || !destination) {
        return res.status(400).json({ message: 'Missing or invalid required booking information.' });
    }
    
    for (const seat of seats) {
        if (!seat.fullName || seat.fullName.trim() === '') {
            return res.status(400).json({ message: `Full name is required for seat ${seat.seatId}.` });
        }
        if ((seat.type === 'CHILD' || seat.type === 'SENIOR') && (!seat.aadhaarNumber || seat.aadhaarNumber.length !== 12)) {
             return res.status(400).json({ message: `A valid 12-digit Aadhaar number is required for seat ${seat.seatId}.` });
        }
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const schedulesMap = await fetchAndAssembleSchedules(connection, scheduleId);
        const schedule = schedulesMap[scheduleId];
        if (!schedule) {
            await connection.rollback();
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        
        const originStop = schedule.fullRouteStops.find(s => s.normalizedName === origin.trim().toLowerCase());
        const destStop = schedule.fullRouteStops.find(s => s.normalizedName === destination.trim().toLowerCase());
        if (!originStop || !destStop || originStop.order >= destStop.order) {
            await connection.rollback();
            return res.status(400).json({ message: 'Invalid origin or destination for this route.' });
        }

        const baseFarePerSeat = destStop.fare - originStop.fare;

        const [[childDiscRow], [seniorDiscRow], [discountEnabledRow]] = await Promise.all([
             connection.query("SELECT value FROM settings WHERE `key` = 'childDiscountPercentage'"),
             connection.query("SELECT value FROM settings WHERE `key` = 'seniorDiscountPercentage'"),
             connection.query("SELECT value FROM settings WHERE `key` = 'isDiscountSystemEnabled'")
        ]);
        
        const childDiscount = Number(childDiscRow[0]?.value || '40');
        const seniorDiscount = Number(seniorDiscRow[0]?.value || '50');
        const isDiscountEnabled = discountEnabledRow[0]?.value === 'true' && schedule.isDiscountEnabled;

                let totalFare = 0;
        const seatTypes = new Set();
        const passengerDetails = [];

        for (const seat of seats) {
            seatTypes.add(seat.type);
            let finalFarePerSeat = baseFarePerSeat;

            const passengerDetail = {
                seatId: seat.seatId,
                fullName: seat.fullName,
                type: seat.type,
                status: 'BOOKED',
            };

            if (isDiscountEnabled) {
                if (seat.type === 'CHILD') {
                    finalFarePerSeat = baseFarePerSeat * (1 - (childDiscount / 100));
                    passengerDetail.aadhaarNumber = seat.aadhaarNumber;
                } else if (seat.type === 'SENIOR') {
                    finalFarePerSeat = baseFarePerSeat * (1 - (seniorDiscount / 100));
                    passengerDetail.aadhaarNumber = seat.aadhaarNumber;
                }
            }

            // Ensure fare is present for EVERY passenger, including NORMAL
            passengerDetail.fare = finalFarePerSeat;

            totalFare += finalFarePerSeat;
            passengerDetails.push(passengerDetail);
        }
        
        let discountTypeForDb = 'NONE';
        const hasDiscountPassenger = Array.from(seatTypes).some(type => type === 'CHILD' || type === 'SENIOR');
        if (hasDiscountPassenger) {
            const discountTypes = new Set(Array.from(seatTypes).filter(type => type !== 'NORMAL'));
            if (discountTypes.size > 1) {
                discountTypeForDb = 'MIXED';
            } else if (discountTypes.has('CHILD')) {
                discountTypeForDb = 'CHILD';
            } else if (discountTypes.has('SENIOR')) {
                discountTypeForDb = 'SENIOR';
            }
        }

        const bookingId = uuidv4();
        await connection.execute(
            `INSERT INTO bookings 
                (id, userId, scheduleId, fare, originalFare, bookingDate, isFreeTicket, origin, destination, discountType, passengerDetails) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                bookingId,
                userId,
                scheduleId,
                totalFare,
                totalFare,
                new Date(),
                false,
                origin,
                destination,
                discountTypeForDb,
                passengerDetails.length > 0 ? JSON.stringify(passengerDetails) : null
            ]
        );

        const seatInsertPromises = seats.map(seat =>
            connection.execute(
                `INSERT INTO bookedseats (bookingId, seatId, origin, destination) VALUES (?, ?, ?, ?)`,
                [bookingId, seat.seatId, origin, destination]
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

apiRouter.post('/bookings/:bookingId/cancel', requireAuth, async (req, res) => {
    const { bookingId } = req.params;
    const { seatIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(seatIds) || seatIds.length === 0) {
        return res.status(400).json({ message: 'An array of seat IDs to cancel is required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const [[cancellationSetting]] = await connection.query("SELECT value FROM settings WHERE `key` = 'isCancellationEnabled'");
        if (!cancellationSetting || cancellationSetting.value !== 'true') {
            await connection.rollback();
            return res.status(403).json({ message: 'Ticket cancellation is currently disabled.' });
        }

        const [[booking]] = await connection.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
        if (!booking) {
            await connection.rollback();
            return res.status(404).json({ message: 'Booking not found.' });
        }
        if (booking.userId !== userId) {
            await connection.rollback();
            return res.status(403).json({ message: 'You are not authorized to cancel this booking.' });
        }
        if (booking.status === 'CANCELLED') {
            await connection.rollback();
            return res.status(400).json({ message: 'This booking has already been fully cancelled.' });
        }

        const schedulesMap = await fetchAndAssembleSchedules(connection, booking.scheduleId);
        const schedule = schedulesMap[booking.scheduleId];
        if (!schedule) {
            await connection.rollback();
            return res.status(404).json({ message: 'Could not find schedule details for this booking.' });
        }
        
        const originStop = schedule.fullRouteStops.find(s => s.name.trim().toLowerCase() === booking.origin.trim().toLowerCase());
        if (!originStop || !originStop.departure) {
             await connection.rollback();
             return res.status(500).json({ message: 'Could not determine departure time for this booking.' });
        }
        
        const [hours, minutes] = originStop.departure.split(':');
        const bookingDateTime = new Date(booking.bookingDate);
        let departureDateTime = new Date(booking.bookingDate);
        departureDateTime.setHours(Number(hours), Number(minutes), 0, 0);

        if (departureDateTime < bookingDateTime) {
            departureDateTime.setDate(departureDateTime.getDate() + 1);
        }
        const oneHourBeforeDeparture = new Date(departureDateTime.getTime() - 60 * 60 * 1000);

        if (new Date() >= oneHourBeforeDeparture) {
            await connection.rollback();
            return res.status(400).json({ message: 'Cancellation window has closed. Tickets can only be cancelled up to 1 hour before departure.' });
        }

        let passengerDetails = JSON.parse(booking.passengerDetails || '[]');
        let fareToRefund = 0;
        let successfullyCancelledSeats = [];

        for (const seatId of seatIds) {
            const passengerIndex = passengerDetails.findIndex(p => p.seatId === seatId && p.status !== 'CANCELLED');
            if (passengerIndex !== -1) {
                const passenger = passengerDetails[passengerIndex];
                fareToRefund += passenger.fare;
                passenger.status = 'CANCELLED';
                successfullyCancelledSeats.push(seatId);
            }
        }
        
        if (successfullyCancelledSeats.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'Seats selected for cancellation are invalid or already cancelled.' });
        }

        const remainingFare = booking.fare - fareToRefund;
        
        await connection.query('DELETE FROM bookedseats WHERE bookingId = ? AND seatId IN (?)', [bookingId, successfullyCancelledSeats]);

        const totalSeats = passengerDetails.length;
        const totalCancelledSeats = passengerDetails.filter(p => p.status === 'CANCELLED').length;
        
        const newStatus = totalCancelledSeats === totalSeats ? 'CANCELLED' : 'PARTIALLY_CANCELLED';

        await connection.query(
            'UPDATE bookings SET fare = ?, passengerDetails = ?, status = ? WHERE id = ?',
            [remainingFare, JSON.stringify(passengerDetails), newStatus, bookingId]
        );

        await connection.commit();
        res.status(200).json({ message: `Successfully cancelled ${successfullyCancelledSeats.length} seat(s).` });
    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'cancelBooking');
    } finally {
        connection.release();
    }
});


apiRouter.get('/tracking/:busId', async (req, res) => {
  try {
    const schedulesMap = await fetchAndAssembleSchedules(dbPool, req.params.busId);
    const schedule = schedulesMap[req.params.busId];

    if (!schedule || !schedule.fullRouteStops || schedule.fullRouteStops.length === 0) {
      return res.status(404).json({ message: 'Tracking information not available for this bus.' });
    }
    
    // Simulation logic to determine current position
    const now = new Date();
    let currentStopIndex = -1;
    let isAtStop = false;

    for (let i = 0; i < schedule.fullRouteStops.length; i++) {
        const stop = schedule.fullRouteStops[i];
        const departureTimeStr = stop.departure; // 'HH:mm:ss'
        const arrivalTimeStr = stop.arrival; // 'HH:mm:ss' or null

        const arrivalTimeToday = new Date();
        const departureTimeToday = new Date();
        
        const timeToUseForArrival = arrivalTimeStr || departureTimeStr;
        if (timeToUseForArrival) {
            const [arrH, arrM] = timeToUseForArrival.split(':');
            arrivalTimeToday.setHours(parseInt(arrH, 10), parseInt(arrM, 10), 0, 0);
        }

        if (departureTimeStr) {
            const [depH, depM] = departureTimeStr.split(':');
            departureTimeToday.setHours(parseInt(depH, 10), parseInt(depM, 10), 0, 0);
        }

        if (now >= arrivalTimeToday && now <= departureTimeToday) {
            currentStopIndex = i;
            isAtStop = true;
            break;
        }

        if (now > departureTimeToday) {
            currentStopIndex = i;
            isAtStop = false;
        } else {
            break; // This is a future stop
        }
    }

    res.json({
      busId: req.params.busId,
      lastUpdated: new Date().toISOString(),
      currentStopIndex: currentStopIndex,
      isAtStop: isAtStop,
      routeStops: schedule.fullRouteStops.map(stop => ({
          name: stop.name,
          arrival: formatTime(stop.arrival),
          departure: formatTime(stop.departure)
      }))
    });
  } catch (error) {
    handleDBError(res, error, 'trackBus');
  }
});

// --- User Management Routes ---
apiRouter.get('/users/:userId/pass-card', requireAuth, async (req, res) => {
    const { userId } = req.params;
    if (req.user.id !== userId) {
        return res.status(403).json({ message: 'Permission denied.' });
    }

    try {
        const [[setting]] = await dbPool.query("SELECT value FROM settings WHERE `key` = 'isPassCardSystemEnabled'");
        if (!(setting && setting.value === 'true')) {
            return res.json(null);
        }
        
        const [rows] = await dbPool.query(
            `SELECT pc.id, pc.userId, pc.passCardNumber, pc.userImage, pc.fatherName, pc.origin, pc.destination, pc.expiryDate, u.fullName, u.dob
            FROM user_pass_cards pc
            JOIN users u ON pc.userId = u.id
            WHERE pc.userId = ?`,
            [userId]
        );
        
        if (rows.length > 0) {
            const passCard = rows[0];
            if (passCard.expiryDate) passCard.expiryDate = new Date(passCard.expiryDate).toISOString().split('T')[0];
            if (passCard.dob) passCard.dob = new Date(passCard.dob).toISOString().split('T')[0];
            res.json(passCard);
        } else {
            res.json(null);
        }
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
             console.log("`user_pass_cards` table not found, returning null.");
             return res.json(null);
        }
        handleDBError(res, error, 'getPassCardForUser');
    }
});

apiRouter.put('/users/profile/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id) {
        return res.status(403).json({ message: 'You can only update your own profile.' });
    }

    const { fullName, email, phone, gender, password, dob } = req.body;
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        const fieldsToUpdate = { fullName, email, phone, gender, dob };
        let sql = 'UPDATE users SET ';
        const params = [];
        
        Object.keys(fieldsToUpdate).forEach((key) => {
            const value = fieldsToUpdate[key];
            if (value !== undefined) {
                if (params.length > 0) sql += ', ';
                sql += `\`${key}\` = ?`;
                params.push(key === 'dob' ? (value || null) : value);
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

        if (phone) {
            await connection.query(
                `UPDATE govtbeneficiaries gb JOIN users u ON gb.govtExamRegistrationNumber = u.govtExamRegistrationNumber SET gb.phone = ? WHERE u.id = ?`,
                 [phone, id]
            );
        }
        await connection.commit();

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

apiRouter.post('/users/bulk-beneficiaries', requireAdmin, async (req, res) => {
    const { beneficiaries } = req.body;
    
    if (!Array.isArray(beneficiaries) || beneficiaries.length === 0) {
        return res.status(400).json({ message: 'A non-empty array of beneficiaries is required.' });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        let createdCount = 0, updatedCount = 0, skippedCount = 0;
        
        for (const bene of beneficiaries) {
            const { govtExamRegistrationNumber, phone, fullName, email, dob, password } = bene;

            if (!govtExamRegistrationNumber || !phone || !fullName) {
                console.log('Skipping invalid record (missing required fields):', bene);
                skippedCount++;
                continue;
            }

            await connection.query(
                `INSERT INTO govtbeneficiaries (id, govtExamRegistrationNumber, phone, ticketClaimed) VALUES (?, ?, ?, 0)
                 ON DUPLICATE KEY UPDATE phone = VALUES(phone), ticketClaimed = 0`,
                [uuidv4(), govtExamRegistrationNumber, phone]
            );
            
            const [existingBeneUsers] = await connection.query('SELECT * FROM users WHERE govtExamRegistrationNumber = ?', [govtExamRegistrationNumber]);

            if (existingBeneUsers.length > 0) {
                const userToUpdate = existingBeneUsers[0];
                if (userToUpdate.phone !== phone) {
                    const [phoneConflict] = await connection.query('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, userToUpdate.id]);
                    if (phoneConflict.length > 0) {
                        console.log(`Skipping update for ${govtExamRegistrationNumber}: New phone number ${phone} is already in use by another account.`);
                        skippedCount++;
                        continue;
                    }
                }
                await connection.query(
                    `UPDATE users SET fullName = ?, email = ?, phone = ?, dob = ?, isFreeTicketEligible = 'Yes', password = ? WHERE id = ?`,
                    [fullName, email || null, phone, dob || null, password || null, userToUpdate.id]
                );
                updatedCount++;
            } else {
                const [usersWithPhone] = await connection.query('SELECT * FROM users WHERE phone = ?', [phone]);
                if (usersWithPhone.length > 0) {
                    const userToConvert = usersWithPhone[0];
                    if (userToConvert.govtExamRegistrationNumber) {
                         console.log(`Skipping conversion for phone ${phone}: This phone number is already linked to a different beneficiary (${userToConvert.govtExamRegistrationNumber}).`);
                         skippedCount++;
                         continue;
                    }
                    await connection.query(
                        `UPDATE users SET fullName = ?, email = ?, dob = ?, isFreeTicketEligible = 'Yes', govtExamRegistrationNumber = ?, password = ? WHERE id = ?`,
                        [fullName, email || null, dob || null, govtExamRegistrationNumber, password || null, userToConvert.id]
                    );
                    updatedCount++;
                } else {
                    const userId = uuidv4();
                    await connection.query(
                        `INSERT INTO users (id, fullName, email, phone, password, role, govtExamRegistrationNumber, isFreeTicketEligible, dob)
                         VALUES (?, ?, ?, ?, ?, 'USER', ?, 'Yes', ?)`,
                        [userId, fullName, email || null, phone, password || null, govtExamRegistrationNumber, dob || null]
                    );
                    createdCount++;
                }
            }
        }
        await connection.commit();
        res.status(201).json({ message: 'Bulk user processing completed.', created: createdCount, updated: updatedCount, skipped: skippedCount });
    } catch (error) {
        await connection.rollback();
        handleDBError(res, error, 'bulkCreateBeneficiaries');
    } finally {
        connection.release();
    }
});

apiRouter.get('/users', requireSubAdminOrAdmin, async (req, res) => {
    try {
        const [users] = await dbPool.query("SELECT id, fullName, email, phone, role, dob, gender FROM users ORDER BY role, fullName");
        const [subAdminDistricts] = await dbPool.query("SELECT userId, district FROM subadmindistricts");

        const districtsMap = subAdminDistricts.reduce((acc, row) => {
            if (!acc[row.userId]) acc[row.userId] = [];
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

apiRouter.post('/users/subadmin', requireAdmin, async (req, res) => {
    const { fullName, email, phone, password, assignedDistricts, gender, dob } = req.body;
    if (!fullName || !phone || !password || !Array.isArray(assignedDistricts)) {
        return res.status(400).json({ message: 'Full name, phone, password, and assigned districts are required.' });
    }

    // --- Backend Validation ---
    if (phone.length !== 10 || !/^\d{10}$/.test(phone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 10 digits.' });
    }
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ message: passwordHint });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        
        if (assignedDistricts.length > 0) {
            const placeholders = assignedDistricts.map(() => '?').join(',');
            const [existingAssignments] = await connection.query(`SELECT district FROM subadmindistricts WHERE district IN (${placeholders})`, assignedDistricts);
            if (existingAssignments.length > 0) {
                const takenDistricts = existingAssignments.map(d => d.district).join(', ');
                await connection.rollback(); connection.release();
                return res.status(409).json({ message: `The following districts are already assigned to another sub-admin: ${takenDistricts}` });
            }
        }
        
        const userId = uuidv4();
        const newUser = { id: userId, fullName, email, phone, password, role: 'SUB_ADMIN', gender, dob };

        await connection.query('INSERT INTO users (id, fullName, email, phone, password, role, gender, dob) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [newUser.id, newUser.fullName, newUser.email, newUser.phone, newUser.password, newUser.role, newUser.gender, newUser.dob || null]);

        if (assignedDistricts.length > 0) {
            const districtInsertPromises = assignedDistricts.map(district => connection.query('INSERT INTO subadmindistricts (userId, district) VALUES (?, ?)', [userId, district]));
            await Promise.all(districtInsertPromises);
        }

        await connection.commit();
        
        const { password: _, ...userToReturn } = newUser;
        userToReturn.assignedDistricts = assignedDistricts;
        res.status(201).json(userToReturn);
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A user with this email or phone number already exists.' });
        handleDBError(res, error, 'createSubAdmin');
    } finally {
        connection.release();
    }
});

apiRouter.put('/users/admin/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    let connection;
    try {
        connection = await dbPool.getConnection();
        await connection.beginTransaction();
        
        const { fullName, email, phone, gender, password, dob } = updateData;
        const fieldsToUpdate = { fullName, email, phone, gender, dob };
        let sql = 'UPDATE users SET ';
        const params = [];
        
        Object.keys(fieldsToUpdate).forEach((key) => {
            const value = fieldsToUpdate[key];
            if (value !== undefined) {
                if (params.length > 0) sql += ', ';
                sql += `\`${key}\` = ?`;
                params.push(key === 'dob' ? (value || null) : value);
            }
        });

        if (password) {
            if (params.length > 0) sql += ', ';
            sql += '`password` = ?';
            params.push(password);
        }

        if (params.length === 0) {
            await connection.rollback(); return res.status(400).json({ message: 'No fields to update.' });
        }

        sql += ' WHERE id = ?';
        params.push(id);
        
        const [result] = await connection.query(sql, params);
        if (result.affectedRows === 0) {
            await connection.rollback(); return res.status(404).json({ message: 'User to update not found.' });
        }

        if (phone) await connection.query(`UPDATE govtbeneficiaries gb JOIN users u ON gb.govtExamRegistrationNumber = u.govtExamRegistrationNumber SET gb.phone = ? WHERE u.id = ?`, [phone, id]);
        await connection.commit();
        
        const [rows] = await connection.query('SELECT * FROM users WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'User not found after update.' });
        const { password: _, ...userToReturn } = rows[0];
        res.status(200).json(userToReturn);
    } catch (error) {
        if(connection) await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email or phone number already in use by another account.' });
        handleDBError(res, error, 'adminUpdateUser');
    } finally {
        if (connection) connection.release();
    }
});

apiRouter.put('/users/subadmin/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { fullName, email, phone, password, gender, dob, assignedDistricts } = req.body;

    if (!fullName || !phone || !Array.isArray(assignedDistricts)) {
        return res.status(400).json({ message: 'Full name, phone, and assigned districts are required.' });
    }
    
    // --- Backend Validation ---
    if (phone.length !== 10 || !/^\d{10}$/.test(phone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 10 digits.' });
    }
    if (password && !passwordRegex.test(password)) {
        return res.status(400).json({ message: passwordHint });
    }

    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        
        if (assignedDistricts.length > 0) {
            const placeholders = assignedDistricts.map(() => '?').join(',');
            const [existingAssignments] = await connection.query(`SELECT district FROM subadmindistricts WHERE district IN (${placeholders}) AND userId != ?`, [...assignedDistricts, id]);
            if (existingAssignments.length > 0) {
                const takenDistricts = existingAssignments.map(d => d.district).join(', ');
                await connection.rollback(); connection.release();
                return res.status(409).json({ message: `The following districts are already assigned to another sub-admin: ${takenDistricts}` });
            }
        }

        const userFields = { fullName, email, phone, gender, dob };
        const userUpdateParts = [], userParams = [];
        for (const [key, value] of Object.entries(userFields)) {
            if (value !== undefined) { 
                userUpdateParts.push(`\`${key}\` = ?`);
                userParams.push(key === 'dob' ? (value || null) : value);
            }
        }
        if (password) { userUpdateParts.push('`password` = ?'); userParams.push(password); }
        
        if (userUpdateParts.length > 0) {
            const userUpdateSql = `UPDATE users SET ${userUpdateParts.join(', ')} WHERE id = ?`;
            userParams.push(id);
            await connection.query(userUpdateSql, userParams);
        }

        if (phone) await connection.query(`UPDATE govtbeneficiaries gb JOIN users u ON gb.govtExamRegistrationNumber = u.govtExamRegistrationNumber SET gb.phone = ? WHERE u.id = ?`, [phone, id]);
        
        await connection.query('DELETE FROM subadmindistricts WHERE userId = ?', [id]);
        if (assignedDistricts.length > 0) {
            const districtInsertPromises = assignedDistricts.map(district => connection.query('INSERT INTO subadmindistricts (userId, district) VALUES (?, ?)', [id, district]));
            await Promise.all(districtInsertPromises);
        }

        await connection.commit();
        res.status(200).json({ message: 'Sub-admin updated successfully.' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email or phone number already in use.' });
        handleDBError(res, error, 'updateSubAdmin');
    } finally {
        connection.release();
    }
});

apiRouter.delete('/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        const [users] = await connection.query('SELECT role FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            await connection.rollback(); return res.status(404).json({ message: 'User not found.' });
        }
        if (users[0].role !== 'SUB_ADMIN') {
            await connection.rollback(); return res.status(403).json({ message: 'Only sub-admin accounts can be deleted.' });
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

apiRouter.get('/analytics/revenue', requireSubAdminOrAdmin, async (req, res) => {
  const user = req.user;
  let assignedDistricts = [];

  try {
    if (user.role === 'SUB_ADMIN') {
      assignedDistricts = user.assignedDistricts || [];
      if (assignedDistricts.length === 0) {
        return res.json({
          summary: { netRevenue: 0, grossRevenue: 0, refundedRevenue: 0, bookedTickets: 0, cancelledTickets: 0 },
          byCategory: [], byDistrict: [], byRoute: [],
        });
      }
    }
    
    const subAdminFilter = assignedDistricts.length > 0 ? 'AND b.origin IN (?)' : '';
    const queryParams = assignedDistricts.length > 0 ? [assignedDistricts] : [];

    const baseQuery = `
      FROM bookings b
      JOIN JSON_TABLE(
        b.passengerDetails, 
        '$[*]' COLUMNS (
          type VARCHAR(20) PATH '$.type',
          fare DECIMAL(10,2) PATH '$.fare',
          status VARCHAR(20) PATH '$.status'
        )
      ) AS p
      WHERE b.isFreeTicket = 0 
        AND b.passengerDetails IS NOT NULL 
        AND JSON_VALID(b.passengerDetails)
        ${subAdminFilter}
    `;
    
    const categoryQuery = `
        SELECT p.type,
            COALESCE(SUM(CASE WHEN p.status IS NULL OR p.status = 'BOOKED' THEN p.fare ELSE 0 END), 0) AS grossRevenue,
            COALESCE(SUM(CASE WHEN p.status = 'CANCELLED' THEN p.fare ELSE 0 END), 0) AS refundedRevenue,
            COUNT(CASE WHEN p.status IS NULL OR p.status = 'BOOKED' THEN 1 END) AS bookedTickets,
            COUNT(CASE WHEN p.status = 'CANCELLED' THEN 1 END) AS cancelledTickets
        ${baseQuery}
        GROUP BY p.type
    `;
    
    const pivotedFields = `
        -- BOOKED REVENUE
        COALESCE(SUM(CASE WHEN p.type = 'NORMAL' AND (p.status = 'BOOKED' OR p.status IS NULL) THEN p.fare ELSE 0 END), 0) as bookedNormalRevenue,
        COALESCE(SUM(CASE WHEN p.type = 'CHILD' AND (p.status = 'BOOKED' OR p.status IS NULL) THEN p.fare ELSE 0 END), 0) as bookedChildRevenue,
        COALESCE(SUM(CASE WHEN p.type = 'SENIOR' AND (p.status = 'BOOKED' OR p.status IS NULL) THEN p.fare ELSE 0 END), 0) as bookedSeniorRevenue,
        -- CANCELLED REVENUE (REFUNDS)
        COALESCE(SUM(CASE WHEN p.type = 'NORMAL' AND p.status = 'CANCELLED' THEN p.fare ELSE 0 END), 0) as cancelledNormalRevenue,
        COALESCE(SUM(CASE WHEN p.type = 'CHILD' AND p.status = 'CANCELLED' THEN p.fare ELSE 0 END), 0) as cancelledChildRevenue,
        COALESCE(SUM(CASE WHEN p.type = 'SENIOR' AND p.status = 'CANCELLED' THEN p.fare ELSE 0 END), 0) as cancelledSeniorRevenue,
        -- BOOKED TICKETS
        COUNT(CASE WHEN p.type = 'NORMAL' AND (p.status = 'BOOKED' OR p.status IS NULL) THEN 1 END) as bookedNormalTickets,
        COUNT(CASE WHEN p.type = 'CHILD' AND (p.status = 'BOOKED' OR p.status IS NULL) THEN 1 END) as bookedChildTickets,
        COUNT(CASE WHEN p.type = 'SENIOR' AND (p.status = 'BOOKED' OR p.status IS NULL) THEN 1 END) as bookedSeniorTickets,
        -- CANCELLED TICKETS
        COUNT(CASE WHEN p.type = 'NORMAL' AND p.status = 'CANCELLED' THEN 1 END) as cancelledNormalTickets,
        COUNT(CASE WHEN p.type = 'CHILD' AND p.status = 'CANCELLED' THEN 1 END) as cancelledChildTickets,
        COUNT(CASE WHEN p.type = 'SENIOR' AND p.status = 'CANCELLED' THEN 1 END) as cancelledSeniorTickets
    `;

    const districtQuery = `SELECT b.origin as district, ${pivotedFields} ${baseQuery} GROUP BY b.origin`;
    const routeQuery = `SELECT CONCAT(b.origin, ' -> ', b.destination) AS route, ${pivotedFields} ${baseQuery} GROUP BY route`;

    const [categoryRows] = await dbPool.query(categoryQuery, queryParams);
    const [districtRows] = await dbPool.query(districtQuery, queryParams);
    const [routeRows] = await dbPool.query(routeQuery, queryParams);

    const byCategory = categoryRows.map(r => ({ ...r, grossRevenue: Number(r.grossRevenue), refundedRevenue: Number(r.refundedRevenue), netRevenue: (Number(r.grossRevenue) - Number(r.refundedRevenue)) }));

    const summary = byCategory.reduce((acc, curr) => ({
      grossRevenue: acc.grossRevenue + Number(curr.grossRevenue),
      refundedRevenue: acc.refundedRevenue + Number(curr.refundedRevenue),
      bookedTickets: acc.bookedTickets + Number(curr.bookedTickets),
      cancelledTickets: acc.cancelledTickets + Number(curr.cancelledTickets),
      netRevenue: acc.netRevenue + Number(curr.netRevenue),
    }), { netRevenue: 0, grossRevenue: 0, refundedRevenue: 0, bookedTickets: 0, cancelledTickets: 0 });

    res.json({ summary, byCategory, byDistrict: districtRows, byRoute: routeRows });

  } catch (err) {
    handleDBError(res, err, 'getRevenueAnalyticsDetailed');
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
